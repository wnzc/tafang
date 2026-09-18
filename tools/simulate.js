/**
 * tools/simulate.js —— 无头逻辑自检
 * 用 Node 跑完整的游戏循环（含渲染路径），验证：
 *   1. 寻路 / 共振 / 反应 / 波次 / 回声倒带 全链路不抛异常
 *   2. 不产生 NaN 坐标
 *   3. 能正常推进多个波次
 *
 * 运行：node tools/simulate.js [帧数]
 */
'use strict';
const path = require('path');

/* ---------------------- Canvas / 环境桩 ---------------------- */
const noopCache = {};
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
  set(t, k, v) { t[k] = v; return true; }
});

const canvasStub = {
  width: 780, height: 1688, style: {},
  getContext: () => ctxStub,
  addEventListener: () => { }
};

global.document = { getElementById: () => canvasStub };
global.window = global;
global.innerWidth = 390;
global.innerHeight = 844;
global.devicePixelRatio = 2;
global.addEventListener = () => { };
global.localStorage = { getItem: () => null, setItem: () => { } };

/* ---------------------- 载入模块 ---------------------- */
const files = ['runtime', 'util', 'icons', 'audio', 'config', 'grid', 'fx', 'enemies',
  'towers', 'resonance', 'waves', 'ui', 'render', 'main'];
for (const f of files) require(path.join(__dirname, '..', 'js', f + '.js'));

const G = global.ECHO_TD;
if (!G) { console.error('模块加载失败：ECHO_TD 未挂载'); process.exit(1); }

/* ---------------------- 启动 ---------------------- */
const report = { errors: [], nan: [], reacts: {}, wavesReached: 0, echoCasts: 0, pulses: 0 };
try {
  G.Runtime.init();
  G.Game.reset();
  G.Game.startRun();
  console.log('布局:', JSON.stringify({
    designH: Math.round(G.Runtime.designH),
    boardY: Math.round(G.LAY.boardY),
    barY: Math.round(G.LAY.barY),
    cards: G.LAY.cards.map(c => Math.round(c.x) + ',' + Math.round(c.y))
  }));
} catch (e) {
  console.error('初始化失败:', e.stack);
  process.exit(1);
}

/* ---------------------- 简易 AI ---------------------- */
/* 一座「理想玩家」会摆出的阵地：雷链（长共振链）+ 贴边吃感电 + 火群贴水吃蒸发。
 * 冰塔（凝霜）下线后，原本靠它吃的超导/汽爆换成感电/蒸发 —— 反应覆盖不能因为
 * 少一座塔就断档，否则这套「平衡曲线」自检会悄悄少跑几条分支。 */
const PLAN = [
  // 雷引竖链（同元素 → 长共振链）
  [4, 2, 'electro'], [4, 3, 'electro'], [4, 4, 'electro'], [4, 5, 'electro'],
  [4, 6, 'electro'], [4, 7, 'electro'], [4, 8, 'electro'],
  // 澄流贴边（异元素 → 感电：闪电在怪群之间跳）
  [5, 2, 'hydro'], [5, 3, 'hydro'], [5, 4, 'hydro'], [5, 6, 'hydro'],
  // 炎爆群（共振链）+ 贴一个澄流吃蒸发
  [7, 3, 'pyro'], [7, 4, 'pyro'], [7, 5, 'pyro'], [7, 6, 'hydro'],
  // 两翼
  [8, 8, 'electro'], [8, 9, 'electro'], [1, 8, 'pyro'], [1, 9, 'pyro']
];
/* 第二阶段：横砌一道墙把路彻底封死，用来验证「无路可走 → 拆塔」分支 */
const WALL = [[0, 6, 'pyro'], [1, 6, 'pyro'], [2, 6, 'pyro'], [3, 6, 'hydro'],
[6, 6, 'hydro'], [7, 6, 'pyro'], [8, 6, 'electro'], [9, 6, 'electro']];
const RICH = process.argv.indexOf('--rich') >= 0;
const SEAL = process.argv.indexOf('--seal') >= 0;
let planIdx = 0, wallIdx = 0;

const waveLog = [];
let lastLoggedWave = 0;

function ai(frame) {
  const g = G.Game;
  if (g.state === 'over' || g.state === 'win') return;
  if (RICH) g.energy = Math.max(g.energy, 900);

  if (frame % 20 === 0) {
    // 总是补齐阵地里缺失的塔位（被拆掉会重建）
    let target = null;
    for (const p of PLAN) {
      if (G.Grid.canPlace(p[0], p[1]) && !g.towers.some(t => t.col === p[0] && t.row === p[1])) {
        target = p; break;
      }
    }
    if (target && g.energy >= G.CFG.TOWERS[target[2]].cost) {
      g.selCard = target[2];
      G.Game.tryBuild(target[0], target[1]);
    } else if (SEAL && wallIdx < WALL.length) {
      const w = WALL[wallIdx];
      if (!G.Grid.canPlace(w[0], w[1])) { wallIdx++; }        // 已被占用，跳过
      else {
        g.selCard = w[2];
        if (g.energy >= G.CFG.TOWERS[w[2]].cost && G.Game.tryBuild(w[0], w[1])) wallIdx++;
      }
    }
  }
  // 贪心升级：留出一部分现金做机动，不要把钱全砸光
  if (frame % 30 === 0 && g.towers.length && g.energy > 300) {
    let low = null;
    for (const t of g.towers) {
      if (t.level >= G.CFG.MAX_LEVEL) continue;
      if (!low || t.level < low.level) low = t;
    }
    if (low && g.energy >= G.Towers.upgradeCost(low) + 150) G.Game.upgradeTower(low);
  }
  if (frame % 900 === 0 && g.enemies.length > 8) {
    const e = g.enemies[0];
    G.Game.castPulse(e.x, e.y);
    report.pulses++;
  }
  if (g.echo >= G.CFG.ECHO.max && (g.coreHp < 60 || frame % 1800 === 0)) {
    G.Game.castEcho();
    report.echoCasts++;
  }
}

/* ---------------------- 主循环 ---------------------- */
const FRAMES = parseInt(process.argv[2] || '12000', 10);
const DT = 1 / 60;
let lastWave = 0;
let lastState = G.Game.state;
let lastCore = G.Game.coreHp;
let lastLeak = 0;
let lastKill = 0;
let fxPeak = 0;
const t0 = Date.now();

// 统计塔被摧毁的次数
const _destroy = G.Game.destroyTower;
G.Game.destroyTower = function (t) { report.towerLost = (report.towerLost || 0) + 1; _destroy(t); };

for (let f = 0; f < FRAMES; f++) {
  try {
    ai(f);
    G.Game.update(DT);
    if (f % 8 === 0) G.Render.draw(G.Game);
    // 特效峰值：确认极端战况下粒子总量不会失控
    const fxNow = G.FX.count();
    if (fxNow > fxPeak) fxPeak = fxNow;
  } catch (e) {
    report.errors.push('frame ' + f + ' : ' + e.stack);
    if (report.errors.length > 3) break;
  }

  const g = G.Game;
  if (g.wave > lastWave) { lastWave = g.wave; report.wavesReached = g.wave; }
  if (lastState === 'wave' && g.state !== 'wave' && g.state !== 'over' && g.state !== 'win') {
    waveLog.push('第' + String(g.wave).padStart(2) + '波 清空  核心 ' +
      String(Math.round(g.coreHp)).padStart(3) + '/100  本波漏 ' +
      String(g.leaked - lastLeak).padStart(2) + '  本波杀 ' +
      String(g.kills - lastKill).padStart(3) + '  塔 ' + g.towers.length +
      '  链 ' + G.Resonance.links.length + '  节点 ' + G.Resonance.nodes.length);
    lastLeak = g.leaked; lastKill = g.kills;
  }
  lastState = g.state;
  lastCore = g.coreHp;

  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
    if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp)) {
      report.nan.push('frame ' + f + ' enemy#' + e.uid + ' type=' + e.key +
        ' x=' + e.x + ' y=' + e.y + ' hp=' + e.hp);
      break;
    }
  }
  if (report.nan.length > 3) break;

  for (let i = 0; i < g.towers.length; i++) {
    const t = g.towers[i];
    if (!isFinite(t.hp) || !isFinite(t.dmgMul)) {
      report.nan.push('frame ' + f + ' tower#' + t.uid + ' hp=' + t.hp + ' dmgMul=' + t.dmgMul);
      break;
    }
  }
  if (report.nan.length > 3) break;

  if (g.state === 'over' || g.state === 'win') {
    report.endState = g.state;
    report.endFrame = f;
    break;
  }
}

/* ---------------------- 结果 ---------------------- */
const g = G.Game;
const res = G.Resonance;
console.log('--- 逐波记录 ---');
waveLog.forEach(l => console.log(l));
console.log('--- 模拟结果 ---');
console.log('耗时        :', ((Date.now() - t0) / 1000).toFixed(2) + 's');
console.log('状态        :', g.state);
console.log('波次        :', g.wave + ' / ' + g.wavesTotal);
console.log('核心血量    :', Math.round(g.coreHp));
console.log('能量        :', Math.round(g.energy));
console.log('得分        :', g.score);
console.log('击杀 / 漏怪 :', g.kills + ' / ' + g.leaked);
console.log('在场敌人    :', g.enemies.length);
console.log('塔数量      :', g.towers.length);
console.log('共振链      :', res.links.length + ' 条');
console.log('反应节点    :', res.nodes.length + ' 个 ' +
  JSON.stringify(res.nodes.map(n => n.def.name)));
console.log('回声释放    :', report.echoCasts, ' 次');
console.log('脉冲释放    :', report.pulses, ' 次');
console.log('快照数量    :', g.snaps.length);
console.log('特效帧数    :', G.FX.count(), ' 峰值', fxPeak, '(上限 ' + 1100 + ')');
console.log('音频可用    :', G.Audio ? (G.Audio.available() ? '是' : '否（Node 环境，静默降级）') : '模块缺失');
console.log('塔被摧毁    :', report.towerLost || 0, ' 次');

if (report.errors.length) {
  console.log('\n[FAIL] 运行异常:');
  report.errors.forEach(e => console.log(e));
  process.exit(2);
}
if (report.nan.length) {
  console.log('\n[FAIL] 数值异常:');
  report.nan.forEach(e => console.log(e));
  process.exit(3);
}
if (report.wavesReached < 3) {
  console.log('\n[FAIL] 波次推进异常，仅到达第 ' + report.wavesReached + ' 波');
  process.exit(4);
}
if (!report.echoCasts) {
  console.log('\n[WARN] 未释放过回声倒带，该路径未被覆盖');
}
console.log('\n[OK] 全链路无异常');
