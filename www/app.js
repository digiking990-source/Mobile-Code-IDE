const fileList = document.getElementById("file-list");
const tabbar = document.getElementById("tabbar");
const saveState = document.getElementById("save-state");
const output = document.getElementById("console-output");
const panel = document.getElementById("bottom-panel");
const previewFrame = document.getElementById("preview-frame");
const findBar = document.getElementById("find-bar");
const findInput = document.getElementById("find-input");
const findCount = document.getElementById("find-count");
const searchResults = document.createElement("div");
searchResults.className = "search-results";
searchResults.id = "search-results";
searchResults.hidden = true;
findBar.after(searchResults);

let workspace;
let activePath = "";
let openPaths = [];
let saveTimer;
let toastTimer;
let searchMode = "file";
let lastSearchMatches = [];
let searchCursor = -1;
let workerUrl;
let runnerWorker;
let runnerTimeout;
let pythonWorker;
let pythonWorkerReady = false;
let pythonRunActive = false;
let pythonRunTimedOut = false;
let livePreviewTimer;
let liveServerRefreshTimer;
let previewEntryPath = "";
let previewBrowserUrl;
let liveServerUrl = "";
let currentPanel = "console";
let activeLessonId = "";
let agentMode = "ask";
let proposedChanges = [];
let livePreview = false;
let fileDialogPurpose = "createFile";
let renameSourcePath = "";
const collapsedFolders = new Set();
const editor = window.createCodeEditor(
  document.getElementById("code-editor"),
  "",
  handleEditorChange,
  handleEditorDiagnostics
);

function extension(path) {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

function updateLiveServerControls(running) {
  const button = document.getElementById("live-server-button");
  button.textContent = running ? "Stop Server" : "Start Server";
  button.classList.toggle("danger", running);
  button.setAttribute("aria-pressed", String(running));
  document.getElementById("run-status").textContent = running ? "Live server running" : "Preview ready";
}

async function startProjectServer() {
  if (!window.Capacitor?.isNativePlatform?.()) {
    showToast("A real Live Server is available in the Android app. Use the in-app Preview in this browser.", true);
    return;
  }
  const plugin = window.Capacitor.Plugins?.ProjectPreview;
  if (!plugin?.startServer) {
    showToast("Update to the latest Android app to use Live Server.", true);
    return;
  }
  if (!previewEntryPath) {
    const entry = findPreviewEntry();
    if (!entry) {
      showToast("Create or import an HTML file before starting Live Server.", true);
      return;
    }
    showPreview(entry.path, entry.content);
  }
  try {
    const result = await plugin.startServer({
      files: workspace.files,
      entryPath: previewEntryPath
    });
    liveServerUrl = result.url;
    updateLiveServerControls(true);
    writeDebugOutput(`Project server listening at ${liveServerUrl}.`);
    showToast("Project server started. Tap ↗ to open it in your browser.");
  } catch (error) {
    showToast(`Could not start the project server: ${error.message}`, true);
  }
}

async function stopProjectServer() {
  const plugin = window.Capacitor?.Plugins?.ProjectPreview;
  if (!plugin?.stopServer) {
    liveServerUrl = "";
    updateLiveServerControls(false);
    return;
  }
  try {
    await plugin.stopServer();
    liveServerUrl = "";
    updateLiveServerControls(false);
    writeDebugOutput("Project server stopped.");
  } catch (error) {
    showToast(`Could not stop the project server: ${error.message}`, true);
  }
}

async function toggleProjectServer() {
  if (liveServerUrl) await stopProjectServer();
  else await startProjectServer();
}

async function openProjectServer() {
  if (!liveServerUrl) await startProjectServer();
  if (!liveServerUrl) return;
  const plugin = window.Capacitor?.Plugins?.ProjectPreview;
  try {
    if (plugin?.openServer) await plugin.openServer({ url: liveServerUrl });
    else window.open(liveServerUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    showToast(`Could not open Live Server in a browser: ${error.message}`, true);
  }
}

function updateBrowserPreviewLink() {
  const link = document.getElementById("open-preview-button");
  if (!previewFrame.srcdoc) return;
  const previousUrl = previewBrowserUrl;
  previewBrowserUrl = URL.createObjectURL(new Blob([previewFrame.srcdoc], { type: "text/html;charset=utf-8" }));
  link.href = previewBrowserUrl;
  if (previousUrl) setTimeout(() => URL.revokeObjectURL(previousUrl), 60_000);
}

function languageName(path) {
  const names = { js: "JAVASCRIPT", mjs: "JAVASCRIPT", cjs: "JAVASCRIPT", html: "HTML", htm: "HTML", css: "CSS", json: "JSON", md: "MARKDOWN", py: "PYTHON", ts: "TYPESCRIPT", txt: "PLAINTEXT" };
  return names[extension(path)] || "PLAINTEXT";
}

function fileIconClass(path) {
  const ext = extension(path);
  return ["html", "js", "css", "md"].includes(ext) ? ext : "generic";
}

function fileIcon(path) {
  const icons = { html: "H", htm: "H", js: "JS", mjs: "JS", cjs: "JS", css: "#", md: "M", json: "{}", py: "PY", ts: "TS" };
  return icons[extension(path)] || "·";
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function setOutput(message, kind = "normal") {
  output.replaceChildren();
  const line = document.createElement("span");
  if (kind === "muted") line.className = "output-muted";
  if (kind === "error") line.className = "output-error";
  if (kind === "info") line.className = "output-info";
  line.textContent = message;
  output.append(line);
}

function writeOutput(message, kind = "normal") {
  if (output.querySelector(".output-muted")) output.replaceChildren();
  const line = document.createElement("span");
  if (kind === "error") line.className = "output-error";
  if (kind === "info") line.className = "output-info";
  line.textContent = message;
  output.append(line, document.createTextNode("\n"));
  output.scrollTop = output.scrollHeight;
}

function writeTerminalOutput(message, kind = "normal") {
  const terminal = document.getElementById("terminal-output");
  if (terminal.querySelector(".output-muted")) terminal.replaceChildren();
  const line = document.createElement("span");
  if (kind === "error") line.className = "output-error";
  if (kind === "info") line.className = "output-info";
  line.textContent = message;
  terminal.append(line, document.createTextNode("\n"));
  terminal.scrollTop = terminal.scrollHeight;
}

function writeDebugOutput(message) {
  const debug = document.getElementById("debug-output");
  if (debug.querySelector(".output-muted")) debug.replaceChildren();
  const line = document.createElement("span");
  line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  debug.append(line, document.createTextNode("\n"));
  debug.scrollTop = debug.scrollHeight;
}

function scheduleSave() {
  saveState.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      workspace.activePath = activePath;
      workspace.openPaths = openPaths;
      await saveWorkspace(workspace);
      saveState.textContent = "Saved";
    } catch (error) {
      saveState.textContent = "Save failed";
      showToast(`Could not save workspace: ${error.message}`, true);
    }
  }, 350);
}

async function persistCurrentWorkspace() {
  clearTimeout(saveTimer);
  workspace.activePath = activePath;
  workspace.openPaths = openPaths;
  await saveWorkspace(workspace);
  saveState.textContent = "Saved";
}

function renderFiles() {
  fileList.replaceChildren();
  const root = { folders: new Map(), files: [] };
  for (const folderPath of workspace.folders || []) {
    let node = root;
    let currentPath = "";
    for (const segment of folderPath.split("/")) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (!node.folders.has(segment)) node.folders.set(segment, { folders: new Map(), files: [], path: currentPath });
      node = node.folders.get(segment);
    }
  }
  for (const file of workspace.files) {
    const segments = file.path.split("/");
    const name = segments.pop();
    let node = root;
    let currentPath = "";
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (!node.folders.has(segment)) node.folders.set(segment, { folders: new Map(), files: [], path: currentPath });
      node = node.folders.get(segment);
    }
    node.files.push({ ...file, name });
  }

  const renderNode = (node, depth = 0) => {
    for (const [name, folder] of [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const row = document.createElement("div");
      row.className = "folder-entry";
      row.dataset.folder = folder.path;
      row.style.paddingLeft = `${8 + depth * 13}px`;
      const toggle = document.createElement("button");
      toggle.className = "folder-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-label", `${collapsedFolders.has(folder.path) ? "Expand" : "Collapse"} ${folder.path}`);
      const arrow = document.createElement("span");
      arrow.className = "folder-arrow";
      arrow.textContent = collapsedFolders.has(folder.path) ? "›" : "⌄";
      const icon = document.createElement("span");
      icon.className = "folder-icon";
      icon.textContent = "▰";
      const label = document.createElement("span");
      label.className = "folder-name";
      label.textContent = name;
      toggle.append(arrow, icon, label);
      const actions = document.createElement("span");
      actions.className = "folder-actions";
      const addFile = document.createElement("button");
      addFile.className = "folder-add-action";
      addFile.type = "button";
      addFile.dataset.action = "new-file";
      addFile.setAttribute("aria-label", `Create a file in ${folder.path}`);
      addFile.title = `New file in ${folder.path}`;
      addFile.textContent = "+";
      const addFolder = document.createElement("button");
      addFolder.className = "folder-add-action";
      addFolder.type = "button";
      addFolder.dataset.action = "new-folder";
      addFolder.setAttribute("aria-label", `Create a subfolder in ${folder.path}`);
      addFolder.title = `New subfolder in ${folder.path}`;
      addFolder.textContent = "▰";
      const preview = document.createElement("button");
      preview.className = "folder-add-action";
      preview.type = "button";
      preview.dataset.action = "preview";
      preview.setAttribute("aria-label", `Preview ${folder.path} in browser`);
      preview.title = `Preview ${folder.path}`;
      preview.textContent = "▣";
      const renameFolder = document.createElement("button");
      renameFolder.className = "folder-add-action";
      renameFolder.type = "button";
      renameFolder.dataset.action = "rename-folder";
      renameFolder.setAttribute("aria-label", `Rename ${folder.path}`);
      renameFolder.title = `Rename ${folder.path}`;
      renameFolder.textContent = "···";
      const deleteFolder = document.createElement("button");
      deleteFolder.className = "folder-add-action";
      deleteFolder.type = "button";
      deleteFolder.dataset.action = "delete-folder";
      deleteFolder.setAttribute("aria-label", `Delete ${folder.path}`);
      deleteFolder.title = `Delete ${folder.path}`;
      deleteFolder.textContent = "×";
      actions.append(addFile, addFolder, preview, renameFolder, deleteFolder);
      row.append(toggle, actions);
      fileList.append(row);
      if (!collapsedFolders.has(folder.path)) renderNode(folder, depth + 1);
    }
    for (const file of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
    const row = document.createElement("div");
    row.className = `file-entry${file.path === activePath ? " active" : ""}`;
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.setAttribute("aria-current", file.path === activePath ? "true" : "false");
    row.dataset.path = file.path;
    row.style.paddingLeft = `${8 + depth * 13}px`;
    const icon = document.createElement("span");
    icon.className = `file-icon ${fileIconClass(file.path)}`;
    icon.textContent = fileIcon(file.path);
    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.path;
    const remove = document.createElement("button");
    remove.className = "file-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete ${file.path}`);
    remove.textContent = "×";
    const rename = document.createElement("button");
    rename.className = "file-rename";
    rename.type = "button";
    rename.setAttribute("aria-label", `Rename ${file.path}`);
    rename.textContent = "···";
    row.append(icon, name, rename, remove);
    fileList.append(row);
    }
  };
  renderNode(root);
  const heading = document.getElementById("project-toggle");
  heading.replaceChildren();
  const arrow = document.createElement("span");
  arrow.textContent = fileList.classList.contains("collapsed") ? "›" : "⌄";
  heading.append(arrow, document.createTextNode(` ${document.getElementById("project-label").textContent || "MY WORKSPACE"}`));
}

function handleEditorChange(content) {
  const file = workspace?.files.find((entry) => entry.path === activePath);
  if (file) file.content = content;
  updateLineNumbers();
  scheduleSave();
  if (searchMode === "file" && !findBar.hidden && findInput.value) findInFile();
  if (searchMode === "workspace" && !searchResults.hidden && findInput.value) renderWorkspaceSearch(findInput.value);
  if (livePreview && previewEntryPath) {
    clearTimeout(livePreviewTimer);
    livePreviewTimer = setTimeout(() => {
      const entry = workspace.files.find((file) => file.path === previewEntryPath);
      if (entry) {
        previewFrame.srcdoc = makePreviewDocument(entry.path, entry.content);
        updateBrowserPreviewLink();
      }
      else previewEntryPath = "";
    }, 500);
  }
  if (liveServerUrl) {
    clearTimeout(liveServerRefreshTimer);
    liveServerRefreshTimer = setTimeout(async () => {
      const plugin = window.Capacitor?.Plugins?.ProjectPreview;
      try {
        const result = await plugin.startServer({ files: workspace.files, entryPath: previewEntryPath });
        liveServerUrl = result.url;
      } catch (error) {
        showToast(`Could not refresh the live server files: ${error.message}`, true);
      }
    }, 500);
  }
}

function handleEditorDiagnostics(diagnostics) {
  if (localStorage.getItem("codestudio.extension.diagnostics") === "false") diagnostics = [];
  document.getElementById("problem-count").textContent = diagnostics.length ? `(${diagnostics.length})` : "";
  const container = document.getElementById("problems-output");
  container.replaceChildren();
  if (!diagnostics.length) {
    const empty = document.createElement("div");
    empty.className = "output-muted";
    empty.textContent = localStorage.getItem("codestudio.extension.diagnostics") === "false"
      ? "Syntax diagnostics are disabled in Extensions."
      : "No syntax problems detected in the current file.";
    container.append(empty);
    return;
  }
  for (const diagnostic of diagnostics) {
    const row = document.createElement("button");
    row.className = "problem-row";
    row.type = "button";
    row.dataset.from = String(diagnostic.from);
    const severity = document.createElement("span");
    severity.className = "problem-severity";
    severity.textContent = "●";
    const message = document.createElement("span");
    message.className = "problem-message";
    message.textContent = diagnostic.message;
    const location = document.createElement("span");
    location.className = "problem-location";
    location.textContent = `Line ${diagnostic.source}`;
    row.append(severity, message, location);
    container.append(row);
  }
}

function renderTabs() {
  tabbar.replaceChildren();
  for (const path of openPaths) {
    const tab = document.createElement("div");
    tab.className = `file-tab${path === activePath ? " active" : ""}`;
    tab.dataset.path = path;
    const icon = document.createElement("span");
    icon.className = `file-icon ${fileIconClass(path)}`;
    icon.textContent = fileIcon(path);
    const name = document.createElement("span");
    name.className = "file-tab-name";
    name.textContent = path.split("/").pop();
    name.title = path;
    const close = document.createElement("button");
    close.className = "file-tab-close";
    close.type = "button";
    close.setAttribute("aria-label", `Close ${path}`);
    close.textContent = "×";
    tab.append(icon, name, close);
    tabbar.append(tab);
  }
}

function updateLineNumbers() {
  document.getElementById("cursor-label").textContent = `Ln ${editor.value.slice(0, editor.selectionStart).split("\n").length}, Col ${editor.selectionStart - editor.value.lastIndexOf("\n", editor.selectionStart - 1)}`;
}

function activateFile(path) {
  const file = workspace.files.find((entry) => entry.path === path);
  if (!file) return;
  activePath = path;
  activeLessonId = path.startsWith("lessons/") && path.endsWith(".py") ? path.slice("lessons/".length, -".py".length) : "";
  if (!openPaths.includes(path)) openPaths.push(path);
  editor.value = file.content;
  editor.setLanguage(path);
  editor.disabled = false;
  document.getElementById("editor-empty").hidden = true;
  document.getElementById("active-path").textContent = path;
  document.getElementById("mobile-current-name").textContent = path.split("/").pop();
  document.getElementById("language-label").textContent = languageName(path);
  updateLineNumbers();
  renderFiles();
  renderTabs();
  scheduleSave();
  if (window.matchMedia("(max-width: 700px)").matches) {
    document.getElementById("sidebar").classList.add("mobile-hidden");
    document.body.classList.remove("keyboard-open");
  }
}

function closeTab(path) {
  openPaths = openPaths.filter((entry) => entry !== path);
  if (activePath === path) {
    const next = openPaths[openPaths.length - 1] || workspace.files[0]?.path || "";
    if (next) activateFile(next);
    else {
      activePath = "";
      editor.value = "";
      document.getElementById("active-path").textContent = "No file selected";
      document.getElementById("mobile-current-name").textContent = "No file selected";
      renderTabs();
      renderFiles();
    }
  } else {
    renderTabs();
  }
  scheduleSave();
}

function togglePanel(panelName) {
  currentPanel = panelName;
  document.querySelectorAll(".panel-tab").forEach((tab) => tab.classList.toggle("selected", tab.dataset.panel === panelName));
  output.hidden = panelName !== "console";
  document.getElementById("terminal-output").hidden = panelName !== "terminal";
  document.getElementById("problems-output").hidden = panelName !== "problems";
  document.getElementById("debug-output").hidden = panelName !== "debug";
  previewFrame.hidden = panelName !== "preview";
  document.querySelector(".terminal-input").hidden = !["terminal", "console"].includes(panelName);
  document.getElementById("open-preview-button").hidden = panelName !== "preview";
  document.getElementById("live-server-button").hidden = panelName !== "preview" && panelName !== "console";
  document.getElementById("live-preview-toggle").parentElement.hidden = !["preview", "console"].includes(panelName);
  document.getElementById("run-status").textContent = panelName === "preview" ? "HTML preview" : panelName === "problems" ? "Syntax diagnostics" : panelName === "debug" ? "Worker debugger" : "Ready";
  panel.classList.remove("panel-hidden");
}

function findPreviewEntry(folderPath = "") {
  const htmlFiles = workspace.files.filter((file) =>
    ["html", "htm"].includes(extension(file.path)) &&
    (!folderPath || file.path.startsWith(`${folderPath}/`))
  );
  return htmlFiles.find((file) => file.path === (folderPath ? `${folderPath}/index.html` : "index.html")) ||
    htmlFiles.find((file) => file.path.slice(folderPath ? folderPath.length + 1 : 0).split("/").pop().toLowerCase() === "index.html") ||
    htmlFiles.find((file) => file.path === activePath) ||
    htmlFiles[0];
}

function makePreviewDocument(path, content) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(content, "text/html");
  const base = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const findFile = (reference) => {
    const clean = reference.split(/[?#]/, 1)[0];
    const parts = (clean.startsWith("/") ? clean.slice(1) : `${base}${clean}`).split("/");
    const resolved = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") resolved.pop();
      else resolved.push(part);
    }
    return workspace.files.find((file) => file.path === resolved.join("/"));
  };

  for (const link of [...parsed.querySelectorAll('link[rel="stylesheet"][href]')]) {
    const file = findFile(link.getAttribute("href"));
    if (!file || extension(file.path) !== "css") continue;
    const style = parsed.createElement("style");
    style.textContent = file.content;
    link.replaceWith(style);
  }
  for (const script of [...parsed.querySelectorAll("script[src]")]) {
    const file = findFile(script.getAttribute("src"));
    if (!file || !["js", "mjs", "cjs"].includes(extension(file.path))) continue;
    script.removeAttribute("src");
    script.textContent = file.content;
  }
  for (const anchor of [...parsed.querySelectorAll("a[href]")]) {
    const href = anchor.getAttribute("href").trim();
    if (!href || href.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) continue;
    const file = findFile(href);
    if (file && ["html", "htm"].includes(extension(file.path))) {
      anchor.dataset.codestudioPath = file.path;
      anchor.setAttribute("href", "#");
    }
  }
  const bridgeId = crypto.randomUUID();
  const bridge = parsed.createElement("script");
  bridge.textContent = `
    (() => {
      const bridgeId = ${JSON.stringify(bridgeId)};
      const stringify = (values) => values.map((value) => {
        if (typeof value === "string") return value;
        try { const text = JSON.stringify(value); return text === undefined ? String(value) : text; }
        catch { return String(value); }
      }).join(" ");
      const send = (type, values) => parent.postMessage({ source: "codestudio-preview", bridgeId, type, text: stringify(values) }, "*");
      for (const type of ["log", "info", "warn", "error"]) {
        const original = console[type].bind(console);
        console[type] = (...values) => { send(type, values); original(...values); };
      }
      document.addEventListener("click", (event) => {
        const link = event.target.closest("a[data-codestudio-path]");
        if (!link) return;
        event.preventDefault();
        send("navigate", [link.dataset.codestudioPath]);
      });
      addEventListener("error", (event) => send("error", [event.message || "Preview runtime error"]));
      addEventListener("unhandledrejection", (event) => send("error", [event.reason?.message || String(event.reason)]));
    })();
  `;
  parsed.body.prepend(bridge);
  previewFrame.dataset.bridgeId = bridgeId;
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

function showPreview(path, content) {
  if (localStorage.getItem("codestudio.extension.preview") === "false") {
    showToast("Enable the HTML Preview extension to run this file.", true);
    return;
  }
  previewEntryPath = path;
  togglePanel("preview");
  previewFrame.srcdoc = makePreviewDocument(path, content);
  updateBrowserPreviewLink();
  document.getElementById("run-status").textContent = "Preview ready";
  if (window.matchMedia("(max-width: 700px)").matches) panel.classList.remove("panel-hidden");
}

function previewProject(folderPath = "") {
  const entry = findPreviewEntry(folderPath);
  if (!entry) {
    showToast(folderPath ? `Create an HTML file in ${folderPath} to preview it.` : "Create or import an HTML file to preview this project.", true);
    return;
  }
  showPreview(entry.path, entry.content);
  writeDebugOutput(`Project preview opened from ${entry.path}.`);
}

function formatLogValue(value) {
  if (typeof value === "string") return value;
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? String(value) : encoded;
  } catch {
    return String(value);
  }
}

function runJavaScript(code) {
  if (localStorage.getItem("codestudio.extension.javascript") === "false") {
    showToast("Enable the JavaScript Worker extension to run code.", true);
    return;
  }
  if (runnerWorker) runnerWorker.terminate();
  clearTimeout(runnerTimeout);
  runnerWorker = undefined;
  if (workerUrl) {
    URL.revokeObjectURL(workerUrl);
    workerUrl = undefined;
  }
  const safeCode = JSON.stringify(code).replace(/</g, "\\u003c");
  const workerSource = `
    const send = (type, args) => postMessage({ type, text: args.map(value => {
      if (typeof value === "string") return value;
      try { const encoded = JSON.stringify(value); return encoded === undefined ? String(value) : encoded; }
      catch { return String(value); }
    }).join(" ") });
    const scopedConsole = {
      log: (...args) => send("log", args),
      info: (...args) => send("info", args),
      warn: (...args) => send("info", args),
      error: (...args) => send("error", args),
      clear: () => postMessage({ type: "clear" })
    };
    try { new Function("console", ${safeCode})(scopedConsole); }
    catch (error) { postMessage({ type: "exception", text: error.stack || error.message }); }
    postMessage({ type: "done" });
  `;
  const blob = new Blob([workerSource], { type: "text/javascript" });
  workerUrl = URL.createObjectURL(blob);
  const runStatus = document.getElementById("run-status");
  runStatus.textContent = "Running…";
  setOutput("Running JavaScript…", "muted");
  let worker;
  try {
    worker = new Worker(workerUrl);
  } catch (error) {
    URL.revokeObjectURL(workerUrl);
    workerUrl = undefined;
    runStatus.textContent = "Run failed";
    setOutput(`Could not start the isolated JavaScript runner: ${error.message}`, "error");
    return;
  }
  runnerWorker = worker;
  let finished = false;
  const finishRun = (status) => {
    if (finished) return;
    finished = true;
    clearTimeout(runnerTimeout);
    worker.terminate();
    if (runnerWorker === worker) runnerWorker = undefined;
    runStatus.textContent = status;
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
      workerUrl = undefined;
    }
    if (output.textContent === "Running JavaScript…") setOutput("Executed successfully (no output).", "info");
  };
  runnerTimeout = setTimeout(() => {
    writeOutput("Execution stopped after 3 seconds.", "error");
    writeDebugOutput("Execution exceeded the 3-second worker limit and was terminated.");
    finishRun("Stopped");
  }, 3000);
  let hasRuntimeError = false;
  worker.onmessage = (event) => {
    const { type, text } = event.data;
    if (type !== "done") writeDebugOutput(`Worker ${type}: ${text || ""}`);
    if (type === "done") finishRun(hasRuntimeError ? "Finished with errors" : "Finished");
    else if (type === "clear") setOutput("");
    else {
      if (type === "exception") hasRuntimeError = true;
      writeOutput(text, type === "exception" || type === "error" ? "error" : type === "info" ? "info" : "normal");
    }
  };
  worker.onerror = (event) => {
    writeOutput(event.message || "The code could not be executed.", "error");
    finishRun("Run failed");
  };
  worker.onmessageerror = () => {
    writeOutput("Could not read the program output.", "error");
    finishRun("Run failed");
  };
  if (window.matchMedia("(max-width: 700px)").matches) panel.classList.remove("panel-hidden");
}

function runPython(code) {
  if (localStorage.getItem("codestudio.extension.python") === "false") {
    showToast("Enable the Offline Python Runtime extension to run Python.", true);
    return;
  }
  if (pythonRunActive) {
    showToast("Python is already running. Stop it before starting another run.");
    return;
  }
  if (pythonWorker && pythonRunTimedOut) {
    pythonWorker.terminate();
    pythonWorker = undefined;
    pythonWorkerReady = false;
    pythonRunTimedOut = false;
  }
  if (!pythonWorker) {
    try {
      pythonWorker = new Worker("python-worker.js", { type: "module" });
    } catch (error) {
      setOutput(`Could not start the offline Python runtime: ${error.message}`, "error");
      document.getElementById("run-status").textContent = "Run failed";
      return;
    }
  }

  pythonRunActive = true;
  let hasOutput = false;
  let hasError = false;
  const status = document.getElementById("run-status");
  setOutput("Loading offline Python runtime…", "muted");
  status.textContent = "Loading Python…";
  writeDebugOutput("Starting bundled Python WebAssembly runtime.");

  const finishRun = (label, terminate = false) => {
    if (!pythonRunActive) return;
    pythonRunActive = false;
    clearTimeout(runnerTimeout);
    if (terminate && pythonWorker) {
      pythonWorker.terminate();
      pythonWorker = undefined;
      pythonWorkerReady = false;
      pythonRunTimedOut = true;
    }
    status.textContent = label;
    if (!hasOutput && !hasError) setOutput("Python finished successfully (no output).", "info");
    if (window.matchMedia("(max-width: 700px)").matches) panel.classList.remove("panel-hidden");
  };

  const setExecutionTimeout = () => {
    clearTimeout(runnerTimeout);
    runnerTimeout = setTimeout(() => {
      if (pythonWorker) pythonWorker.terminate();
      pythonWorker = undefined;
      pythonWorkerReady = false;
      pythonRunTimedOut = true;
      hasError = true;
      writeOutput("Python stopped: the runtime took too long or the program ran for more than 15 seconds.", "error");
      writeDebugOutput("Python worker terminated by the execution timeout.");
      finishRun("Stopped", false);
    }, 15_000);
  };

  pythonWorker.onmessage = (event) => {
    const { type, text } = event.data;
    if (type === "ready") {
      pythonWorkerReady = true;
      writeDebugOutput("Bundled Python runtime is ready.");
    } else if (type === "status") {
      const loading = text.includes("Loading");
      status.textContent = loading ? "Loading Python…" : "Running Python…";
      if (!loading) {
        setOutput("Running Python…", "muted");
        setExecutionTimeout();
      }
    } else if (type === "log") {
      hasOutput = true;
      writeOutput(text);
    } else if (type === "stderr" || type === "error") {
      hasError = true;
      writeOutput(text, "error");
      writeDebugOutput(`Python ${type}: ${text.slice(0, 1_000)}`);
    } else if (type === "result") {
      hasOutput = true;
      writeOutput(text);
    } else if (type === "done") {
      finishRun(hasError ? "Finished with errors" : "Finished");
      const lesson = window.CodeStudioPythonLessons.find((entry) => entry.id === activeLessonId);
      if (lesson && activePath === `lessons/${lesson.id}.py` && !hasError) {
        const actual = output.innerText.trim();
        showToast(actual === lesson.expected ? "Lesson check passed!" : `Not quite yet. Hint: ${lesson.hint}`, actual !== lesson.expected);
      }
    }
  };
  pythonWorker.onerror = (event) => {
    hasError = true;
    writeOutput(`Python runtime error: ${event.message || "The bundled interpreter could not start."}`, "error");
    if (pythonWorker) pythonWorker.terminate();
    pythonWorker = undefined;
    pythonWorkerReady = false;
    finishRun("Run failed");
  };

  runnerTimeout = setTimeout(() => {
    if (pythonWorker) pythonWorker.terminate();
    pythonWorker = undefined;
    pythonWorkerReady = false;
    pythonRunTimedOut = true;
    hasError = true;
    writeOutput("The offline Python runtime did not finish loading within 60 seconds. Check free device memory and app files.", "error");
    finishRun("Python load failed");
  }, pythonWorkerReady ? 15_000 : 60_000);
  pythonWorker.postMessage({ type: "run", code, path: activePath });
  if (window.matchMedia("(max-width: 700px)").matches) panel.classList.remove("panel-hidden");
}

function runActiveFile() {
  const file = workspace.files.find((entry) => entry.path === activePath);
  if (!file) {
    showToast("Select a file before running it.", true);
    return;
  }
  if (["html", "htm"].includes(extension(file.path))) {
    showPreview(file.path, file.content);
  } else if (["js", "mjs", "cjs"].includes(extension(file.path))) {
    togglePanel("console");
    runJavaScript(file.content);
  } else if (extension(file.path) === "py") {
    togglePanel("console");
    runPython(file.content);
  } else {
    showToast(`${languageName(file.path)} has editor support but no local runtime.`, true);
  }
}

function openFind(mode) {
  searchMode = mode;
  findBar.hidden = false;
  searchResults.hidden = mode !== "workspace";
  findInput.placeholder = mode === "workspace" ? "Search all project files…" : "Find in this file…";
  findInput.value = "";
  findCount.textContent = mode === "workspace" ? "Search workspace" : "0 matches";
  searchResults.replaceChildren();
  findInput.focus();
}

function findInFile() {
  const query = findInput.value;
  lastSearchMatches = [];
  searchCursor = -1;
  if (!query) {
    findCount.textContent = "0 matches";
    return;
  }
  let index = editor.value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  while (index !== -1) {
    lastSearchMatches.push(index);
    index = editor.value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase(), index + query.length);
  }
  findCount.textContent = `${lastSearchMatches.length} match${lastSearchMatches.length === 1 ? "" : "es"}`;
  if (lastSearchMatches.length) selectNextMatch();
}

function selectNextMatch() {
  if (!lastSearchMatches.length) return;
  searchCursor = (searchCursor + 1) % lastSearchMatches.length;
  const start = lastSearchMatches[searchCursor];
  editor.focus();
  editor.setSelectionRange(start, start + findInput.value.length);
  const line = editor.value.slice(0, start).split("\n").length;
  const lineHeight = Number.parseFloat(getComputedStyle(editor.dom).lineHeight) || 20;
  editor.scrollTop = Math.max(0, (line - 2) * lineHeight);
  updateLineNumbers();
}

function renderWorkspaceSearch(query) {
  searchResults.replaceChildren();
  if (!query) {
    findCount.textContent = "Search workspace";
    return;
  }
  const matches = [];
  const normalizedQuery = query.toLocaleLowerCase();
  for (const file of workspace.files) {
    const lines = file.content.split("\n");
    lines.forEach((line, index) => {
      if (line.toLocaleLowerCase().includes(normalizedQuery)) matches.push({ path: file.path, line: index + 1, text: line.trim() });
    });
  }
  findCount.textContent = `${matches.length}${matches.length === 100 ? "+" : ""} result${matches.length === 1 ? "" : "s"}`;
  for (const match of matches.slice(0, 100)) {
    const result = document.createElement("button");
    result.className = "search-result";
    result.type = "button";
    result.dataset.path = match.path;
    result.dataset.line = String(match.line);
    const title = document.createElement("strong");
    title.textContent = `${match.path}:${match.line}`;
    const text = document.createElement("span");
    text.textContent = match.text || "(empty line)";
    result.append(title, text);
    searchResults.append(result);
  }
}

function validWorkspacePath(path) {
  return path.length > 0 && path.length <= 160 && !path.startsWith("/") && !path.includes("\\") &&
    !path.split("/").some((segment) => !segment || segment === "." || segment === "..") &&
    !/[<>:"|?*\u0000-\u001f]/.test(path);
}

function openNewFileDialog() {
  openNewFileDialogAt("src/new-file.js");
}

function openNewFileDialogAt(defaultPath) {
  fileDialogPurpose = "createFile";
  renameSourcePath = "";
  const dialog = document.getElementById("file-dialog");
  document.getElementById("file-dialog-title").textContent = "Create a file";
  dialog.querySelector("p").textContent = "Add a file anywhere in your local workspace.";
  document.querySelector("#file-form .dialog-submit").textContent = "Create file";
  const pathInput = document.getElementById("new-file-path");
  pathInput.value = defaultPath;
  pathInput.placeholder = "src/new-file.js";
  pathInput.setCustomValidity("");
  dialog.showModal();
  pathInput.focus();
  pathInput.select();
}

function openNewFolderDialog() {
  openNewFolderDialogAt("src/components");
}

function openNewFolderDialogAt(defaultPath) {
  fileDialogPurpose = "createFolder";
  renameSourcePath = "";
  const dialog = document.getElementById("file-dialog");
  document.getElementById("file-dialog-title").textContent = "Create a folder";
  dialog.querySelector("p").textContent = "Folders are created locally in this workspace.";
  document.querySelector("#file-form .dialog-submit").textContent = "Create folder";
  const pathInput = document.getElementById("new-file-path");
  pathInput.value = defaultPath;
  pathInput.placeholder = "src/components";
  pathInput.setCustomValidity("");
  dialog.showModal();
  pathInput.focus();
  pathInput.select();
}

function openRenameDialog(path) {
  fileDialogPurpose = "renameFile";
  renameSourcePath = path;
  const dialog = document.getElementById("file-dialog");
  document.getElementById("file-dialog-title").textContent = "Rename file";
  dialog.querySelector("p").textContent = `Choose a new path for ${path}.`;
  document.querySelector("#file-form .dialog-submit").textContent = "Rename";
  const pathInput = document.getElementById("new-file-path");
  pathInput.value = path;
  pathInput.placeholder = "src/renamed-file.js";
  pathInput.setCustomValidity("");
  dialog.showModal();
  pathInput.focus();
  pathInput.select();
}

function openRenameFolderDialog(path) {
  fileDialogPurpose = "renameFolder";
  renameSourcePath = path;
  const dialog = document.getElementById("file-dialog");
  document.getElementById("file-dialog-title").textContent = "Rename folder";
  dialog.querySelector("p").textContent = `Choose a new path for ${path} and its contents.`;
  document.querySelector("#file-form .dialog-submit").textContent = "Rename folder";
  const pathInput = document.getElementById("new-file-path");
  pathInput.value = path;
  pathInput.placeholder = "src/renamed-folder";
  pathInput.setCustomValidity("");
  dialog.showModal();
  pathInput.focus();
  pathInput.select();
}

function createFile(path) {
  const normalized = path.trim();
  if (!validWorkspacePath(normalized)) {
    showToast("Use a valid relative file path, such as src/app.js.", true);
    return false;
  }
  if (workspace.files.some((file) => file.path === normalized)) {
    showToast("A file with that path already exists.", true);
    return false;
  }
  workspace.files.push({ path: normalized, content: "" });
  activateFile(normalized);
  editor.focus();
  return true;
}

function createFolder(path) {
  const normalized = path.trim().replace(/\/+$/, "");
  if (!validWorkspacePath(normalized)) {
    showToast("Use a valid relative folder path, such as src/components.", true);
    return false;
  }
  workspace.folders ||= [];
  if (workspace.folders.includes(normalized) || workspace.files.some((file) => file.path === normalized)) {
    showToast("A file or folder with that path already exists.", true);
    return false;
  }
  const segments = normalized.split("/");
  for (let i = 1; i <= segments.length; i++) {
    const parentPath = segments.slice(0, i).join("/");
    if (!workspace.folders.includes(parentPath)) workspace.folders.push(parentPath);
  }
  scheduleSave();
  renderFiles();
  showToast(`Created folder ${normalized}`);
  return true;
}

function renameFolder(oldPath, newPath) {
  const normalized = newPath.trim().replace(/\/+$/, "");
  if (!validWorkspacePath(normalized) || normalized.startsWith(`${oldPath}/`)) {
    showToast("Use a valid folder path outside the folder being renamed.", true);
    return false;
  }
  const knownFolders = new Set(workspace.folders || []);
  for (const file of workspace.files) {
    if (!file.path.startsWith(`${oldPath}/`)) continue;
    const segments = file.path.split("/");
    segments.pop();
    let folderPath = "";
    for (const segment of segments) {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      knownFolders.add(folderPath);
    }
  }
  const affectedFiles = workspace.files.filter((file) => file.path.startsWith(`${oldPath}/`));
  const affectedFolders = [...knownFolders].filter((path) => path === oldPath || path.startsWith(`${oldPath}/`));
  if (!affectedFolders.length || (knownFolders.has(normalized) && normalized !== oldPath)) {
    showToast("A folder with that path already exists or the folder was removed.", true);
    return false;
  }
  const replacements = affectedFiles.map((file) => [file, `${normalized}${file.path.slice(oldPath.length)}`]);
  const remainingPaths = new Set(workspace.files.filter((file) => !affectedFiles.includes(file)).map((file) => file.path));
  if (replacements.some(([, path]) => remainingPaths.has(path))) {
    showToast("Renaming this folder would overwrite an existing file.", true);
    return false;
  }
  for (const [file, path] of replacements) file.path = path;
  workspace.folders = (workspace.folders || [])
    .filter((path) => path !== oldPath && !path.startsWith(`${oldPath}/`))
    .concat(affectedFolders.map((path) => `${normalized}${path.slice(oldPath.length)}`));
  openPaths = openPaths.map((path) => path.startsWith(`${oldPath}/`) ? `${normalized}${path.slice(oldPath.length)}` : path);
  if (activePath.startsWith(`${oldPath}/`)) activePath = `${normalized}${activePath.slice(oldPath.length)}`;
  const collapsed = [...collapsedFolders].filter((path) => path === oldPath || path.startsWith(`${oldPath}/`));
  for (const path of collapsed) collapsedFolders.delete(path);
  for (const path of collapsed) collapsedFolders.add(`${normalized}${path.slice(oldPath.length)}`);
  renderFiles();
  renderTabs();
  if (activePath) activateFile(activePath);
  scheduleSave();
  showToast(`Renamed folder to ${normalized}`);
  return true;
}

function deleteFolder(path) {
  const files = workspace.files.filter((file) => file.path.startsWith(`${path}/`));
  if (workspace.files.length - files.length < 1) {
    showToast("Keep at least one file in the workspace.", true);
    return;
  }
  if (!confirm(`Delete folder ${path} and all ${files.length} file(s) inside it?`)) return;
  workspace.files = workspace.files.filter((file) => !file.path.startsWith(`${path}/`));
  workspace.folders = (workspace.folders || []).filter((folder) => folder !== path && !folder.startsWith(`${path}/`));
  const removedPaths = new Set(files.map((file) => file.path));
  openPaths = openPaths.filter((entry) => !removedPaths.has(entry));
  if (removedPaths.has(activePath)) activePath = openPaths[openPaths.length - 1] || workspace.files[0].path;
  for (const folder of [...collapsedFolders]) if (folder === path || folder.startsWith(`${path}/`)) collapsedFolders.delete(folder);
  activateFile(activePath);
  showToast(`Deleted folder ${path}`);
}

function renameFile(oldPath, newPath) {
  const normalized = newPath.trim();
  if (!validWorkspacePath(normalized)) {
    showToast("Use a valid relative file path.", true);
    return false;
  }
  if (normalized !== oldPath && workspace.files.some((file) => file.path === normalized)) {
    showToast("A file with that path already exists.", true);
    return false;
  }
  const file = workspace.files.find((entry) => entry.path === oldPath);
  if (!file) {
    showToast("That file no longer exists.", true);
    return false;
  }
  file.path = normalized;
  openPaths = openPaths.map((path) => path === oldPath ? normalized : path);
  if (activePath === oldPath) activePath = normalized;
  renderFiles();
  renderTabs();
  activateFile(normalized);
  scheduleSave();
  showToast(`Renamed to ${normalized}`);
  return true;
}

function deleteFile(path) {
  if (workspace.files.length < 2) {
    showToast("Keep at least one file in the workspace.", true);
    return;
  }
  if (!confirm(`Delete ${path} from this device?`)) return;
  workspace.files = workspace.files.filter((file) => file.path !== path);
  closeTab(path);
  renderFiles();
  scheduleSave();
  showToast(`Deleted ${path}`);
}

function importFile(file) {
  if (file.size > 2_000_000) {
    showToast("Files larger than 2 MB cannot be imported as text.", true);
    return;
  }
  if (!validWorkspacePath(file.name)) {
    showToast("The imported filename is not a safe workspace path.", true);
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast("Could not read the selected file.", true);
  reader.onload = () => {
    const path = file.name;
    const existing = workspace.files.find((entry) => entry.path === path);
    if (existing && !confirm(`Replace ${path}?`)) return;
    if (existing) existing.content = String(reader.result);
    else workspace.files.push({ path, content: String(reader.result) });
    activateFile(path);
    scheduleSave();
    showToast(`Imported ${path}`);
  };
  reader.readAsText(file);
}

function exportActiveFile() {
  const file = workspace.files.find((entry) => entry.path === activePath);
  if (!file) {
    showToast("Select a file before exporting it.", true);
    return;
  }
  const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.path.split("/").pop();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Exported ${file.path.split("/").pop()}`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportProject() {
  try {
    const blob = await window.createProjectArchive(workspace.files, workspace.folders || []);
    const name = (workspace.projectName || "codestudio-project").replace(/[^a-z0-9_-]/gi, "-");
    downloadBlob(blob, `${name}.zip`);
    showToast(`Exported ${workspace.files.length} project files.`);
  } catch (error) {
    showToast(`Could not create ZIP archive: ${error.message}`, true);
  }
}

function mergeProjectFiles(importedFiles, projectName, importedFolders = []) {
  if ((!importedFiles.length && !importedFolders.length) || importedFiles.length > 500 || importedFolders.length > 500) {
    throw new Error("Projects must contain files or folders, with at most 500 of each.");
  }
  const paths = new Set();
  let size = 0;
  for (const file of importedFiles) {
    if (!validWorkspacePath(file.path) || typeof file.content !== "string" || file.content.length > 2_000_000) {
      throw new Error("A project file has an invalid path or exceeds the 2 MB text-file limit.");
    }
    if (paths.has(file.path)) throw new Error(`Duplicate project path: ${file.path}`);
    paths.add(file.path);
    size += file.content.length;
    if (size > 20_000_000) throw new Error("Project text files exceed the 20 MB import limit.");
  }
  const folders = new Set();
  for (const importedFolder of importedFolders) {
    const folder = importedFolder.replace(/\/+$/, "");
    if (!validWorkspacePath(folder)) throw new Error(`Unsafe project folder path: ${importedFolder}`);
    if (paths.has(folder) || workspace.files.some((file) => file.path === folder)) {
      throw new Error(`A project file conflicts with folder path ${folder}.`);
    }
    folders.add(folder);
  }
  const conflicts = importedFiles.filter((file) => workspace.files.some((current) => current.path === file.path));
  if (conflicts.length && !confirm(`Replace ${conflicts.length} matching file${conflicts.length === 1 ? "" : "s"} and merge the imported project?`)) return;
  const replacements = new Map(importedFiles.map((file) => [file.path, file.content]));
  workspace.files = workspace.files.filter((file) => !replacements.has(file.path));
  workspace.files.push(...importedFiles);
  workspace.folders ||= [];
  for (const folder of folders) if (!workspace.folders.includes(folder)) workspace.folders.push(folder);
  for (const file of importedFiles) {
    const segments = file.path.split("/");
    segments.pop();
    for (let i = 1; i <= segments.length; i++) {
      const folder = segments.slice(0, i).join("/");
      if (!workspace.folders.includes(folder)) workspace.folders.push(folder);
    }
  }
  if (projectName) {
    workspace.projectName = projectName.slice(0, 60);
    document.getElementById("project-label").textContent = workspace.projectName.toUpperCase();
  }
  for (const file of importedFiles) if (!openPaths.includes(file.path)) openPaths.push(file.path);
  const firstPath = importedFiles.some((file) => file.path === activePath) ? activePath : importedFiles[0]?.path;
  renderFiles();
  renderTabs();
  if (firstPath) activateFile(firstPath);
  scheduleSave();
  showToast(`Imported ${importedFiles.length} files and ${importedFolders.length} folders.`);
}

async function importProjectSelection(fileList) {
  const selectedFiles = Array.from(fileList);
  if (!selectedFiles.length) return;
  try {
    let imported;
    let importedFolders = [];
    let projectName = "";
    if (selectedFiles.length === 1 && selectedFiles[0].name.toLowerCase().endsWith(".zip")) {
      const archive = await window.readProjectArchive(selectedFiles[0]);
      imported = archive.files;
      importedFolders = archive.folders;
    } else {
      if (selectedFiles.length > 500) throw new Error("Projects are limited to 500 files.");
      let totalBytes = 0;
      for (const file of selectedFiles) {
        if (file.size > 2_000_000) throw new Error(`${file.name} exceeds the 2 MB per-file import limit.`);
        totalBytes += file.size;
        if (totalBytes > 20_000_000) throw new Error("Projects are limited to 20 MB of imported files.");
      }
      const firstRelative = selectedFiles[0].webkitRelativePath || selectedFiles[0].name;
      projectName = firstRelative.split("/")[0] || "";
      imported = await Promise.all(selectedFiles.map(async (file) => ({
        path: file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name,
        content: await file.text()
      })));
    }
    mergeProjectFiles(imported, projectName, importedFolders);
  } catch (error) {
    showToast(`Could not import project: ${error.message}`, true);
  }
}

function getAgentSettings() {
  return {
    endpoint: localStorage.getItem("codestudio.agentEndpoint") || "",
    token: sessionStorage.getItem("codestudio.agentToken") || ""
  };
}

function openAgents() {
  const dialog = document.getElementById("agent-dialog");
  const settings = getAgentSettings();
  document.getElementById("agent-endpoint").value = settings.endpoint;
  document.getElementById("agent-token").value = settings.token;
  dialog.showModal();
  document.getElementById("agent-prompt").focus();
}

function showAgentMessage(message, role = "agent", isError = false) {
  const item = document.createElement("div");
  item.className = `agent-message${role === "user" ? " user" : ""}${isError ? " error" : ""}`;
  item.textContent = message;
  document.getElementById("agent-messages").append(item);
  item.scrollIntoView({ block: "nearest" });
}

function buildAgentContext() {
  const sorted = [...workspace.files].sort((a, b) => Number(b.path === activePath) - Number(a.path === activePath));
  const files = [];
  let size = 0;
  let skipped = 0;
  for (const file of sorted) {
    if (files.length >= 50 || file.content.length > 30_000 || size + file.content.length > 100_000) {
      skipped += 1;
      continue;
    }
    files.push({ path: file.path, content: file.content });
    size += file.content.length;
  }
  if (!files.length) throw new Error("Add a text file smaller than 30 KB before using an agent.");
  return { files, skipped };
}

async function requestAgent(mode, prompt) {
  const settings = getAgentSettings();
  if (!settings.endpoint) throw new Error("Connect an HTTPS backend in AI agent settings first.");
  if (!settings.token) throw new Error("Enter the backend access token configured by your server administrator.");
  const context = buildAgentContext();
  if (context.skipped) showAgentMessage(`For this request, included ${context.files.length} files; ${context.skipped} larger/excess file(s) were left out.`, "agent");
  const endpoint = `${settings.endpoint.replace(/\/+$/, "")}/api/agents/${mode === "build" ? "build" : "ask"}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.token}` },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ prompt, activePath, files: context.files })
    });
  } catch (error) {
    throw new Error(error.name === "TimeoutError" ? "AI request timed out. Try a smaller request." : `Could not reach the configured backend: ${error.message}`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Backend returned HTTP ${response.status} with an invalid response.`);
  }
  if (!response.ok) throw new Error(result.error || `AI backend returned HTTP ${response.status}.`);
  if (typeof result.message !== "string" || !Array.isArray(result.changes)) throw new Error("AI backend returned an invalid response shape.");
  return result;
}

function renderAgentProposal(changes) {
  proposedChanges = changes;
  const proposal = document.getElementById("agent-proposal");
  proposal.replaceChildren();
  if (!changes.length) {
    proposal.hidden = true;
    return;
  }
  const summary = document.createElement("div");
  summary.className = "agent-notice";
  summary.textContent = `${changes.length} proposed file change${changes.length === 1 ? "" : "s"}. Review the result, then apply it to this local workspace.`;
  proposal.append(summary);
  for (const change of changes) {
    const details = document.createElement("details");
    details.className = "proposal-file";
    const summary = document.createElement("summary");
    summary.textContent = `${workspace.files.some((file) => file.path === change.path) ? "Update" : "Create"}  ${change.path}  ·  ${change.content.length.toLocaleString()} chars`;
    const code = document.createElement("pre");
    code.textContent = change.content;
    details.append(summary, code);
    proposal.append(details);
  }
  const actions = document.createElement("div");
  actions.className = "proposal-actions";
  const discard = document.createElement("button");
  discard.type = "button";
  discard.textContent = "Discard";
  discard.addEventListener("click", () => renderAgentProposal([]));
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "apply-proposal";
  apply.textContent = "Apply to workspace";
  apply.addEventListener("click", applyAgentProposal);
  actions.append(discard, apply);
  proposal.append(actions);
  proposal.hidden = false;
}

async function applyAgentProposal() {
  if (!proposedChanges.length) return;
  const paths = new Set();
  let total = 0;
  for (const change of proposedChanges) {
    if (!validWorkspacePath(change.path) || typeof change.content !== "string" || change.content.length > 50_000 || paths.has(change.path)) {
      showToast("The proposed changes failed local validation and were not applied.", true);
      return;
    }
    paths.add(change.path);
    total += change.content.length;
    if (total > 180_000) {
      showToast("The proposed changes are too large to apply.", true);
      return;
    }
  }
  const files = workspace.files.map((file) => ({ ...file }));
  for (const change of proposedChanges) {
    const existing = files.find((file) => file.path === change.path);
    if (existing) existing.content = change.content;
    else files.push({ path: change.path, content: change.content });
  }
  const nextWorkspace = { ...workspace, files };
  try {
    await saveWorkspace(nextWorkspace);
    workspace = nextWorkspace;
    for (const change of proposedChanges) if (!openPaths.includes(change.path)) openPaths.push(change.path);
    renderFiles();
    renderTabs();
    const nextPath = proposedChanges.some((change) => change.path === activePath) ? activePath : proposedChanges[0].path;
    renderAgentProposal([]);
    activateFile(nextPath);
    showAgentMessage("Changes applied and saved to this device. Run the project and review the result.", "agent");
  } catch (error) {
    showToast(`Could not save the proposed changes: ${error.message}`, true);
  }
}

async function saveAgentSettings() {
  const endpointField = document.getElementById("agent-endpoint");
  const tokenField = document.getElementById("agent-token");
  let settingsSaved = false;
  try {
    const endpoint = new URL(endpointField.value.trim());
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !(isLoopback && endpoint.protocol === "http:")) {
      throw new Error("Use HTTPS, except for a local development server.");
    }
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error("The backend URL cannot contain credentials, query parameters or a fragment.");
    }
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
    localStorage.setItem("codestudio.agentEndpoint", endpoint.toString().replace(/\/+$/, ""));
    sessionStorage.setItem("codestudio.agentToken", tokenField.value.trim());
    settingsSaved = true;
    document.getElementById("agent-notice").textContent = "Checking your private backend…";
    const response = await fetch(`${endpoint.toString().replace(/\/+$/, "")}/api/health`, {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Backend health check returned HTTP ${response.status}.`);
    const health = await response.json();
    if (!health.aiConfigured) throw new Error("Backend is reachable but has no server-side AI provider key configured.");
    if (!health.ready) throw new Error("Backend is missing required AI or access-token configuration.");
    document.getElementById("agent-notice").textContent = "Backend is reachable. File contents are sent there only when you submit a prompt. Review changes before applying them.";
    showToast("AI backend is reachable and configured.");
  } catch (error) {
    if (!settingsSaved) {
      showToast(`Backend settings not saved: ${error.message}`, true);
      return;
    }
    if (error instanceof TypeError || error.name === "TimeoutError") {
      document.getElementById("agent-notice").textContent = "Backend settings saved, but it could not be reached. Check HTTPS, CORS, the URL and server status.";
      showToast(`Backend settings saved; connection failed: ${error.message}`, true);
      return;
    }
    document.getElementById("agent-notice").textContent = `Settings are saved, but the backend check failed: ${error.message}`;
    showToast(`Settings saved, backend check failed: ${error.message}`, true);
  }
}

function addFeatureCard(container, titleText, detailText, actionLabel, onAction) {
  const card = document.createElement("section");
  card.className = "feature-card";
  const title = document.createElement("strong");
  title.textContent = titleText;
  const detail = document.createElement("p");
  detail.textContent = detailText;
  const button = document.createElement("button");
  button.className = "feature-action";
  button.type = "button";
  button.textContent = actionLabel;
  button.addEventListener("click", onAction);
  card.append(title, detail, button);
  container.append(card);
}

async function createTemplateProject(template) {
  try {
    await persistCurrentWorkspace();
    const project = {
      projectName: template.projectName,
      files: template.files.map((file) => ({ ...file })),
      folders: [...template.folders],
      openPaths: [],
      activePath: template.files.find((file) => file.path === "index.html")?.path || template.files[0]?.path || ""
    };
    await createProjectWorkspace(project);
    window.location.reload();
  } catch (error) {
    showToast(`Could not create project: ${error.message}`, true);
  }
}

async function renderProjectManager(container) {
  container.replaceChildren();
  const projects = await listProjectWorkspaces();
  const currentId = getCurrentProjectId();
  const heading = document.createElement("p");
  heading.className = "feature-notice";
  heading.textContent = "Projects are stored only on this device. Select one to open it, or make a separate copy before experimenting.";
  container.append(heading);
  for (const project of projects) {
    const card = document.createElement("section");
    card.className = "feature-card project-card";
    const title = document.createElement("strong");
    title.textContent = project.projectName + (project.id === currentId ? " · OPEN" : "");
    const details = document.createElement("p");
    details.textContent = `${project.data.files.length} files · ${project.data.folders?.length || 0} folders`;
    const rename = document.createElement("input");
    rename.className = "project-rename-input";
    rename.value = project.projectName;
    rename.maxLength = 48;
    rename.setAttribute("aria-label", `Project name for ${project.projectName}`);
    const actions = document.createElement("div");
    actions.className = "feature-card-actions";
    const open = document.createElement("button");
    open.className = "feature-action primary";
    open.type = "button";
    open.textContent = project.id === currentId ? "Currently open" : "Open";
    open.disabled = project.id === currentId;
    open.addEventListener("click", () => {
      Promise.all([persistCurrentWorkspace(), stopProjectServer()]).then(() => {
        setCurrentProjectId(project.id);
        touchRecentProject(project.id);
        window.location.reload();
      }).catch((error) => showToast(`Could not save the open project: ${error.message}`, true));
    });
    const saveName = document.createElement("button");
    saveName.className = "feature-action";
    saveName.type = "button";
    saveName.textContent = "Rename";
    saveName.addEventListener("click", async () => {
      const name = rename.value.trim();
      if (!name || name.length > 48) {
        showToast("Project names must be 1–48 characters.", true);
        return;
      }
      try {
        if (project.id === getCurrentProjectId()) {
          await persistCurrentWorkspace();
          workspace.projectName = name;
          await saveWorkspace(workspace, project.id);
          document.getElementById("project-label").textContent = name.toUpperCase();
        } else {
          project.data.projectName = name;
          await saveWorkspace(project.data, project.id);
        }
        showToast("Project renamed.");
        renderProjectManager(container);
      } catch (error) {
        showToast(`Could not rename project: ${error.message}`, true);
      }
    });
    const duplicate = document.createElement("button");
    duplicate.className = "feature-action";
    duplicate.type = "button";
    duplicate.textContent = "Duplicate";
    duplicate.addEventListener("click", async () => {
      try {
        if (project.id === currentId) await persistCurrentWorkspace();
        const copy = JSON.parse(JSON.stringify(project.id === currentId ? workspace : project.data));
        copy.projectName = `${project.projectName} copy`.slice(0, 48);
        const activeId = getCurrentProjectId();
        setCurrentProjectId(project.id);
        await createProjectWorkspace(copy);
        setCurrentProjectId(activeId);
        showToast("Project duplicated.");
        renderProjectManager(container);
      } catch (error) {
        setCurrentProjectId(currentId);
        showToast(`Could not duplicate project: ${error.message}`, true);
      }
    });
    const remove = document.createElement("button");
    remove.className = "feature-action danger";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.disabled = project.id === currentId;
    remove.title = project.id === currentId ? "Open another project before deleting this one." : "Delete this local project";
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete project "${project.projectName}" from this device?`)) return;
      try {
        await deleteProjectWorkspace(project.id);
        showToast("Project deleted from this device.");
        renderProjectManager(container);
      } catch (error) {
        showToast(`Could not delete project: ${error.message}`, true);
      }
    });
    actions.append(open, saveName, duplicate, remove);
    card.append(title, details, rename, actions);
    container.append(card);
  }
}

function renderTemplates(container) {
  container.replaceChildren();
  const notice = document.createElement("p");
  notice.className = "feature-notice";
  notice.textContent = "A new project is saved separately; your current workspace stays untouched.";
  container.append(notice);
  for (const template of window.CodeStudioProjectCatalog) {
    addFeatureCard(container, template.name, template.description, "Create project", () => createTemplateProject(template));
  }
}

function renderPythonLessons(container) {
  container.replaceChildren();
  const notice = document.createElement("p");
  notice.className = "feature-notice";
  notice.textContent = "Choose a lesson to create an editable Python file. Run it, then use Check answer to compare its output with the exercise.";
  container.append(notice);
  for (const lesson of window.CodeStudioPythonLessons) {
    addFeatureCard(container, `${lesson.title} · ${lesson.level}`, lesson.challenge, "Open lesson", () => {
      const path = `lessons/${lesson.id}.py`;
      let file = workspace.files.find((entry) => entry.path === path);
      if (!file) workspace.files.push(file = { path, content: lesson.starter });
      workspace.folders ||= [];
      if (!workspace.folders.includes("lessons")) workspace.folders.push("lessons");
      activeLessonId = lesson.id;
      activateFile(path);
      document.getElementById("features-dialog").close();
      showToast(`Lesson opened. Hint: ${lesson.hint}`);
    });
  }
}

function currentGitState() {
  workspace.localGit ||= { currentBranch: "main", branches: { main: null }, commits: [] };
  workspace.localGit.branches ||= { main: null };
  workspace.localGit.commits ||= [];
  if (!Object.hasOwn(workspace.localGit.branches, workspace.localGit.currentBranch)) {
    workspace.localGit.currentBranch = "main";
    workspace.localGit.branches.main ??= null;
  }
  return workspace.localGit;
}

function snapshotForCommit(commitId) {
  return currentGitState().commits.find((commit) => commit.id === commitId);
}

function applyCommitSnapshot(commit) {
  if (!commit) return;
  workspace.files = commit.files.map((file) => ({ ...file }));
  workspace.folders = [...commit.folders];
  workspace.projectName = commit.projectName;
  openPaths = [];
  activePath = workspace.files[0]?.path || "";
  if (activePath) activateFile(activePath);
  scheduleSave();
}

function renderLocalGit(container) {
  container.replaceChildren();
  const git = currentGitState();
  const branchNames = Object.keys(git.branches);
  const currentCommit = snapshotForCommit(git.branches[git.currentBranch]);
  const baselineFiles = new Map((currentCommit?.files || []).map((file) => [file.path, file.content]));
  const changes = workspace.files.filter((file) => baselineFiles.get(file.path) !== file.content).map((file) => file.path);
  for (const path of baselineFiles.keys()) if (!workspace.files.some((file) => file.path === path)) changes.push(path);

  const notice = document.createElement("p");
  notice.className = "feature-notice";
  notice.textContent = "Offline snapshots on this device (not a real Git repository). GitHub push/pull and remote authentication are not configured; export a ZIP to move projects safely.";
  container.append(notice);
  const branchLabel = document.createElement("label");
  branchLabel.className = "feature-label";
  branchLabel.textContent = `Current branch: ${git.currentBranch}`;
  const select = document.createElement("select");
  select.className = "feature-select";
  select.setAttribute("aria-label", "Local snapshot branch");
  for (const name of branchNames) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === git.currentBranch;
    select.append(option);
  }
  select.addEventListener("change", () => {
    const commit = snapshotForCommit(git.branches[select.value]);
    if (changes.length && !confirm("Switching branches replaces the current files. Uncommitted edits will be lost. Continue?")) {
      select.value = git.currentBranch;
      return;
    }
    git.currentBranch = select.value;
    if (commit) applyCommitSnapshot(commit);
    else {
      activePath = workspace.files[0]?.path || "";
      if (activePath) activateFile(activePath);
    }
    scheduleSave();
    renderLocalGit(container);
  });
  container.append(branchLabel, select);

  const commitInput = document.createElement("input");
  commitInput.className = "feature-input";
  commitInput.placeholder = "Snapshot message";
  commitInput.maxLength = 120;
  commitInput.setAttribute("aria-label", "Snapshot message");
  const commitButton = document.createElement("button");
  commitButton.className = "feature-action primary";
  commitButton.type = "button";
  commitButton.textContent = `Save snapshot (${changes.length} changed)`;
  commitButton.disabled = changes.length === 0;
  commitButton.addEventListener("click", () => {
    const message = commitInput.value.trim();
    if (!message) {
      showToast("Enter a message for this snapshot.", true);
      return;
    }
    const commit = {
      id: crypto.randomUUID(),
      message,
      date: new Date().toISOString(),
      projectName: workspace.projectName,
      files: workspace.files.map((file) => ({ ...file })),
      folders: [...(workspace.folders || [])]
    };
    const snapshotSize = commit.files.reduce((total, file) => total + file.path.length + file.content.length, commit.projectName.length);
    if (snapshotSize > 1_000_000) {
      showToast("This project is too large for a local snapshot (limit: 1 million characters).", true);
      return;
    }
    git.commits.unshift(commit);
    git.branches[git.currentBranch] = commit.id;
    const protectedCommits = new Set(Object.values(git.branches).filter(Boolean));
    git.commits = git.commits.filter((entry, index) => index < 20 || protectedCommits.has(entry.id));
    scheduleSave();
    renderLocalGit(container);
    showToast("Local snapshot saved.");
  });
  const branchInput = document.createElement("input");
  branchInput.className = "feature-input";
  branchInput.placeholder = "New branch name";
  branchInput.maxLength = 32;
  branchInput.setAttribute("aria-label", "New local branch name");
  const branchButton = document.createElement("button");
  branchButton.className = "feature-action";
  branchButton.type = "button";
  branchButton.textContent = "Create branch";
  branchButton.addEventListener("click", () => {
    const name = branchInput.value.trim();
    if (!/^[a-z0-9][a-z0-9._/-]{0,31}$/i.test(name) || Object.hasOwn(git.branches, name) || Object.keys(git.branches).length >= 20) {
      showToast("Choose a unique branch name using letters, numbers, ., _, / or -.", true);
      return;
    }
    git.branches[name] = git.branches[git.currentBranch];
    git.currentBranch = name;
    scheduleSave();
    renderLocalGit(container);
    showToast(`Created local branch ${name}.`);
  });
  const commitArea = document.createElement("div");
  commitArea.className = "feature-inline-form";
  commitArea.append(commitInput, commitButton);
  const branchArea = document.createElement("div");
  branchArea.className = "feature-inline-form";
  branchArea.append(branchInput, branchButton);
  container.append(commitArea, branchArea);

  const changeList = document.createElement("ul");
  changeList.className = "feature-change-list";
  if (!changes.length) {
    const empty = document.createElement("li");
    empty.textContent = "No file changes since the latest snapshot.";
    changeList.append(empty);
  } else {
    for (const path of changes.slice(0, 100)) {
      const row = document.createElement("li");
      row.textContent = `${baselineFiles.has(path) ? "M" : "A"}  ${path}`;
      changeList.append(row);
    }
  }
  container.append(changeList);

  const history = document.createElement("div");
  history.className = "feature-history";
  for (const commit of git.commits.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "feature-history-row";
    const details = document.createElement("span");
    details.textContent = `${commit.message} · ${new Date(commit.date).toLocaleString()}`;
    const restore = document.createElement("button");
    restore.className = "feature-action";
    restore.type = "button";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => {
      if (!confirm(`Restore snapshot "${commit.message}"? Current edits will be replaced.`)) return;
      applyCommitSnapshot(commit);
      showToast("Snapshot restored.");
      renderLocalGit(container);
    });
    row.append(details, restore);
    history.append(row);
  }
  container.append(history);
}

function formatCurrentFile() {
  const content = editor.value;
  const formatted = content.split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n");
  const normalized = formatted ? `${formatted}\n` : "";
  editor.value = normalized;
  handleEditorChange(normalized);
  showToast("Removed trailing spaces and normalized the final newline.");
}

function renderFeatureView(action) {
  const container = document.getElementById("feature-content");
  container.replaceChildren();
  if (action === "new-project") {
    renderTemplates(container);
    return;
  }
  if (action === "projects") {
    renderProjectManager(container).catch((error) => showToast(`Could not list projects: ${error.message}`, true));
    return;
  }
  if (action === "lessons") {
    renderPythonLessons(container);
    return;
  }
  if (action === "git") {
    renderLocalGit(container);
    return;
  }
  if (action === "publish") {
    const hasBuildConfig = workspace.files.some((file) => file.path === "package.json");
    addFeatureCard(container, "Export deployable website", "Export this project as a ZIP, then upload it to a static host such as GitHub Pages or Netlify. Hosting requires an account and internet access.", "Export project ZIP", exportProject);
    addFeatureCard(container, "React / Vite projects", hasBuildConfig
      ? "Build with npm in a desktop environment, then import the generated dist folder and preview its index.html. This phone app does not run npm or Vite."
      : "Use the React + Vite template, build it in a desktop Node.js environment, then import dist and preview index.html.", "Build instructions", () => showToast("See the project README for the desktop build steps."));
    return;
  }
  if (action === "replace") {
    const notice = document.createElement("p");
    notice.className = "feature-notice";
    notice.textContent = "Replace matching text in every project file. Changes are saved locally and can be reviewed in the local snapshot tool.";
    const search = document.createElement("input");
    search.className = "feature-input";
    search.placeholder = "Find text";
    search.setAttribute("aria-label", "Find text in project");
    const replacement = document.createElement("input");
    replacement.className = "feature-input";
    replacement.placeholder = "Replace with";
    replacement.setAttribute("aria-label", "Replacement text");
    const button = document.createElement("button");
    button.className = "feature-action primary";
    button.type = "button";
    button.textContent = "Replace in all files";
    button.addEventListener("click", () => {
      if (!search.value) {
        showToast("Enter the text to find.", true);
        return;
      }
      let count = 0;
      for (const file of workspace.files) {
        const parts = file.content.split(search.value);
        if (parts.length > 1) {
          count += parts.length - 1;
          file.content = parts.join(replacement.value);
        }
      }
      scheduleSave();
      if (count) activateFile(activePath);
      showToast(`Replaced ${count} occurrence${count === 1 ? "" : "s"}.`);
    });
    container.append(notice, search, replacement, button);
    return;
  }
  if (action === "editor") {
    const notice = document.createElement("p");
    notice.className = "feature-notice";
    notice.textContent = "Editor helpers for the current file. Formatting is a safe whitespace tidy, not a language-specific formatter.";
    const format = document.createElement("button");
    format.className = "feature-action primary";
    format.type = "button";
    format.textContent = "Tidy current file";
    format.addEventListener("click", formatCurrentFile);
    const font = document.createElement("input");
    font.type = "range";
    font.min = "11";
    font.max = "20";
    font.value = String(Number.parseFloat(getComputedStyle(editor.dom).fontSize));
    font.setAttribute("aria-label", "Editor font size");
    font.addEventListener("input", () => { editor.dom.style.fontSize = `${font.value}px`; });
    const theme = document.createElement("button");
    theme.className = "feature-action";
    theme.type = "button";
    theme.textContent = document.documentElement.dataset.theme === "light" ? "Use dark theme" : "Use light theme";
    theme.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("codestudio.theme", next);
      theme.textContent = next === "light" ? "Use dark theme" : "Use light theme";
    });
    container.append(notice, format, font, theme);
    return;
  }
}

function renderExtensions() {
  const extensions = [
    { id: "diagnostics", name: "Syntax diagnostics", description: "Show parser errors in Problems as you type." },
    { id: "javascript", name: "JavaScript Worker", description: "Run JavaScript in a disposable Worker with a timeout." },
    { id: "python", name: "Offline Python 3 Runtime", description: "Run Python 3.14 in a bundled WebAssembly Worker without an internet connection." },
    { id: "preview", name: "HTML Live Preview", description: "Preview local HTML/CSS/JavaScript in a restricted iframe." },
    { id: "live-preview", name: "Refresh preview while typing", description: "Refresh the open HTML preview after edits." }
  ];
  const list = document.getElementById("extension-list");
  list.replaceChildren();
  for (const extensionItem of extensions) {
    const row = document.createElement("label");
    row.className = "extension-card";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = extensionItem.name;
    const description = document.createElement("span");
    description.textContent = extensionItem.description;
    details.append(title, description);
    const checkbox = document.createElement("input");
    checkbox.className = "extension-toggle";
    checkbox.type = "checkbox";
    const savedState = localStorage.getItem(`codestudio.extension.${extensionItem.id}`);
    checkbox.checked = savedState === null || savedState === "true";
    checkbox.setAttribute("aria-label", `${extensionItem.name} enabled`);
    checkbox.addEventListener("change", () => {
      localStorage.setItem(`codestudio.extension.${extensionItem.id}`, String(checkbox.checked));
      if (extensionItem.id === "live-preview") {
        livePreview = checkbox.checked;
        document.getElementById("live-preview-toggle").checked = livePreview;
      }
      if (extensionItem.id === "diagnostics") editor.forceLinting();
      if (extensionItem.id === "live-preview" && checkbox.checked && previewEntryPath) {
        const file = workspace.files.find((entry) => entry.path === previewEntryPath);
        if (file) {
          previewFrame.srcdoc = makePreviewDocument(file.path, file.content);
          updateBrowserPreviewLink();
        }
      }
      showToast(`${extensionItem.name} ${checkbox.checked ? "enabled" : "disabled"}.`);
    });
    row.append(details, checkbox);
    list.append(row);
  }
}

async function handleAgentSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("agent-prompt");
  const prompt = input.value.trim();
  if (!prompt) return;
  showAgentMessage(prompt, "user");
  input.value = "";
  const send = document.querySelector(".agent-send");
  send.disabled = true;
  send.textContent = "Thinking…";
  try {
    const response = await requestAgent(agentMode, prompt);
    showAgentMessage(response.message, "agent");
    if (agentMode === "build") renderAgentProposal(response.changes);
  } catch (error) {
    showAgentMessage(error.message, "agent", true);
  } finally {
    send.disabled = false;
    send.textContent = "Send";
  }
}

function runCommand() {
  const input = document.getElementById("command-input");
  const command = input.value.trim().toLowerCase();
  input.value = "";
  if (!command) return;
  togglePanel("terminal");
  writeTerminalOutput(`› ${command}`, "info");
  if (command === "help") {
    writeTerminalOutput("Actions: help, clear, files, run");
  } else if (command === "clear") {
    document.getElementById("terminal-output").replaceChildren();
  } else if (command === "files") {
    workspace.files.forEach((file) => writeTerminalOutput(file.path));
  } else if (command === "run") {
    runActiveFile();
  } else {
    writeTerminalOutput(`Unknown action: ${command}. Type "help" for available actions.`, "error");
  }
}

fileList.addEventListener("click", (event) => {
  const folderAction = event.target.closest(".folder-add-action");
  if (folderAction) {
    const folder = folderAction.closest(".folder-entry")?.dataset.folder;
    if (!folder) return;
    if (folderAction.dataset.action === "new-file") openNewFileDialogAt(`${folder}/new-file.html`);
    else if (folderAction.dataset.action === "new-folder") openNewFolderDialogAt(`${folder}/new-folder`);
    else if (folderAction.dataset.action === "preview") previewProject(folder);
    else if (folderAction.dataset.action === "rename-folder") openRenameFolderDialog(folder);
    else if (folderAction.dataset.action === "delete-folder") deleteFolder(folder);
    return;
  }
  const row = event.target.closest(".file-entry");
  if (!row) {
    const folderToggle = event.target.closest(".folder-toggle");
    if (folderToggle) {
      const folder = folderToggle.closest(".folder-entry");
      if (!folder) return;
      const path = folder.dataset.folder;
      if (collapsedFolders.has(path)) collapsedFolders.delete(path);
      else collapsedFolders.add(path);
      renderFiles();
    }
    return;
  }
  if (event.target.closest(".file-remove")) deleteFile(row.dataset.path);
  else if (event.target.closest(".file-rename")) openRenameDialog(row.dataset.path);
  else activateFile(row.dataset.path);
});
fileList.addEventListener("keydown", (event) => {
  const row = event.target.closest(".file-entry");
  if (row && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    activateFile(row.dataset.path);
  }
});

tabbar.addEventListener("click", (event) => {
  const tab = event.target.closest(".file-tab");
  if (!tab) return;
  if (event.target.closest(".file-tab-close")) closeTab(tab.dataset.path);
  else activateFile(tab.dataset.path);
});

searchResults.addEventListener("click", (event) => {
  const result = event.target.closest(".search-result");
  if (!result) return;
  activateFile(result.dataset.path);
  const line = Number(result.dataset.line);
  const lineStart = editor.value.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
  const lineText = editor.value.split("\n")[line - 1] || "";
  const matchOffset = lineText.toLocaleLowerCase().indexOf(findInput.value.toLocaleLowerCase());
  const start = lineStart + Math.max(0, matchOffset);
  editor.focus();
  editor.setSelectionRange(start, start + findInput.value.length);
  findBar.hidden = true;
  searchResults.hidden = true;
});

editor.scrollElement.addEventListener("scroll", () => { updateLineNumbers(); });
editor.addEventListener("click", updateLineNumbers);
editor.addEventListener("keyup", updateLineNumbers);
editor.addEventListener("focus", () => document.body.classList.add("keyboard-open"));
editor.addEventListener("blur", () => document.body.classList.remove("keyboard-open"));
editor.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveImmediately();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    openFind("file");
  } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "i") {
    event.preventDefault();
    formatCurrentFile();
  } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runActiveFile();
  }
});

async function saveImmediately() {
  clearTimeout(saveTimer);
  saveState.textContent = "Saving…";
  workspace.activePath = activePath;
  workspace.openPaths = openPaths;
  try {
    await saveWorkspace(workspace);
    saveState.textContent = "Saved";
    showToast("Workspace saved on this device.");
  } catch (error) {
    saveState.textContent = "Save failed";
    showToast(`Could not save workspace: ${error.message}`, true);
  }
}

document.getElementById("new-file-button").addEventListener("click", openNewFileDialog);
document.getElementById("mobile-new-file").addEventListener("click", openNewFileDialog);
document.getElementById("new-folder-button").addEventListener("click", openNewFolderDialog);
document.getElementById("file-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("new-file-path");
  input.setCustomValidity("");
  const success = fileDialogPurpose === "createFolder" ? createFolder(input.value) :
    fileDialogPurpose === "renameFolder" ? renameFolder(renameSourcePath, input.value) :
    fileDialogPurpose === "renameFile" ? renameFile(renameSourcePath, input.value) : createFile(input.value);
  if (success) document.getElementById("file-dialog").close();
  else {
    input.setCustomValidity("Enter a unique, valid relative file path.");
    input.reportValidity();
  }
});
document.getElementById("cancel-new-file").addEventListener("click", () => document.getElementById("file-dialog").close());
document.getElementById("run-button").addEventListener("click", runActiveFile);
document.getElementById("preview-project-button").addEventListener("click", () => previewProject());
document.getElementById("live-server-button").addEventListener("click", toggleProjectServer);
document.getElementById("import-project-button").addEventListener("click", () => document.getElementById("project-input").click());
document.getElementById("import-archive-button").addEventListener("click", () => document.getElementById("archive-input").click());
document.getElementById("export-project-button").addEventListener("click", exportProject);
document.getElementById("project-input").addEventListener("change", (event) => {
  importProjectSelection(event.target.files);
  event.target.value = "";
});
document.getElementById("archive-input").addEventListener("change", (event) => {
  importProjectSelection(event.target.files);
  event.target.value = "";
});
document.getElementById("import-button").addEventListener("click", () => document.getElementById("file-input").click());
document.getElementById("file-input").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importFile(file);
  event.target.value = "";
});
document.getElementById("download-button").addEventListener("click", exportActiveFile);
document.getElementById("search-button").addEventListener("click", () => openFind("workspace"));
document.getElementById("find-button").addEventListener("click", () => openFind("file"));
document.getElementById("close-find").addEventListener("click", () => {
  findBar.hidden = true;
  searchResults.hidden = true;
  editor.focus();
});
findInput.addEventListener("input", () => {
  if (searchMode === "workspace") renderWorkspaceSearch(findInput.value);
  else findInFile();
});
findInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && searchMode === "file") {
    event.preventDefault();
    selectNextMatch();
  } else if (event.key === "Escape") {
    findBar.hidden = true;
    searchResults.hidden = true;
    editor.focus();
  }
});
document.querySelectorAll(".panel-tab").forEach((tab) => tab.addEventListener("click", () => togglePanel(tab.dataset.panel)));
document.getElementById("clear-output").addEventListener("click", () => setOutput(""));
document.getElementById("close-panel").addEventListener("click", () => panel.classList.toggle("panel-hidden"));
document.getElementById("command-run").addEventListener("click", runCommand);
document.getElementById("command-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") runCommand();
});
document.getElementById("mobile-files-button").addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("mobile-hidden");
  document.body.classList.remove("keyboard-open");
});
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button === item));
    const view = item.dataset.view;
    if (view === "files") {
      document.getElementById("sidebar").classList.remove("mobile-hidden");
    } else if (view === "search") {
      document.getElementById("sidebar").classList.add("mobile-hidden");
      openFind("workspace");
    } else if (view === "editor") {
      document.getElementById("sidebar").classList.add("mobile-hidden");
      findBar.hidden = true;
      searchResults.hidden = true;
      panel.classList.add("panel-hidden");
      editor.focus();
    } else if (view === "console") {
      document.getElementById("sidebar").classList.add("mobile-hidden");
      togglePanel("console");
      panel.classList.remove("panel-hidden");
    } else if (view === "agents") {
      openAgents();
    }
  });
});
document.getElementById("collapse-files-button").addEventListener("click", () => {
  const collapsed = fileList.classList.toggle("collapsed");
  document.getElementById("collapse-files-button").textContent = collapsed ? "›" : "⌄";
  renderFiles();
});
document.getElementById("project-toggle").addEventListener("click", () => {
  fileList.classList.toggle("collapsed");
  renderFiles();
});
document.getElementById("editor-menu-button").addEventListener("click", () => {
  const currentSize = Number.parseFloat(getComputedStyle(editor.dom).fontSize);
  const newSize = currentSize >= 16 ? 12 : currentSize + 1;
  editor.dom.style.fontSize = `${newSize}px`;
  showToast(`Editor text: ${newSize}px`);
});
document.getElementById("home-button").addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("mobile-hidden");
  document.querySelector('[data-view="files"]').click();
});
document.getElementById("agents-button").addEventListener("click", openAgents);
document.getElementById("features-button").addEventListener("click", () => {
  document.getElementById("features-dialog").showModal();
  renderFeatureView("projects");
});
document.getElementById("close-features").addEventListener("click", () => document.getElementById("features-dialog").close());
document.querySelector(".feature-toolbar").addEventListener("click", (event) => {
  const action = event.target.closest("[data-feature]")?.dataset.feature;
  if (action) renderFeatureView(action);
});
document.getElementById("close-agent").addEventListener("click", () => document.getElementById("agent-dialog").close());
document.getElementById("agent-form").addEventListener("submit", handleAgentSubmit);
document.getElementById("save-agent-settings").addEventListener("click", saveAgentSettings);
document.querySelectorAll(".agent-mode").forEach((button) => button.addEventListener("click", () => {
  agentMode = button.dataset.agentMode;
  document.querySelectorAll(".agent-mode").forEach((mode) => mode.classList.toggle("selected", mode === button));
  document.getElementById("agent-prompt").placeholder = agentMode === "build"
    ? "Describe a feature or fix; the agent will propose complete file changes…"
    : "Ask about this code, explain an error, or request a safe approach…";
}));
document.getElementById("extensions-button").addEventListener("click", () => document.getElementById("extensions-dialog").showModal());
document.getElementById("close-extensions").addEventListener("click", () => document.getElementById("extensions-dialog").close());
document.getElementById("live-preview-toggle").addEventListener("change", (event) => {
  livePreview = event.target.checked;
  localStorage.setItem("codestudio.extension.live-preview", String(livePreview));
  if (livePreview && previewEntryPath) {
    const file = workspace.files.find((entry) => entry.path === previewEntryPath);
    if (file) {
      previewFrame.srcdoc = makePreviewDocument(file.path, file.content);
      updateBrowserPreviewLink();
    }
  }
});
document.getElementById("open-preview-button").addEventListener("click", async (event) => {
  if (!previewFrame.srcdoc) {
    event.preventDefault();
    showToast("Run an HTML file before opening its preview.", true);
    return;
  }
  if (window.Capacitor?.isNativePlatform?.()) {
    event.preventDefault();
    if (liveServerUrl) {
      await openProjectServer();
      return;
    }
    const previewPlugin = window.Capacitor.Plugins?.ProjectPreview;
    if (!previewPlugin) {
      showToast("The Android browser preview service is unavailable. Rebuild and reinstall the latest app.", true);
      return;
    }
    try {
      await previewPlugin.open({ html: previewFrame.srcdoc });
    } catch (error) {
      showToast(`Could not open the preview in a browser: ${error.message}`, true);
    }
    return;
  }
  updateBrowserPreviewLink();
});
document.getElementById("problems-output").addEventListener("click", (event) => {
  const row = event.target.closest(".problem-row");
  if (!row) return;
  const position = Number(row.dataset.from);
  editor.focus();
  editor.setSelectionRange(position, position);
});
document.getElementById("preview-frame").addEventListener("load", () => {
  if (previewFrame.srcdoc) writeDebugOutput(`HTML preview loaded for ${previewEntryPath}.`);
});
window.addEventListener("message", (event) => {
  const message = event.data;
  if (event.source !== previewFrame.contentWindow || message?.source !== "codestudio-preview" ||
    message.bridgeId !== previewFrame.dataset.bridgeId || typeof message.text !== "string" || message.text.length > 8_000) return;
  if (message.type === "navigate") {
    const path = message.text;
    const file = workspace.files.find((entry) => entry.path === path && ["html", "htm"].includes(extension(entry.path)));
    if (file) showPreview(file.path, file.content);
    else showToast("That project page could not be found.", true);
    return;
  }
  const kind = message.type === "error" || message.type === "warn" ? "error" : message.type === "info" ? "info" : "normal";
  writeOutput(`[preview:${message.type}] ${message.text}`, kind);
  document.getElementById("run-status").textContent = message.type === "error" ? "Preview error" : "Preview running";
});

togglePanel("console");

async function initialize() {
  try {
    const savedTheme = localStorage.getItem("codestudio.theme");
    if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
    document.getElementById("live-server-button").hidden = !window.Capacitor?.isNativePlatform?.();
    workspace = await loadWorkspace();
    if (!Array.isArray(workspace.files) || workspace.files.some((file) => typeof file.path !== "string" || typeof file.content !== "string")) {
      throw new Error("The saved workspace has an invalid format.");
    }
    workspace.projectName = workspace.projectName || "mobile-starter";
    workspace.folders = Array.isArray(workspace.folders) ? workspace.folders.filter(validWorkspacePath) : [];
    livePreview = localStorage.getItem("codestudio.extension.live-preview") !== "false";
    document.getElementById("live-preview-toggle").checked = livePreview;
    renderExtensions();
    openPaths = Array.isArray(workspace.openPaths) ? workspace.openPaths.filter((path) => workspace.files.some((file) => file.path === path)) : [];
    activePath = workspace.files.some((file) => file.path === workspace.activePath) ? workspace.activePath : (openPaths[0] || workspace.files[0]?.path || "");
    if (activePath && !openPaths.includes(activePath)) openPaths.push(activePath);
    document.getElementById("project-label").textContent = workspace.projectName.toUpperCase();
    renderFiles();
    renderTabs();
    if (activePath) activateFile(activePath);
    else {
      editor.disabled = true;
      document.getElementById("editor-empty").hidden = false;
    }
  } catch (error) {
    saveState.textContent = "Storage unavailable";
    editor.disabled = true;
    document.getElementById("editor-empty").hidden = false;
    document.getElementById("editor-empty").textContent = "Workspace could not be loaded. Check this device's storage and reload.";
    showToast(`Could not open workspace: ${error.message}`, true);
  }
}

initialize();
