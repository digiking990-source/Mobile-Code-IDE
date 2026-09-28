"use strict";

const projectTemplates = [
  {
    id: "website",
    name: "Website",
    description: "Responsive HTML, CSS and JavaScript starter.",
    projectName: "my-website",
    files: [
      {
        path: "index.html",
        content: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>My website</title>\n  <link rel="stylesheet" href="src/styles.css">\n</head>\n<body>\n  <main class="card">\n    <h1>Build something great.</h1>\n    <p>Edit this project, then preview it.</p>\n    <button id="action">Get started</button>\n  </main>\n  <script src="src/app.js"><\\/script>\n</body>\n</html>\n'
      },
      { path: "src/styles.css", content: "body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101216; color: #f4f3ff; font: 16px system-ui, sans-serif; }\n.card { width: min(420px, calc(100% - 48px)); padding: 32px; border: 1px solid #343746; border-radius: 18px; background: #191c23; }\nbutton { padding: 10px 14px; border: 0; border-radius: 8px; background: #8b78f6; color: white; }\n" },
      { path: "src/app.js", content: 'document.querySelector("#action").addEventListener("click", () => {\n  document.querySelector("h1").textContent = "It works!";\n});\n' },
      { path: "README.md", content: "# My website\n\nEdit `index.html`, `src/styles.css` and `src/app.js`, then tap **Preview**.\n" }
    ],
    folders: ["src"]
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description: "A polished personal portfolio with a project gallery.",
    projectName: "my-portfolio",
    files: [
      {
        path: "index.html",
        content: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>My portfolio</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <header><a class="brand" href="index.html">MY PORTFOLIO</a><nav><a href="#work">Work</a><a href="#about">About</a></nav></header>\n  <main><section class="hero"><p class="eyebrow">DESIGNER · DEVELOPER · CREATOR</p><h1>I make useful things for the web.</h1><p>Replace this text with your story and the kind of work you love.</p><a class="button" href="#work">See my work</a></section>\n  <section id="work"><h2>Selected projects</h2><div class="grid"><article><span>01 / WEB</span><h3>Project One</h3><p>A short description of something you built.</p></article><article><span>02 / CODE</span><h3>Project Two</h3><p>Describe a challenge you solved.</p></article></div></section>\n  <section id="about"><h2>A little about me</h2><p>Tell visitors what you do, what you are learning, and how to contact you.</p></section></main>\n  <footer>Made with care · <a href="mailto:hello@example.com">Get in touch</a></footer>\n</body>\n</html>\n'
      },
      { path: "styles.css", content: ":root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; color: #f5f3ff; background: #11121a; } * { box-sizing: border-box; } body { margin: 0; } header, footer { display: flex; justify-content: space-between; gap: 20px; padding: 24px max(7vw, 20px); border-bottom: 1px solid #30303a; } a { color: inherit; text-decoration: none; } nav { display: flex; gap: 20px; color: #b9b6c8; } main { max-width: 920px; margin: auto; padding: 50px 24px; } .hero { padding: 8vh 0 12vh; } .eyebrow, article span { color: #a78bfa; font-size: 12px; letter-spacing: .14em; } h1 { max-width: 720px; margin: 20px 0; font-size: clamp(42px, 9vw, 88px); line-height: 1.02; } h2 { font-size: 32px; } .hero p:not(.eyebrow), section p { max-width: 560px; color: #b9b6c8; line-height: 1.7; } .button { display: inline-block; margin-top: 18px; padding: 12px 18px; border-radius: 9px; background: #8b78f6; } .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; } article { padding: 24px; border: 1px solid #30303a; border-radius: 14px; background: #191a24; } footer { border-top: 1px solid #30303a; border-bottom: 0; color: #b9b6c8; }\n" },
      { path: "README.md", content: "# My portfolio\n\nReplace the sample content in `index.html` and customize `styles.css`. Preview this project to see the result.\n" }
    ],
    folders: []
  },
  {
    id: "react-vite",
    name: "React + Vite",
    description: "React/Vite source files; build with Vite before previewing on this offline app.",
    projectName: "react-vite-app",
    files: [
      { path: "package.json", content: '{\n  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },\n  "dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" },\n  "devDependencies": { "vite": "^6.0.0" },\n  "type": "module"\n}\n' },
      { path: "index.html", content: '<!doctype html>\n<html lang="en">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>React + Vite</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>\n</html>\n' },
      { path: "src/main.jsx", content: 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nfunction App() {\n  return <main><h1>Hello React!</h1><p>Edit <code>src/main.jsx</code> to get started.</p></main>;\n}\n\ncreateRoot(document.getElementById("root")).render(<App />);\n' },
      { path: "src/styles.css", content: "body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101216; color: #f4f3ff; font: 18px system-ui, sans-serif; }\nmain { padding: 32px; border: 1px solid #343746; border-radius: 18px; background: #191c23; }\ncode { color: #c4b5fd; }\n" },
      { path: "README.md", content: "# React + Vite\n\nThis template contains React source code. It needs Node.js and internet access to install packages and build:\n\n1. Run `npm install` in a desktop development environment.\n2. Run `npm run build`.\n3. Import the generated `dist` folder into CodeStudio and preview its `index.html`.\n\nThe phone app does not run Vite or install npm packages locally.\n" }
    ],
    folders: ["src"]
  },
  {
    id: "python",
    name: "Python practice",
    description: "Offline Python starter with a guided first exercise.",
    projectName: "python-practice",
    files: [
      { path: "main.py", content: 'name = "Coder"\nprint(f"Hello, {name}!")\n\nnumbers = [2, 4, 6]\nprint("Sum:", sum(numbers))\n' },
      { path: "README.md", content: "# Python practice\n\nRun `main.py` offline. The bundled runtime supports Python's standard library; third-party packages need a separate setup.\n\nTry changing the name and adding your own list of numbers.\n" }
    ],
    folders: []
  },
  {
    id: "blank",
    name: "Blank project",
    description: "An empty workspace ready for your files.",
    projectName: "my-project",
    files: [{ path: "README.md", content: "# My project\n\nStart building here.\n" }],
    folders: []
  }
];

window.CodeStudioProjectCatalog = Object.freeze(projectTemplates.map((template) => Object.freeze(template)));
