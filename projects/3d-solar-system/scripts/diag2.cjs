// Diagnostic: why do orb projections not map to hover hits?
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://127.0.0.1:4321/index.html";
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(__dirname, "..", ".tmp", "chrome-diag2");
  fs.mkdirSync(profile, { recursive: true });
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--headless=new", "--no-sandbox", "--disable-gpu-sandbox",
    "--no-first-run", "--no-default-browser-check", "--window-size=1920,1080", "about:blank",
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
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(6000);

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  console.log("viewport:", await evalJs("JSON.stringify({iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio,cw:document.querySelector('canvas').clientWidth,ch:document.querySelector('canvas').clientHeight,rect:document.querySelector('canvas').getBoundingClientRect().toJSON()})"));

  // Probe: for each orb, project it, then raycast at that NDC and report what is hit.
  console.log(await evalJs(`(() => {
    const D = window.__DEMO__;
    const out = [];
    const THREE = D.scene.constructor === Object ? null : null;
    for (let i = 0; i < 4; i++) {
      const o = D.orbs[i];
      const p = new o.group.position.constructor();
      o.body.getWorldPosition(p);
      const world = { x: p.x, y: p.y, z: p.z };
      const ndc = p.clone().project(D.camera);
      const res = { i, world, ndc: { x: ndc.x, y: ndc.y, z: ndc.z }, screen: D.screenOf(i) };
      out.push(res);
    }
    out.push({ camera: D.camera.position.toArray(), radius: Math.hypot(...D.camera.position.toArray()) });
    return JSON.stringify(out);
  })()`));

  // Now: sweep the mouse over a grid and record which cell hovers orb 0.
  const sweep = [];
  for (let gy = 0.15; gy <= 0.9; gy += 0.075) {
    for (let gx = 0.08; gx <= 0.95; gx += 0.045) {
      const x = Math.round(gx * 1920), y = Math.round(gy * 1080);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
      const h = await evalJs("window.__DEMO__.hovered");
      if (h !== null) sweep.push({ x, y, hovered: h });
    }
  }
  console.log("hover cells:", JSON.stringify(sweep.slice(0, 40)));
  console.log("hover cell count:", sweep.length);

  ws.close(); chrome.kill(); await sleep(400); process.exit(0);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
