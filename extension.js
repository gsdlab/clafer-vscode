// @ts-check
// Compiles Clafer models, shows the compiler's errors in the Problems panel, in the files that
// they are in (the model or a file it imports), and runs the instance generators in a terminal.

'use strict';

const vscode = require('vscode');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseErrors, characterOf } = require('./clafer');

/** @type {vscode.DiagnosticCollection} */
let diagnostics;
/** @type {vscode.OutputChannel} */
let output;
/** The running compilation of each model, by file name. @type {Map<string, childProcess.ChildProcess>} */
const running = new Map();
/** The files with the errors of each compiled model, by file name, to clear them at its next compilation. @type {Map<string, vscode.Uri[]>} */
const errorFiles = new Map();

function config() {
  return vscode.workspace.getConfiguration('clafer');
}

/** The configured folder of the Clafer tools, or ''. */
function configuredTools() {
  const tools = /** @type {string} */ (config().get('toolsPath', ''));
  return tools ? tools.replace(/^~(?=$|[\\/])/, process.env.HOME || process.env.USERPROFILE || '~') : '';
}

/** The environment of the tools: the configured folder first on PATH, since chocosolver runs clafer itself. */
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
    showErrors(document, errors);
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
    shellArgs = [path.basename(file)];
  } else {
    const jar = path.join(toolsDir(), 'chocosolver.jar');
    if (!fs.existsSync(jar)) return notFound('chocosolver.jar');
    shellPath = findTool('java');
    if (!shellPath) return notFound('java');
    shellArgs = ['-jar', jar, '--repl', '--prettify', '--file', path.basename(file)];
  }
  const terminal = vscode.window.createTerminal({
    name: `${path.basename(file)} (${backend === 'alloy' ? 'Alloy' : 'Choco'})`,
    shellPath, shellArgs, cwd: path.dirname(file), env: toolsEnv(),
  });
  terminal.show();
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection('clafer');
  output = vscode.window.createOutputChannel('Clafer');
  context.subscriptions.push(
    diagnostics,
    output,
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
}

function deactivate() {
  for (const child of running.values()) child.kill();
}

module.exports = { activate, deactivate };
