// Builds dist/pokr-preview.html: the whole app in one file, playable inside Claude with bots.
// Run: node preview/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const shim = `
const process = { env: {} };
const __mods = {};
const __cache = {};
const __crypto = {
  randomInt(n) { const a = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim); return x % n; },
};
function require(name) {
  if (name === 'crypto') return __crypto;
  const key = name.replace(/^\\.\\//, '').replace(/\\.js$/, '');
  if (!__cache[key]) { const module = { exports: {} }; __mods[key](module, module.exports); __cache[key] = module.exports; }
  return __cache[key];
}`;
const mod = (name, file) => `__mods[${JSON.stringify(name)}] = function (module, exports) {\n${read(file)}\n};`;
const css = read('public/app.css')
  // the artifact frame already pads the top and bottom safe areas
  .replace('padding: env(safe-area-inset-top, 0px) max(16px, env(safe-area-inset-right, 0px)) env(safe-area-inset-bottom, 0px) max(16px, env(safe-area-inset-left, 0px));',
           'padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 0;');
const html = `<title>Pokr Preview</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,600;0,6..96,700;1,6..96,600;1,6..96,700&family=DM+Mono:wght@500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&family=Yellowtail&display=swap">
<style>
${css}
.preview-bar { max-width: 1180px; margin: 10px auto 0; font-family: var(--mono); font-size: 11px; letter-spacing: .06em; color: var(--muted); text-align: center; }
.preview-bar b { color: var(--brass); font-weight: 600; }
</style>
<div class="preview-bar"><b>PREVIEW</b> · You’re playing bots. Friends can join once Pokr is online.</div>
<div id="app"><div class="boot"><h1 class="marquee xl">Pokr</h1></div></div>
<div id="modal"></div>
<div id="toast" role="status" aria-live="polite"></div>
<div id="conn" hidden>Reconnecting…</div>
<script>
${shim}
${mod('cards', 'server/cards.js')}
${mod('bots', 'server/bots.js')}
${mod('engine', 'server/engine.js')}
${mod('shop', 'server/shop.js')}
${read('preview/sim.js')}
</script>
<script>
${read('public/app.js')}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'pokr-preview.html'), html);
console.log('wrote dist/pokr-preview.html', (html.length / 1024).toFixed(1) + ' KB');
