// Minimal CDP driver: launches headless Chrome, loads the interactive demo,
// drives real mouse events at each target, and screenshots the result.
// No puppeteer/playwright needed — Node 24 ships a global WebSocket.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://127.0.0.1:4321/index.html";
const OUT = path.join(__dirname, "..", "out");
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(__dirname, "..", ".tmp", "chrome-profile");
  fs.mkdirSync(profile, { recursive: true });

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--disable-gpu-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1920,1080",
    "--hide-scrollbars",
    "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch { /* not up yet */ }
  }
  if (!wsUrl) { console.error("FAIL: chrome did not expose a debug target"); chrome.kill(); process.exit(1); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      logs.push(msg.params.type + ": " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    } else if (msg.method === "Runtime.exceptionThrown") {
      logs.push("EXCEPTION: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false,
  });

  await send("Page.navigate", { url: URL });
  await sleep(6000); // let three.js boot + first frames render

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  const boot = await evalJs("typeof window.__DEMO__");
  console.log("boot hook:", boot);

  const results = [];
  for (const idx of [0, 1, 4, 2, 3]) {
    // Orbs keep orbiting, so aim in a closed loop: measure, move, re-measure.
    let hover = null;
    let aim = null;
    for (let attempt = 0; attempt < 24 && hover !== idx; attempt++) {
      const p = JSON.parse(await evalJs(`JSON.stringify(window.__DEMO__.screenOf(${idx}))`));
      aim = p;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none", buttons: 0 });
      await sleep(70);
      hover = await evalJs("window.__DEMO__.hovered");
    }

    const before = await evalJs("window.__DEMO__.clickCount");
    if (hover === idx) {
      const { x, y } = aim;
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
      await sleep(60);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
      await sleep(500);
    }

    const after = await evalJs("window.__DEMO__.clickCount");
    results.push({ target: idx, hovered: hover, clicked: after > before, before, after });

    if (idx === 4) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, "web-click-core.png"), Buffer.from(shot.data, "base64"));
    }
  }

  // idle frame with the pointer parked off to the side
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1700, y: 120, button: "none", buttons: 0 });
  await sleep(700);
  const idle = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "web-idle.png"), Buffer.from(idle.data, "base64"));

  const total = await evalJs("window.__DEMO__.clickCount");
  const fps = await evalJs("document.getElementById('fps').textContent");

  console.log(JSON.stringify({ results, total, fps, logs: logs.slice(0, 20) }, null, 2));

  ws.close();
  chrome.kill();
  await sleep(500);
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
