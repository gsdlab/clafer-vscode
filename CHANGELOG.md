# Change Log

## 0.5.3 - Oct 15, 2026

For Clafer 0.5.3; the Clafer grammar is unchanged.

* Highlighting of Clafer in Markdown fenced code blocks (` ```clafer ` and ` ```{.clafer …} `, as used by ClaferWiki pages).
* Snippet for the integer range of the Choco output: `//# OPTIONS --minint=… --maxint=…` (new in Clafer 0.5.3).
* `npm test` checks the grammar on Clafer models with VS Code's own tokenizer.

[Pull request](https://github.com/gsdlab/clafer-vscode/pull/1)

## 0.5.2 - Oct 9, 2026

First release, for Clafer 0.5.2. Ported from [Clafer Tools for Sublime Text](https://github.com/gsdlab/ClaferToolsST).

* Syntax highlighting for `.cfr` files following the Clafer 0.5.2 grammar, including temporal operators,
  `finalref`/`finaltarget`, compiler directives, and embedded `[alloy| … |]` and `[choco| … |]` blocks
  (choco blocks are highlighted as JavaScript).
* Comment toggling, bracket matching and auto-closing.
* Folding of nested clafers by indentation.
* Word selection that treats identifiers like `x'` as one word.
* Snippets for common Clafer constructs and directives.
* An icon for `.cfr` files.
