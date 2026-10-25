// Tests the parsing of the Clafer compiler's errors (clafer.js) on its actual output.
//
// Usage: node --test test/compile.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { parseErrors, characterOf } = createRequire(import.meta.url)('../clafer.js');

test('a compile error with its message lines', () => {
  const output = '\nCompile error at line 3 column 3...\nName resolver: \'c\' not found within paths:\nin context of \'"none"\'\n';
  assert.deepEqual(parseErrors(output), [
    { line: 3, column: 3, message: 'Name resolver: \'c\' not found within paths:\nin context of \'"none"\'' },
  ]);
});

test('a parse error, with Windows line endings', () => {
  const output = '\r\nParse failed at line 2 column 14...\r\nsyntax error at line 2 before }\r\n';
  assert.deepEqual(parseErrors(output), [{ line: 2, column: 14, message: 'syntax error at line 2 before }' }]);
});

test('an error without a position', () => {
  const output = '\nError...\n\nThe model contains clafers with keywords as names in the following places:\nLine 1 column 1\n';
  assert.deepEqual(parseErrors(output), [
    { line: 0, column: 0, message: 'The model contains clafers with keywords as names in the following places:\nLine 1 column 1' },
  ]);
});

test('no errors in a successful compilation', () => {
  assert.deepEqual(parseErrors('All clafers: 2 | Abstract: 0 | Concrete: 2 | Reference: 0\nConstraints: 0\n'), []);
});

test('columns count a tab as the next multiple of 8, plus 1', () => {
  assert.equal(characterOf('  b ?', 3), 2);
  assert.equal(characterOf('\tb ->', 9), 1);       // b after a tab
  assert.equal(characterOf('\tb ->', 11), 3);      // ->
  assert.equal(characterOf('a\tb', 9), 2);         // a tab after a character also stops at 9
});

test('a column past the end of the line is its end', () => {
  assert.equal(characterOf('\tb ->', 14), 5);      // the compiler's virtual closing brace
  assert.equal(characterOf('', 1), 0);
});
