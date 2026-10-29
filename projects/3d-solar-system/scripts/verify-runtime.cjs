const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launchChrome({ root, executable }) {
  const temp = path.join(root, ".tmp");
  fs.mkdirSync(temp, { recursive: true });
  const profile = fs.mkdtempSync(path.join(temp, "chrome-regression-"));
  const chrome = spawn(executable, ["--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--headless=new", "--no-first-run", "--no-default-browser-check", "--window-size=1920,1080", "about:blank"],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let launchError = null, stderr = "";
  chrome.on("error", (error) => { launchError = error; });
  chrome.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-12000); });
  let ws;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      if (chrome.exitCode !== null) throw new Error(`Chrome exited ${chrome.exitCode}: ${stderr}`);
      if (fs.existsSync(portFile)) { port = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]); break; }
      await sleep(100);
    }
    if (!port) throw new Error(`Chrome debug port unavailable: ${stderr}`);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find((entry) => entry.type === "page");
    if (!page) throw new Error("Chrome has no page debug target");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let sequence = 0;
    const pending = new Map(), exceptions = [], consoleErrors = [], consoleMessages = [], requests = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request.timeout);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      } else if (message.method === "Network.requestWillBeSent") {
        requests.push(message.params.request.url);
      } else if (message.method === "Runtime.exceptionThrown") {
        exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      } else if (message.method === "Runtime.consoleAPICalled") {
        const entry = {type: message.params.type, text: message.params.args.map((arg) => arg.value ?? arg.description).join(" ")};
        consoleMessages.push(entry);
        if (entry.type === "error") consoleErrors.push(entry.text);
      }
    };
    ws.onclose = () => {
      for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error("Chrome debug connection closed")); }
      pending.clear();
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      pending.set(id, {resolve, reject, timeout}); ws.send(JSON.stringify({id, method, params}));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (expression, timeoutMs = 12000) => {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (await evaluate(expression)) return;
        await sleep(100);
      }
      throw new Error(`Condition timed out: ${expression}`);
    };
    await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
    return {send, evaluate, waitFor, exceptions, consoleErrors, consoleMessages, requests, profile,
      async close() {
        try { await send("Browser.close"); } catch { /* Chrome closes its connection with the browser. */ }
        ws.close();
        if (chrome.exitCode === null) chrome.kill();
      }};
  } catch (error) {
    ws?.close(); if (chrome.exitCode === null) chrome.kill(); throw error;
  }
}

module.exports = { launchChrome, sleep };
