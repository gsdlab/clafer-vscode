// @ts-check
// The Clafer compiler's error output and the outline of a model, independent of VS Code
// (tested by test/compile.mjs).

'use strict';

// "Compile error at model.cfr:3:5..." or "Parse failed at model.cfr:3:5...", followed by the
// message; the file is the one in which the error is, a path relative to the current directory
// or a URL. Before Clafer 0.5.4, "at line 3 column 5..." in the compiled file. An error without
// a position prints "Error...".
const ERROR = /^(?:Compile error|Parse failed) at (?:(.+):(\d+):(\d+)|line (\d+) column (\d+))\.\.\.$|^Error\.\.\.$/gm;

/**
 * The errors in clafer's output: the file (null for the compiled file), and lines and
 * columns from 1; line 0 if the error has no position.
 * @param {string} output
 * @returns {{file: string | null, line: number, column: number, message: string}[]}
 */
function parseErrors(output) {
  output = output.replace(/\r\n/g, '\n');
  const matches = [...output.matchAll(ERROR)];
  return matches.map((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : output.length;
    const message = output.slice(start, end).trim();
    if (match[1]) return { file: match[1], line: Number(match[2]), column: Number(match[3]), message };
    if (match[4]) return { file: null, line: Number(match[4]), column: Number(match[5]), message };
    return { file: null, line: 0, column: 0, message };
  });
}

/**
 * The index in the line's text of clafer's column: the compiler counts a tab as
 * advancing to the next multiple of 8, plus 1. A column past the end of the line
 * (the compiler's virtual closing brace) is the end of the line.
 * @param {string} text the line
 * @param {number} column from 1
 */
function characterOf(text, column) {
  let visual = 1;
  for (let i = 0; i < text.length; i++) {
    if (visual >= column) return i;
    visual = text[i] === '\t' ? Math.floor((visual + 7) / 8) * 8 + 1 : visual + 1;
  }
  return text.length;
}

/**
 * The text with its comments, strings, embedded blocks and the insides of constraints replaced
 * by spaces, so that positions stay the same. The opening bracket of a constraint stays.
 * @param {string} text
 */
function maskCode(text) {
  const masked = text.split('');
  /** @param {number} from @param {number} to */
  const blank = (from, to) => {
    for (let i = from; i < to; i++) {
      if (text[i] !== '\n' && text[i] !== '\r') masked[i] = ' ';
    }
  };
  /** @param {string} close @param {number} from */
  const after = (close, from) => {
    const end = text.indexOf(close, from);
    return end < 0 ? text.length : end + close.length;
  };
  const string = /"(?:[^"\\]|\\.)*"?/y;
  let depth = 0;
  for (let i = 0; i < text.length;) {
    let end = i;
    if (text.startsWith('//', i)) end = after('\n', i);
    else if (text.startsWith('/*', i)) end = after('*/', i + 2);
    else if (text.startsWith('[alloy|', i) || text.startsWith('[choco|', i)) end = after('|]', i);
    else if (text[i] === '"') {
      string.lastIndex = i;
      end = i + (string.exec(text)?.[0].length ?? 1);
    }
    if (end > i) {
      blank(i, end);
      i = end;
      continue;
    }
    if (text[i] === '[' && depth++ === 0) {
      i++;
      continue;
    }
    if (text[i] === ']') depth = Math.max(depth - 1, 0);
    if (depth > 0 || text[i] === ']') blank(i, i + 1);
    i++;
  }
  return masked.join('');
}

const NOT_NAMES = new Set(['abstract', 'assert', 'enum', 'final', 'finalref', 'finaltarget', 'initial', 'mux', 'opt', 'or', 'xor']);
const IDENTIFIER = "[A-Za-z_][\\w']*";
const ENUM = new RegExp(`^\\s*enum\\s+(${IDENTIFIER})`);
// Abstract [TempModifier] GCard PosIdent, or a use of a clafer: "`" Name, in clafer.cf
const CLAFER = new RegExp(`^(\\s*)(\`|(?:abstract\\s+)?(?:(?:initial|finalref|finaltarget|final)\\s+)*(?:(?:xor|or|mux|opt|\\d+\\s*\\.\\.\\s*(?:\\d+|\\*))\\s+)?)(${IDENTIFIER})(.*)$`);
// Super Reference Card
const HEADER = /^\s*(:\s*[\w'.]+)?\s*(->>?\s*[\w'.]+)?\s*([?+*]|\d+(?:\s*\.\.\s*(?:\d+|\*))?)?(?=\s|$)/;
// a transition or a value, which an xor on a following line of the same indentation continues
const EXPRESSION = /-->|-\[|(?:^|\s):?=/;

/**
 * The clafers of a model as a tree, by indentation: its layout. Lines and characters are from 0;
 * lastLine is the line of the last element of the clafer. Clafers in braces on one line are not found.
 * @typedef {{name: string, detail: string, kind: 'abstract' | 'enum' | 'reference' | 'clafer', line: number,
 *   start: number, end: number, lastLine: number, children: OutlineClafer[]}} OutlineClafer
 * @param {string} text
 * @returns {OutlineClafer[]}
 */
function outline(text) {
  /** @type {OutlineClafer[]} */
  const top = [];
  /** @type {{indent: number, clafer: OutlineClafer}[]} */
  const open = [];
  let continuedIndent = 0;
  const lines = text.split(/\r?\n/);
  maskCode(text).split(/\r?\n/).forEach((code, line) => {
    if (!code.trim()) return;
    const indent = characterIndent(lines[line]);
    let closed = indent;
    while (open.length && open[open.length - 1].indent >= indent) closed = /** @type {{indent: number}} */ (open.pop()).indent;
    if (closed !== indent) open.pop(); // between two levels, the compiler closes the lower one too
    for (const { clafer } of open) clafer.lastLine = line;

    /** @type {OutlineClafer | undefined} */
    let clafer;
    const enumeration = ENUM.exec(code);
    const match = CLAFER.exec(code);
    if (enumeration) {
      const start = code.indexOf(enumeration[1], enumeration[0].length - enumeration[1].length);
      clafer = { name: enumeration[1], detail: '', kind: 'enum', line, start, end: start + enumeration[1].length, lastLine: line, children: [] };
    } else if (match && !NOT_NAMES.has(match[3]) && !(indent === continuedIndent && match[2].trim() === 'xor')) {
      const [, spaces, modifiers, name, rest] = match;
      const header = HEADER.exec(rest);
      const detail = [modifiers, ...(header ?? []).slice(1)].filter(Boolean).map((part) => part.trim()).join(' ');
      const start = spaces.length + modifiers.length;
      const kind = modifiers.includes('abstract') ? 'abstract' : header?.[2] ? 'reference' : 'clafer';
      clafer = { name, detail, kind, line, start, end: start + name.length, lastLine: line, children: [] };
    }
    if (clafer) {
      (open.length ? open[open.length - 1].clafer.children : top).push(clafer);
      open.push({ indent, clafer });
    }
    continuedIndent = !enumeration && EXPRESSION.test(code) ? indent : 0;
  });
  return top;
}

/**
 * The column of the first character of a line, with tabs as in characterOf.
 * @param {string} text
 */
function characterIndent(text) {
  let visual = 1;
  for (const character of text) {
    if (character !== ' ' && character !== '\t') break;
    visual = character === '\t' ? Math.floor((visual + 7) / 8) * 8 + 1 : visual + 1;
  }
  return visual;
}

module.exports = { parseErrors, characterOf, outline };
