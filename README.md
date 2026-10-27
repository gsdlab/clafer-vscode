# Clafer for VS Code

Syntax highlighting for [Clafer](https://www.clafer.org) (`.cfr` files): keywords, operators, comments, and number and string literals,
compilation with the compiler's errors in the editor, and the instance generators. Also provides:

* comment toggling (`Ctrl+/`), bracket matching and auto-closing,
* folding of nested clafers by indentation,
* word selection that treats identifiers like `x'` as one word,
* snippets: `abstract`, `super`, `ref`, `refbag`, `xor`/`or`/`mux`/`opt`, `enum`, `constraint`, `assert`, `goal`, `some`/`no`/`one`/`lone`, `all`, `if`, `let`, `choco`, `alloy`, and the directives `options` (also with the integer range: `intrange`, and the decimal digits: `decimaldigits`), `fragment` and `summary`,
* highlighting of Clafer in Markdown code blocks (` ```clafer ` and ` ```{.clafer …} `, as in ClaferWiki pages),
* an icon for `.cfr` files (shown when your file icon theme has none for Clafer).

The highlighting follows the Clafer 0.5.3 grammar (`clafer.cf`), including temporal operators, `finalref`/`finaltarget`, and embedded `[alloy| … |]` and `[choco| … |]` blocks (choco blocks are highlighted as JavaScript).

Compiler directives (`//# OPTIONS …`, `//# FRAGMENT`, `//# GRAPH`, `//# STATS`, `//# SUMMARY`) are highlighted only where the compiler recognizes them: `OPTIONS` on the first line of the file, the others alone on a line with no extra whitespace. A directive that is shown as an ordinary comment will be ignored by the compiler. It was originally ported from [Clafer Tools for Sublime Text](https://github.com/gsdlab/ClaferToolsST).

## Compilation and instance generation

These need the [Clafer tools](https://wiselab.uwaterloo.ca/clafer-tools-binary-distributions) (Clafer 0.5.3 or later; Java 21 or later for the instance generators),
either on `PATH` or in the folder set by `clafer.toolsPath`.

* Saving a Clafer model compiles it (setting `clafer.compileOnSave`), and so does **Clafer: Compile** in the Command Palette.
  The compiler's errors are shown in the model and in the Problems panel, its output in the Output panel **Clafer**.
  An error in a file that the model imports (`--import`, Clafer 0.5.4) is shown in that file, and at the start of the model with the file and the position in it.
* **Clafer: Compile and Validate** also validates the generated outputs with Alloy and chocosolver.
* **Clafer: Instances (Alloy)** and **Clafer: Instances (Choco)** run the instance generators (claferIG, chocosolver) on the model in a terminal.

Settings:

* `clafer.toolsPath`: the folder of the Clafer tools (`clafer`, `claferIG`, `chocosolver.jar`, `alloy6.2.0.jar`); empty (the default): use the tools on `PATH`.
* `clafer.arguments`: the arguments of `clafer`; the model is added at the end. Default: `["-m", "alloy", "-m", "choco", "-m", "html", "--self-contained"]`.
* `clafer.compileOnSave`: compile a model when it is saved (default: on).

## Installation

Either build and install a `.vsix` package:

```bash
npx @vscode/vsce package
code --install-extension clafer-syntax-0.5.4.vsix
```

or copy this folder into `~/.vscode/extensions/` and restart VS Code.

## Testing

`npm test` checks the parsing of the compiler's errors (`test/compile.mjs`), then tokenizes every `.cfr` file under the given directories (by default `../clafer/test/positive`) the way VS Code does and fails if a file ends inside an unclosed comment, string or embedded block, or contains an invalid token:

```bash
npm install
npm test -- ../clafer/test/positive ../ClaferCaseStudies
```
