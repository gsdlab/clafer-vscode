// @ts-check
// Starts the Clafer language server (clafer-ls.jar), which checks the models as they are edited
// and gives their outline, definitions, references, hovers, completion and renaming. Compiles
// Clafer models and runs the instance generators in a terminal. Without the server, shows the
// compiler's errors in the Problems panel, in the files that they are in (the model or a file it
// imports), and gives the outline of a model by its layout.

'use strict';

const vscode = require('vscode');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseErrors, characterOf, outline } = require('./clafer');
const { LanguageClient } = require('vscode-languageclient/node');

/** @type {vscode.DiagnosticCollection} */
let diagnostics;
/** @type {vscode.OutputChannel} */
let output;
/** The running compilation of each model, by file name. @type {Map<string, childProcess.ChildProcess>} */
const running = new Map();
/** The files with the errors of each compiled model, by file name, to clear them at its next compilation. @type {Map<string, vscode.Uri[]>} */
const errorFiles = new Map();
/** The terminal of each instance generator of a model, by file name and generator. @type {Map<string, vscode.Terminal>} */
const terminals = new Map();
/** The language server's client, while it runs. @type {LanguageClient | undefined} */
let client;
/** The extension's own outline, without the server. @type {vscode.Disposable | undefined} */
let ownOutline;
/** @type {vscode.LogOutputChannel} */
let serverOutput;

function config() {
  return vscode.workspace.getConfiguration('clafer');
}

/** The configured folder of the Clafer tools, or ''. */
function configuredTools() {
  const tools = /** @type {string} */ (config().get('toolsPath', ''));
  return tools ? tools.replace(/^~(?=$|[\\/])/, process.env.HOME || process.env.USERPROFILE || '~') : '';
}

/** The environment of the tools: the configured folder first on PATH, since clafersg runs clafer itself, for the models that its Java frontend does not take. */
function toolsEnv() {
  const tools = configuredTools();
  return tools ? { ...process.env, PATH: tools + path.delimiter + (process.env.PATH || '') } : { ...process.env };
}

/**
 * The executable of a tool, in the configured folder or on PATH.
 * @param {string} name
 */
function findTool(name) {
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (toolsEnv().PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const file = path.join(dir, name + extension);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
  }
  return undefined;
}

/** The folder of the Clafer tools: the setting, or the folder of clafer on PATH. */
function toolsDir() {
  const clafer = findTool('clafer');
  return configuredTools() || (clafer ? path.dirname(fs.realpathSync(clafer)) : '');
}

/** @param {string} name */
function notFound(name) {
  vscode.window.showErrorMessage(
    `Clafer: ${name} was not found. Add the folder of the Clafer tools to PATH or set clafer.toolsPath.`,
    'Open Settings',
  ).then((choice) => {
    if (choice) vscode.commands.executeCommand('workbench.action.openSettings', 'clafer.toolsPath');
  });
}

/**
 * The range of an error: the word at the position, the character there, or the
 * last character of the line at its end.
 * @param {vscode.TextDocument} document
 * @param {number} line from 1, 0 if the error has no position
 * @param {number} column from 1
 */
function rangeOf(document, line, column) {
  if (line < 1 || line > document.lineCount) return document.lineAt(0).range;
  const text = document.lineAt(line - 1).text;
  const character = characterOf(text, column);
  const position = new vscode.Position(line - 1, character);
  const word = document.getWordRangeAtPosition(position, /[A-Za-z_][\w']*|\d+/);
  if (word) return word;
  if (character < text.length) return new vscode.Range(position, position.translate(0, 1));
  return new vscode.Range(position.translate(0, -Math.min(1, character)), position);
}

/**
 * Shows the errors of a compilation in the files in which they are: the compiled model or a
 * file it imports. An error in another file is also shown at the start of the model, where
 * the imports are, with the file and the position in it.
 * @param {vscode.TextDocument} document the compiled model
 * @param {{file: string | null, line: number, column: number, message: string}[]} errors
 */
async function showErrors(document, errors) {
  const file = document.uri.fsPath;
  /** @type {Map<string, {uri: vscode.Uri, list: vscode.Diagnostic[]}>} */
  const byFile = new Map([[document.uri.toString(), { uri: document.uri, list: [] }]]);
  /** @param {vscode.Uri} uri @param {vscode.Diagnostic} diagnostic */
  const add = (uri, diagnostic) => {
    diagnostic.source = 'clafer';
    const entry = byFile.get(uri.toString()) ?? { uri, list: [] };
    entry.list.push(diagnostic);
    byFile.set(uri.toString(), entry);
  };
  for (const error of errors) {
    const remote = error.file !== null && /^https?:\/\//.test(error.file);
    const local = error.file === null || remote ? file : path.resolve(path.dirname(file), error.file);
    const uri = local === file ? document.uri : vscode.Uri.file(local);
    const target = remote ? undefined
      : uri === document.uri ? document
      : await vscode.workspace.openTextDocument(uri).then((d) => d, () => undefined);
    if (target) add(uri, new vscode.Diagnostic(rangeOf(target, error.line, error.column), error.message, vscode.DiagnosticSeverity.Error));
    if (target !== document) {
      const diagnostic = new vscode.Diagnostic(document.lineAt(0).range,
        `${error.file}:${error.line}:${error.column}: ${error.message}`, vscode.DiagnosticSeverity.Error);
      if (target) diagnostic.relatedInformation = [new vscode.DiagnosticRelatedInformation(
        new vscode.Location(uri, rangeOf(target, error.line, error.column)), 'the error in the imported file')];
      add(document.uri, diagnostic);
    }
  }
  for (const uri of errorFiles.get(file) ?? []) {
    if (!byFile.has(uri.toString())) diagnostics.delete(uri);
  }
  for (const { uri, list } of byFile.values()) diagnostics.set(uri, list);
  errorFiles.set(file, [...byFile.values()].map(({ uri }) => uri));
}

/**
 * Compiles the model and shows its errors.
 * @param {vscode.TextDocument} document
 * @param {boolean} validate
 */
function compile(document, validate) {
  const file = document.uri.fsPath;
  const clafer = findTool('clafer');
  if (!clafer) return notFound('clafer');
  running.get(file)?.kill();
  const args = [.../** @type {string[]} */ (config().get('arguments', [])), path.basename(file)];
  if (validate) args.unshift('--validate', `--tooldir=${toolsDir()}`);
  output.appendLine(`${clafer} ${args.join(' ')}`);
  if (validate) output.show(true); // the validation's results are in the output
  const child = childProcess.spawn(clafer, args, { cwd: path.dirname(file), env: toolsEnv() });
  running.set(file, child);
  let text = '';
  child.stdout.on('data', (data) => (text += data));
  child.stderr.on('data', (data) => (text += data));
  child.on('error', (error) => output.appendLine(String(error)));
  child.on('close', (code, signal) => {
    if (running.get(file) !== child) return; // replaced by a newer compilation
    running.delete(file);
    output.append(text);
    output.appendLine(signal ? `[stopped]` : `[exit code ${code}]`);
    if (signal) return;
    const errors = code === 0 ? [] : parseErrors(text);
    if (!client) showErrors(document, errors); // the server shows the errors as the model is edited
    if (code !== 0 && errors.length === 0) output.show(true); // a failure without a recognized error
    vscode.window.setStatusBarMessage(code === 0 ? 'Clafer: compiled' : `Clafer: ${errors.length} error(s)`, 5000);
  });
}

/** The Clafer model in the active editor, saved. */
async function activeModel() {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || document.languageId !== 'clafer' || document.isUntitled) {
    vscode.window.showWarningMessage('Clafer: open a saved Clafer model (.cfr) first.');
    return undefined;
  }
  if (document.isDirty) await document.save();
  return document;
}

/**
 * Runs an instance generator for the model in a terminal.
 * @param {'alloy' | 'choco'} backend
 */
async function instances(backend) {
  const document = await activeModel();
  if (!document) return;
  const file = document.uri.fsPath;
  let shellPath, shellArgs;
  if (backend === 'alloy') {
    shellPath = findTool('claferIG');
    if (!shellPath) return notFound('claferIG');
    shellArgs = [.../** @type {string[]} */ (config().get('claferIGArguments', ['--diff', '--addtypes'])), path.basename(file)];
  } else {
    // the launcher, which also passes the optimized MiniSat prover to Alloy for temporal models
    shellPath = findTool('clafersg');
    if (!shellPath) return notFound('clafersg');
    shellArgs = ['--repl', '--prettify', '--file', path.basename(file)];
  }
  // a new run replaces the previous one, instead of leaving its terminal behind
  terminals.get(`${file} ${backend}`)?.dispose();
  const terminal = vscode.window.createTerminal({
    name: `${path.basename(file)} (${backend === 'alloy' ? 'Alloy' : 'Choco'})`,
    shellPath, shellArgs, cwd: path.dirname(file), env: toolsEnv(),
  });
  terminals.set(`${file} ${backend}`, terminal);
  terminal.show();
}

/**
 * The jar of the language server: in the configured folder, next to clafer-ls on PATH, or in
 * the folder of clafer.
 * @returns {string | undefined}
 */
function serverJar() {
  const launcher = findTool('clafer-ls');
  const dirs = [configuredTools(), launcher ? path.dirname(fs.realpathSync(launcher)) : '', toolsDir()];
  return dirs.filter(Boolean).map((dir) => path.join(dir, 'clafer-ls.jar')).find((jar) => fs.existsSync(jar));
}

/** Shows the extension's own outline, by the layout of a model, when the server does not run. */
function useOwnOutline() {
  ownOutline ??= vscode.languages.registerDocumentSymbolProvider('clafer', {
    provideDocumentSymbols: (document) => outline(document.getText()).map((clafer) => symbolOf(document, clafer)),
  });
}

/**
 * Starts the language server, unless it is turned off or not found; without it, the
 * extension's own outline and the compiler's errors are used.
 */
async function startServer() {
  if (!config().get('languageServer', true)) return useOwnOutline();
  const jar = serverJar();
  const java = findTool('java');
  if (!jar || !java) {
    output.appendLine(`Clafer: ${jar ? 'java' : 'clafer-ls.jar'} was not found, so the language server does not run; `
      + 'the errors are those of the compiler when a model is saved.');
    return useOwnOutline();
  }
  const candidate = new LanguageClient('clafer', 'Clafer Language Server',
    { command: java, args: [...(/** @type {string[]} */ (config().get('languageServerJavaArguments', []))), '-jar', jar], options: { env: toolsEnv() } },
    {
      documentSelector: [{ scheme: 'file', language: 'clafer' }, { scheme: 'untitled', language: 'clafer' }],
      outputChannel: serverOutput,
      // the server re-checks the open models when a file they import changes on disk
      synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher('**/*.cfr') },
    });
  try {
    await candidate.start();
  } catch (error) {
    serverOutput.error(`The language server did not start: ${error}`);
    return useOwnOutline();
  }
  client = candidate;
  ownOutline?.dispose();
  ownOutline = undefined;
  // the server's errors replace those of earlier compilations
  diagnostics.clear();
  errorFiles.clear();
}

async function stopServer() {
  const stopping = client;
  client = undefined;
  if (stopping) await stopping.stop().catch(() => undefined);
}

async function restartServer() {
  await stopServer();
  await startServer();
}

const SYMBOL_KINDS = {
  abstract: vscode.SymbolKind.Class,
  enum: vscode.SymbolKind.Enum,
  reference: vscode.SymbolKind.Field,
  clafer: vscode.SymbolKind.Object,
};

/**
 * The symbol of a clafer of the outline, with its children.
 * @param {vscode.TextDocument} document
 * @param {ReturnType<typeof outline>[number]} clafer
 * @returns {vscode.DocumentSymbol}
 */
function symbolOf(document, clafer) {
  const symbol = new vscode.DocumentSymbol(clafer.name, clafer.detail, SYMBOL_KINDS[clafer.kind],
    new vscode.Range(clafer.line, 0, clafer.lastLine, document.lineAt(clafer.lastLine).text.length),
    new vscode.Range(clafer.line, clafer.start, clafer.line, clafer.end));
  symbol.children = clafer.children.map((child) => symbolOf(document, child));
  return symbol;
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection('clafer');
  output = vscode.window.createOutputChannel('Clafer');
  serverOutput = vscode.window.createOutputChannel('Clafer Language Server', { log: true });
  context.subscriptions.push(
    diagnostics,
    output,
    serverOutput,
    { dispose: () => ownOutline?.dispose() },
    vscode.commands.registerCommand('clafer.restartServer', restartServer),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (['clafer.languageServer', 'clafer.languageServerJavaArguments', 'clafer.toolsPath'].some((s) => event.affectsConfiguration(s))) restartServer();
    }),
    // a compilation started by saving the model is replaced by this one
    vscode.commands.registerCommand('clafer.compile', async () => {
      const document = await activeModel();
      if (document) compile(document, false);
    }),
    vscode.commands.registerCommand('clafer.validate', async () => {
      const document = await activeModel();
      if (document) compile(document, true);
    }),
    vscode.commands.registerCommand('clafer.instancesAlloy', () => instances('alloy')),
    vscode.commands.registerCommand('clafer.instancesChoco', () => instances('choco')),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === 'clafer' && config().get('compileOnSave', true)) compile(document, false);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
  );
  // the commands work while the server starts
  startServer().catch((error) => serverOutput.error(String(error)));
}

function deactivate() {
  for (const child of running.values()) child.kill();
  return stopServer();
}

module.exports = { activate, deactivate };
