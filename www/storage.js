const WORKSPACE_KEY = "codestudio.workspace.v1";
const PROJECT_ID_KEY = "codestudio.currentProject";
const RECENT_PROJECTS_KEY = "codestudio.recentProjects";
const DEFAULT_PROJECT_ID = "project-default";

const starterWorkspace = {
  projectName: "mobile-starter",
  files: [
    {
      path: "index.html",
      content: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>My first page</title>\n  <link rel="stylesheet" href="src/styles.css">\n</head>\n<body>\n  <main class="card">\n    <span class="eyebrow">YOUR NEXT IDEA</span>\n    <h1>Hello, world.</h1>\n    <p>Edit this page, then tap <strong>Run</strong> to preview it.</p>\n    <button id="hello">Say hello</button>\n  </main>\n  <script src="src/app.js"><\/script>\n</body>\n</html>\n'
    },
    {
      path: "src/app.js",
      content: 'console.log("Welcome to CodeStudio.");\n\nif (typeof document !== "undefined") {\n  const button = document.querySelector("#hello");\n  button.addEventListener("click", () => {\n    button.textContent = "It works!";\n  });\n}\n'
    },
    {
      path: "src/styles.css",
      content: 'body {\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  margin: 0;\n  background: #101216;\n  color: #f2f4f8;\n  font-family: system-ui, sans-serif;\n}\n\n.card {\n  max-width: 380px;\n  padding: 36px;\n  border: 1px solid #292d36;\n  border-radius: 24px;\n  background: #191c23;\n}\n\n.eyebrow { color: #a78bfa; letter-spacing: .14em; }\nbutton { padding: 12px 18px; border: 0; border-radius: 12px; background: #8b78f6; color: white; }\n'
    },
    {
      path: "hello.py",
      content: 'name = "CodeStudio"\nprint(f"Hello from {name}!")\nprint("2 + 3 =", 2 + 3)\n'
    },
    {
      path: "README.md",
      content: '# Mobile starter\n\nYour offline-first coding workspace.\n\n- Edit `index.html` and tap **Run** to preview your page.\n- Open `hello.py` and tap **Run** to execute Python offline on your device.\n'
    }
  ]
};

function openWorkspaceDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("CodeStudioDB", 2);
    request.onupgradeneeded = (event) => {
      const store = request.result.objectStoreNames.contains("workspace")
        ? request.transaction.objectStore("workspace")
        : request.result.createObjectStore("workspace", { keyPath: "id" });
      if (event.oldVersion < 2) {
        const legacy = store.get("main");
        legacy.onsuccess = () => {
          if (!legacy.result?.data) return;
          const existing = store.get(DEFAULT_PROJECT_ID);
          existing.onsuccess = () => {
            if (!existing.result) store.put({ id: DEFAULT_PROJECT_ID, data: legacy.result.data });
          };
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local workspace storage."));
  });
}

async function loadWorkspace() {
  return loadProjectWorkspace(getCurrentProjectId());
}

function getCurrentProjectId() {
  return localStorage.getItem(PROJECT_ID_KEY) || DEFAULT_PROJECT_ID;
}

function setCurrentProjectId(id) {
  localStorage.setItem(PROJECT_ID_KEY, id);
}

async function loadProjectWorkspace(id) {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const store = db.transaction("workspace", "readonly").objectStore("workspace");
    const request = store.get(id);
    request.onsuccess = () => {
      let saved = request.result && request.result.data;
      if (!saved && id === DEFAULT_PROJECT_ID) {
        const legacy = store.get("main");
        legacy.onsuccess = () => {
          if (legacy.result?.data) resolve(legacy.result.data);
          else resolve(JSON.parse(JSON.stringify(starterWorkspace)));
          db.close();
        };
        legacy.onerror = () => {
          db.close();
          reject(legacy.error || new Error("Could not load the previous local workspace."));
        };
        return;
      }
      if (saved && Array.isArray(saved.files)) {
        resolve(saved);
      } else {
        resolve(JSON.parse(JSON.stringify(starterWorkspace)));
      }
      db.close();
    };
    request.onerror = () => {
      db.close();
      reject(request.error || new Error("Could not load the local workspace."));
    };
  });
}

async function saveWorkspace(workspace, projectId = getCurrentProjectId()) {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").put({ id: projectId, data: workspace });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Could not save the local workspace."));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error("Saving the local workspace was interrupted."));
    };
  });
}

async function listProjectWorkspaces() {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("workspace", "readonly").objectStore("workspace").getAll();
    request.onsuccess = () => {
      const projects = request.result
        .filter((entry) => entry.id !== "main" && entry.data && Array.isArray(entry.data.files))
        .map((entry) => ({ id: entry.id, projectName: entry.data.projectName || "Untitled project", data: entry.data }));
      if (!projects.some((project) => project.id === DEFAULT_PROJECT_ID)) {
        const legacy = db.transaction("workspace", "readonly").objectStore("workspace").get("main");
        legacy.onsuccess = () => {
          if (legacy.result?.data) {
            projects.unshift({ id: DEFAULT_PROJECT_ID, projectName: legacy.result.data.projectName || "mobile-starter", data: legacy.result.data });
          }
          resolve(sortRecentProjects(projects));
          db.close();
        };
        legacy.onerror = () => {
          db.close();
          reject(legacy.error || new Error("Could not read the previous local project."));
        };
        return;
      }
      resolve(sortRecentProjects(projects));
      db.close();
    };
    request.onerror = () => {
      db.close();
      reject(request.error || new Error("Could not list local projects."));
    };
  });
}

function sortRecentProjects(projects) {
  const recent = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || "[]");
  return projects.sort((a, b) => {
    const aIndex = recent.indexOf(a.id);
    const bIndex = recent.indexOf(b.id);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
}

async function createProjectWorkspace(data) {
  if (!data || typeof data.projectName !== "string" || !Array.isArray(data.files)) {
    throw new Error("The new project has an invalid format.");
  }
  if ((await listProjectWorkspaces()).length >= 20) throw new Error("This app stores up to 20 projects on this device.");
  const id = `project-${crypto.randomUUID()}`;
  const db = await openWorkspaceDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").add({ id, data });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not create the project."));
    transaction.onabort = () => reject(transaction.error || new Error("Creating the project was interrupted."));
  }).finally(() => db.close());
  setCurrentProjectId(id);
  touchRecentProject(id);
  return id;
}

function touchRecentProject(id) {
  const recent = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || "[]").filter((entry) => entry !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recent.slice(0, 20)));
}

async function deleteProjectWorkspace(id) {
  if (id === getCurrentProjectId()) throw new Error("Switch to another project before deleting this one.");
  const db = await openWorkspaceDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not delete the project."));
  }).finally(() => db.close());
  const recent = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || "[]").filter((entry) => entry !== id);
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recent));
}

async function saveCodeOffline(code) {
  const workspace = await loadWorkspace();
  const file = workspace.files.find((entry) => entry.path === "index.js");
  if (file) {
    file.content = code;
  } else {
    workspace.files.push({ path: "index.js", content: code });
  }
  await saveWorkspace(workspace);
}
