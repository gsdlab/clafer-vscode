# Clafer for VS Code

Syntax highlighting for [Clafer](https://www.clafer.org) (`.cfr` files): keywords, operators, comments, and number and string literals,
the Clafer language server (errors as you type, the outline, go to definition, references, hovers, completion and rename),
compilation, and the instance generators. Also provides:

* comment toggling (`Ctrl+/`), bracket matching and auto-closing,
* folding of nested clafers by indentation,
* the outline of the clafers of a model, in the Outline view, breadcrumbs and **Go to Symbol in Editor** (`Ctrl+Shift+O`): from the language server, or by the layout of the model without it,
* word selection that treats identifiers like `x'` as one word,
* snippets: `abstract`, `super`, `ref`, `refbag`, `xor`/`or`/`mux`/`opt`, `enum`, `constraint`, `assert`, `goal`, `some`/`no`/`one`/`lone`, `all`, `if`, `let`, `statemachine`, `transition`, `guarded`, `initial`/`final`, `each`/`together` (the clock of `:=`), `initially`, `scenario`, `next`, `never`/`sometime`/`lonce`/`always`, `must`, `choco`, `alloy`, and the directives `options` (also with the integer range: `intrange`, and the decimal digits: `decimaldigits`), `fragment` and `summary`,
* highlighting of Clafer in Markdown code blocks (` ```clafer ` and ` ```{.clafer …} `, as in ClaferWiki pages),
* an icon for `.cfr` files (shown when your file icon theme has none for Clafer).

The highlighting follows the Clafer 0.5.3 grammar (`clafer.cf`), including temporal operators, `finalref`/`finaltarget`, and embedded `[alloy| … |]` and `[choco| … |]` blocks (choco blocks are highlighted as JavaScript).

Compiler directives (`//# OPTIONS …`, `//# FRAGMENT`, `//# GRAPH`, `//# STATS`, `//# SUMMARY`) are highlighted only where the compiler recognizes them: `OPTIONS` on the first line of the file, the others alone on a line with no extra whitespace. A directive that is shown as an ordinary comment will be ignored by the compiler. It was originally ported from [Clafer Tools for Sublime Text](https://github.com/gsdlab/ClaferToolsST).

## The language server

The Clafer language server, `clafer-ls.jar` of the [Clafer tools](https://wiselab.uwaterloo.ca/clafer-tools-binary-distributions) 0.6.0 (Java 21 or later), checks the open models as they are edited, with the Java frontend of chocosolver, and gives:

* the errors, in the model and in the Problems panel; an error in a file that the model imports is shown in that file, and at the start of the model with the file and the position in it,
* the outline,
* **Go to Definition** (`F12`) and **Find All References** (`Shift+F12`) of clafers and of the locals of quantifiers and `let`,
* hovers, with a clafer's declaration,
* completion of the names in scope, and after a `.` of the children of a path,
* **Rename Symbol** (`F2`) of a clafer or a local, in the open models and the files they import.

It runs when `clafer-ls.jar` is in the folder set by `clafer.toolsPath`, next to `clafer-ls` or `clafer` on `PATH`, and `java` is found; its log is in the Output panel **Clafer Language Server**. **Clafer: Restart Language Server** restarts it. Without it, the errors are the compiler's when a model is saved, and the outline is by the layout of the model.

## Compilation and instance generation

These need the [Clafer tools](https://wiselab.uwaterloo.ca/clafer-tools-binary-distributions) (Clafer 0.5.3 or later; Java 21 or later for the instance generators),
either on `PATH` or in the folder set by `clafer.toolsPath`.

* Saving a Clafer model compiles it (setting `clafer.compileOnSave`), and so does **Clafer: Compile** in the Command Palette.
  The compiler's output is in the Output panel **Clafer**. Without the language server, the compiler's errors are shown in the model and in the Problems panel;
  an error in a file that the model imports (`--import`, Clafer 0.5.4) is shown in that file, and at the start of the model with the file and the position in it.
* **Clafer: Compile and Validate** also validates the generated outputs with Alloy and chocosolver.
* **Clafer: Instances (Alloy)** and **Clafer: Instances (Choco)** run the instance generators (claferIG, chocosolver) on the model in a terminal. A new run replaces the terminal of the previous run of that model.

Settings:

* `clafer.toolsPath`: the folder of the Clafer tools (`clafer`, `claferIG`, `chocosolver.jar`, `clafer-ls.jar`, `alloy6.2.0.jar`); empty (the default): use the tools on `PATH`.
* `clafer.languageServer`: run the language server (default: on).
* `clafer.languageServerJavaArguments`: the arguments of `java` for the language server, before `-jar`, e.g., `["-Xmx1g"]` (default: none).
* `clafer.arguments`: the arguments of `clafer`; the model is added at the end. Default: `["-m", "alloy", "-m", "choco", "-m", "html", "--self-contained", "-m", "clafer"]`, which also writes the rich explicit model (`.des.cfr`).
* `clafer.claferIGArguments`: the arguments of `claferIG` for **Clafer: Instances (Alloy)**; the model is added at the end. Default: `["--diff", "--addtypes"]`: each next instance, or state of a trace, as its changes from the previous one, as in ClaferIDE, and the clafers with their types, e.g., `A : P`.
* `clafer.compileOnSave`: compile a model when it is saved (default: on); without the language server, this also shows the compiler's errors.

## Installation

Either build and install a `.vsix` package:

```bash
npx @vscode/vsce package
code --install-extension clafer-syntax-0.6.0.vsix
```

or copy this folder, with its `node_modules` after `npm install --omit=dev`, into `~/.vscode/extensions/` and restart VS Code.

## Testing

`npm test` checks the parsing of the compiler's errors and the outline (`test/compile.mjs`), starts the language server as the extension does and checks its errors and outline (`test/server.mjs`; the jar is `$CLAFER_LS_JAR` or the one built in `../chocosolver/lsp/target`, and the test is skipped without it or `java`), then tokenizes every `.cfr` file under the given directories (by default `../clafer/test/positive`) the way VS Code does and fails if a file ends inside an unclosed comment, string or embedded block, or contains an invalid token:

```bash
npm install
npm test -- ../clafer/test/positive ../ClaferCaseStudies
```
