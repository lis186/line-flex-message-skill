// Offline Flex Message → HTML renderer that mirrors the Flex Message Simulator's output.
// Rules: references/render-mapping.md. Values: references/measured-values.md.
// Usage: node scripts/render.mjs <flex.json> > out.html   (accepts a container or a {type:"flex", contents} message)

import { createHash } from 'node:crypto';

export const CSS_URL = 'https://static.line-scdn.net/line_flexible_msg/188b38e2f32/css/sp/main.css';
// sha256 of the file at CSS_URL; preview.mjs refuses any other content (tools/check-css.mjs records it).
export const CSS_SHA256 = '00b1b8339093ff10be4e09d25d980f87e4e1efb9e3ccdcd8eb2eaaee9d46ccab';

const BUBBLE = table({ nano: ['LyNa', 120], micro: ['LyMi', 160], deca: ['LyDe', 220], hecto: ['LyHe', 241], kilo: ['LyKi', 260], mega: ['LyMe', 300], giga: ['LyGi', 500] });
const KW = table({ none: 'None', xs: 'Xs', sm: 'Sm', md: 'Md', lg: 'Lg', xl: 'Xl', xxl: 'XXl' });
const SIZE = table({ xxs: 'XXs', xs: 'Xs', sm: 'Sm', md: 'Md', lg: 'Lg', xl: 'Xl', xxl: 'XXl', '3xl': '3Xl', '4xl': '4Xl', '5xl': '5Xl' });
const BORDER = table({ none: 'None', light: 'Lgh', normal: 'Nml', medium: 'Mdm', 'semi-bold': 'Sbd', bold: 'Bld' });
const JUSTIFY = table({ 'flex-start': 'S', center: 'C', 'flex-end': 'E', 'space-between': 'SB', 'space-around': 'SA', 'space-evenly': 'SE' });
const ALIGN_ITEMS = table({ 'flex-start': 'S', center: 'C', 'flex-end': 'E' });
const DECORATION = table({ none: 'ExTxtDecNone', underline: 'ExTxtDecUl', 'line-through': 'ExTxtDecLt' });
const LAYOUT = table({ vertical: 'vr', horizontal: 'hr', baseline: 'hr bl' });
const BUTTON_STYLE = table({ primary: 'ExBtn1', secondary: 'ExBtn2' });

// Lookup tables without a prototype, so a value such as "constructor" never matches a key.
function table(entries) { return Object.freeze(Object.assign(Object.create(null), entries)); }

// Raw JSON values that reach a style attribute, a <style> block or url() must have one of these shapes (the shapes
// LINE accepts); anything else is dropped, so a hostile message cannot break out into markup or script.
const SAFE = {
  length: /^-?\d+(\.\d+)?(px|%)$/,
  color: /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/,
  angle: /^-?\d+(\.\d+)?deg$/,
  url: /^https:\/\/[^\s"'()<>\\]+$/,
};
const safe = (kind, v) => (typeof v === 'string' && SAFE[kind].test(v) ? v : undefined);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

class Ctx {
  constructor({ device = null, annotate = false } = {}) {
    this.rules = []; this.ids = new Map(); this.rtl = false; this.device = device; this.annotate = annotate; this.path = '';
  }
  // One class per distinct (property, value) pair, numbered in first-use order.
  color(prop, value) {
    if (!safe('color', value)) return null;
    value = value.toLowerCase();
    const key = `${prop}|${value}`;
    if (!this.ids.has(key)) {
      const cls = `fxC${this.ids.size}`;
      this.ids.set(key, cls);
      this.rules.push(`.${cls} { ${prop}: ${value} !important; }`);
    }
    return this.ids.get(key);
  }
  // start/end map to physical sides by the bubble's text direction: [class letter, css side].
  get start() { return this.rtl ? ['R', 'right'] : ['L', 'left']; }
  get end() { return this.rtl ? ['L', 'left'] : ['R', 'right']; }
}

function el(tag, classes, style, inner) {
  // Every value is validated where it is produced; escaping here is the backstop that keeps attributes closed.
  const c = classes.filter(Boolean).map(esc);
  const s = style.length ? ` style="${esc(style.join(' '))}"` : '';
  return `<${tag}${c.length ? ` class="${c.join(' ')}"` : ''}${s}>${inner}</${tag}>`;
}

// Adds a declaration to the outermost element's style attribute, keeping data-path, class, style in el()'s order.
function appendStyle(html, decl) {
  return html.replace(/^<div((?: data-path="[^"]*")?(?: class="[^"]*")?)(?: style="([^"]*)")?>/, (_, cls, st) => `<div${cls} style="${st ? `${st} ` : ''}${decl}">`);
}

// keyword → class, anything else → inline declaration
function kwOrInline(v, cls, cssProp, classes, style) {
  if (v === undefined) return;
  if (KW[v] !== undefined) classes.push(cls + KW[v]);
  else if (safe('length', v)) style.push(`${cssProp}:${v};`);
}

function margin(node, parent, ctx, classes, style) {
  if (node.margin === undefined) return;
  const [s, sCss] = ctx.start;
  if (parent.layout === 'vertical') kwOrInline(node.margin, 'ExMgnT', 'margin-top', classes, style);
  else kwOrInline(node.margin, 'ExMgn' + s, 'margin-' + sCss, classes, style);
}

function common(node, parent, ctx, classes, style) {
  const [s, sCss] = ctx.start, [e, eCss] = ctx.end;
  margin(node, parent, ctx, classes, style);
  if (Number.isInteger(node.flex) && node.flex >= 0) {
    if (node.flex <= 3) classes.push('fl' + node.flex);
    else style.push(`-webkit-box-flex:${node.flex};`, `flex-grow:${node.flex};`);
  }
  if (node.position === 'absolute') classes.push('ExAbs');
  kwOrInline(node.offsetTop, 'ExT', 'top', classes, style);
  kwOrInline(node.offsetBottom, 'ExB', 'bottom', classes, style);
  kwOrInline(node.offsetStart, 'Ex' + s, sCss, classes, style);
  kwOrInline(node.offsetEnd, 'Ex' + e, eCss, classes, style);
  if (node.gravity === 'center') classes.push('grvC');
  if (node.gravity === 'bottom') classes.push('grvB');
}

function textStyle(node, ctx, classes, style) {
  if (node.size !== undefined) { if (SIZE[node.size]) classes.push('Ex' + SIZE[node.size]); else if (safe('length', node.size)) style.push(`font-size:${node.size};`); }
  if (node.weight === 'regular') classes.push('ExWR');
  if (node.weight === 'bold') classes.push('ExWB');
  if (node.style === 'normal') classes.push('ExFntStyNml');
  if (node.style === 'italic') classes.push('ExFntStyIt');
  if (node.decoration) classes.push(DECORATION[node.decoration]);
  if (node.color) classes.push(ctx.color('color', node.color));
}

function paddingBottom(ratio = '1:1') {
  const [w, h] = String(ratio).split(':').map(Number);
  return `${Math.trunc((h / w) * 100 * 1000) / 1000}%`;
}

const renderers = {
  box(node, parent, ctx) {
    const classes = ['MdBx', LAYOUT[node.layout]];
    const style = [];
    common(node, parent, ctx, classes, style);
    const spacingPx = KW[node.spacing] === undefined ? safe('length', node.spacing) : undefined;
    if (node.spacing && node.spacing !== 'none' && KW[node.spacing]) classes.push('spc' + KW[node.spacing]);
    kwOrInline(node.paddingAll, 'ExPadA', 'padding', classes, style);
    kwOrInline(node.paddingTop, 'ExPadT', 'padding-top', classes, style);
    kwOrInline(node.paddingBottom, 'ExPadB', 'padding-bottom', classes, style);
    kwOrInline(node.paddingStart, 'ExPad' + ctx.start[0], 'padding-' + ctx.start[1], classes, style);
    kwOrInline(node.paddingEnd, 'ExPad' + ctx.end[0], 'padding-' + ctx.end[1], classes, style);
    if (node.backgroundColor) classes.push(ctx.color('background-color', node.backgroundColor));
    if (safe('color', node.borderColor)) classes.push(ctx.color('border-color', node.borderColor), 'ExBd');
    if (node.borderWidth !== undefined) { if (BORDER[node.borderWidth]) classes.push('ExBdrWdt' + BORDER[node.borderWidth]); else if (safe('length', node.borderWidth)) style.push(`border-width:${node.borderWidth};`); }
    if (node.background?.type === 'linearGradient') {
      const b = node.background;
      const center = b.centerColor === undefined ? [] : [`${safe('color', b.centerColor)} ${safe('length', b.centerPosition ?? '50%')}`];
      const parts = [safe('angle', b.angle), safe('color', b.startColor), safe('color', b.endColor), ...center];
      if (parts.every(p => p && !p.includes('undefined'))) {
        style.push(`background:linear-gradient(${b.angle}, ${[`${b.startColor} 0%`, ...center, `${b.endColor} 100%`].join(', ')});`);
      }
    }
    if (node.cornerRadius !== undefined) { if (KW[node.cornerRadius]) classes.push('ExBdrRad' + KW[node.cornerRadius]); else if (safe('length', node.cornerRadius)) style.push(`border-radius:${node.cornerRadius};`); }
    // A fixed size along the parent's main axis takes the box out of flex growth, even over an explicit flex.
    if (parent.layout === 'vertical' ? node.height !== undefined : node.width !== undefined) {
      for (let i = classes.length - 1; i >= 0; i--) if (/^fl\d$/.test(classes[i])) classes.splice(i, 1);
      for (let i = style.length - 1; i >= 0; i--) if (/^(-webkit-box-flex|flex-grow):/.test(style[i])) style.splice(i, 1);
      classes.push('fl0');
    }
    if (safe('length', node.width)) style.push(`width:${node.width};`);
    if (safe('length', node.height)) style.push(`height:${node.height};`);
    if (safe('length', node.maxWidth)) style.push(`max-width:${node.maxWidth};`);
    if (safe('length', node.maxHeight)) style.push(`max-height:${node.maxHeight};`);
    if (node.justifyContent) classes.push('itms-jfc' + JUSTIFY[node.justifyContent]);
    if (node.alignItems) classes.push('itms-alg' + ALIGN_ITEMS[node.alignItems]);
    const spacingDecl = spacingPx && `${node.layout === 'vertical' ? 'margin-top' : 'margin-' + ctx.start[1]}:${spacingPx};`;
    // A px spacing becomes a leading margin on every child after the first, unless the child sets its own margin.
    const inner = (node.contents ?? []).map((child, i) => {
      const html = renderComponent(child, node, ctx, `${ctx.path}/contents/${i}`);
      return spacingDecl && i > 0 && child.margin === undefined ? appendStyle(html, spacingDecl) : html;
    }).join('');
    return el('div', classes, style, inner);
  },

  text(node, parent, ctx) {
    const classes = ['MdTxt'];
    const style = [];
    common(node, parent, ctx, classes, style);
    textStyle(node, ctx, classes, style);
    if (ctx.device && node.scaling) classes.push('dvScale');
    if (node.align === 'center') classes.push('ExAlgC');
    if (node.align === 'end') classes.push('ExAlgE');
    if (node.wrap) classes.push('ExWrap');
    const inner = node.contents?.length
      ? node.contents.map(span => { const c = ['MdSpn'], s = []; textStyle(span, ctx, c, s); return el('span', c, s, esc(span.text ?? '')); }).join('')
      : null;
    // Device mode adds what the simulator ignores, as measured on iOS (references/device-ios.md).
    const pStyle = [];
    if (ctx.device) {
      if (node.wrap && Number.isInteger(node.maxLines) && node.maxLines > 0) pStyle.push('display:-webkit-box;', '-webkit-box-orient:vertical;', `-webkit-line-clamp:${node.maxLines};`);
      // Extra gap between lines only: widen each line box, then pull the first and last half-gaps back in.
      if (safe('length', node.lineSpacing)) pStyle.push(`line-height:calc(var(--dv-lh) + ${node.lineSpacing});`, `margin:calc(${node.lineSpacing} / -2) 0;`);
      if (node.adjustMode === 'shrink-to-fit') classes.push('dvShrink');
    }
    const p = html => el('p', [], pStyle, html);
    // Each line of a plain text becomes its own paragraph.
    const paragraphs = inner ?? String(node.text ?? '').split('\n').map(line => p(esc(line))).join('');
    return el('div', classes, style, inner === null ? paragraphs : p(inner));
  },

  image(node, parent, ctx) {
    const classes = ['MdImg'];
    const style = [];
    common(node, parent, ctx, classes, style);
    const size = node.size ?? 'md';
    const innerStyle = [];
    if (size === 'full') classes.push('ExFull');
    else if (SIZE[size]) classes.push('Ex' + SIZE[size]);
    else if (safe('length', size)) innerStyle.push(`width:${size};`);
    classes.push(node.aspectMode === 'cover' ? 'ExCover' : 'ExFit');
    if (node.align === 'start') classes.push('algS');
    if (node.align === 'end') classes.push('algE');
    const spanClass = node.backgroundColor ? [ctx.color('background-color', node.backgroundColor)] : [];
    const span = el('span', spanClass, safe('url', node.url) ? [`background-image:url('${node.url}');`] : [], '');
    return el('div', classes, style, el('div', [], innerStyle, `<a style="padding-bottom:${paddingBottom(node.aspectRatio)};">${span}</a>`));
  },

  video(node, parent, ctx) {
    // The simulator can't play video; it renders altContent (an image or a box) in its place.
    return renderComponent(node.altContent, parent, ctx, `${ctx.path}/altContent`);
  },

  button(node, parent, ctx) {
    const styleClass = BUTTON_STYLE[node.style] ?? 'ExBtnL';
    const classes = ['MdBtn', styleClass];
    const style = [];
    common(node, parent, ctx, classes, style);
    if (node.height === 'sm') classes.push('ExSm');
    if (ctx.device && node.adjustMode === 'shrink-to-fit') classes.push('dvShrink');
    if (ctx.device && node.scaling) classes.push('dvScale');
    const label = esc(node.action?.label ?? '');
    const linkStyle = styleClass === 'ExBtnL';
    const colorClass = node.color ? ctx.color(linkStyle ? 'color' : 'background-color', node.color) : null;
    const a = linkStyle
      ? `<a>${el('div', [colorClass], [], label)}</a>`
      : `${el('a', [colorClass], [], `<div>${label}</div>`)}`;
    return el('div', classes, style, a);
  },

  icon(node, parent, ctx) {
    const classes = ['MdIco', 'fl0'];
    if (ctx.device && node.scaling) classes.push('dvScale');
    const style = [];
    common({ ...node, flex: undefined }, parent, ctx, classes, style);
    const size = node.size ?? 'md';
    if (SIZE[size]) classes.push('Ex' + SIZE[size]); else if (safe('length', size)) style.push(`font-size:${size};`);
    const [w, h] = String(node.aspectRatio ?? '1:1').split(':').map(Number);
    const bg = safe('url', node.url) ? `background-image:url('${node.url}'); ` : '';
    return el('div', classes, style, `<div><span style="${bg}width:${Number.isFinite(w / h) ? w / h : 1}em;"></span></div>`);
  },

  separator(node, parent, ctx) {
    const classes = ['fl0', 'MdSep'];
    const style = [];
    margin(node, parent, ctx, classes, style);
    if (node.color) classes.push(ctx.color('border-color', node.color));
    return el('div', classes, style, '');
  },

  filler(node) {
    return el('div', ['mdBxFiller', Number.isInteger(node.flex) && node.flex >= 0 && node.flex <= 3 ? 'fl' + node.flex : null], [], '');
  },
};

// path is the component's JSON Pointer within the container; with ctx.annotate it lands in a data-path attribute.
export function renderComponent(node, parent, ctx, path = ctx.path) {
  const r = renderers[node.type];
  if (!r) throw new Error(`unsupported component type: ${node.type}`);
  const outer = ctx.path;
  ctx.path = path;
  const html = r(node, parent, ctx);
  ctx.path = outer;
  return ctx.annotate ? html.replace(/^<(\w+)/, `<$1 data-path="${path}"`) : html;
}

function renderBubble(bubble, ctx, base = '') {
  const [ly] = BUBBLE[bubble.size] ?? BUBBLE.mega;
  const dir = bubble.direction === 'rtl' ? 'rtl' : 'ltr';
  ctx.rtl = dir === 'rtl';
  const blockParent = { layout: 'vertical' };
  const blocks = [['header', 't1Header'], ['hero', 't1Hero'], ['body', 't1Body'], ['footer', 't1Footer']].filter(([key]) => bubble[key]);
  // Block style colors are numbered before any component color.
  const styleClasses = blocks.map(([key]) => {
    const st = bubble.styles?.[key] ?? {};
    return {
      bg: st.backgroundColor ? ctx.color('background-color', st.backgroundColor) : null,
      sep: st.separator && st.separatorColor ? ctx.color('border-color', st.separatorColor) : null,
      separator: !!st.separator,
    };
  });
  const parts = [];
  for (const [i, [key, cls]] of blocks.entries()) {
    const { bg, sep, separator } = styleClasses[i];
    const classes = [cls, bg];
    if (key === 'body' && bubble.footer) classes.push('ExHasFooter');
    if (separator && parts.length) parts.push(el('div', [sep, 'MdSep'], [], ''));
    parts.push(el('div', classes, [], renderComponent(bubble[key], blockParent, ctx, `${base}/${key}`)));
  }
  return { ly, html: `<div class="T1 fx${dir.toUpperCase()}" dir="${dir}">${parts.join('')}</div>` };
}

// Returns the <body> markup the simulator renders for a container.
export function renderBody(container, ctx = new Ctx()) {
  if (container.type === 'carousel') {
    const items = container.contents.map((b, i) => { const { ly, html } = renderBubble(b, ctx, `/contents/${i}`); return `<div class="lyItem ${ly}">${html}</div>`; });
    return { ctx, body: `<div class="LySlider"><div class="lyInner">${items.join('')}</div></div>` };
  }
  const { ly, html } = renderBubble(container, ctx);
  return { ctx, body: `<div class="${ly}">${html}</div>` };
}

// iOS line boxes measure max(1.2 × font, 16px) where the simulator uses 1.4 (references/device-ios.md).
// A single giga bubble keeps 8px each side on iOS (simulator: 7px).
const DEVICE_CSS = table({ ios: '.MdTxt p { --dv-lh: max(1.2em, 16px); line-height: var(--dv-lh); } .MdTxt p:empty { height: var(--dv-lh); } .LyGi .T1 { margin: 0 8px; }' });

// iOS text-size setting (Settings > Display & Brightness > Text Size) as Dynamic Type body sizes; 'l' is the default.
// `scaling: true` multiplies a component's font by size / 17: measured ×0.82 at xs and ×1.33 at xxxl (references/device-ios.md).
export const IOS_TEXT_SIZES = table({ xs: 14, s: 15, m: 16, l: 17, xl: 19, xxl: 21, xxxl: 23 });

// Runs after fonts load: scaling first, then shrink-to-fit, which fits whatever size scaling produced.
const deviceScript = factor => `document.fonts.ready.then(() => {
  const k = ${factor};
  if (k !== 1) for (const el of document.querySelectorAll('.dvScale')) {
    // Text scales itself and every span; a button scales its label; an icon scales its em box.
    const targets = el.matches('.MdBtn') ? [el.querySelector('a')] : [el, ...el.querySelectorAll('.MdSpn')];
    const sizes = targets.map(t => parseFloat(getComputedStyle(t).fontSize));
    targets.forEach((t, i) => { t.style.fontSize = sizes[i] * k + 'px'; });
  }
  // shrink-to-fit: the font shrinks until the text fits; the line box keeps its unshrunk height.
  for (const el of document.querySelectorAll('.dvShrink')) {
    // The element that truncates: a button's label div (an <a> wraps it), a text's paragraph.
    const t = el.matches('.MdBtn') ? el.querySelector('a > div') : el.querySelector('p');
    const h = t.getBoundingClientRect().height;
    if (!el.matches('.MdBtn')) { t.style.height = h + 'px'; t.style.lineHeight = h + 'px'; }
    let f = parseFloat(getComputedStyle(t).fontSize);
    // Compare the text's own laid-out width with the box at sub-pixel precision; scrollWidth rounds and lets
    // a text that overflows by under 1px through, ellipsis and all.
    const range = document.createRange();
    range.selectNodeContents(t);
    const overflows = () => range.getBoundingClientRect().width > t.getBoundingClientRect().width + 0.01;
    while (overflows() && f > 1) { f -= 0.25; t.style.fontSize = f + 'px'; }
  }
  document.documentElement.dataset.dvReady = '1';
});`;

// device: null reproduces the Flex Message Simulator exactly; 'ios' adds the measured iOS behaviour.
// textSize: the phone's text-size setting (IOS_TEXT_SIZES key), which only `scaling: true` components follow.
// annotate: mark each component with data-path (its JSON Pointer) so a browser can report its box.
export function renderDocument(input, { device = null, textSize = 'l', annotate = false } = {}) {
  if (device && !DEVICE_CSS[device]) throw new Error(`unknown device: ${device}`);
  if (!IOS_TEXT_SIZES[textSize]) throw new Error(`unknown text size: ${textSize} (${Object.keys(IOS_TEXT_SIZES).join(', ')})`);
  const container = input.type === 'flex' ? input.contents : input;
  const { ctx, body } = renderBody(container, new Ctx({ device, annotate }));
  const ly = Object.values(BUBBLE).map(([c, w]) => `.${c} { width: 100%; max-width: ${w}px; min-width: 0;}`).join(' ');
  const extra = device ? `<style type="text/css">${DEVICE_CSS[device]}</style>` : '';
  const script = device ? deviceScript(IOS_TEXT_SIZES[textSize] / IOS_TEXT_SIZES.l) : '';
  // Defence in depth for messages from untrusted sources: only this renderer's own script may run (pinned by
  // hash), nothing may be fetched except LINE's stylesheet (or its local copy) and https images.
  const scriptSrc = script ? `'sha256-${createHash('sha256').update(script).digest('base64')}'` : "'none'";
  const csp = `default-src 'none'; script-src ${scriptSrc}; style-src 'unsafe-inline' https://static.line-scdn.net file:; img-src https: data:; font-src https: data: file:`;
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1, maximum-scale=1"><meta name="format-detection" content="telephone=no"><link rel="stylesheet" type="text/css" href="${CSS_URL}"><style type="text/css">${ly} ${ctx.rules.join(' ')}</style>${extra}</head><body style="margin: 0;">${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
}

export { Ctx };

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  process.stdout.write(renderDocument(JSON.parse(readFileSync(process.argv[2], 'utf8'))));
}
