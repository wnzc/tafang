/**
 * tools/font-check.js —— 字号自检（不需要微信开发者工具）
 *
 * 回答四个问题：
 *   1. 全工程有没有绕过 CFG.FS 直接写 ctx.font 的地方？（漏一处就会有一处字不跟着档位变）
 *   2. 真正渲染出来的字号，是不是都能在**当前档位**的表里查到？（查不到 = 走了兜底 = 可能倒挂）
 *   3. 三档（小/中/大）是不是真的逐级递增、同一基础字号下不会出现大档更小？
 *   4. 折算到屏幕像素上，最小的字有多大？够不够读？
 *
 * 做法：拿桩 canvas，把 render 的全部界面状态（含设置页、玩法页）逐个档位跑一遍，
 *      每次 ctx.font 的赋值都录下来。
 *
 * 运行：node tools/font-check.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------------- Canvas 桩 ---------------------- */
const noopCache = {};
const fonts = [];              // 录制所有 ctx.font 赋值
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') {
      return () => ({ addColorStop() { } });
    }
    if (k === 'measureText') return () => ({ width: 10 });
    if (k in t) return t[k];
    if (!(k in noopCache)) noopCache[k] = function () { };
    return noopCache[k];
  },
  set(t, k, v) { if (k === 'font') fonts.push(v); t[k] = v; return true; }
});
const canvasStub = {
  width: 0, height: 0, style: {},
  getContext: () => ctxStub,
  addEventListener: () => { }
};

const JS_DIR = path.join(__dirname, '..', 'js');
const FILES = ['runtime', 'util', 'icons', 'audio', 'config', 'settings', 'grid', 'fx', 'enemies',
  'towers', 'resonance', 'waves', 'ui', 'render', 'main'];

/* ---------------------- 断言工具 ---------------------- */
let failures = 0;
const results = [];
function check(cond, label, detail) {
  if (!cond) failures++;
  results.push({ label, ok: !!cond, detail });
}

/* ---------------------- 1) 源码扫描 ---------------------- */
const offenders = [];
for (const f of fs.readdirSync(JS_DIR).filter(n => n.endsWith('.js'))) {
  const lines = fs.readFileSync(path.join(JS_DIR, f), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    if (!/\.font\s*=/.test(ln)) return;
    // 只有这两条合法路径：render.js 的 fontOf()、fx.js 里显式的 CFG.FS()
    if (/fontOf\(/.test(ln) || /CFG\.FS\(/.test(ln)) return;
    offenders.push(`${f}:${i + 1}  ${ln.trim()}`);
  });
}
check(offenders.length === 0, '没有绕过 CFG.FS 的 ctx.font', offenders.join(' | '));

/* ---------------------- 2) 干净加载 ---------------------- */
/** 微信环境；不传 env 用 iPhone 13（状态栏 47 / 胶囊下沿 83 / home 条 34） */
function load(env, level) {
  Object.keys(require.cache).forEach(k => {
    if (k.indexOf(JS_DIR + path.sep) === 0) delete require.cache[k];
  });
  delete global.ECHO_TD;
  delete global.wx;
  global.wx = env || {
    createCanvas: () => canvasStub,
    getWindowInfo: () => ({
      windowWidth: 390, windowHeight: 844, screenWidth: 390, screenHeight: 844,
      statusBarHeight: 47, pixelRatio: 2, safeArea: { bottom: 810 }
    }),
    getSystemInfoSync: () => global.wx.getWindowInfo(),
    getMenuButtonBoundingClientRect: () =>
      ({ left: 279, top: 51, right: 366, bottom: 83, width: 87, height: 32 }),
    onWindowResize: () => { }, onTouchStart: () => { }, onTouchMove: () => { },
    onTouchEnd: () => { }, onTouchCancel: () => { }
  };
  for (const f of FILES) require(path.join(JS_DIR, f + '.js'));
  const G = global.ECHO_TD;
  G.Runtime.init();
  if (level !== undefined) G.Settings.set('fontLevel', level);
  return G;
}

/** iPhone SE 320x568：最窄机型，用它看「最小字会不会掉到看不见」 */
const SE_ENV = {
  createCanvas: () => canvasStub,
  getWindowInfo: () => ({
    windowWidth: 320, windowHeight: 568, screenWidth: 320, screenHeight: 568,
    statusBarHeight: 20, pixelRatio: 2, safeArea: { bottom: 568 }
  }),
  getSystemInfoSync: () => SE_ENV.getWindowInfo(),
  getMenuButtonBoundingClientRect: () =>
    ({ left: 230, top: 24, right: 313, bottom: 56, width: 83, height: 32 }),
  onWindowResize: () => { }, onTouchStart: () => { }, onTouchMove: () => { },
  onTouchEnd: () => { }, onTouchCancel: () => { }
};

const G0 = load();
const LEVELS = G0.CFG.FONT_LEVELS;

/* ---------------------- 3) 逐档跑界面 ---------------------- */
const base = {
  time: 1.7, shake: 0, wave: 3, wavesTotal: 20, best: 1234,
  coreHp: 88, coreMax: 100, echo: 62, energy: 230, prepT: 8,
  pulseMode: false, sel: null, selCard: null, towers: [], enemies: [],
  bullets: [], bannerT: 0, toastT: 0, redFlash: 0, whiteFlash: 0,
  waveData: null, spawnIdx: 0, echoBuffT: 0
};
/* 塔面板不是主循环状态，只有「选中一座塔」时才画，单独造一个塔对象喂进去。
 * 漏掉这一档就会漏掉塔面板专用的字号（17px 那一级），所以必须覆盖。 */
const TOWER = {
  def: G0.CFG.TOWERS.pyro, elem: 'pyro', level: 3, x: 300, y: 700,
  dmgMul: 1, rateMul: 1, clusterSize: 3, suppressed: false,
  hp: 200, maxHp: 260, spent: 120,
  cool: 0.4, angle: 0, recoil: 0, flash: 0, hitFlash: 0
};

const STATES = [
  ['prep', Object.assign({}, base, { state: 'prep' })],
  ['wave', Object.assign({}, base, {
    state: 'wave', waveData: { events: [1, 2, 3, 4, 5] }, spawnIdx: 2, echoBuffT: 2.5
  })],
  ['tower', Object.assign({}, base, { state: 'wave', sel: TOWER })],
  ['menu', Object.assign({}, base, { state: 'menu' })],
  ['set', Object.assign({}, base, { state: 'set', toastT: 1.0, toastMsg: '字体大小：大' })],
  ['help', Object.assign({}, base, { state: 'help' })],
  ['over', Object.assign({}, base, { state: 'over', score: 12000, kills: 300, leaked: 4 })],
  ['win', Object.assign({}, base, { state: 'win', score: 20000, kills: 500, leaked: 0 })]
];

/** 每个档位跑一遍，返回 { uniq, count, scale, seScale, table } */
const PER_LEVEL = [];
for (let lv = 0; lv < LEVELS.length; lv++) {
  const G = load(undefined, lv);
  const before = fonts.length;
  for (const [name, g] of STATES) {
    try {
      G.Render.draw(g);
    } catch (e) {
      check(false, `「${LEVELS[lv].name}号」界面「${name}」可正常绘制`, e.message);
    }
  }

  /* 静态状态覆盖不到「飘字」：伤害数字、扣费、升级、震击数这些字号只有真打起来才出现。
   * 所以这里再真跑一段战斗，把特效层的字号也录进来 ——
   * 只在表里查漏是查不出漏的，必须让它真的画一次。 */
  try {
    G.Game.reset();
    G.Game.startRun();
    G.Game.energy = 99999;
    var plans = [[3, 5, 'pyro'], [4, 5, 'pyro'], [5, 5, 'hydro'], [6, 5, 'hydro'],
      [4, 6, 'electro'], [5, 6, 'electro'], [2, 8, 'pyro']];
    for (var pi = 0; pi < plans.length; pi++) {
      G.Game.selCard = plans[pi][2];
      G.Game.tryBuild(plans[pi][0], plans[pi][1]);
    }
    G.Game.selCard = null;
    G.Game.startWave(true);
    for (var fi = 0; fi < 900; fi++) G.Game.update(1 / 60);   // 15 秒
    G.Game.castPulse(400, 700);                               // 震击数
    G.Game.echo = 100;
    G.Game.castEcho();                                        // 倒带横幅
    G.Game.energy = 415;
    G.Game.toast('能量不足');
    G.Game.sel = G.Game.towers.length ? G.Game.towers[0] : null;   // 塔面板
    G.Render.draw(G.Game);
    check(true, `「${LEVELS[lv].name}号」战斗 + 特效可正常绘制`);
  } catch (e) {
    check(false, `「${LEVELS[lv].name}号」战斗 + 特效可正常绘制`, e.message);
  }
  const sizes = fonts.slice(before).map(s => {
    const m = /(\d+(?:\.\d+)?)px/.exec(s);
    return m ? parseFloat(m[1]) : NaN;
  }).filter(n => !isNaN(n));
  const uniq = Array.from(new Set(sizes)).sort((a, b) => a - b);

  check(sizes.length > 0, `「${LEVELS[lv].name}号」录到了字号`, `${sizes.length} 次赋值`);
  check(uniq.length >= 8, `「${LEVELS[lv].name}号」字号层级够用（≥8 档）`, `实际 ${uniq.length} 档`);

  // 表自校验：表是人工排的，最容易出的两个错 —— 相邻档位排反、漏档走兜底
  const table = G.CFG.FS_TABLES[lv];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const vals = keys.map(k => table[k]);
  let monoBad = '';
  for (let i = 1; i < keys.length; i++) {
    if (vals[i] <= vals[i - 1]) monoBad = `${keys[i - 1]}→${vals[i - 1]} 与 ${keys[i]}→${vals[i]}`;
  }
  check(!monoBad, `「${LEVELS[lv].name}号」字号表单调递增`, monoBad);

  const missing = uniq.filter(n => vals.indexOf(n) < 0);
  check(missing.length === 0, `「${LEVELS[lv].name}号」用到的字号都在表里（没有走兜底）`,
    missing.join(', '));

  // 屏幕折算：主流机型 + 最窄机型，两个都实测（不拍常数）
  const se = load(SE_ENV, lv);
  PER_LEVEL.push({
    lv, name: LEVELS[lv].name, k: LEVELS[lv].k,
    uniq, count: sizes.length, table,
    scale: G.Runtime.scale, seScale: se.Runtime.scale
  });
}

/* ---------------------- 4) 跨档递增 ---------------------- */
// 同一基础字号，必须小 < 中 < 大。档位倍率也要同向，否则「大」会比「中」还小。
const keysAll = Object.keys(PER_LEVEL[1].table).map(Number).sort((a, b) => a - b);
const crossBad = [];
for (const k of keysAll) {
  const vs = PER_LEVEL.map(p => p.table[k]);
  for (let i = 1; i < vs.length; i++) {
    if (!(vs[i] > vs[i - 1])) crossBad.push(`${k}px: ${vs.join(' / ')}`);
  }
}
check(crossBad.length === 0, '三档逐级递增（同一基础字号：小 < 中 < 大）', crossBad.join(' | '));

const kBad = [];
for (let i = 1; i < PER_LEVEL.length; i++) {
  if (!(PER_LEVEL[i].k > PER_LEVEL[i - 1].k)) kBad.push(`${i}`);
}
check(kBad.length === 0, '三档布局倍率同向递增（字大了盒子也大）', kBad.join(', '));

// 档位越高，字必须真的更大 —— 不能出现「切到大号但屏幕上看不出来」
const midMax = Math.max.apply(null, PER_LEVEL[1].uniq);
const bigMax = Math.max.apply(null, PER_LEVEL[2].uniq);
check(bigMax > midMax, '大号的最大字号确实大于中号', `${midMax} → ${bigMax}`);

/* ---------------------- 5) 屏幕像素下限 ---------------------- */
// 屏幕 px = 设计字号 × scale。下限按「微信正文 ≈ 14px、辅助 ≈ 12px」定，
// 小号是用户主动选择的更小一档，所以放宽一点，但也不能小到看不清。
const NEED = [9.5, 11.0, 12.0];
for (const p of PER_LEVEL) {
  const minD = p.uniq[0];
  const px = minD * p.scale;
  check(px >= NEED[p.lv], `「${p.name}号」主流机型（iPhone 13）屏幕最小字号 ≥ ${NEED[p.lv]}px`,
    `${minD} 设计 px → ${px.toFixed(1)}px 屏幕（缩放 ${p.scale.toFixed(4)}）`);
}

/* ---------------------- 输出 ---------------------- */
console.log('');
console.log('-'.repeat(78));
console.log('  ' + '档位'.padEnd(10) + '倍率'.padEnd(8) + '设计字号范围'.padEnd(16) +
  'iPhone13 缩放'.padEnd(15) + 'iPhoneSE 缩放'.padEnd(15) + '屏幕最小字');
for (const p of PER_LEVEL) {
  console.log('  ' + p.name.padEnd(12) + String(p.k).padEnd(8) +
    (p.uniq[0] + ' ~ ' + p.uniq[p.uniq.length - 1]).padEnd(16) +
    p.scale.toFixed(4).padEnd(15) + p.seScale.toFixed(4).padEnd(15) +
    (p.uniq[0] * p.scale).toFixed(1) + 'px / SE ' + (p.uniq[0] * p.seScale).toFixed(1) + 'px');
}
console.log('-'.repeat(78));
console.log('  基础字号'.padEnd(12) + PER_LEVEL.map(p => (p.name + ' 屏幕').padEnd(14)).join(''));
for (const k of keysAll) {
  console.log('  ' + (k + 'px').padEnd(12) +
    PER_LEVEL.map(p => ((p.table[k] * p.scale).toFixed(1) + 'px').padEnd(14)).join(''));
}
console.log('-'.repeat(78));
console.log('  共 ' + PER_LEVEL.length + ' 档，' +
  PER_LEVEL.map(p => p.name + ' ' + p.count + ' 次绘制').join(' / '));
console.log('');

let bad = 0;
for (const r of results) {
  if (!r.ok) {
    bad++;
    console.log('[FAIL] ' + r.label + (r.detail ? '  —— ' + r.detail : ''));
  }
}
if (bad) {
  console.log('');
  console.log(`>>> 共 ${bad} 项未通过`);
  process.exit(1);
} else {
  console.log(`>>> 全部通过：${results.length} 项断言`);
}
