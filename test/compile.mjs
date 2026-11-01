// Tests the parsing of the Clafer compiler's errors (clafer.js) on its actual output, and the
// outline of a model.
//
// Usage: node --test test/compile.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { parseErrors, characterOf, outline } = createRequire(import.meta.url)('../clafer.js');

test('a compile error with its message lines', () => {
  const output = '\nCompile error at model.cfr:3:3...\nName resolver: \'c\' not found within paths:\nin context of \'"none"\'\n';
  assert.deepEqual(parseErrors(output), [
    { file: 'model.cfr', line: 3, column: 3, message: 'Name resolver: \'c\' not found within paths:\nin context of \'"none"\'' },
  ]);
});

test('a parse error, with Windows line endings', () => {
  const output = '\r\nParse failed at model.cfr:2:14...\r\nsyntax error before }\r\n';
  assert.deepEqual(parseErrors(output), [{ file: 'model.cfr', line: 2, column: 14, message: 'syntax error before }' }]);
});

test('an error in an imported file, a path or a URL', () => {
  assert.deepEqual(parseErrors('\nCompile error at lib/design space.cfr:12:5...\nmessage\n'),
    [{ file: 'lib/design space.cfr', line: 12, column: 5, message: 'message' }]);
  assert.deepEqual(parseErrors('\nParse failed at https://example.org:8080/a.cfr:2:1...\nmessage\n'),
    [{ file: 'https://example.org:8080/a.cfr', line: 2, column: 1, message: 'message' }]);
  assert.deepEqual(parseErrors('\nParse failed at C:\\models\\a.cfr:2:1...\nmessage\n'),
    [{ file: 'C:\\models\\a.cfr', line: 2, column: 1, message: 'message' }]);
});

test('an error of Clafer 0.5.3 and older, in the compiled file', () => {
  const output = '\nParse failed at line 2 column 14...\nsyntax error at line 2 before }\n';
  assert.deepEqual(parseErrors(output), [{ file: null, line: 2, column: 14, message: 'syntax error at line 2 before }' }]);
});

test('an error without a position', () => {
  const output = '\nError...\n\nThe model contains clafers with keywords as names in the following places:\nLine 1 column 1\n';
  assert.deepEqual(parseErrors(output), [
    { file: null, line: 0, column: 0, message: 'The model contains clafers with keywords as names in the following places:\nLine 1 column 1' },
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

/** The outline as nested names. */
const names = (clafers) => clafers.map(({ name, children }) => (children.length ? [name, names(children)] : name));

test('the outline follows the indentation, with the header of each clafer', () => {
  const clafers = outline('abstract Engine\n    power -> integer ?\n\nxor machine\n    initial idle -[ coin ]-> busy\n    busy --> idle\n\ncar : Engine 2..3\nenum Color = red | green\n');
  assert.deepEqual(names(clafers), [['Engine', ['power']], ['machine', ['idle', 'busy']], 'car', 'Color']);
  assert.deepEqual(clafers.map(({ detail, kind }) => [detail, kind]),
    [['abstract', 'abstract'], ['xor', 'clafer'], [': Engine 2..3', 'clafer'], ['', 'enum']]);
  assert.deepEqual(clafers[0].children[0], { name: 'power', detail: '-> integer ?', kind: 'reference', line: 1, start: 4, end: 9, lastLine: 1, children: [] });
  assert.equal(clafers[1].children[0].detail, 'initial');
  assert.equal(clafers[1].children[0].start, 12);
  assert.equal(clafers[1].lastLine, 5);
});

test('the outline leaves out comments, strings, constraints and embedded code', () => {
  const text = '// a\n/* b\nc */\nd\n    [ e\n      f ]\n    assert [ g ]\n    << minimize h >>\nh = "i\nj"\n[alloy|\nk\n|]\nl // m\n';
  assert.deepEqual(names(outline(text)), ['d', 'h', 'l']);
  assert.equal(outline(text)[0].lastLine, 7);
});

test('a line with xor after an expression continues it', () => {
  assert.deepEqual(names(outline('a --> b\nxor c --> d\ne\n')), ['a', 'e']);
  assert.deepEqual(names(outline('a -> b\nxor c\n    d\n')), ['a', ['c', ['d']]]);
});

test('a line with xor after a deeper expression is a clafer', () => {
  assert.deepEqual(names(outline('a\n    b --> c\nxor d\n')), [['a', ['b']], 'd']);
});

test('the outline shows the uses of clafers', () => {
  const clafers = outline('a\n    `b ?\n');
  assert.deepEqual(names(clafers), [['a', ['b']]]);
  assert.equal(clafers[0].children[0].start, 5);
});

test('a dedent between two levels closes the lower one, as in the compiler', () => {
  assert.deepEqual(names(outline('a\n    b\n        c\n      d\n')), [['a', [['b', ['c']], 'd']]]);
});

test('a comment before a clafer does not count as indentation', () => {
  const clafers = outline('a\n  /*b*/ c\n    d\n');
  assert.deepEqual(names(clafers), [['a', [['c', ['d']]]]]);
  assert.equal(clafers[0].children[0].start, 8);
});

test('the outline counts a tab as the indentation of the compiler', () => {
  assert.deepEqual(names(outline('a\n\tb\n        c\n')), [['a', ['b', 'c']]]);
});

test('a model that does not compile still has an outline', () => {
  assert.deepEqual(names(outline('a\n    [ b\nc\n')), ['a']);
});
