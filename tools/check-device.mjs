// Renders each calibration card with `--device ios` and compares box heights and line counts with the iPhone,
// then card C5 at each recorded iOS text-size setting for `scaling`.
// Run: npm run check-device   (needs Chrome and uv; ~1 min)
// Exit 0 when every box is within TOLERANCE px of the phone and has the same number of text lines.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOLERANCE = 1.0;
// Glyph widths at a scaled size differ slightly between Chrome and iOS text shaping.
const SCALE_WIDTH_TOLERANCE = 1.5;
const root = new URL('..', import.meta.url).pathname;
const expected = JSON.parse(readFileSync(join(root, 'tests/device/ios-expected.json'), 'utf8'));
const cards = JSON.parse(readFileSync(join(root, 'tests/device/calibration.json'), 'utf8')).contents.contents;
const work = mkdtempSync(join(tmpdir(), 'flex-device-'));
let failures = 0;

try {
  for (const [name, { boxes }] of Object.entries(expected.cards)) {
    const card = cards[Number(name.slice(1)) - 1];
    const json = join(work, `${name}.json`), png = join(work, `${name}.png`);
    writeFileSync(json, JSON.stringify(card));
    execFileSync('node', [join(root, 'skills/line-flex-message/scripts/preview.mjs'), json, '--device', expected.device, '--width', String(expected.width), '--scale', '3', '--out', png]);
    const out = execFileSync('uv', ['run', '--quiet', '--with', 'pillow==13.0.0', 'python', '-I', join(root, 'tools/measure-device.py'), png], { encoding: 'utf8' });
    const got = [...out.matchAll(/h\s+([\d.]+)\s+w\s+[\d.]+\s+ink-lines (\d+)/g)].map(m => ({ height: Number(m[1]), lines: Number(m[2]) }));
    boxes.forEach((want, i) => {
      const have = got[i];
      const ok = have && Math.abs(have.height - want.height) <= TOLERANCE && have.lines === want.lines;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} box${i + 1}: phone ${want.height}px ${want.lines} lines, render ${have ? `${have.height}px ${have.lines} lines` : 'missing'}`);
    });
  }

  // scaling: card C5 at each recorded text-size setting; ink width carries the scale factor most precisely.
  const c5 = join(work, 'C5.json');
  writeFileSync(c5, JSON.stringify(cards[4]));
  for (const [size, { items }] of Object.entries(expected.scaling.textSizes)) {
    const png = join(work, `C5-${size}.png`);
    execFileSync('node', [join(root, 'skills/line-flex-message/scripts/preview.mjs'), c5, '--device', expected.device, '--text-size', size, '--width', String(expected.width), '--scale', '3', '--out', png]);
    const out = execFileSync('uv', ['run', '--quiet', '--with', 'pillow==13.0.0', 'python', '-I', join(root, 'tools/measure-scaling.py'), png], { encoding: 'utf8' });
    const got = Object.fromEntries([...out.matchAll(/^\s+(\w+ \w+)\s+h\s+([\d.]+)\s+ink-h\s+([\d.]+)\s+ink-w\s+([\d.]+)/gm)]
      .map(m => [m[1], { height: Number(m[2]), inkHeight: Number(m[3]), inkWidth: Number(m[4]) }]));
    for (const [item, want] of Object.entries(items)) {
      const have = got[item];
      const ok = have && Math.abs(have.height - want.height) <= TOLERANCE && Math.abs(have.inkHeight - want.inkHeight) <= TOLERANCE
        && Math.abs(have.inkWidth - want.inkWidth) <= SCALE_WIDTH_TOLERANCE;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} C5 text-size=${size} ${item}: phone ink ${want.inkHeight}×${want.inkWidth}, render ${have ? `${have.inkHeight}×${have.inkWidth}` : 'missing'}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `device=mismatch boxes=${failures}` : 'device=match');
process.exit(failures ? 1 : 0);
