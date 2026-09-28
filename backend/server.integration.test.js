"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

async function freePort() {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("AI backend authenticates requests, applies CORS and validates both agent modes", async (t) => {
  const provider = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const { messages } = JSON.parse(body);
    const isBuild = messages[0].content.includes("CodeStudio Build");
    const content = isBuild
      ? JSON.stringify({ message: "Added a safe helper.", changes: [{ path: "src/helper.js", content: "export const answer = 42;" }] })
      : "Check the stack trace and active file.";
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const backendPort = await freePort();
  const child = spawn(process.execPath, ["backend/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(backendPort),
      HOST: "127.0.0.1",
      OPENAI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`,
      OPENAI_MODEL: "test-model",
      OPENAI_API_KEY: "test-only-provider-key",
      APP_ACCESS_TOKEN: "test-only-access-token",
      APP_ORIGINS: "http://localhost:4173"
    },
    stdio: "ignore"
  });

  t.after(async () => {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else {
        child.once("exit", resolve);
        setTimeout(resolve, 1_500).unref();
      }
    });
    await new Promise((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()));
  });

  let health;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      health = await fetch(`http://127.0.0.1:${backendPort}/api/health`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  assert.ok(health, "backend should start");
  assert.deepEqual(await health.json(), { ready: true, aiConfigured: true });

  const base = `http://127.0.0.1:${backendPort}`;
  const askResponse = await fetch(`${base}/api/agents/ask`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:4173",
      Authorization: "Bearer test-only-access-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt: "Explain this error", activePath: "src/app.js", files: [{ path: "src/app.js", content: "console.log(1)" }] })
  });
  assert.equal(askResponse.status, 200);
  assert.equal(askResponse.headers.get("access-control-allow-origin"), "http://localhost:4173");
  assert.equal((await askResponse.json()).message, "Check the stack trace and active file.");

  const buildResponse = await fetch(`${base}/api/agents/build`, {
    method: "POST",
    headers: { Authorization: "Bearer test-only-access-token", "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Create a helper", activePath: "", files: [] })
  });
  assert.equal(buildResponse.status, 200);
  assert.equal((await buildResponse.json()).changes[0].path, "src/helper.js");

  const unauthorized = await fetch(`${base}/api/agents/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Explain", files: [] })
  });
  assert.equal(unauthorized.status, 401);

  const deniedOrigin = await fetch(`${base}/api/agents/ask`, {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      Authorization: "Bearer test-only-access-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt: "Explain", files: [] })
  });
  assert.equal(deniedOrigin.status, 403);
});
