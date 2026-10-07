# Clafer for VS Code

Syntax highlighting for [Clafer](http://clafer.org) (`.cfr` files): keywords, operators, comments, and number and string literals. Also provides comment toggling (`Ctrl+/`), bracket matching and auto-closing.

The highlighting follows the Clafer 0.5.2 grammar (`clafer.cf`), including temporal operators, `finalref`/`finaltarget`, and embedded `[alloy| … |]` and `[choco| … |]` blocks (choco blocks are highlighted as JavaScript).

Compiler directives (`//# OPTIONS …`, `//# FRAGMENT`, `//# GRAPH`, `//# STATS`, `//# SUMMARY`) are highlighted only where the compiler recognizes them: `OPTIONS` on the first line of the file, the others alone on a line with no extra whitespace. A directive that is shown as an ordinary comment will be ignored by the compiler. It was originally ported from [Clafer Tools for Sublime Text](https://github.com/gsdlab/ClaferToolsST).

## Installation

Either build and install a `.vsix` package:

```bash
npx @vscode/vsce package
code --install-extension clafer-syntax-0.5.2.vsix
```

or copy this folder into `~/.vscode/extensions/` and restart VS Code.
