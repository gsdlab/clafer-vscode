// Tokenizes Clafer models with VS Code's own TextMate engine and checks the grammar:
// every file must end outside comments, strings and embedded blocks, and must not
// contain invalid tokens. Also checks Clafer code blocks in Markdown if VS Code's
// Markdown grammar is installed.
//
// Usage: node test/grammar.mjs [directory or .cfr file ...]   (default: ../clafer/test/positive)

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vsctm from 'vscode-textmate';
import oniguruma from 'vscode-oniguruma';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
await oniguruma.loadWASM(wasm);

// Markdown and JavaScript come from a VS Code installation, if there is one.
const vscodeExtensions = [
  '/usr/share/code/resources/app/extensions',
  '/opt/visual-studio-code/resources/app/extensions',
  '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions',
].find((dir) => fs.existsSync(dir));

const grammars = {
  'source.clafer': path.join(root, 'syntaxes/clafer.tmLanguage.json'),
  'markdown.clafer.codeblock': path.join(root, 'syntaxes/clafer.markdown.tmLanguage.json'),
};
if (vscodeExtensions) {
  grammars['text.html.markdown'] = path.join(vscodeExtensions, 'markdown-basics/syntaxes/markdown.tmLanguage.json');
  grammars['source.js'] = path.join(vscodeExtensions, 'javascript/syntaxes/JavaScript.tmLanguage.json');
}

const registry = new vsctm.Registry({
  onigLib: Promise.resolve({
    createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
    createOnigString: (s) => new oniguruma.OnigString(s),
  }),
  loadGrammar: async (scopeName) => {
    const file = grammars[scopeName];
    if (!file || !fs.existsSync(file)) return null;
    return vsctm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
  },
  getInjections: (scopeName) => (scopeName === 'text.html.markdown' ? ['markdown.clafer.codeblock'] : []),
});

function tokenize(grammar, text) {
  let state = vsctm.INITIAL;
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    const result = grammar.tokenizeLine(line, state);
    lines.push({ line, tokens: result.tokens });
    state = result.ruleStack;
  }
  return { lines, state };
}

function cfrFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith('.cfr') ? [target] : [];
  return fs.readdirSync(target).sort().flatMap((entry) => cfrFiles(path.join(target, entry)));
}

const clafer = await registry.loadGrammar('source.clafer');
const failures = [];
let checked = 0;

const targets = process.argv.slice(2);
for (const target of targets.length ? targets : [path.join(root, '../clafer/test/positive')]) {
  for (const file of cfrFiles(target)) {
    checked++;
    const { lines, state } = tokenize(clafer, fs.readFileSync(file, 'utf8'));
    if (state !== vsctm.INITIAL && state.depth > 1) {
      failures.push(`${file}: ends inside an unclosed comment, string or embedded block`);
    }
    lines.forEach(({ line, tokens }, i) => {
      for (const token of tokens) {
        if (token.scopes.some((scope) => scope.startsWith('invalid'))) {
          failures.push(`${file}:${i + 1}: invalid token '${line.slice(token.startIndex, token.endIndex)}'`);
        }
      }
    });
  }
}

// Clafer code blocks in Markdown: the Clafer grammar applies inside, and the block closes.
const markdown = await registry.loadGrammar('text.html.markdown');
if (markdown) {
  const text = fs.readFileSync(path.join(root, 'test/fixtures/wiki.md'), 'utf8');
  const { lines } = tokenize(markdown, text);
  // The scopes of the token at the first occurrence of the given text as a whole word.
  const scopesOf = (text) => {
    const word = new RegExp(`(?<![\\w'])${text.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w'])`);
    for (const { line, tokens } of lines) {
      const match = word.exec(line);
      if (match) return tokens.find((t) => t.startIndex <= match.index && match.index < t.endIndex).scopes;
    }
    throw new Error(`no '${text}' in test/fixtures/wiki.md`);
  };
  const expect = (pattern, scope, present = true) => {
    if (scopesOf(pattern).some((s) => s.startsWith(scope)) !== present) {
      failures.push(`test/fixtures/wiki.md: '${pattern}' should ${present ? '' : 'not '}have scope ${scope}`);
    }
  };
  expect('abstract', 'storage.modifier');
  expect('xor', 'keyword');
  expect('// inside the block', 'comment');
  expect('or', 'keyword', false); // in the prose after the closed block
  expect('mux', 'keyword');       // ```{.clafer .summary}
  expect('lone', 'keyword', false); // ```haskell block
  console.log(`Markdown: checked test/fixtures/wiki.md with ${grammars['text.html.markdown']}`);
} else {
  console.log('Markdown: skipped (no VS Code installation with the Markdown grammar found)');
}

for (const failure of failures) console.error(failure);
console.log(`${checked} Clafer files checked, ${failures.length} problems`);
process.exit(failures.length ? 1 : 0);
