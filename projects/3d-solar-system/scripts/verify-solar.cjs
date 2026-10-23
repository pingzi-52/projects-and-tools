// CDP driver for the solar-system model: real mouse clicks on every body.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://127.0.0.1:4321/solar.html";
const OUT = path.join(__dirname, "..", "out");
const PORT = 9334;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(__dirname, "..", ".tmp", "chrome-solar");
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

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
    } catch { /* not up */ }
  }
  if (!wsUrl) { console.error("FAIL: no debug target"); chrome.kill(); process.exit(1); }

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
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(9000); // procedural textures take a moment

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, "base64"));
  };

  console.log("hook:", await evalJs("typeof window.__SOLAR__"));
  const bodyCount = await evalJs("window.__SOLAR__ ? window.__SOLAR__.bodies.length : -1");
  console.log("bodies:", bodyCount);

  const results = [];
  // sun, then each planet in order
  for (const target of ["sun", 0, 1, 2, 3, 4, 5, 6, 7]) {
    await evalJs("window.__SOLAR__.clear()");
    // the camera dollies back to the system view after clear(); aiming while it is
    // still moving means the projection is stale by the time the click lands
    for (let i = 0; i < 60; i++) {
      if (await evalJs("window.__SOLAR__.settled()")) break;
      await sleep(100);
    }
    await sleep(250);

    let hover = null, aim = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const p = JSON.parse(await evalJs(`JSON.stringify(window.__SOLAR__.screenOf(${JSON.stringify(target)}))`));
      if (!p) break;
      aim = p;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(p.x), y: Math.round(p.y), button: "none", buttons: 0 });
      await sleep(80);
      hover = await evalJs("window.__SOLAR__.hoveredKey");
      if (hover === target) break;
    }

    let focusedAfter = null, diag = null;
    if (hover === target) {
      const { x, y } = aim;
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(x), y: Math.round(y), button: "left", buttons: 1, clickCount: 1 });
      await sleep(70);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(x), y: Math.round(y), button: "left", buttons: 0, clickCount: 1 });
      await sleep(900);
      focusedAfter = await evalJs("window.__SOLAR__.focused");
      diag = JSON.parse(await evalJs("JSON.stringify(window.__SOLAR__.lastClick)"));
      if (target === 4) await shot("solar-jupiter.png");
      if (target === 5) await shot("solar-saturn.png");
      if (target === 2) await shot("solar-earth.png");
    }
    const label = await evalJs("window.__SOLAR__.labelText()");
    results.push({ target, hover, focusedAfter, label, diag, ok: hover === target && focusedAfter === target });
  }

  // idle / system view
  await evalJs("window.__SOLAR__.clear(); window.__SOLAR__.setSpeed(1)");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1860, y: 1040, button: "none", buttons: 0 });
  await sleep(1800);
  await shot("solar-system.png");

  const fps = await evalJs("document.getElementById('fps').textContent");
  const pass = results.filter((r) => r.ok).length;

  console.log(JSON.stringify({ results, pass, total: results.length, fps, logs: logs.slice(0, 12) }, null, 2));

  ws.close();
  chrome.kill();
  await sleep(400);
  process.exit(pass === results.length ? 0 : 2);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
