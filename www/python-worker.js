"use strict";

import { loadPyodide } from "./pyodide/pyodide.mjs";

let pyodidePromise;
let pyodide;

function send(type, text) {
  self.postMessage({ type, text: text == null ? "" : String(text) });
}

async function loadRuntime() {
  if (pyodide) return pyodide;
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      try {
        const indexURL = new URL("./pyodide/", self.location.href).href;
        send("status", "Loading offline Python runtime…");
        pyodide = await loadPyodide({
          indexURL,
          stdout: (text) => send("log", text),
          stderr: (text) => send("stderr", text)
        });
        return pyodide;
      } catch (error) {
        pyodidePromise = undefined;
        pyodide = undefined;
        throw new Error(`Python runtime could not load its bundled files: ${error.message}`);
      }
    })();
  }
  return pyodidePromise;
}

self.onmessage = async (event) => {
  if (event.data?.type === "terminate") {
    self.close();
    return;
  }
  if (event.data?.type === "init") {
    try {
      await loadRuntime();
      send("ready", "Offline Python is ready.");
    } catch (error) {
      send("error", error.message);
      send("done", "");
    }
    return;
  }
  if (event.data?.type !== "run" || typeof event.data.code !== "string") return;

  try {
    const runtime = await loadRuntime();
    send("ready", "Offline Python is ready.");
    send("status", "Running Python…");
    const code = JSON.stringify(event.data.code);
    const filename = JSON.stringify(event.data.path || "<workspace>");
    await runtime.runPythonAsync(
      `__codestudio_namespace = {"__name__": "__main__"}\n` +
      `exec(compile(${code}, ${filename}, "exec"), __codestudio_namespace, __codestudio_namespace)\n` +
      `del __codestudio_namespace`
    );
    send("done", "");
  } catch (error) {
    send("error", error?.message || error);
    send("done", "");
  }
};
