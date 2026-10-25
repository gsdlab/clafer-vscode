# Change Log

## 0.5.4 - Oct 25, 2026

* Compilation: saving a Clafer model, or **Clafer: Compile**, runs the Clafer compiler and shows its errors in the model and in the Problems panel (setting `clafer.compileOnSave`), in the files in which they are when the model imports other files (Clafer 0.5.4); **Clafer: Compile and Validate** also validates the outputs.
* **Clafer: Instances (Alloy)** and **Clafer: Instances (Choco)** run claferIG and chocosolver on the model in a terminal.
* The tools are found on `PATH` or in the folder set by `clafer.toolsPath`; `clafer.arguments` sets the compiler's arguments.

[Pull request](https://github.com/gsdlab/clafer-vscode/pull/2)

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
