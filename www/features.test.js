"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function loadBrowserData(filename, globalName) {
  const sandbox = { window: {} };
  const source = fs.readFileSync(path.join(__dirname, filename), "utf8");
  vm.runInNewContext(source, sandbox, { filename });
  return sandbox.window[globalName];
}

test("project templates have unique safe file paths and include their entry files", () => {
  const templates = loadBrowserData("project-catalog.js", "CodeStudioProjectCatalog");
  assert.ok(templates.length >= 5);
  assert.equal(new Set(templates.map((template) => template.id)).size, templates.length);
  for (const template of templates) {
    const paths = template.files.map((file) => file.path);
    assert.equal(new Set(paths).size, paths.length, `${template.id} has duplicate paths`);
    assert.ok(paths.every((filePath) => filePath && !filePath.startsWith("/") && !filePath.split("/").some((part) => part === "..")));
    assert.ok(template.files.every((file) => typeof file.content === "string"));
    assert.ok(paths.includes("README.md"), `${template.id} should include setup notes`);
  }
  assert.ok(templates.find((template) => template.id === "website").files.some((file) => file.path === "index.html"));
  assert.ok(templates.find((template) => template.id === "react-vite").files.some((file) => file.path === "src/main.jsx"));
  assert.match(templates.find((template) => template.id === "react-vite").files.find((file) => file.path === "README.md").content, /npm run build/);
});

test("Python lessons have runnable starter code and nonempty checks", () => {
  const lessons = loadBrowserData("python-lessons.js", "CodeStudioPythonLessons");
  assert.ok(lessons.length >= 5);
  assert.equal(new Set(lessons.map((lesson) => lesson.id)).size, lessons.length);
  for (const lesson of lessons) {
    assert.ok(lesson.starter.trim(), `${lesson.id} needs starter code`);
    assert.ok(lesson.challenge && lesson.expected && lesson.hint, `${lesson.id} needs a task, expected output and hint`);
  }
});
