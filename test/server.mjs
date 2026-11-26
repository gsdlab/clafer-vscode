// Starts the Clafer language server the way the extension does (java -jar clafer-ls.jar) and
// checks, over the JSON-RPC library of the extension's language client, that it initializes, publishes the errors
// of an open model and gives its outline. Skipped without java or the jar.
//
// The jar: $CLAFER_LS_JAR, or the one that chocosolver builds next to this folder.
//
// Usage: node --test test/server.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const rpc = require('vscode-jsonrpc/node'); // the client's own JSON-RPC library (the client itself needs VS Code)

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '../../chocosolver/lsp/target');
const jar = process.env.CLAFER_LS_JAR
  ?? (existsSync(target) ? readdirSync(target).filter((f) => /^clafer-language-server-.*-jar-with-dependencies\.jar$/.test(f))
    .map((f) => path.join(target, f))[0] : undefined);
const java = spawnSync('java', ['-version']).status === 0;
const skip = !java ? 'java was not found' : !jar || !existsSync(jar) ? 'clafer-ls.jar was not found (set CLAFER_LS_JAR)' : false;

test('the language server checks an open model and gives its outline', { skip, timeout: 60000 }, async () => {
  const server = spawn('java', ['-jar', /** @type {string} */ (jar)], { stdio: ['pipe', 'pipe', 'inherit'] });
  const connection = rpc.createMessageConnection(new rpc.StreamMessageReader(server.stdout), new rpc.StreamMessageWriter(server.stdin));
  /** @type {Map<string, (params: any) => void>} */
  const waiting = new Map();
  connection.onNotification('textDocument/publishDiagnostics', (params) => waiting.get(params.uri)?.(params));
  connection.listen();
  try {
    const uri = pathToFileURL(path.join(here, 'fixtures', 'unsaved.cfr')).toString();
    const result = await connection.sendRequest('initialize', {
      processId: process.pid, rootUri: null,
      capabilities: { textDocument: { documentSymbol: { hierarchicalDocumentSymbolSupport: true } } },
    });
    assert.ok(result.capabilities.definitionProvider);
    assert.ok(result.capabilities.renameProvider);
    await connection.sendNotification('initialized', {});

    const published = new Promise((resolve) => waiting.set(uri, resolve));
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: 'clafer', version: 1, text: 'abstract Person\n  name ->> string\nAlice : Persn\n' },
    });
    const diagnostics = /** @type {any} */ (await published).diagnostics;
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].range.start.line, 2);
    assert.match(diagnostics[0].message, /Persn/);

    const symbols = await connection.sendRequest('textDocument/documentSymbol', { textDocument: { uri } });
    assert.deepEqual(symbols.map((/** @type {any} */ s) => s.name), ['Person', 'Alice']);
    assert.deepEqual(symbols[0].children.map((/** @type {any} */ s) => s.name), ['name']);

    await connection.sendRequest('shutdown');
    await connection.sendNotification('exit');
  } finally {
    connection.dispose();
    server.kill();
  }
});
