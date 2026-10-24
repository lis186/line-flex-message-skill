// Renders Flex Messages to PNG the way the Flex Message Simulator draws them, using headless Chrome.
// Usage: node scripts/preview.mjs <file.json|/dev/stdin> [--out preview.png] [--width 375] [--device ios] [--text-size l]
//                                  [--scale 2] [--boxes boxes.json]
//   Input: a Flex container, a flex message, or {messages:[...]} (one PNG per flex message: preview-1.png, ...).
//   --width is the chat width in CSS px. A single bubble is min(width, the size's max width), giga keeping 7px each side;
//   a carousel bubble is min(80% of width, max). A carousel is drawn whole: every bubble side by side, each at that width.
//   --scale sets device px per CSS px.
//   --boxes writes each component's box as [{path, x, y, width, height}] in CSS px from its bubble's top-left corner,
//   path being the component's JSON Pointer in the container (e.g. /body/contents/2).
//   --device ios applies what the simulator ignores, as measured on iOS (references/device-ios.md); omit it to match the simulator.
//   --text-size xs|s|m|l|xl|xxl|xxxl is the iPhone's text-size setting (l = default); only `scaling: true` follows it.
// Chrome or Chromium: $CHROME_PATH, else the usual install locations on macOS, Linux and Windows.
// LINE's stylesheet is fetched once and cached in $XDG_CACHE_HOME/line-flex-message (default ~/.cache/line-flex-message).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderDocument, CSS_URL, CSS_SHA256 } from './render.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
const input = args[0];
if (!input || input.startsWith('--')) { console.error('usage: preview.mjs <file.json|/dev/stdin> [--out preview.png] [--width 375] [--device ios] [--text-size l] [--scale 2] [--boxes boxes.json]'); process.exit(2); }
const out = opt('--out', 'preview.png');
const width = Number(opt('--width', 375));
const scale = Number(opt('--scale', 2));
const device = opt('--device', null);
const textSize = opt('--text-size', 'l');
const boxesOut = opt('--boxes', null);
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const chrome = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find(p => existsSync(p));
if (!chrome || !existsSync(chrome)) { console.error('Chrome or Chromium not found; set CHROME_PATH'); process.exit(2); }

const json = JSON.parse(readFileSync(input, 'utf8'));
const allBoxes = [];
const containers = Array.isArray(json.messages)
  ? json.messages.filter(m => m.type === 'flex').map(m => m.contents)
  : [json.type === 'flex' ? json.contents : json];
if (!containers.length) { console.error('no flex message in input'); process.exit(2); }

// Cache LINE's stylesheet locally so later previews work offline. Only the exact file the renderer was built
// against is accepted (CSS_SHA256), both when downloading and every time the cache is used.
const cacheDir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'line-flex-message');
mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const cssFile = join(cacheDir, CSS_URL.split('/line_flexible_msg/')[1].replace(/\//g, '_'));
const sha256 = data => createHash('sha256').update(data).digest('hex');
if (!existsSync(cssFile) || sha256(readFileSync(cssFile)) !== CSS_SHA256) {
  const r = await fetch(CSS_URL);
  const css = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  if (!css || sha256(css) !== CSS_SHA256) {
    console.error(`preview=error reason=${CSS_URL} ${r.ok ? 'does not match the pinned sha256 (LINE changed its stylesheet; see docs/maintaining.md)' : `HTTP ${r.status}`}`);
    process.exit(2);
  }
  const tmp = `${cssFile}.${process.pid}.tmp`;
  writeFileSync(tmp, css);
  renameSync(tmp, cssFile);
}

const work = mkdtempSync(join(tmpdir(), 'flex-preview-'));
// DevTools over a private pipe (fd 3 in, fd 4 out) rather than a TCP port, so no other local process can attach.
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${join(work, 'profile')}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-extensions', '--disable-sync',
  '--disable-background-networking', '--disable-component-update', '--disable-features=MediaRouter,OptimizationHints',
  'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const cleanup = async () => {
  const exited = new Promise(ok => (proc.exitCode !== null ? ok() : proc.once('exit', ok)));
  proc.kill();
  await exited;
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
};
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => cleanup().finally(() => process.exit(130)));

try {
  const [toChrome, fromChrome] = [proc.stdio[3], proc.stdio[4]];
  let seq = 0, buf = '', gate = () => {};
  const blocked = { document: null };
  const pending = new Map(), waiters = [];
  const exited = new Promise((_, ng) => proc.once('exit', () => ng(new Error('Chrome exited unexpectedly'))));
  exited.catch(() => {});
  // Pipe messages are JSON, each terminated by a NUL byte.
  fromChrome.on('data', chunk => {
    buf += chunk;
    let end;
    while ((end = buf.indexOf('\0')) !== -1) {
      let m;
      try { m = JSON.parse(buf.slice(0, end)); } catch { m = null; }
      buf = buf.slice(end + 1);
      if (!m) continue;
      if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); continue; }
      if (m.method === 'Fetch.requestPaused') { gate(m); continue; }
      for (const w of waiters.splice(0)) w(m);
    }
  });
  const send = (method, params = {}, sessionId) => Promise.race([exited, new Promise((ok, ng) => {
    const id = ++seq;
    pending.set(id, m => (m.error ? ng(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
    toChrome.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  })]);
  const nextEvent = (method, sessionId) => new Promise(ok => {
    const wait = m => (m.method === method && m.sessionId === sessionId ? ok(m) : waiters.push(wait));
    waiters.push(wait);
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  // Every request the page makes passes this gate: the preview HTML we wrote, the verified stylesheet, and https
  // images. Anything else — a meta refresh to file:// or to a local service, a script, a font from elsewhere — fails.
  const cssUrl = pathToFileURL(cssFile).href;
  let pageUrl = null;
  gate = m => {
    const { requestId, request, resourceType } = m.params;
    const ok = request.url === pageUrl || request.url === cssUrl || (resourceType === 'Image' && /^https:\/\//.test(request.url));
    if (!ok) {
      console.error(`blocked request: ${resourceType} ${request.url.slice(0, 120)}`);
      if (resourceType === 'Document') blocked.document = request.url;
    }
    send(ok ? 'Fetch.continueRequest' : 'Fetch.failRequest', ok ? { requestId } : { requestId, errorReason: 'BlockedByClient' }, m.sessionId)
      .catch(() => {});
  };
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);

  for (const [i, container] of containers.entries()) {
    const html = renderDocument(container, { device, textSize, annotate: !!boxesOut })
      .replace(CSS_URL, cssUrl)
      // A neutral chat-like backdrop with the simulator's side gutters.
      .replace('<body style="margin: 0;">', '<body style="margin: 0; padding: 16px 0; background: #8cabd9;">');
    const file = join(work, `flex-${i}.html`);
    pageUrl = pathToFileURL(file).href;
    blocked.document = null;
    writeFileSync(file, html);
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: scale, mobile: true }, sessionId);
    const loaded = nextEvent('Page.loadEventFired', sessionId);
    await send('Page.navigate', { url: pathToFileURL(file).href }, sessionId);
    await loaded;
    // Refuse to capture anything but our own page, whatever the content tried (checked again after capturing).
    const stillOurs = async () => {
      const { result: where } = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, sessionId);
      if (where.value !== pageUrl || blocked.document) throw new Error(`page tried to navigate away (${String(blocked.document || where.value).slice(0, 120)})`);
    };
    await stillOurs();
    // Flex images are CSS backgrounds; wait for each one (10 s cap) before measuring and capturing.
    const { result } = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const urls = [...document.querySelectorAll('[style*="background-image"]')]
        .map(el => getComputedStyle(el).backgroundImage.match(/url\\("?(.*?)"?\\)/)?.[1]).filter(Boolean);
      const failed = [];
      // Device mode fits shrink-to-fit text after fonts load and flags the document when done.
      for (let i = 0; i < 40 && document.querySelector('.dvShrink') && !document.documentElement.dataset.dvReady; i++) await new Promise(r => setTimeout(r, 50));
      await Promise.race([
        Promise.all(urls.map(u => new Promise(ok => { const img = new Image(); img.onload = ok; img.onerror = () => { failed.push(u); ok(); }; img.src = u; }))),
        new Promise(ok => setTimeout(ok, 10000)),
      ]);
      // A carousel scrolls sideways in the chat; lay every bubble out at its chat width (80% of --width, capped) instead.
      const slider = document.querySelector('.LySlider');
      if (slider) {
        slider.style.overflow = 'visible';
        for (const item of slider.querySelectorAll('.lyItem')) item.style.width = ${width * 0.8} + 'px';
      }
      const r = n => Math.round(n * 10) / 10;
      const boxes = [...document.querySelectorAll('[data-path]')].map(el => {
        const b = el.getBoundingClientRect(), t = el.closest('.T1').getBoundingClientRect();
        return { path: el.dataset.path, x: r(b.left - t.left), y: r(b.top - t.top), width: r(b.width), height: r(b.height) };
      });
      return {
        height: Math.ceil(document.body.getBoundingClientRect().bottom),
        width: Math.ceil(Math.max(${width}, slider ? slider.querySelector('.lyInner').scrollWidth : 0)),
        boxes, failed,
      };
    })()` }, sessionId);
    const { height, width: shotWidth, boxes } = result.value;
    for (const u of result.value.failed) console.error(`image failed to load: ${u}`);
    await send('Emulation.setDeviceMetricsOverride', { width: shotWidth, height, deviceScaleFactor: scale, mobile: true }, sessionId);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: shotWidth, height, scale: 1 } }, sessionId);
    await stillOurs();
    const target = resolve(containers.length > 1 ? out.replace(/(\.png)?$/, `-${i + 1}.png`) : out);
    writeFileSync(target, Buffer.from(shot.data, 'base64'));
    allBoxes.push(...(containers.length > 1 ? boxes.map(b => ({ message: i + 1, ...b })) : boxes));
    console.log(`preview=${target} width=${shotWidth} height=${height}`);
  }
  if (boxesOut) {
    writeFileSync(boxesOut, JSON.stringify(allBoxes, null, 1) + '\n');
    console.log(`boxes=${resolve(boxesOut)} count=${allBoxes.length}`);
  }
  toChrome.end();
} catch (e) {
  console.error(`preview=error reason=${e.message}`);
  process.exitCode = 2;
} finally {
  await cleanup();
}
