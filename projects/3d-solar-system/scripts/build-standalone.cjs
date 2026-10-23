// Builds web/solar-standalone.html: one self-contained file that opens by
// double-click. The normal web/solar.html stays modular for development.
//
// Why this exists: opening solar.html straight off disk (file://) makes Chrome
// refuse to load ./vendor/three.module.js with a CORS error ("origin 'null'"),
// so nothing runs. Inlining the bundle removes the separate module request.
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const WEB = path.join(__dirname, "..", "web");
const SRC = path.join(WEB, "solar.html");
const OUT = path.join(WEB, "solar-standalone.html");

(async () => {
  const html = fs.readFileSync(SRC, "utf8");

  const importmap = /\s*<script type="importmap">[\s\S]*?<\/script>/;
  const moduleOpen = /<script type="module">/;
  if (!importmap.test(html) || !moduleOpen.test(html)) {
    throw new Error("solar.html no longer has the expected importmap/module script shape");
  }

  // Everything after the opening <script type="module"> tag, up to </script>.
  const start = html.search(moduleOpen) + "<script type=\"module\">".length;
  const end = html.indexOf("</script>", start);
  const source = html.slice(start, end);

  const result = await esbuild.build({
    stdin: {
      contents: source,
      resolveDir: WEB,
      sourcefile: "solar-inline.js",
      loader: "js",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome100", "firefox100", "safari15"],
    minify: false,
    legalComments: "none",
    write: false,
  });

  const bundle = result.outputFiles[0].text;

  let out = html.slice(0, html.search(importmap))
    + html.slice(html.search(importmap) + html.match(importmap)[0].length);
  out = out.replace(moduleOpen, "<script>");
  const s2 = out.search(/<script>/) + "<script>".length;
  const e2 = out.indexOf("</script>", s2);
  out = out.slice(0, s2) + "\n" + bundle + "\n" + out.slice(e2);

  // Guard against the classic inline-script landmine: a literal </script> inside
  // the bundle would end the tag early and break the page.
  if (bundle.includes("</script")) {
    throw new Error("bundle contains a literal </script> — needs escaping");
  }

  fs.writeFileSync(OUT, out);
  console.log("wrote", path.relative(process.cwd(), OUT), (out.length / 1024).toFixed(0) + " KB");
})();
