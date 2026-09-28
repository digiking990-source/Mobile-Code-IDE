import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { angular } from "@codemirror/lang-angular";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { lezer } from "@codemirror/lang-lezer";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { wast } from "@codemirror/lang-wast";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { bracketMatching, indentUnit, syntaxTree } from "@codemirror/language";
import { forceLinting, lintGutter, linter } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import JSZip from "jszip";

const languageCompartment = new Compartment();

const languageByExtension = {
  js: () => javascript(),
  mjs: () => javascript(),
  cjs: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  scss: () => css(),
  json: () => json(),
  jsonc: () => json(),
  py: () => python(),
  java: () => java(),
  c: () => cpp(),
  cc: () => cpp(),
  cpp: () => cpp(),
  h: () => cpp(),
  hpp: () => cpp(),
  rs: () => rust(),
  sql: () => sql(),
  php: () => php(),
  xml: () => xml(),
  svg: () => xml(),
  yaml: () => yaml(),
  yml: () => yaml(),
  md: () => markdown(),
  markdown: () => markdown(),
  go: () => go(),
  wast: () => wast(),
  lezer: () => lezer(),
  angular: () => angular()
};

function languageExtension(path) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return languageByExtension[ext]?.() || [];
}

function collectDiagnostics(state) {
  const diagnostics = [];
  if (localStorage.getItem("codestudio.extension.diagnostics") === "false") return diagnostics;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.isError) {
        const line = state.doc.lineAt(node.from);
        diagnostics.push({
          from: node.from,
          to: Math.min(state.doc.length, Math.max(node.to, node.from)),
          severity: "error",
          message: "Unexpected or incomplete syntax.",
          source: line.number
        });
      }
    }
  });
  return diagnostics;
}

function createEditor(parent, initialPath, onChange, onDiagnostics) {
  const state = EditorState.create({
    doc: "",
    extensions: [
      oneDark,
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      rectangularSelection(),
      history(),
      closeBrackets(),
      bracketMatching(),
      indentUnit.of("  "),
      autocompletion({ activateOnTyping: true }),
      linter((view) => collectDiagnostics(view.state), { delay: 300 }),
      lintGutter(),
      keymap.of([...closeBracketsKeymap, ...completionKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
      languageCompartment.of(languageExtension(initialPath)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
        if (update.docChanged || update.selectionSet) {
          onDiagnostics(collectDiagnostics(update.state));
        }
      }),
      EditorView.theme({
        "&": { height: "100%", fontSize: "13px", backgroundColor: "#101216" },
        ".cm-scroller": { overflow: "auto", fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: "1.7" },
        ".cm-content": { padding: "13px 16px 30px 8px", caretColor: "#c4b5fd" },
        ".cm-gutters": { backgroundColor: "#101216", color: "#555b69", border: "none" },
        ".cm-activeLineGutter": { backgroundColor: "#1b1e26" },
        ".cm-activeLine": { backgroundColor: "#171a20" },
        "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#45415e" },
        ".cm-tooltip": { zIndex: "8" },
        ".cm-tooltip-autocomplete": { backgroundColor: "#20232c", color: "#edf0f7", border: "1px solid #3b3e49" },
        ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "#3a3550" }
      }),
      EditorView.contentAttributes.of({ "aria-label": "Code editor", autocapitalize: "off", autocomplete: "off", autocorrect: "off", spellcheck: "false" })
    ]
  });
  const view = new EditorView({ state, parent });
  let applyingValue = false;
  const adapter = {
    get value() {
      return view.state.doc.toString();
    },
    set value(value) {
      const content = String(value);
      if (content === view.state.doc.toString()) return;
      applyingValue = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
      applyingValue = false;
    },
    get disabled() {
      return view.contentDOM.getAttribute("contenteditable") === "false";
    },
    set disabled(value) {
      view.contentDOM.setAttribute("contenteditable", value ? "false" : "true");
    },
    get selectionStart() {
      return view.state.selection.main.from;
    },
    get selectionEnd() {
      return view.state.selection.main.to;
    },
    get scrollTop() {
      return view.scrollDOM.scrollTop;
    },
    set scrollTop(value) {
      view.scrollDOM.scrollTop = value;
    },
    focus() {
      view.focus();
    },
    setSelectionRange(from, to) {
      view.dispatch({ selection: { anchor: from, head: to } });
    },
    setRangeText(text, from, to, mode) {
      const cursor = from + text.length;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: mode === "end" ? cursor : from, head: mode === "end" ? cursor : from }
      });
    },
    addEventListener(type, listener, options) {
      const captureOptions = type === "focus" || type === "blur" ? { capture: true } : options;
      view.dom.addEventListener(type, listener, captureOptions);
    },
    dispatchEvent() {},
    setLanguage(path) {
      view.dispatch({ effects: languageCompartment.reconfigure(languageExtension(path)) });
    },
    forceLinting() {
      forceLinting(view);
    },
    get dom() {
      return view.dom;
    },
    get scrollElement() {
      return view.scrollDOM;
    },
    get view() {
      return view;
    }
  };
  view.dom.addEventListener("input", () => {
    if (applyingValue) return;
    const length = view.state.selection.main.head;
    view.contentDOM.dataset.cursor = String(length);
  });
  return adapter;
}

window.createCodeEditor = createEditor;
window.createProjectArchive = async (files, folders = []) => {
  const archive = new JSZip();
  for (const folder of folders) archive.folder(folder);
  for (const file of files) archive.file(file.path, file.content);
  return archive.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
};
window.readProjectArchive = async (blob) => {
  if (blob.size > 25_000_000) throw new Error("Compressed project archives are limited to 25 MB.");
  const archive = await JSZip.loadAsync(blob);
  const files = [];
  const folders = [];
  let fileCount = 0;
  let estimatedSize = 0;
  let actualSize = 0;
  for (const [path, entry] of Object.entries(archive.files)) {
    if (entry.dir) {
      const folder = path.replace(/\/+$/, "");
      if (folder) folders.push(folder);
      if (folders.length > 500) throw new Error("Project archives are limited to 500 folders.");
      continue;
    }
    if (++fileCount > 500) throw new Error("Project archives are limited to 500 files.");
    const uncompressedSize = Number(entry._data?.uncompressedSize || 0);
    estimatedSize += uncompressedSize;
    if (uncompressedSize < 0 || estimatedSize > 20_000_000) {
      throw new Error("Project archives are limited to 20 MB of uncompressed text.");
    }
    const content = await entry.async("string");
    actualSize += content.length;
    if (actualSize > 20_000_000) throw new Error("Project archives are limited to 20 MB of uncompressed text.");
    files.push({ path, content });
  }
  return { files, folders };
};
