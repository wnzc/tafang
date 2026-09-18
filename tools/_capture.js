// 一次性无头截图捕获：跑真实渲染路径，把各场景的 canvas 转 PNG 落盘。
// 用法：node _capture.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = path.join(ROOT, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

// [输出文件名, scene 查询串]
const JOBS = [
  ['battle.png', 'scene=game&lv=5'],
  ['monsters.png', 'scene=monsters'],
  ['monsters-hp.png', 'scene=monsters&react=1'],
  ['codex-monsters.png', 'scene=codex&tab=0'],
  ['codex-monster-detail.png', 'scene=codex&tab=0&sel=drifter'],
  ['codex-boss.png', 'scene=codex&tab=0&sel=boss&seen=all'],
  ['codex-towers.png', 'scene=codex&tab=1'],
  ['codex-tower-detail.png', 'scene=codex&tab=1&sel=pyro'],
  ['pop-boss.png', 'scene=pop&key=boss'],
  ['pop-bulwark.png', 'scene=pop&key=bulwark'],
  ['pop-drifter.png', 'scene=pop&key=drifter'],
  ['help.png', 'scene=help'],
  ['set.png', 'scene=set'],
  ['menu.png', 'scene=game&wx=1'],
  ['battle-endgame.png', 'scene=over'],
];

function decodeDataUrlToPng(dataUrl) {
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('bad data url');
  return Buffer.from(m[1], 'base64');
}

for (const [name, query] of JOBS) {
  const url = `file://${ROOT}/shot.html?${query}`;
  let dom;
  try {
    dom = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=9000', '--dump-dom', url
    ], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 120000 });
  } catch (e) {
    console.error(`[FAIL] ${name}: chrome error ${e.message}`);
    continue;
  }
  const m = dom.match(/<div id="out"[^>]*>([^<]*)<\/div>/);
  if (!m || !m[1].startsWith('data:image/png')) {
    console.error(`[FAIL] ${name}: no data url in #out`);
    continue;
  }
  const buf = decodeDataUrlToPng(m[1]);
  fs.writeFileSync(path.join(SHOTS, name), buf);
  console.log(`[OK] ${name}  ${buf.length} bytes`);
}
console.log('done');
