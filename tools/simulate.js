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
const files = ['runtime', 'util', 'icons', 'audio', 'config', 'codex', 'grid', 'fx', 'enemies', 'monsters',
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

/* ---------------------- 击退 / 护甲穿透 / 反应名 / Boss 提示：独立走一遍 ----------------------
 * 这几件事都是「数值改了、表现就变，但不会抛异常」的类型，只有量出来才看得见：
 *   ① 击退是**连续位移**：一次 push 之后逐帧推进，单帧位移只占总量的一小块。
 *      老写法是 `e.x -= fx * push` 一帧跳完 —— 风 + 减速的场合看起来就是「闪现」。
 *   ② 击退不会把怪推出棋盘、也不会推回出生区（推回去会重新触发出生保护，
 *      表现为「被吹上去卡住」）。
 *   ③ 击退有免疫窗：连着的第二下推不动（否则多个风节点会把怪一次吹出半屏）。
 *   ④ 反应伤害无视护甲，平砍不穿。
 *   ⑤ 反应打中时，反应名真的挂到了怪身上（渲染那边要画它）。
 *   ⑥ 首领波开始时，提示语里必须有「无视护甲」——那是这只 Boss 的唯一解法。
 */
{
  const g = G.Game;
  const res = {};

  G.Game.reset();
  G.Game.startRun();

  // ① / ② 击退：连续位移 + 不出界
  const e = G.Enemies.create('bulwark', 1, 0, 1);
  e.x = G.CFG.BX + G.CFG.CELL * 3 + 32;
  e.y = G.LAY.boardY + G.CFG.CELL * 5;
  e.fx = 0; e.fy = 1;                    // 正往下走 → 击退方向是往上
  g.enemies.push(e);

  const PUSH = 40;
  const y0 = e.y;
  const applied = G.Enemies.push(e, e.fx, e.fy, PUSH);
  const immuneBlocked = !G.Enemies.push(e, e.fx, e.fy, PUSH);   // 免疫窗内的第二下
  let maxStep = 0, deepest = e.y;
  for (let i = 0; i < 45 && e.kbT > 0; i++) {
    const px = e.x, py = e.y;
    G.Enemies.update(g, 1 / 60);
    const step = Math.sqrt((e.x - px) * (e.x - px) + (e.y - py) * (e.y - py));
    if (step > maxStep) maxStep = step;
    if (e.y < deepest) deepest = e.y;
  }
  const back = y0 - deepest;
  res.push = {
    applied: applied, immune: immuneBlocked,
    back: +back.toFixed(1), maxStep: +maxStep.toFixed(1),
    inBoard: e.y >= G.LAY.boardY - 0.5
  };
  // 退了足够远（>70% 的标称距离），但没有任何一帧是一步跳过去的
  if (!applied || !immuneBlocked || back < PUSH * 0.7 || maxStep > PUSH * 0.25 || !res.push.inBoard) {
    report.errors.push('击退表现异常: ' + JSON.stringify(res.push));
  }

  // ③ 免疫窗过后还能再推
  let reusable = false;
  for (let i = 0; i < 60 && !reusable; i++) {
    G.Enemies.update(g, 1 / 60);
    if (e.kbImmune <= 0) reusable = G.Enemies.push(e, e.fx, e.fy, PUSH);
  }
  if (!reusable) report.errors.push('击退免疫窗过后推不动了（风会时灵时不灵）');

  // ④ 护甲穿透
  const t1 = G.Enemies.create('bulwark', 1, 0, 1);
  const hpA = t1.hp;
  G.Game.damageEnemy(t1, 20, '#ffffff');
  const normal = hpA - t1.hp;
  const hpB = t1.hp;
  G.Game.damageEnemy(t1, 20, '#ffffff', { pierce: true });
  const pierced = hpB - t1.hp;
  res.armor = { armor: t1.armor, normal: normal, pierced: pierced };
  if (!(normal === 20 - t1.armor && pierced === 20 && pierced > normal)) {
    report.errors.push('护甲 / 穿透结算不对: ' + JSON.stringify(res.armor));
  }

  // ⑤ 反应名挂到怪身上（端到端：两座异元素塔相邻 → 节点触发）
  const tp = G.Towers.create('pyro', 2, 6);
  const th = G.Towers.create('hydro', 3, 6);
  g.towers.push(tp, th);
  G.Grid.recompute(g.towers);
  const victim = G.Enemies.create('drifter', 1, 0, 1);
  victim.x = (tp.x + th.x) / 2;
  victim.y = tp.y;
  g.enemies.push(victim);
  G.Resonance.rebuild(g);
  for (let i = 0; i < 900 && !victim.reactName; i++) G.Resonance.update(g, 1 / 60);
  res.react = { name: victim.reactName, color: victim.reactColor, t: +victim.reactT.toFixed(2) };
  if (victim.reactName !== '蒸发' || !victim.reactColor || victim.reactT <= 0) {
    report.errors.push('反应名没有挂到敌人身上: ' + JSON.stringify(res.react));
  }

  // ⑥ 首领波提示
  G.Game.reset();
  G.Game.startRun();
  g.wave = 4;                                 // 下一波是第 5 波（首领波）
  G.Game.startWave(false);
  res.bossHint = { boss: !!g.waveData.isBoss, wave: g.wave, msg: g.toastMsg, t: +g.toastT.toFixed(1) };
  if (!res.bossHint.boss || String(g.toastMsg).indexOf('无视护甲') < 0 || g.toastT < 2) {
    report.errors.push('首领波的打法提示缺失: ' + JSON.stringify(res.bossHint));
  }

  report.combat = res;
}

/* ---------------------- 首次遭遇弹窗：独立走一遍 ----------------------
 * 弹窗会把 state 切到 'pop' 并**暂停战斗**，所以它不能混在主模拟里跑 ——
 * 主模拟跑的是「老玩家」路径（下面的 markAllSeen），弹窗流程单独验：
 *   ① 第一次遇到 → 入队 + 返回 true；再遇到同一只 → 返回 false（不重复打断）
 *   ② 暂停是真的：弹窗期间推 60 帧，waveTime / prepT 一动不动
 *   ③ 同帧遇到两只 → 关掉第一只后自动弹第二只，全关完回到战斗状态
 *   ④ 弹窗的渲染路径也要跑一遍（那只怪物形象是临场造的假实体）
 */
{
  const g = G.Game;
  G.Codex.reset();
  const a = G.Game.queueCodex('drifter');
  const b = G.Game.queueCodex('sprinter');
  const dup = G.Game.queueCodex('drifter');

  g.state = 'wave';
  g.waveTime = 12.5;
  g.prepT = 7.5;
  G.Game.openPop();                       // 主循环末尾也是这么开的
  const st1 = g.state, key1 = g.popKey;
  try { G.Render.draw(g); } catch (e) { report.errors.push('弹窗渲染: ' + e.stack); }
  for (let i = 0; i < 60; i++) G.Game.update(1 / 60);
  const paused = (g.waveTime === 12.5 && g.prepT === 7.5 && g.state === 'pop');

  G.Game.closePop();
  const st2 = g.state, key2 = g.popKey;
  G.Game.closePop();
  const st3 = g.state;

  report.pop = {
    newFirst: a, newSecond: b, dupBlocked: !dup,
    first: st1 + '/' + key1, second: st2 + '/' + key2, after: st3, paused: paused
  };
  if (!(a && b && !dup && st1 === 'pop' && key1 === 'drifter' &&
    st2 === 'pop' && key2 === 'sprinter' && st3 === 'wave' && paused)) {
    report.errors.push('首次遭遇弹窗流程异常: ' + JSON.stringify(report.pop));
  }

  // 复原：主模拟按「怪全都见过」跑，否则第一只怪就会把它冻在暂停里
  G.Codex.reset();
  G.Codex.markAllSeen();
  G.Game.reset();                  // 清 state / codexQueue / popKey
  G.Game.startRun();               // 回到 prep，主循环照常从第 1 波开始（waveData 也在这里才有）
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
console.log('图鉴弹窗    :', JSON.stringify(report.pop));
console.log('击退 / 护甲 :', JSON.stringify(report.combat));

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
