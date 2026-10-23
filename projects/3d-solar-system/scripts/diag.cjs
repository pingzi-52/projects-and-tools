// Diagnostic: load the page and dump console output + any exceptions.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://127.0.0.1:4321/index.html";
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(__dirname, "..", ".tmp", "chrome-diag");
  fs.mkdirSync(profile, { recursive: true });
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--headless=new", "--no-sandbox", "--disable-gpu-sandbox",
    "--no-first-run", "--no-default-browser-check", "--window-size=1920,1080",
    "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch {}
  }
  if (!wsUrl) { console.error("no target"); chrome.kill(); process.exit(1); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method) {
      events.push(m);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Page.navigate", { url: URL });
  await sleep(8000);

  const summary = events.map((e) => {
    if (e.method === "Runtime.consoleAPICalled") return "console." + e.params.type + ": " + e.params.args.map((a) => a.value ?? a.description).join(" ");
    if (e.method === "Runtime.exceptionThrown") return "EXCEPTION: " + (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
    if (e.method === "Log.entryAdded") return "log." + e.params.entry.level + ": " + e.params.entry.text;
    if (e.method === "Network.loadingFailed") return "netfail: " + e.params.errorText + " " + e.params.type;
    if (e.method === "Network.responseReceived") return "net " + e.params.response.status + " " + e.params.response.url;
    return null;
  }).filter(Boolean);

  console.log(summary.join("\n"));

  const r = await send("Runtime.evaluate", { expression: "JSON.stringify({hook: typeof window.__DEMO__, canvas: !!document.querySelector('canvas'), loading: document.getElementById('loading')?.className})", returnByValue: true });
  console.log("STATE:", r.result.value);

  ws.close(); chrome.kill(); await sleep(400); process.exit(0);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
