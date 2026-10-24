// Compares the skill's renderer against HTML the Flex Message Simulator produced for the same JSON.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { renderComponent, renderBody, renderDocument, Ctx, CSS_URL } from '../skills/line-flex-message/scripts/render.mjs';

const probes = JSON.parse(readFileSync(new URL('./data/probes.json', import.meta.url)));
const results = JSON.parse(readFileSync(new URL('./data/probe-results.json', import.meta.url)));

// Class order and inline-style order carry no meaning in the simulator's output.
export function normalize(html) {
  return html
    .replace(/ class="([^"]*)"/g, (_, c) => ` class="${c.split(/\s+/).filter(Boolean).sort().join(' ')}"`)
    .replace(/ style="([^"]*)"/g, (_, s) => {
      const decls = s.split(';').map(d => d.trim()).filter(Boolean).sort();
      return decls.length ? ` style="${decls.join('; ')}"` : '';
    });
}

const CONTAINER = new Set(['bubble', 'video', 'carousel']);

probes.forEach((probe, i) => {
  const golden = results[i];
  const name = `${probe.comp}.${probe.p}=${JSON.stringify(probe.v)}`;
  if (golden.status !== 200) {
    test(`${name} is rejected by the simulator`, () => assert.equal(golden.status, 400));
    return;
  }
  test(name, () => {
    let actual;
    if (CONTAINER.has(probe.comp)) actual = renderBody(probe.bubble).body;
    else {
      const body = probe.bubble.body;
      const target = body.contents[1];
      actual = renderComponent(target, body, new Ctx());
    }
    const expected = typeof golden.target === 'string' ? golden.target : golden.target.el;
    assert.equal(normalize(actual), normalize(expected));
  });
});

// Whole-document goldens for the combined cases in tests/cases/.
const goldenDir = new URL('./data/golden/', import.meta.url);
const styleRules = html => (html.match(/<style type="text\/css">([^<]*)<\/style>/)?.[1] ?? '')
  .split('}').map(r => r.trim().replace(/\s+/g, ' ')).filter(Boolean).sort();
for (const file of existsSync(goldenDir) ? readdirSync(goldenDir).filter(f => f.endsWith('.json')) : []) {
  const golden = JSON.parse(readFileSync(new URL(file, goldenDir)));
  if (golden.status !== 200) continue;
  test(`golden ${file}`, () => {
    // A new CSS hash means LINE shipped new styles: run `node tools/check-css.mjs --diff <new url>`.
    const cssUrl = golden.html.match(/href="([^"?]+)/)?.[1];
    assert.equal(cssUrl, CSS_URL, `simulator now serves ${cssUrl}`);
    const { ctx, body } = renderBody(golden.input);
    assert.equal(normalize(body), normalize(golden.html.match(/<body[^>]*>(.*)<\/body>/s)[1]));
    const mine = styleRules(`<style type="text/css">${ctx.rules.join(' ')}</style>`);
    assert.deepEqual(mine, styleRules(golden.html).filter(r => r.startsWith('.fxC')));
  });
}

// --boxes annotates components with data-path; apart from that attribute the HTML must not change.
test('annotate mode only adds data-path attributes', () => {
  const containers = [...probes.map(p => p.bubble), ...readdirSync(new URL('../tests/cases/', import.meta.url))
    .map(f => JSON.parse(readFileSync(new URL(`../tests/cases/${f}`, import.meta.url))))];
  for (const c of containers) {
    for (const device of [null, 'ios']) {
      const plain = renderDocument(c, { device });
      const annotated = renderDocument(c, { device, annotate: true });
      assert.equal(annotated.replace(/ data-path="[^"]*"/g, ''), plain);
    }
  }
});
