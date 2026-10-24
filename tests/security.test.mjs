// Hostile Flex values must never reach the preview page as markup, script or a URL other than an https image.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDocument } from '../skills/line-flex-message/scripts/render.mjs';

const BREAKOUT = '"><script>pwn()</script>';
const evil = {
  type: 'bubble',
  size: 'constructor',
  styles: { body: { backgroundColor: `#000;} </style><script>pwn()</script><style>`, separator: true, separatorColor: BREAKOUT } },
  body: {
    type: 'box', layout: 'vertical', margin: 'constructor', spacing: `3px${BREAKOUT}`, paddingAll: `1px${BREAKOUT}`,
    cornerRadius: BREAKOUT, borderWidth: BREAKOUT, borderColor: BREAKOUT, offsetTop: BREAKOUT,
    contents: [
      { type: 'text', text: '<img src=x onerror=pwn()>', color: `#fff !important; } </style><script>pwn()</script><style>`,
        size: `1px;${BREAKOUT}`, maxLines: `1;${BREAKOUT}`, lineSpacing: BREAKOUT, flex: `1;${BREAKOUT}`, wrap: true,
        contents: [{ type: 'span', text: '</p><script>pwn()</script>', size: BREAKOUT, color: BREAKOUT }] },
      { type: 'image', url: `https://x/a.png');"><img src=x onerror=pwn()>`, size: `9px${BREAKOUT}`, aspectRatio: 5,
        backgroundColor: BREAKOUT },
      { type: 'image', url: 'javascript:pwn()' },
      { type: 'image', url: 'http://127.0.0.1:9222/json' },
      { type: 'box', layout: 'baseline', contents: [{ type: 'icon', url: `https://x/i.png'); x:url('https://evil`, size: BREAKOUT }] },
      { type: 'button', style: 'primary', color: BREAKOUT, action: { type: 'uri', label: '<script>pwn()</script>', uri: 'javascript:pwn()' } },
      { type: 'box', layout: 'vertical', contents: [], width: BREAKOUT, height: BREAKOUT, maxWidth: BREAKOUT, maxHeight: BREAKOUT,
        background: { type: 'linearGradient', angle: "0deg);background:url('https://evil", startColor: '#000', endColor: '#fff' } },
    ],
  },
};

for (const device of [null, 'ios']) {
  for (const annotate of [false, true]) {
    test(`hostile values stay inert (device=${device}, annotate=${annotate})`, () => {
      const html = renderDocument(evil, { device, annotate });
      // The renderer's own device script is the only script allowed; drop it before looking for anything injected.
      const rest = html.replace(/<script>document\.fonts\.ready[\s\S]*?<\/script>/, '');
      assert.doesNotMatch(rest, /<script|onerror|javascript:|evil|127\.0\.0\.1|pwn\(\)(?![^<]*<\/(p|span|div)>)/i);
      assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src /);
    });
  }
}

test('escaped text still shows as text', () => {
  const html = renderDocument({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [
    { type: 'text', text: '<img src=x onerror=pwn()>' },
    { type: 'button', action: { type: 'uri', label: '<script>pwn()</script>', uri: 'https://example.com' } }] } });
  assert.match(html, /<p>&lt;img src=x onerror=pwn\(\)&gt;<\/p>/);
  assert.match(html, /<div>&lt;script&gt;pwn\(\)&lt;\/script&gt;<\/div>/);
});

// Every property of every component, set to a value that tries to close the attribute or tag it lands in.
import { readFileSync } from 'node:fs';
const probes = JSON.parse(readFileSync(new URL('./data/probes.json', import.meta.url)));
const PAYLOADS = ['0"><meta http-equiv="refresh" content="0;url=file:///etc/passwd"><div class="',
  "0');background:url('https://evil", '0;}</style><meta http-equiv="refresh" content="0"><style>', '0 onerror=x', 'constructor'];

test('no property of any component can inject markup', () => {
  const seen = new Set();
  const containers = [];
  for (const probe of probes) {
    const key = `${probe.comp}.${probe.p}`;
    if (seen.has(key) || probe.comp === 'bubble') continue;
    seen.add(key);
    for (const payload of PAYLOADS) {
      const bubble = structuredClone(probe.bubble);
      const target = probe.comp === 'carousel' || probe.comp === 'video' ? bubble : bubble.body.contents[1];
      if (probe.comp === 'filler') target.flex = payload;
      // Structural fields (hero, contents, styles) hold components, not values; a string there is a type error, not markup.
      else if (target && probe.p in target && typeof target[probe.p] !== 'object') target[probe.p] = payload;
      containers.push(bubble);
    }
  }
  containers.push({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: PAYLOADS.map(flex => ({ type: 'filler', flex })) } });
  assert.ok(containers.length > 200);
  for (const c of containers) {
    for (const device of [null, 'ios']) {
      const body = renderDocument(c, { device, annotate: true }).split('<body')[1].replace(/<script>document\.fonts\.ready[\s\S]*?<\/script>/, '');
      assert.doesNotMatch(body, /<meta|<style|<script|onerror=|evil|file:\/\//i, JSON.stringify(c).slice(0, 300));
    }
  }
});
