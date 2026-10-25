// @ts-check
// The Clafer compiler's error output, independent of VS Code (tested by test/compile.mjs).

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

module.exports = { parseErrors, characterOf };
