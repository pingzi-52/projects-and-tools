// Bundle the solar entry and its local modules for offline file:// use.
// Keep the runtime identical to the modular page: resolve three from web/vendor.
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const WEB = path.join(__dirname, "..", "web");
const SRC = path.join(WEB, "solar.html");
const OUT = path.join(WEB, "solar-standalone.html");

function attributes(source) {
  const result = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (result.has(name)) throw new Error(`duplicate HTML attribute: ${name}`);
    result.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function assertEmbeddedResources(html) {
  // Script content is JavaScript, not HTML/CSS. Never interpret its strings as tags.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  for (const match of markup.matchAll(/<(link|img|iframe|audio|video|source|track|object|embed|input)\b([^>]*)>/gi)) {
    for (const [name, value] of attributes(match[2])) {
      if (["src", "href", "poster", "data", "srcset"].includes(name)
        && value && !/^(?:data:|#)/i.test(value)) {
        throw new Error("standalone resources must be embedded; found a resource URL");
      }
    }
  }
  if (/@import\b/i.test(markup)) throw new Error("standalone CSS cannot contain @import");
  for (const match of markup.matchAll(/url\(\s*["']?([^\s)'";]+)/gi)) {
    if (!/^(?:data:|#)/i.test(match[1])) throw new Error("standalone CSS resources must be embedded");
  }
}

async function main() {
  const html = fs.readFileSync(SRC, "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => ({ match, attrs: attributes(match[1]), source: match[2] }));
  if ((html.match(/<script\b/gi) || []).length !== scripts.length
    || (html.match(/<\/script\s*>/gi) || []).length !== scripts.length) {
    throw new Error("malformed script element or literal script terminator in source");
  }
  if (scripts.some((script) => script.attrs.has("src"))) {
    throw new Error("standalone cannot contain external script elements");
  }
  const imports = scripts.filter((script) => script.attrs.get("type")?.toLowerCase() === "importmap");
  const modules = scripts.filter((script) => script.attrs.get("type")?.toLowerCase() === "module");
  if (imports.length !== 1 || modules.length !== 1 || !modules[0].source.trim()) {
    throw new Error("expected exactly one nonempty module entry and one importmap");
  }
  const importmap = JSON.parse(imports[0].source);
  if (Object.keys(importmap).length !== 1 || !importmap.imports
    || Object.keys(importmap.imports).length !== 1
    || importmap.imports.three !== "./vendor/three.module.js") {
    throw new Error("expected only the vendored three import mapping");
  }
  assertEmbeddedResources(html);

  const result = await esbuild.build({
    stdin: { contents: modules[0].source, resolveDir: WEB, sourcefile: "solar-inline.js", loader: "js" },
    plugins: [{
      name: "offline-local-modules",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          const specifier = args.path === "three" ? "./vendor/three.module.js" : args.path;
          if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
            throw new Error("standalone imports must be local modules");
          }
          const resolved = path.resolve(args.resolveDir, specifier);
          const relative = path.relative(WEB, resolved);
          if (relative.startsWith("..") || path.isAbsolute(relative) || !/\.(?:m?js)$/i.test(resolved)) {
            throw new Error("standalone imports must stay inside web and use JavaScript modules");
          }
          return { path: resolved };
        });
      },
    }],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome100", "firefox100", "safari15"],
    minify: false,
    legalComments: "none",
    write: false,
    logLevel: "silent",
  });
  const bundle = result.outputFiles[0].text;
  if (/<\/script\b/i.test(bundle)) throw new Error("bundle contains a literal script terminator; escape it before inlining");

  // Replace only the known entry, preserving ordinary initialization/error scripts.
  const replacements = [
    { match: imports[0].match, text: "" },
    { match: modules[0].match, text: `<script>\n${bundle}\n</script>` },
  ].sort((a, b) => b.match.index - a.match.index);
  let output = html;
  for (const replacement of replacements) {
    const start = replacement.match.index;
    output = output.slice(0, start) + replacement.text + output.slice(start + replacement.match[0].length);
  }
  assertEmbeddedResources(output);
  fs.writeFileSync(OUT, output);
  console.log("wrote", path.relative(process.cwd(), OUT), `${Math.round(Buffer.byteLength(output) / 1024)} KB`);
}

main().catch((error) => { console.error("Build failed:", error.message); process.exitCode = 1; });
