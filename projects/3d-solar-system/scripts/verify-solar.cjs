// Independent CDP regression: real canvas clicks and keyboard input, with hook
// measurements and an explicitly synthetic pointercancel recovery check.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { pathToFileURL, URL: URLConstructor } = require("node:url");
const { launchChrome, sleep } = require("./verify-runtime.cjs");
const ROOT = path.join(__dirname, "..");
const CHROME = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.resolve(process.env.SOLAR_OUT || path.join(ROOT, "out/solar-regression"));
const URL = process.env.SOLAR_URL || "http://127.0.0.1:4321/solar.html";
const targets = ["sun", 0, 1, 2, 3, 4, 5, 6, 7];
const names = ["水星", "金星", "地球", "火星", "木星", "土星", "天王星", "海王星"];
const fingerprints = () => Object.fromEntries(["web/solar.html", "web/solar-motion.mjs", "web/solar-surfaces.mjs", "web/solar-standalone.html"].map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex")]));

async function verifyMode(mode) {
  const report = {mode: mode.name, url: mode.url,
    inputCoverage: {canvasClicks:"real CDP mouse input, original overview camera",keyboard:"real CDP Escape/Space",pointerCancellation:"real mouse drag plus synthetic PointerEvent; native touch not covered"},
    testedFiles: fingerprints(), checks: [], screenshots: [], startedAt: new Date().toISOString()};
  let runtime;
  const check = (name, ok, detail) => { report.checks.push({name, ok: Boolean(ok), detail}); console.log(`${mode.name}: ${ok ? "PASS" : "FAIL"} ${name}`); };
  try {
    runtime = await launchChrome({root: ROOT, executable: CHROME});
    const {send, evaluate, waitFor} = runtime;
    report.profile = path.relative(ROOT, runtime.profile);
    const viewport = async (width, height) => {
      await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: false});
      await sleep(150);
    };
    const screenshot = async (name) => {
      const result = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
      const file = `${mode.name}-${name}.png`; fs.writeFileSync(path.join(OUT, file), Buffer.from(result.data, "base64"));
      report.screenshots.push(file);
    };
    const mouse = (type, x, y, down = false) => send("Input.dispatchMouseEvent", {type, x: Math.round(x), y: Math.round(y), button: type === "mouseMoved" ? "none" : "left", buttons: down ? 1 : 0, clickCount: type === "mouseMoved" ? undefined : 1});
    const click = async (x, y) => {
      await mouse("mouseMoved", x, y);
      // Queue both native events together, avoiding an artificial long press if
      // a software-rendered frame delays the acknowledgement of pointerdown.
      await Promise.all([mouse("mousePressed", x, y, true), mouse("mouseReleased", x, y)]);
    };
    const key = async (code, key, virtual) => {
      await send("Input.dispatchKeyEvent", {type: "keyDown", code, key, windowsVirtualKeyCode: virtual});
      await send("Input.dispatchKeyEvent", {type: "keyUp", code, key, windowsVirtualKeyCode: virtual});
    };
    // The exposed dolly/angle hook can settle before the independent focus-target
    // transition. Wait for its real projected center too; assertions stay at 4 px.
    const settled = () => waitFor("(()=>{const h=window.__SOLAR__;if(!h.settled())return false;if(h.focused===null)return true;const p=h.screenOf(h.focused),a=h.focusArea;return Math.hypot(p.x-a.left-a.width/2,p.y-a.top-a.height/2)<2;})()", 15000);
    await viewport(1920, 1080);
    await send("Page.navigate", {url: mode.url});
    await waitFor("Boolean(window.__SOLAR_READY__ && window.__SOLAR__ && document.getElementById('loading').classList.contains('gone'))", 30000);
    await evaluate("window.__pointerTrace=[];for(const name of ['pointerdown','pointerup','pointercancel','lostpointercapture'])document.getElementById('scene').addEventListener(name,event=>{window.__pointerTrace.push({type:event.type,id:event.pointerId,trusted:event.isTrusted,x:event.clientX,y:event.clientY,at:performance.now()});if(window.__pointerTrace.length>12)window.__pointerTrace.shift();})");
    check("ready and nine bodies", await evaluate("window.__SOLAR__.bodies.length === 9"));

    // Freeze only simulation for repeatable aiming; clicks remain real CDP input.
    await evaluate("window.__SOLAR__.setSpeed(1)");
    await key("Space", " ", 32);
    check("real Space pauses", await evaluate("window.__SOLAR__.paused"));
    for (const target of targets) {
      await key("Escape", "Escape", 27); await settled();
      await evaluate("window.__pointerTrace=[]");
      const rayDiagnostic = await evaluate(`(() => {
        const hook=window.__SOLAR__, key=body=>body.kind==='sun'?'sun':body.index;
        const body=hook.bodies.find(body=>key(body)===${JSON.stringify(target)}), world=new hook.THREE.Vector3();
        body.group.getWorldPosition(world);
        const center=hook.screenOf(${JSON.stringify(target)}), radius=body.dispR*innerHeight/(2*Math.tan(hook.camera.fov*Math.PI/360)*hook.camera.position.distanceTo(world));
        const meshes=hook.bodies.flatMap(body=>[body.mesh,...(body.ringMesh?[body.ringMesh]:[])]);
        const ray=new hook.THREE.Raycaster(), points=[], seen=new Set();
        const probe=(x,y)=>{x=Math.round(x);y=Math.round(y);const id=x+','+y;if(seen.has(id))return;seen.add(id);
          ray.setFromCamera(new hook.THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),hook.camera);
          const hit=ray.intersectObjects(meshes,false)[0], hitBody=hit&&(hit.object.userData.body||hook.bodies.find(body=>body.mesh===hit.object||body.ringMesh===hit.object));
          points.push({x,y,visualKey:hitBody?key(hitBody):null,distance:hit?.distance??null});};
        probe(center.x,center.y);
        for(const fraction of [.45,.72,.88])for(let n=0;n<12;n++)probe(center.x+radius*fraction*Math.cos(n*Math.PI/6),center.y+radius*fraction*Math.sin(n*Math.PI/6));
        return {center,radius,centerRay:points[0],probes:points,visiblePoints:points.filter(point=>point.visualKey===${JSON.stringify(target)})};
      })()`);
      let aim, hover;
      for (let attempt = 0; attempt < 30; attempt++) {
        if (!rayDiagnostic.visiblePoints.length) break;
        aim = rayDiagnostic.visiblePoints[attempt % rayDiagnostic.visiblePoints.length];
        await mouse("mouseMoved", aim.x, aim.y); await sleep(70);
        hover = await evaluate("window.__SOLAR__.hoveredKey");
        if (hover === target) break;
      }
      if (hover === target) { await click(aim.x, aim.y); await settled(); }
      const actual = await evaluate("({focused:window.__SOLAR__.focused, heading:document.querySelector('#info .cn').textContent, visible:document.getElementById('info').classList.contains('on'), diagnostic:window.__SOLAR__.lastClick, pointerEvents:window.__pointerTrace})");
      const expectedHeading = target === "sun" ? "太阳" : names[target];
      const eventsTrusted = ["pointerdown", "pointerup"].every(type => actual.pointerEvents.some(event => event.type === type && event.trusted));
      const ok = hover === target && actual.focused === target && actual.heading === expectedHeading && actual.visible
        && actual.diagnostic?.pressed === target && actual.diagnostic?.released === target && actual.diagnostic?.used === target && eventsTrusted;
      check(`real canvas click ${target}`, ok, {target, hover, aim, rayDiagnostic, ...actual});
      if (!ok) await screenshot(`failed-click-${target}`);
    }

    // Ring planes must remain parallel to the tilted spin axes while the bodies
    // rotate, not only at zero spin. Measurements do not replace visual checks.
    for (const target of [5, 6]) {
      await evaluate(`window.__SOLAR__.select(${target}); window.__SOLAR__.setSpeed(1)`);
      await settled();
      const samples = [];
      for (let index = 0; index < 3; index++) {
        samples.push(await evaluate(`(() => {
          const h=window.__SOLAR__, b=h.bodies.find(b=>b.index===${target});h.scene.updateMatrixWorld(true);
          const axis=new h.THREE.Vector3(0,1,0).applyQuaternion(b.mesh.getWorldQuaternion(new h.THREE.Quaternion())).normalize();
          const normal=new h.THREE.Vector3(0,0,1).applyQuaternion(b.ringMesh.getWorldQuaternion(new h.THREE.Quaternion())).normalize();
          return {axis:axis.toArray(),ringNormal:normal.toArray(),alignment:Math.abs(axis.dot(normal)),spin:b.mesh.rotation.y};
        })()`));
        await sleep(350);
      }
      check(`ring remains parallel to spin axis ${target}`, samples.every(sample => sample.alignment >= .9999), samples);
    }
    await key("Space", " ", 32);

    // Measure center and all visible primary controls at each supported layout.
    for (const [width, height] of [[1920, 1080], [390, 844], [568, 320], [709, 632]]) {
      await viewport(width, height);
      for (const target of ["sun", 2, 5]) {
        await evaluate(`window.__SOLAR__.select(${JSON.stringify(target)})`); await settled(); await sleep(150);
        const measurement = await evaluate(`(() => {
          const hook=window.__SOLAR__, point=hook.screenOf(${JSON.stringify(target)}), area=hook.focusArea;
          const rect=el=>{const r=el.getBoundingClientRect();return {id:el.id||el.getAttribute('data-sp'),left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
          const controls=[...document.querySelectorAll('#controls button,#bodySelect,#info')].filter(el=>getComputedStyle(el).visibility!=='hidden').map(rect);
          const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
          const overlaps=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++)if(intersects(controls[i],controls[j]))overlaps.push([controls[i].id,controls[j].id]);
          return {point,area,controls,overlaps,inArea:point.x>=area.left&&point.x<=area.left+area.width&&point.y>=area.top&&point.y<=area.top+area.height,centerError:Math.hypot(point.x-area.left-area.width/2,point.y-area.top-area.height/2),controlsInViewport:controls.every(r=>r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1)};
        })()`);
        check(`framing ${width}x${height} ${target}`, measurement.inArea && measurement.centerError < 4 && measurement.overlaps.length === 0 && measurement.controlsInViewport, measurement);
      }
      await screenshot(`${width}x${height}-saturn`);
    }

    await viewport(1920, 1080);
    await evaluate("window.__SOLAR__.select(0); window.__SOLAR__.setSpeed(16)"); await settled(); await sleep(800);
    const samples = [];
    for (let index = 0; index < 12; index++) {
      samples.push(await evaluate("(()=>{const h=window.__SOLAR__,p=h.screenOf(0),a=h.focusArea;return {focused:h.focused,point:p,error:Math.hypot(p.x-a.left-a.width/2,p.y-a.top-a.height/2),inside:p.x>=a.left&&p.x<=a.left+a.width&&p.y>=a.top&&p.y<=a.top+a.height};})()"));
      await sleep(300);
    }
    check("Mercury 16x stays centered for 3.6 seconds", samples.every(sample => sample.focused === 0 && sample.inside && sample.error < 4), samples);
    await screenshot("mercury-16x");
    await key("Space", " ", 32);
    const pausedAngle = await evaluate("window.__SOLAR__.bodies.find(b=>b.index===0).angle"); await sleep(400);
    check("real Space freezes orbit", await evaluate(`window.__SOLAR__.paused && Math.abs(window.__SOLAR__.bodies.find(b=>b.index===0).angle-${pausedAngle})<1e-9`));
    await key("Space", " ", 32); await sleep(300);
    check("real Space resumes orbit", await evaluate(`!window.__SOLAR__.paused && Math.abs(window.__SOLAR__.bodies.find(b=>b.index===0).angle-${pausedAngle})>.01`));
    await key("Escape", "Escape", 27); await settled();
    check("real Escape clears focus", await evaluate("window.__SOLAR__.focused === null && document.getElementById('info').getAttribute('aria-hidden') === 'true'"));

    // Real press plus synthetic cancellation. This does not claim native touch coverage.
    const area = await evaluate("window.__SOLAR__.focusArea");
    const x = area.left + area.width / 2, y = area.top + area.height / 2;
    await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, true);
    await mouse("mouseMoved", x + 40, y, true);
    await evaluate("document.getElementById('scene').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,isPrimary:true,bubbles:true}))");
    const yaw = await evaluate("window.__SOLAR__.camState.targetYaw");
    await mouse("mouseMoved", x + 90, y, true);
    const afterCancel = await evaluate("window.__SOLAR__.camState.targetYaw");
    await mouse("mouseReleased", x + 90, y);
    check("synthetic pointercancel stops real drag", Math.abs(yaw - afterCancel) < 1e-9, {input:"CDP mouse press/move; synthetic PointerEvent cancellation",yaw,afterCancel});
    await screenshot("overview");
    report.exceptions = [...runtime.exceptions]; report.consoleErrors = [...runtime.consoleErrors]; report.consoleMessages = runtime.consoleMessages;
    report.requests = [...new Set(runtime.requests)];
    const origin = new URLConstructor(mode.url).origin;
    const unexpectedRequests = report.requests.filter(url => {
      const parsed = new URLConstructor(url);
      if (["data:", "blob:"].includes(parsed.protocol)) return false;
      return mode.name === "file" ? url !== mode.url : parsed.origin !== origin;
    });
    check("no external resource dependencies", unexpectedRequests.length === 0, {requests: report.requests, unexpected: unexpectedRequests});
    check("no JavaScript exceptions", report.exceptions.length === 0, report.exceptions);
    check("no console errors", report.consoleErrors.length === 0, report.consoleErrors);
    const programs = await evaluate("window.__SOLAR__.renderer.info.programs.map(program=>({name:program.name,runnable:program.diagnostics?.runnable!==false,log:program.diagnostics?.programLog||null}))");
    check("WebGL shader programs compiled", programs.length > 0 && programs.every(program => program.runnable), programs);
    check("tested source stayed unchanged during mode", JSON.stringify(report.testedFiles) === JSON.stringify(fingerprints()));
  } catch (error) {
    check("runner completed", false, error.stack || error.message);
    if (runtime) { report.exceptions = [...runtime.exceptions]; report.consoleErrors = [...runtime.consoleErrors]; }
  } finally {
    if (runtime) await runtime.close();
  }
  report.finishedAt = new Date().toISOString(); report.ok = report.checks.every(entry => entry.ok);
  fs.writeFileSync(path.join(OUT, `${mode.name}-report.json`), JSON.stringify(report, null, 2));
  return report;
}

(async () => {
  const relative = path.relative(ROOT, OUT);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("SOLAR_OUT must stay within the working project");
  fs.mkdirSync(OUT, {recursive:true});
  const standalone = pathToFileURL(path.join(ROOT, "web/solar-standalone.html")).href;
  const modes = URL === standalone ? [{name:"file",url:standalone}] : [{name:"http",url:URL},{name:"file",url:standalone}];
  const reports = [];
  for (const mode of modes) reports.push(await verifyMode(mode));
  const summary = {ok:reports.every(report=>report.ok), modes:reports.map(report=>({mode:report.mode,ok:report.ok,pass:report.checks.filter(check=>check.ok).length,total:report.checks.length}))};
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2)); process.exitCode = summary.ok ? 0 : 2;
})().catch(error=>{console.error(error.stack || error.message);process.exitCode=1;});
