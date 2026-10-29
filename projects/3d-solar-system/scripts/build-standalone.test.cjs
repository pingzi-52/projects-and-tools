const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const builder = fs.readFileSync(path.join(__dirname, "build-standalone.cjs"), "utf8");
const imports = '<script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script>';
const moduleScript = '<script type="module">import { marker } from "three"; import { motion } from "./solar-motion.mjs"; globalThis.result = marker + motion;</script>';
const page = (extra = "") => `<!doctype html><html><head>${extra}</head><body>${imports}${moduleScript}</body></html>`;

function build(html, extras = {}) {
  const tempRoot = path.join(__dirname, "..", ".tmp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempRoot, "solar-build-test-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.mkdirSync(path.join(dir, "web/vendor"), { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules/three"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules/three/package.json"), '{"main":"index.js"}');
    fs.writeFileSync(path.join(dir, "node_modules/three/index.js"), 'export const marker = "NPM_THREE";');
    fs.writeFileSync(path.join(dir, "scripts/build-standalone.cjs"), builder);
    fs.writeFileSync(path.join(dir, "web/solar.html"), html);
    fs.writeFileSync(path.join(dir, "web/vendor/three.module.js"), 'export const marker = "VENDORED_THREE";');
    fs.writeFileSync(path.join(dir, "web/solar-motion.mjs"), 'export const motion = "LOCAL_MOTION";');
    for (const [name, value] of Object.entries(extras)) fs.writeFileSync(path.join(dir, "web", name), value);
    const result = spawnSync(process.execPath, [path.join(dir, "scripts/build-standalone.cjs")], { encoding: "utf8", timeout: 30000 });
    const output = path.join(dir, "web/solar-standalone.html");
    return { ...result, html: fs.existsSync(output) ? fs.readFileSync(output, "utf8") : null };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("standalone uses vendored three and includes local motion without imports", () => {
  const result = build(page());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.html, /VENDORED_THREE/);
  assert.match(result.html, /LOCAL_MOTION/);
  assert.doesNotMatch(result.html, /type=["'](?:module|importmap)["']/i);
  assert.equal((result.html.match(/<script>/gi) || []).length, 1);
});

test("script extraction accepts HTML case and attribute whitespace", () => {
  const result = build(page().replace('type="importmap"', "TYPE = 'importmap'").replace('type="module"', "TYPE = 'module'"));
  assert.equal(result.status, 0, result.stderr);
});

test("preserves the ordinary initialization-error script before the module", () => {
  const result = build(page('<script>globalThis.fallbackMarker = "LOADING_FALLBACK";</script>'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.html, /LOADING_FALLBACK/);
  assert.match(result.html, /VENDORED_THREE/);
  assert.match(result.html, /LOCAL_MOTION/);
});

for (const [name, html] of [
  ["duplicate module", page().replace("</body>", `${moduleScript}</body>`)],
  ["duplicate importmap", page().replace("</body>", `${imports}</body>`)],
  ["missing module close", page().replace(`${moduleScript}</body>`, `${moduleScript.replace("</script>", "")}</body>`)],
  ["external script", page('<script src="https://example.com/code.js"></script>')],
  ["external style", page('<link rel="stylesheet" href="//example.com/app.css">')],
  ["external image", page('<img src="https://example.com/background.png">')],
  ["CSS resource", page('<style>body { background: url(https://example.com/bg.png) }</style>')],
  ["CSS import", page('<style>@import "https://example.com/theme.css";</style>')],
  ["local unbundled resource", page('<img src="./background.png">')],
  ["remote module", page().replace('from "./solar-motion.mjs"', 'from "https://example.com/motion.mjs"')],
  ["mixed-case script terminator", page().replace('globalThis.result = marker + motion;', 'globalThis.result = "</ScRiPt>";')],
  ["unexpected importmap", page().replace('./vendor/three.module.js', 'https://example.com/three.js')],
]) {
  test(`rejects ${name} without writing an output`, () => {
    const result = build(html);
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(result.html, null);
  });
}
