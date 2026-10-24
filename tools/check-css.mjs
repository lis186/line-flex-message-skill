// Detects changes to the simulator's Flex CSS on LINE's public CDN. No login, no simulator request.
// Usage: node tools/check-css.mjs                 is the file at CSS_URL still the one pinned by CSS_SHA256?
//        node tools/check-css.mjs --diff <url>    list renderer-relevant rules that differ between CSS_URL and <url>
// Exit: 0 unchanged, 1 changed (prints what moved), 2 could not fetch.
//
// Only the URL and a sha256 (both in render.mjs) are stored, never LINE's stylesheet. Hashed CDN files are kept, so --diff fetches both
// versions live. When LINE moves the stylesheet to a new hash, point CSS_URL at it and --diff the old URL.
import { createHash } from 'node:crypto';
import { CSS_URL, CSS_SHA256 } from '../skills/line-flex-message/scripts/render.mjs';

const RELEVANT = /(^|[ .])(Ly\w+|T1|t1\w+|MdBx|MdTxt|MdSpn|MdIco|MdImg|MdBtn|MdSep|ExMgn\w+|ExPad\w+|ExBdr\w+|Ex[TBLR]\w+|spc\w+|fl\d|itms-\w+|grv\w|alg\w)\b/;

async function load(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    console.log(`css=error reason=${e.message} url=${url}`);
    process.exit(2);
  }
}

// "selector{decls}" pairs the renderer depends on; rules inside @media are keyed with their condition.
function rules(css) {
  const out = {};
  let media = '';
  for (const m of css.matchAll(/(@media[^{]+)\{|([^{}]+)\{([^{}]*)\}|\}/g)) {
    if (m[1]) { media = m[1].trim() + ' '; continue; }
    if (!m[2]) { media = ''; continue; }
    if (RELEVANT.test(m[2])) out[media + m[2].trim()] = m[3].split(';').map(d => d.trim()).filter(Boolean).sort().join('; ');
  }
  return out;
}

const sha = text => createHash('sha256').update(text).digest('hex');
const diffIndex = process.argv.indexOf('--diff');

if (diffIndex !== -1) {
  const other = process.argv[diffIndex + 1];
  const [a, b] = [rules(await load(CSS_URL)), rules(await load(other))];
  const changes = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);
  console.log(`css=${changes.length ? 'changed' : 'unchanged'} rules=${changes.length}`);
  for (const k of changes) console.log(`  ${k}\n    - ${a[k] ?? '(absent)'}\n    + ${b[k] ?? '(absent)'}`);
  process.exit(changes.length ? 1 : 0);
}

const css = await load(CSS_URL);
if (sha(css) !== CSS_SHA256) {
  console.log(`css=changed reason=file at CSS_URL no longer matches CSS_SHA256; new sha256=${sha(css)}`);
  process.exit(1);
}
console.log('css=unchanged');
