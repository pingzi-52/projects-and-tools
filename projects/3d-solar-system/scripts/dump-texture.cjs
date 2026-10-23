// Throwaway: dump a planet's generated surface texture to disk so it can be
// inspected directly instead of inferred from a shaded sphere.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://127.0.0.1:4321/solar.html";
const OUT = path.join(__dirname, "..", "out");
const PORT = 9335;
const KEY = process.argv[2] || "jupiter";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(__dirname, "..", ".tmp", "chrome-tex");
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--headless=new", "--disable-gpu-sandbox", "--no-first-run",
    "--no-default-browser-check", "--window-size=1920,1080",
    "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch { /* not up */ }
  }
  if (!wsUrl) { chrome.kill(); process.exit(1); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
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
  await sleep(9000);

  // Pull the texture straight off the mesh's material.
  const expr = `(() => {
    const b = window.__SOLAR__.bodies.find(x => x.index !== undefined &&
      (x.mesh.material.map && x.mesh.material.map.image &&
       x.mesh.material.map.image.width > 0) && x.dispR > 0);
    const target = window.__SOLAR__.bodies.find(x => x.kind === "planet" && x.info.en === "${KEY.toUpperCase()}");
    if (!target) return "no such planet";
    const img = target.mesh.material.map.image;
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/png");
  })()`;
  const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  const val = res.result?.value;
  if (typeof val !== "string" || !val.startsWith("data:image")) {
    console.error("dump failed:", val);
    chrome.kill();
    process.exit(1);
  }
  const buf = Buffer.from(val.split(",")[1], "base64");
  const out = path.join(OUT, `tex-${KEY}.png`);
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes");
  chrome.kill();
  process.exit(0);
})();
