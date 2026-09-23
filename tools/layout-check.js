/**
 * tools/layout-check.js —— 版式自检（不需要微信开发者工具）
 *
 * 微信小游戏里，状态栏、右上角胶囊、home 指示条都浮在 canvas 之上，
 * 画上去的 UI 会被盖住；胶囊还会吞掉点击。真机才看得出来，所以这里
 * 直接把各机型的 px 安全区喂给 runtime，逐条断言布局没压线。
 *
 * 字号改成三档后，矩阵从 9 组变成 9 机型 × 3 档 = 27 组：
 * 字号一变，行高、盒子、所需的屏幕高度全都变，只跑中档等于没测。
 *
 * 运行：node tools/layout-check.js
 */
'use strict';
const path = require('path');

/* ---------------------- 记账 ctx ----------------------
 * 一个会跟着 save/restore/translate/scale/rotate 维护 CTM 的 ctx：
 *   - ops 记下指令流（比对两个时刻是否真的在动）
 *   - pts 记下变换后的落点（算包围盒 / 判断「这块到底画没画」）
 * 两处用到：
 *   ① GLOBAL_REC 当 canvas 桩的 ctx —— 跑一次 Render.draw 就能拿到整屏的落点；
 *   ② makeRec() 拿一个独立的记账 ctx，单独量某只怪 / 某个控件的包围盒。
 */
function makeRecorder() {
  const st = [];                                  // save / restore 栈
  let m = [1, 0, 0, 1, 0, 0];                     // a,b,c,d,e,f：x' = ax+cy+e
  const ops = [], pts = [];
  const mul = n => {
    const [a, b, c, d, e, f] = m;
    m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3],
      b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f];
  };
  const add = (x, y) => pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const num = v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);

  const fire = (k, a) => {
    ops.push(k + ':' + Array.prototype.map.call(a, num).join(','));
    if (k === 'translate') mul([1, 0, 0, 1, a[0], a[1]]);
    else if (k === 'scale') mul([a[0], 0, 0, a[1], 0, 0]);
    else if (k === 'rotate') { const c = Math.cos(a[0]), s = Math.sin(a[0]); mul([c, s, -s, c, 0, 0]); }
    else if (k === 'save') st.push(m.slice());
    else if (k === 'restore') { if (st.length) m = st.pop(); }
    else if (k === 'moveTo' || k === 'lineTo') add(a[0], a[1]);
    else if (k === 'quadraticCurveTo') { add(a[0], a[1]); add(a[2], a[3]); }
    else if (k === 'bezierCurveTo') { add(a[0], a[1]); add(a[2], a[3]); add(a[4], a[5]); }
    else if (k === 'arc') {
      add(a[0] + Math.cos(a[3]) * a[2], a[1] + Math.sin(a[3]) * a[2]);
      add(a[0] + Math.cos(a[4]) * a[2], a[1] + Math.sin(a[4]) * a[2]);
      add(a[0], a[1]);
    } else if (k === 'arcTo') { add(a[0], a[1]); add(a[2], a[3]); }
  };

  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } });
      if (k in t) return t[k];
      return function () { fire(String(k), arguments); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return {
    ctx, ops, pts,
    reset() { ops.length = 0; pts.length = 0; st.length = 0; m = [1, 0, 0, 1, 0, 0]; }
  };
}
function makeRec() { return makeRecorder(); }

/* ---------------------- Canvas 桩 ---------------------- */
const GLOBAL_REC = makeRecorder();
const ctxStub = GLOBAL_REC.ctx;
const canvasStub = {
  width: 0, height: 0, style: {},
  getContext: () => ctxStub,
  addEventListener: () => { }
};

const FILES = ['runtime', 'util', 'icons', 'audio', 'config', 'settings', 'codex', 'profile', 'grid', 'fx', 'enemies', 'monsters',
  'towers', 'resonance', 'waves', 'ui', 'render', 'main'];

/** 在全新的模块环境里跑一次 init()，可选指定字号档 */
function load(env, level) {
  Object.keys(require.cache).forEach(k => {
    if (k.indexOf(path.join(__dirname, '..', 'js') + path.sep) === 0) delete require.cache[k];
  });
  delete global.ECHO_TD;
  delete global.wx;

  if (env.wx) {
    global.wx = env.wx;
  } else {
    global.document = { getElementById: () => canvasStub };
    global.window = global;
    global.innerWidth = env.w;
    global.innerHeight = env.h;
    global.devicePixelRatio = 2;
  }
  for (const f of FILES) require(path.join(__dirname, '..', 'js', f + '.js'));
  const G = global.ECHO_TD;
  G.Runtime.init();
  // 走真实设置通道：改档位 → 重新 fit → 重新 buildLayout
  if (level !== undefined) G.Settings.set('fontLevel', level);
  return G;
}

/* ---------------------- 机型 ----------------------
 * 胶囊矩形取各机型实测的常见值（width 87 / height 32，右边距 7~10px）。
 */
function wxEnv(w, h, screenH, statusBar, capsule, safeArea) {
  const info = {
    windowWidth: w, windowHeight: h, screenWidth: w, screenHeight: screenH,
    statusBarHeight: statusBar, pixelRatio: 2, safeArea: safeArea || undefined
  };
  return {
    w, h, screenH, statusBar, capsule, safeArea,
    wx: {
      createCanvas: () => canvasStub,
      getWindowInfo: () => info,
      getSystemInfoSync: () => info,
      getMenuButtonBoundingClientRect: () => capsule
    }
  };
}

const PROFILES = [
  { name: '浏览器 390x844', env: { w: 390, h: 844 } },
  {
    name: 'iPhone 13 390x844',
    env: wxEnv(390, 844, 844, 47, { left: 279, top: 51, right: 366, bottom: 83, width: 87, height: 32 },
      { bottom: 810 })
  },
  {
    name: 'iPhone 16 Pro 402x874',
    env: wxEnv(402, 874, 874, 54, { left: 291, top: 58, right: 378, bottom: 90, width: 87, height: 32 },
      { bottom: 840 })
  },
  {
    name: 'iPhone 8 375x667',
    env: wxEnv(375, 667, 667, 20, { left: 278, top: 24, right: 365, bottom: 56, width: 87, height: 32 },
      { bottom: 667 })
  },
  {
    name: 'iPhone SE 320x568',
    env: wxEnv(320, 568, 568, 20, { left: 230, top: 24, right: 313, bottom: 56, width: 83, height: 32 },
      { bottom: 568 })
  },
  {
    name: 'Android 360x800',
    env: wxEnv(360, 800, 800, 24, { left: 266, top: 28, right: 350, bottom: 60, width: 84, height: 32 }, null)
  },
  {
    name: 'Android 360x640 (16:9)',
    env: wxEnv(360, 640, 640, 24, { left: 266, top: 28, right: 350, bottom: 60, width: 84, height: 32 }, null)
  },
  {
    name: 'Android 412x915',
    env: wxEnv(412, 915, 915, 28, { left: 314, top: 32, right: 398, bottom: 64, width: 84, height: 32 }, null)
  },
  {
    name: 'iPad 768x1024',
    env: wxEnv(768, 1024, 1024, 24, { left: 590, top: 28, right: 758, bottom: 60, width: 168, height: 32 }, null)
  }
];

/* ---------------------- 断言工具 ---------------------- */
const EPS = 0.6;              // 允许 0.6px 的取整误差
let failures = 0;
let checksTotal = 0;          // 含「机型 × 档位」之外的全局断言（图标、怪物形象）
const rows = [];
const allChecks = [];         // 每一条断言的结果都留一份

function check(cond, label, detail) {
  checksTotal++;
  const r = cond ? { label, ok: true } : { label, detail, ok: false };
  if (!cond) failures++;
  allChecks.push(r);
  return r;
}

function overlap(a, b) {
  return !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1);
}

/* 估算文本宽度：CJK / 全角标点算 1 em，其余（拉丁、数字、半角符号）算 0.55 em。
 * 字体是 sans-serif 的默认实现，这个估算偏保守（略宽），
 * 用来挡「大字号档下文字串到控件上」这类只有肉眼才看得出来的问题。 */
function estW(s, px) {
  let u = 0;
  for (const ch of s) {
    u += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : 0.55;
  }
  return u * px;
}

/** 量一只怪在「半径 r、圆心 (cx,cy)」下画出来的包围盒（返回相对圆心的偏移） */
function monBox(G, key, r, cx, cy, t) {
  const rec = makeRec();
  const def = G.CFG.ENEMIES[key];
  G.Monsters.draw(rec.ctx, {
    uid: 5, key: key, def: def, color: def.color, r: r, x: cx, y: cy,
    fx: 0, fy: 1, hitFlash: 0, off: 4.2, phaseT: 0, mode: 'path'
  }, t, 1);
  let up = 0, down = 0, side = 0;
  for (const p of rec.pts) {
    up = Math.max(up, cy - p[1]);
    down = Math.max(down, p[1] - cy);
    side = Math.max(side, Math.abs(p[0] - cx));
  }
  return { up, down, side };
}

/* 量形象时取的动画相位。12 个而不是 4 个：部分怪（游荡体、首领）在做周期摆动，
 * 隔 0.25 采样会正好跳过极值，而弹窗的纵向排布就是按极值定的。 */
const PHASES = [];
for (let ti = 0; ti < 12; ti++) PHASES.push(ti / 12);

/* ---------------------- 0b) 菜单次级按钮「真的画出来了」 ----------------------
 * 出过的事故：加「图鉴」时 ui.js 加了几何、main.js 接了点击，**render.js 忘了画** ——
 * 按钮点得到却看不见。而当时所有几何断言、命中断言、图鉴数据断言**全是绿的**。
 *
 * 修法是三处共用 UI.menuSubBtns() 一张表（渲染遍历它画、命中遍历它判），
 * 这条断言是给那张表上的保险：真跑一次 drawMenu，录下落点，逐个按钮验「这个矩形被描过」
 * —— 「有几何、有命中、但没人画」这一类就再也藏不住。
 */
{
  const G = load({ w: 390, h: 844 });
  const subs = G.UI.menuSubBtns();
  check(subs.length === 4, '菜单次级按钮正好四个（玩法 / 图鉴 / 回响 / 设置）', String(subs.length));
  check(subs.every(s => s.key && s.label && s.rect), '菜单次级按钮都带 key / label / rect', '');
  check(subs.every(s => estW(s.label, G.CFG.FS(18)) + G.CFG.S(16) <= s.rect.w),
    '菜单次级按钮的标签都装得进按钮',
    subs.filter(s => estW(s.label, G.CFG.FS(18)) + G.CFG.S(16) > s.rect.w).map(s => s.label).join(', '));
  /* 四个按钮并排后要互不重叠、且整排在内容区之内。三个变四个时
   * 单格宽度从 196 压到 142 —— 压过头就会叠字，这两条是给那次改动的保险。 */
  for (let si = 1; si < subs.length; si++) {
    const a = subs[si - 1].rect, b = subs[si].rect;
    check(b.x >= a.x + a.w, '次级按钮 ' + si + ' 不压前一个', b.x + ' vs ' + (a.x + a.w));
  }
  const firstR = subs[0].rect, lastR = subs[subs.length - 1].rect;
  check(firstR.x >= 46 - 0.5, '次级按钮左沿不越内容区', String(firstR.x));
  check(lastR.x + lastR.w <= 674 + 0.5, '次级按钮右沿不越内容区', String(lastR.x + lastR.w));

  G.Game.state = 'menu';
  GLOBAL_REC.reset();
  G.Render.draw(G.Game);
  const pts = GLOBAL_REC.pts;
  /* 判据用「矩形右下角这个精确坐标有没有被描过」，而不是「矩形范围内有没有落点」——
   * 后者太松：整屏任何一条扫过的线都能蒙中，实测漏画「图鉴」时它照样通过。
   * U.roundRect 会依次落到 (x+w, y+h) 这个角，它是这个按钮独有的坐标。 */
  const undrawn = [];
  for (const s of subs) {
    const r = s.rect;
    const hit = pts.some(p => Math.abs(p[0] - (r.x + r.w)) < 0.6 && Math.abs(p[1] - (r.y + r.h)) < 0.6);
    if (!hit) undrawn.push(s.label);
  }
  check(pts.length > 0, '菜单这一帧确实画了东西（记账 ctx 接通了）', String(pts.length));
  check(undrawn.length === 0, '菜单四个次级按钮都真的画了（不是只有几何和命中）', undrawn.join(', '));
}

/* ---------------------- 0c) 凝霜解锁之后的建造栏版式 ----------------------
 * 冰塔「凝霜」是成长系统里**唯一会动布局**的解锁项：上架后建造栏从 6 张卡
 * 变 7 张，两行 3+3 → 4+3、卡宽 221 → 164、栏高仍是 236。
 *
 * 为什么单独测一次：常规断言跑的都是「未解锁」的默认态（profile 在 Node 里
 * 读不到存档，永远返回空档案），所以解锁后那一套几何没人看着 ——
 * 而它恰恰是加法式改动里最容易悄悄错位的地方（卡宽算错就会叠字）。
 * 这里直接把点数推过最后一档门槛，再 fit 一次，把两行 4+3 量一遍。
 * 两种状态都必须绿，缺一不可。
 */
{
  const G = load({ w: 390, h: 844 });
  const CFGV = G.CFG;

  const before = CFGV.TOWER_ORDER.length;
  // 一次 20 波通关约 690 点（20×12 + 2000÷8 + 通关 200），8 次足够过 3800 的最后一档
  for (let i = 0; i < 8; i++) {
    G.Profile.settle({ wave: 20, kills: 2000, leaked: 0, deep: 0 }, true);
  }
  check(G.Profile.pts() > 0, '档案能累加回响点', String(G.Profile.pts()));
  check(G.Profile.has('cryo'), '点数够了能解锁凝霜', String(G.Profile.pts()));
  check(G.Profile.has('deep'), '点数够了能解锁深渊', '');
  check(G.Profile.mutPool().length === 8, '地脉谱系满档时突变池 8 条',
    String(G.Profile.mutPool().length));
  check(CFGV.TOWER_ORDER.indexOf('cryo') >= 0, '解锁后凝霜回到上架塔表', CFGV.TOWER_ORDER.join(','));
  check(CFGV.TOWER_ORDER.length === before + 1, '解锁后塔数 +1',
    before + ' → ' + CFGV.TOWER_ORDER.length);

  G.Runtime.fit();
  const LAY2 = G.LAY, cards2 = LAY2.cards;
  check(cards2.length === 7, '解锁后正好 7 张卡', String(cards2.length));
  check(LAY2.barH === 236, '解锁后栏高仍是 236（仍两行）', String(LAY2.barH));
  check(cards2[0].w === 164, '解锁后卡宽 164', String(cards2[0].w));
  check(cards2.filter(c => c.row === 0).length === 4, '解锁后第一行 4 张', '');
  check(cards2.filter(c => c.row === 1).length === 3, '解锁后第二行 3 张', '');
  let ov2 = 0;
  for (let a = 0; a < cards2.length; a++) {
    for (let b = a + 1; b < cards2.length; b++) {
      if (overlap(
        { x1: cards2[a].x, y1: cards2[a].y, x2: cards2[a].x + cards2[a].w, y2: cards2[a].y + cards2[a].h },
        { x1: cards2[b].x, y1: cards2[b].y, x2: cards2[b].x + cards2[b].w, y2: cards2[b].y + cards2[b].h })) ov2++;
    }
  }
  check(ov2 === 0, '解锁后卡片两两不重叠', String(ov2));
  /* 横向容差跟常规卡片断言同口径（12 ~ 708）：建造栏的卡片是「按 720 居中」
   * 而不是「按 40 边距排」—— 7 张卡时首行从 x≈20 起，拿 40 去卡会误报。 */
  check(cards2.every(c => c.x >= 12 - 0.5 && c.x + c.w <= 708 + 0.5), '解锁后卡片横向在栏内', '');
  check(cards2.every(c => c.y + c.h <= LAY2.barY + LAY2.barH + 0.5), '解锁后卡片纵向在栏内', '');

  // 卡宽从 221 压到 164 之后，塔名与「造价 · 攻击方式」还得装得下
  let wideName = 0, wideSub = 0;
  for (const k of CFGV.TOWER_ORDER) {
    const d = CFGV.TOWERS[k];
    wideName = Math.max(wideName, estW(d.name, CFGV.FS(15)));
    wideSub = Math.max(wideSub, estW('◈ ' + d.cost, CFGV.FS(12)));
  }
  check(wideName + CFGV.S(16) <= cards2[0].w, '解锁后卡宽容得下最长塔名',
    `${(wideName + CFGV.S(16)).toFixed(0)} vs ${cards2[0].w}`);
  check(wideSub + CFGV.S(16) <= cards2[0].w, '解锁后卡宽容得下副标题',
    `${(wideSub + CFGV.S(16)).toFixed(0)} vs ${cards2[0].w}`);

  /* 深渊开关的「可用/不可用」两态都要能画：解锁前是置灰的提示按钮，
   * 解锁后才是可点开关。这里只验几何（渲染走的是同一个 btn()）。 */
  const db2 = G.UI.profileDeepBtn();
  check(db2.x >= 40 - 0.5 && db2.x + db2.w <= 680 + 0.5, '深渊开关横向在屏内', '');
  check(db2.y + db2.h <= LAY2.codexTop + LAY2.codexH + 0.5, '深渊开关在图鉴页块内', '');
}

const LEVELS = load({ w: 390, h: 844 }).CFG.FONT_LEVELS;

/* ---------------------- 0) 元素图标 ----------------------
 * 卡片和塔身核心上的元素标记现在直接画矢量路径数据（js/icons.js）。
 * 路径数据或解析器任一环节坏掉，表现都是「图标凭空消失」——数字全合法、画面全空白，
 * 所以这里用一个记账用的 ctx 真跑一遍，数它到底有没有画出来。
 */
{
  const G = load({ w: 390, h: 844 });
  const calls = {};
  const named = ['beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo',
    'closePath', 'fill', 'save', 'restore', 'translate', 'scale'];
  const recCtx = new Proxy({}, {
    get(t, k) {
      if (named.indexOf(k) >= 0) return () => { calls[k] = (calls[k] || 0) + 1; };
      return () => { };
    },
    set(t, k, v) { t[k] = v; return true; }
  });

  const elems = Object.keys(G.CFG.ELEM);
  const missing = elems.filter(e => !G.Icons.has(e));
  check(missing.length === 0, '元素图标数据齐全（含留档元素）', missing.join(', '));
  /* 塔数不再恒等于元素数：元素可以「留档」—— 凝霜（冰）暂时下线，但元素配色、
   * 反应条目、图标数据全部保留，解注即回来。所以这里改判两件事：
   *   ① 每座上场的塔，其元素必须有定义、有图标（这才是不崩的下限，
   *      光断言「数量相等」会在留档时误报，也挡不住 ORDER 里写错元素名）；
   *   ② 塔数 ≤ 元素数 —— 防止 ORDER 里出现重复项或凭空冒出的元素名。 */
  const order = G.CFG.TOWER_ORDER;
  const badTower = order.filter(k =>
    !G.CFG.TOWERS[k] || !G.CFG.ELEM[G.CFG.TOWERS[k].elem] || !G.Icons.has(G.CFG.TOWERS[k].elem));
  check(badTower.length === 0, '每座塔的元素都有定义与图标数据', badTower.join(', '));
  check(order.length <= elems.length, '塔数不超过元素数',
    `${order.length} vs ${elems.length}`);

  const thin = [], dead = [];
  const segs = [];
  for (const e of elems) {
    for (const k in calls) delete calls[k];
    const okDraw = G.Icons.draw(recCtx, e, 100, 100, 16);
    const seg = (calls.bezierCurveTo || 0) + (calls.lineTo || 0);
    segs.push(e + ':' + seg);
    if (!okDraw || !(calls.fill >= 1)) dead.push(e);
    else if (seg < 12) thin.push(e + '(' + seg + ')');
    // 没有这个元素时不许假装画成功（调用方靠返回值决定要不要兜底）
  }
  check(dead.length === 0, '每个元素图标都能画出闭合路径并填充', dead.join(', '));
  check(thin.length === 0, '每个元素图标的路径复杂度够（≥12 段）', thin.join(', '));
  check(!G.Icons.draw(recCtx, 'not_an_element', 100, 100, 16), '未知元素返回 false（可兜底）');
  check(!!G.CFG.S && G.CFG.S(96) === Math.round(96 * G.CFG.LAY_K), '布局倍率入口一致', '');
  console.log('');
  console.log('元素图标分段数：' + segs.join('  '));
}


/* ---------------------- 0b) 怪物形象 ----------------------
 * 怪物从「一个多边形」换成矢量手绘 + 逐部件动画（js/monsters.js）。
 * 有四件事只有机器判得住：
 *   ① 每种怪都有专属形象 —— 少一个就退回兜底圆点，要玩到那一波才发现；
 *   ② 形象真的在动 —— 「动画没生效」光看代码永远是对的，只有比对两个时刻的
 *      绘制指令流才抓得住；
 *   ③ 形象不顶血条 —— 血条画在怪的上方（几何走 Render.barRect），
 *      形象往上冒就压住它（画面全对、就血条被挡，最难发现的一类）；
 *   ④ 形象不横向溢出、指令数有上限 —— 溢出会压到邻格，指令数爆炸是性能地雷。
 * 做法：一个会跟着 save/restore 维护 CTM 的记账 ctx，
 * 指令流拿来比对动画，变换后的点拿来算包围盒。
 */
{
  const G = load({ w: 390, h: 844 });

  function sample(key, t) {
    const rec = makeRec();
    const def = G.CFG.ENEMIES[key];
    G.Monsters.draw(rec.ctx, {
      uid: 5, key: key, def: def, color: def.color, r: def.r, x: 60, y: 80,
      fx: 0, fy: 1, hitFlash: 0, off: 4.2, phaseT: 0, mode: 'path'
    }, t, 1);
    return { sig: rec.ops.join('|'), pts: rec.pts, n: rec.ops.length };
  }

  const keys = Object.keys(G.CFG.ENEMIES);
  const noArt = keys.filter(k => !G.Monsters.has(k));
  check(noArt.length === 0, '每种怪都有专属形象', noArt.join(', ') || `${keys.length} 种`);

  const still = [], unstable = [], bleed = [], spill = [], tiny = [], heavy = [];
  const report = [];
  for (const key of keys) {
    const a = sample(key, 0.31), b = sample(key, 0.73);
    const c = sample(key, 0.5), d = sample(key, 0.5);
    if (a.sig === b.sig) still.push(key);              // 两个时刻画得一模一样 = 没动画
    if (c.sig !== d.sig) unstable.push(key);           // 同一时刻两次不一样 = 不可复现

    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of b.pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    const r = G.CFG.ENEMIES[key].r;
    /* 血条几何直接从渲染层取（Render.barRect）—— 早先这里是硬编码的
     * 「-(r+13) + 5」，drawEnemies 那边是另一份，改一处就会悄悄失准。
     * 现在血条常显、首领那条还加厚到 14，都靠这一份数对齐。 */
    const br = G.Render.barRect({ x: 60, y: 80, r: r, def: G.CFG.ENEMIES[key] });
    if (y0 < br.y + br.h) bleed.push(`${key} 顶 ${y0.toFixed(1)} vs 血条底 ${(br.y + br.h).toFixed(1)}`);
    if (br.w > G.CFG.CELL * 2 + 0.5) bleed.push(`${key} 血条宽 ${br.w.toFixed(1)} 超过 2 格`);
    if (Math.max(x1 - 60, 60 - x0) > r * 1.4) spill.push(`${key} 半宽 ${Math.max(x1 - 60, 60 - x0).toFixed(1)} vs ${(r * 1.4).toFixed(1)}`);
    if (x1 - x0 < r * 0.9 || y1 - y0 < r * 0.9) tiny.push(key);
    if (b.n > 400) heavy.push(`${key}(${b.n})`);
    report.push(`${key}:${b.n}`);
  }
  check(still.length === 0, '每种怪的动画都真的在变（两个时刻指令流不同）', still.join(', '));
  check(unstable.length === 0, '同一时刻画两次完全一致（动画不引入随机）', unstable.join(', '));
  check(bleed.length === 0, '怪物形象不顶到血条', bleed.join(' | '));
  check(spill.length === 0, '怪物形象不横向溢出（不压邻格）', spill.join(' | '));
  check(tiny.length === 0, '怪物形象没有退化成小点', tiny.join(', '));
  check(heavy.length === 0, '单只怪的绘制指令数在上限内（≤400）', heavy.join(', '));

  /* 登记外扩：CFG.MON_EXTENT 是弹窗排布的依据（形象占多高、多宽）。
   * 它是「实测值」而不是拍脑袋的常数 —— 所以这里反过来把实测结果跟登记值对一遍：
   * 谁改了形象（加犄角、拔高耳朵）超出登记值，弹窗那几条断言不会失败，
   * 但会在这里失败，报出到底是哪只怪超了。
   * 相位取 12 个：只取 4 个会漏掉摆动的极值，而弹窗正是按极值排的。 */
  const EXT = G.CFG.MON_EXTENT;
  const extBad = [];
  for (const key of keys) {
    for (const t of PHASES) {
      const box = monBox(G, key, 20, 0, 0, t);
      if (box.up > EXT.up * 20 + 0.5 || box.down > EXT.down * 20 + 0.5 || box.side > EXT.side * 20 + 0.5) {
        extBad.push(`${key}@${t.toFixed(2)} 上${(box.up / 20).toFixed(2)} 下${(box.down / 20).toFixed(2)} 侧${(box.side / 20).toFixed(2)}`);
      }
    }
  }
  check(extBad.length === 0, '形象实测外扩不超出 CFG.MON_EXTENT 登记值', extBad.join(' | '));

  console.log('');
  console.log('怪物形象指令数：' + report.join('  '));
}


/* ---------------------- 0c) 图鉴数据 ----------------------
 * 图鉴是「文案 + 数值」两套东西拼起来的，最容易出的错是加了新怪/新塔
 * 却忘了写档案 —— 表现是图鉴里那一格空白，而且要玩到那一波才发现。
 * 所以这里把「齐全」「条数一致」「判定正确」逐条断掉。
 */
{
  const G = load({ w: 390, h: 844 });
  const C = G.Codex;

  const enemies = C.enemyKeys();
  const towers = C.towerKeys();
  check(enemies.length === Object.keys(G.CFG.ENEMIES).length, '图鉴覆盖全部怪物',
    `${enemies.length} vs ${Object.keys(G.CFG.ENEMIES).length}`);
  check(towers.length === G.CFG.TOWER_ORDER.length, '图鉴覆盖全部上场炮台', '');

  const noInfo = [];
  for (const k of enemies) {
    const info = C.enemy(k);
    if (!info || !info.role || !info.tag || !info.lines.length) noInfo.push(k);
    else if (info.lines.some(l => !l || l.length < 4)) noInfo.push(k + '(行太短)');
  }
  for (const k of towers) {
    const info = C.tower(k);
    if (!info || !info.role || !info.lines.length) noInfo.push(k);
    else if (info.lines.some(l => !l || l.length < 4)) noInfo.push(k + '(行太短)');
  }
  check(noInfo.length === 0, '每个图鉴条目都有定位与特性文案', noInfo.join(', '));

  // 攻击方式标签要覆盖所有上场塔用到的 kind（漏了会显示成 bolt / chain 这种英文键名）
  const kindBad = towers.filter(k => !C.KIND_NAME[G.CFG.TOWERS[k].kind]);
  check(kindBad.length === 0, '每种攻击方式都有中文标签', kindBad.join(', '));

  // 反应效果文案：新增 kind 忘了写文案，图鉴里那一行会是空的
  const noEffect = [];
  for (const key in G.CFG.RES.reactions) {
    if (!G.CFG.RES.reactions.hasOwnProperty(key)) continue;
    if (!C.effectText(G.CFG.RES.reactions[key])) noEffect.push(key);
  }
  check(noEffect.length === 0, '每条反应都有可读的效果文案', noEffect.join(', '));

  /* reactionsOf：条数必须等于该元素在反应表里出现的次数；
   * active 必须严格等于「对手元素有上场塔」——当前实情是涉及冰的那几条
   * 对每座塔都标「未上线」，图鉴里会显示成灰的，这是有意的。 */
  const elemsInUse = {};
  for (const k of towers) elemsInUse[G.CFG.TOWERS[k].elem] = true;
  const cntBad = [], actBad = [];
  let totalRows = 0;
  for (const k of towers) {
    const el = G.CFG.TOWERS[k].elem;
    const rs = C.reactionsOf(el);
    let expect = 0;
    for (const key in G.CFG.RES.reactions) {
      if (!G.CFG.RES.reactions.hasOwnProperty(key)) continue;
      const p = key.split('|');
      if (p[0] === el || p[1] === el) expect++;
    }
    if (rs.length !== expect) cntBad.push(`${k}: ${rs.length} vs ${expect}`);
    totalRows += rs.length;
    for (const r of rs) {
      if (r.active !== !!elemsInUse[r.otherElem]) actBad.push(`${k}/${r.name}/${r.otherElem}`);
    }
  }
  check(cntBad.length === 0, '每个元素的反应条数与反应表一致', cntBad.join(' | '));
  check(actBad.length === 0, '反应的「已上线」判定跟随上场塔', actBad.join(' | '));
  const thinReact = towers.filter(k => C.reactionsOf(G.CFG.TOWERS[k].elem).length < 3);
  check(thinReact.length === 0, '每个上场元素至少参与 3 条反应', thinReact.join(', '));

  // 解锁记录：只认已知的怪、幂等、reset 能清
  C.reset();
  const first = C.markSeen('drifter');
  const again = C.markSeen('drifter');
  const bogus = C.markSeen('not_an_enemy');
  const cnt1 = C.seenCount();
  C.markAllSeen();
  const cntAll = C.seenCount();
  C.reset();
  const cnt0 = C.seenCount();
  check(first === true, '第一次遭遇返回 true（据此触发弹窗）');
  check(again === false, '同一只怪第二次不再触发弹窗');
  check(bogus === false, '不认识的怪不会写进图鉴记录');
  check(cnt1 === 1, '已遭遇计数正确', String(cnt1));
  check(cntAll === enemies.length, 'markAllSeen 全解锁', `${cntAll} vs ${enemies.length}`);
  check(cnt0 === 0, 'reset 能清空记录', String(cnt0));
  check(C.isSeen('drifter') === false, 'reset 后确实回到未遭遇');
  console.log('');
  console.log('图鉴：怪物 ' + enemies.length + ' 种 / 炮台 ' + towers.length +
    ' 座，反应行合计 ' + totalRows + ' 条');
}


/* ---------------------- 0d) 血条 / 反应名标签 / 击退参数 ----------------------
 * 三样东西都是「数值改动本身看不出问题、只有跑起来才发现」的类型：
 *   ① 血条几何 —— 首领那条加厚到 14 之后必须仍然整个落在身体之上，
 *      否则会盖住自己的脑袋（0b 验的是形象不顶血条，这条验血条不压形象，
 *      两个方向都要，因为 gap 与 h 是两个可以各自被改的数）；
 *   ② 反应名标签 —— 名字太长就横着压到邻格，三档字号下长度还不一样；
 *   ③ 击退免疫窗 —— 免疫窗比反应周期还长的话，反应照样出伤害但推不动，
 *      表现是「风塔有时灵有时不灵」，最难查的一类。
 */
for (let lv = 0; lv < LEVELS.length; lv++) {
  const G = load({ w: 390, h: 844 }, lv);
  const tag = '档' + lv + ' ';
  const BAR = G.Render.BAR, TAG = G.Render.TAG;
  const S = G.CFG.S, F = G.CFG.FS;

  // ① 血条整体在身体之上（不压自己的头）
  const barBad = [];
  for (const key of Object.keys(G.CFG.ENEMIES)) {
    const d = G.CFG.ENEMIES[key];
    const br = G.Render.barRect({ x: 0, y: 0, r: d.r, def: d });
    if (br.y + br.h > -d.r + 0.001) {
      barBad.push(`${key} 血条底 ${(br.y + br.h).toFixed(1)} vs 身体顶 ${-d.r}`);
    }
    if (br.w > G.CFG.CELL * 2 + 0.5) barBad.push(`${key} 血条宽 ${br.w.toFixed(1)}`);
  }
  check(barBad.length === 0, tag + '血条不压住自己的身体，也不超过两格宽', barBad.join(' | '));

  // ② 反应名标签：三档字号下都不宽过两格
  const tagBad = [];
  for (const key in G.CFG.RES.reactions) {
    if (!G.CFG.RES.reactions.hasOwnProperty(key)) continue;
    const nm = G.CFG.RES.reactions[key].name;
    const w = estW(nm, F(TAG.font)) + S(TAG.padX) * 2;
    if (w > G.CFG.CELL * 2) tagBad.push(`${nm} ${w.toFixed(0)}`);
  }
  check(tagBad.length === 0, tag + '反应名标签不宽过两格', tagBad.join(' | '));

  // ③ 击退免疫窗要短于最短的「带击退」反应周期
  const KB = G.Enemies.KB;
  let minPushCd = 1e9, minPushName = '';
  for (const key in G.CFG.RES.reactions) {
    if (!G.CFG.RES.reactions.hasOwnProperty(key)) continue;
    const d = G.CFG.RES.reactions[key];
    if (!d.push) continue;
    if (d.cd < minPushCd) { minPushCd = d.cd; minPushName = d.name; }
  }
  check(KB.immune < minPushCd,
    tag + '击退免疫窗短于最短的带击退反应周期（否则那一下推不动）',
    `${KB.immune} vs ${minPushCd}(${minPushName})`);
  check(KB.tau > 0.05 && KB.tau < 0.6,
    tag + '击退衰减时间常数在手感区间内（0.05~0.6s）', String(KB.tau));
  console.log(tag + '血条：普通 ' + BAR.h + 'px / 首领 ' + BAR.bossH + 'px，击退 τ=' + KB.tau + 's 免疫 ' + KB.immune + 's');
}
console.log('');


/* ---------------------- 逐个机型 × 逐档字号 ---------------------- */
for (let lv = 0; lv < LEVELS.length; lv++) {
  for (const p of PROFILES) {
    const env = p.env;
    const G = load(env, lv);
    const R = G.Runtime, LAY = G.LAY, H = LAY.hud, CFG = G.CFG, UI = G.UI;
    const s = R.scale, ox = R.ox, oy = R.oy;
    const S = CFG.S, F = CFG.FS;

    // 设计坐标 -> 屏幕 px
    const DX = x => x * s + ox;
    const DY = y => y * s + oy;

    const cap = env.capsule || null;
    const statusBar = env.statusBar || 0;
    const screenH = env.screenH || env.h;
    const homeInset = (env.safeArea && env.safeArea.bottom) ? Math.max(0, screenH - env.safeArea.bottom) : 0;
    const line = { name: p.name + ' · ' + LEVELS[lv].name + '号', checks: [], info: {} };

    line.info = {
      scale: +s.toFixed(4),
      designH: Math.round(R.designH),
      insetTop: R.insetTop,
      insetBottom: R.insetBottom,
      layout: H.layout,
      boardY: Math.round(LAY.boardY),
      barY: Math.round(LAY.barY),
      minFont: F(12)
    };

    // 1) 左上角标题不能压状态栏
    const titleTop = DY(H.title - F(28) / 2);
    line.checks.push(check(titleTop >= statusBar - EPS, '标题不压状态栏',
      `标题顶 ${titleTop.toFixed(1)}px vs 状态栏底 ${statusBar}px`));

    // 2) HUD 各行都不能压状态栏
    line.checks.push(check(DY(LAY.hpBar.y) >= statusBar - EPS, '血条不压状态栏',
      `${DY(LAY.hpBar.y).toFixed(1)} vs ${statusBar}`));
    line.checks.push(check(DY(H.waveTxt - F(19) / 2) >= statusBar - EPS, '波次文字不压状态栏',
      `${DY(H.waveTxt - F(19) / 2).toFixed(1)} vs ${statusBar}`));
    line.checks.push(check(DY(H.waveBtn.y) >= statusBar - EPS, '开波按钮不压状态栏',
      `${DY(H.waveBtn.y).toFixed(1)} vs ${statusBar}`));

    if (cap) {
      const capRect = { x1: cap.left, y1: cap.top, x2: cap.right, y2: cap.bottom };

      // 3) 设置键必须整个落在胶囊下方
      const sb = LAY.settingsBtn;
      const sbRect = { x1: DX(sb.x), y1: DY(sb.y), x2: DX(sb.x + sb.w), y2: DY(sb.y + sb.h) };
      line.checks.push(check(sbRect.y1 >= cap.bottom - EPS, '设置键在胶囊下方',
        `键顶 ${sbRect.y1.toFixed(1)}px vs 胶囊底 ${cap.bottom}px`));
      line.checks.push(check(!overlap(sbRect, capRect), '设置键不与胶囊重叠',
        `键[${sbRect.x1.toFixed(0)},${sbRect.y1.toFixed(0)}]-[${sbRect.x2.toFixed(0)},${sbRect.y2.toFixed(0)}]`));

      // 4) 右对齐那一列的包围盒不能碰胶囊（宽度按估算字宽算；能量字号已降到 22）
      const rcWide = estW('最高分 12345', F(12));
      const rc = {
        x1: DX(H.hudRight - rcWide), y1: DY(H.waveTxt - F(19) / 2),
        x2: DX(H.hudRight), y2: DY(H.energyVal + F(20) / 2)
      };
      line.checks.push(check(!overlap(rc, capRect), '右对齐列不碰胶囊',
        `${H.layout} 列[${rc.x1.toFixed(0)},${rc.y1.toFixed(0)}]-[${rc.x2.toFixed(0)},${rc.y2.toFixed(0)}] vs 胶囊[${cap.left},${cap.top}]-[${cap.right},${cap.bottom}]`));

      // 5) 设置键挂在开波按钮右侧那一格：横向与它分离，纵向与右列分离
      line.checks.push(check(sbRect.x1 >= rc.x2 - EPS || sbRect.y1 >= rc.y2 - EPS || sbRect.y2 <= rc.y1 + EPS,
        '设置键与右列分离', `键 x1=${sbRect.x1.toFixed(0)} vs 右列 x2=${rc.x2.toFixed(0)}`));
      line.checks.push(check(sbRect.x1 >= DX(LAY.waveBtn.x + LAY.waveBtn.w) - EPS, '设置键不压开波按钮',
        `键 x1=${sbRect.x1.toFixed(0)} vs 开波按钮右沿 ${DX(LAY.waveBtn.x + LAY.waveBtn.w).toFixed(0)}`));
    }

    const speedBtn = LAY.speedBtn, settingBtn = LAY.settingsBtn;
    line.checks.push(check(speedBtn.x >= LAY.waveBtn.x + LAY.waveBtn.w + S(10),
      '倍速按钮与开波按钮留有间距', ''));
    line.checks.push(check(speedBtn.x + speedBtn.w + S(10) <= settingBtn.x,
      '倍速按钮与设置按钮不重叠', ''));

    // 6) HUD 内部不互相压（回声条已随倒带下线，左列只剩「血条 → 开波按钮」）
    line.checks.push(check(LAY.hpBar.y > H.hpLabel + F(13) / 2, '血条标题有间距', `${LAY.hpBar.y} vs ${H.hpLabel}`));
    line.checks.push(check(H.waveBtn.y - (LAY.hpBar.y + LAY.hpBar.h) >= S(12), '开波按钮不压血条',
      `间隙 ${H.waveBtn.y - (LAY.hpBar.y + LAY.hpBar.h)}px`));
    line.checks.push(check(H.energyVal + F(20) / 2 < H.waveBtn.y, '能量数字不压开波按钮',
      `${H.energyVal + F(20) / 2} vs ${H.waveBtn.y}`));
    /* 首次教程的面板与两座指定教学塔都在棋盘内，且不能盖住需要玩家点击的格子。 */
    const tutPanel = UI.tutorialPanel(), tutSkip = UI.tutorialSkip(), tutNext = UI.tutorialNext();
    line.checks.push(check(tutPanel.x >= LAY.boardX && tutPanel.x + tutPanel.w <= LAY.boardX + LAY.boardW &&
      tutPanel.y >= LAY.boardY && tutPanel.y + tutPanel.h <= LAY.boardY + LAY.boardH,
    '新手教程面板在棋盘内', ''));
    line.checks.push(check(tutSkip.x >= tutPanel.x && tutSkip.x + tutSkip.w <= tutPanel.x + tutPanel.w &&
      tutNext.x >= tutPanel.x && tutNext.x + tutNext.w <= tutPanel.x + tutPanel.w,
    '教程跳过与继续按钮在面板内', ''));
    for (const ts of [UI.tutorialTarget(1), UI.tutorialTarget(2)]) {
      const tr = { x1: LAY.boardX + ts.col * CFG.CELL, y1: LAY.boardY + ts.row * CFG.CELL,
        x2: LAY.boardX + (ts.col + 1) * CFG.CELL, y2: LAY.boardY + (ts.row + 1) * CFG.CELL };
      const pr = { x1: tutPanel.x, y1: tutPanel.y, x2: tutPanel.x + tutPanel.w, y2: tutPanel.y + tutPanel.h };
      line.checks.push(check(!overlap(tr, pr), '教程指定建造格不被面板遮住', ts.tower));
    }
    /* 共振临界条位于血条与开波按钮之间，不占右侧能量列，三档字号下都要保留
     * 一整行的呼吸位；没有该几何就说明渲染与版式无法同源。 */
    const overloadBar = H.overloadBar;
    const overloadValue = H.overloadValue;
    line.checks.push(check(!!overloadBar, 'HUD 提供共振临界条几何', ''));
    line.checks.push(check(typeof overloadValue === 'number', 'HUD 提供共振临界数值锚点', ''));
    if (overloadBar) {
      line.checks.push(check(overloadBar.x >= LAY.hpBar.x && overloadBar.x + overloadBar.w <= LAY.hpBar.x + LAY.hpBar.w,
        '共振临界条横向落在血条列内', ''));
      line.checks.push(check(overloadBar.y >= LAY.hpBar.y + LAY.hpBar.h + S(4) &&
        overloadBar.y + overloadBar.h + S(6) <= H.waveBtn.y,
      '共振临界条不压血条或开波按钮', ''));
      line.checks.push(check(H.overloadLabel + F(12) / 2 + S(2) <= overloadBar.y,
        '共振临界标题不覆盖进度填充', ''));
      if (typeof overloadValue === 'number') {
        line.checks.push(check(overloadValue + F(12) / 2 + S(2) <= overloadBar.y,
          '共振临界数值不覆盖进度填充', ''));
      }
    }

    // 6b) 左右两列在同一条水平带上最容易叠字 —— 宽度全部按估算字宽现算
    const titleRight = 40 + estW('回声防线', F(28));
    const subRight = 40 + estW('ECHO LINE · 共振塔防', F(12));
    const waveLeft = H.hudRight - estW('第 20 波', F(19));
    const bestLeft = H.hudRight - estW('最高分 12345', F(12));
    line.checks.push(check(waveLeft >= titleRight + 16, '波次行不与标题叠字',
      `右列左沿 ${waveLeft.toFixed(0)} vs 标题右沿 ${titleRight.toFixed(0)}`));
    line.checks.push(check(bestLeft >= subRight + 16, '最高分行不与副标题叠字',
      `右列左沿 ${bestLeft.toFixed(0)} vs 副标题右沿 ${subRight.toFixed(0)}`));

    // 7) 棋盘顺序：HUD 下、建造栏上
    line.checks.push(check(LAY.boardY >= H.waveBtn.y + H.waveBtn.h + S(8), '棋盘在 HUD 之下',
      `棋盘顶 ${Math.round(LAY.boardY)} vs HUD 底 ${H.waveBtn.y + H.waveBtn.h}`));
    line.checks.push(check(LAY.boardY + LAY.boardH <= LAY.barY + EPS, '棋盘在建造栏之上',
      `棋盘底 ${Math.round(LAY.boardY + LAY.boardH)} vs 栏顶 ${Math.round(LAY.barY)}`));

    /* 7b) 底部卡片（只剩炮台，当前 6 张）：
     *     两行 3+3 平铺、每张都在栏内、两两不重叠、同行与两行之间都有呼吸位，
     *     卡名/副标题在卡内排得下。更早那版一行 9 张（卡宽只有 72）挤得看不清，
     *     这里的 minGap / 卡宽断言就是防它退回去。 */
    const cards = LAY.cards;
    const perRow = Math.ceil(CFG.TOWER_ORDER.length / 2);
    line.checks.push(check(cards.length === CFG.TOWER_ORDER.length, '卡片数量 = 塔数',
      `${cards.length} vs ${CFG.TOWER_ORDER.length}`));
    const rowOf = r => (r.row === undefined ? 0 : r.row);
    const rowIdx = Array.from(new Set(cards.map(rowOf))).sort((a, b) => a - b);
    line.checks.push(check(rowIdx.length === 2, '卡片铺成两行', `实际 ${rowIdx.length} 行`));
    const rowCounts = rowIdx.map(r => cards.filter(c => rowOf(c) === r).length);
    line.checks.push(check(rowCounts[0] === perRow && rowCounts.reduce((a, b) => a + b, 0) === cards.length,
      `每行卡片数正确（首行 ${perRow} 张）`, rowCounts.join(' / ')));

    const outOfBar = cards.filter(c => c.x < 12 - EPS || c.x + c.w > 708 + EPS ||
      c.y < LAY.barY - EPS || c.y + c.h > LAY.barY + LAY.barH + EPS);
    line.checks.push(check(outOfBar.length === 0, '每张卡都在建造栏内',
      outOfBar.map(c => `#${c.idx}[${Math.round(c.x)},${Math.round(c.y)}]`).join(' ')));

    const hits = [];
    for (let a = 0; a < cards.length; a++) {
      for (let b = a + 1; b < cards.length; b++) {
        const A = cards[a], B = cards[b];
        if (overlap({ x1: A.x, y1: A.y, x2: A.x + A.w, y2: A.y + A.h },
          { x1: B.x, y1: B.y, x2: B.x + B.w, y2: B.y + B.h })) hits.push(`#${A.idx}×#${B.idx}`);
      }
    }
    line.checks.push(check(hits.length === 0, '卡片两两不重叠', hits.join(' ')));

    let minGapX = Infinity, minGapY = Infinity;
    for (const r of rowIdx) {
      const rs = cards.filter(c => rowOf(c) === r).slice().sort((a, b) => a.x - b.x);
      for (let i = 1; i < rs.length; i++) {
        minGapX = Math.min(minGapX, rs[i].x - (rs[i - 1].x + rs[i - 1].w));
      }
    }
    for (let i = 1; i < rowIdx.length; i++) {
      const up = cards.filter(c => rowOf(c) === rowIdx[i - 1])[0];
      const dn = cards.filter(c => rowOf(c) === rowIdx[i])[0];
      minGapY = Math.min(minGapY, dn.y - (up.y + up.h));
    }
    line.checks.push(check(minGapX >= S(6) - EPS && minGapY >= S(6) - EPS, '同行/两行之间留了呼吸位',
      `横向 ${minGapX.toFixed(0)}px 纵向 ${minGapY.toFixed(0)}px`));

    // 卡宽：两字卡名 + 两侧 S(12) 呼吸位；同时不许退回到「一行 9 张」时的 72
    const nameNeed = estW('炎爆', F(15)) + S(12);
    line.checks.push(check(cards[0].w >= nameNeed, '卡宽容得下 2 字卡名（S(15) 字号）',
      `卡宽 ${cards[0].w} vs 需要 ${nameNeed.toFixed(0)}`));
    line.checks.push(check(cards[0].w >= 120, '卡宽够摆元素图标（不再挤）', `${cards[0].w}px`));

    // 卡内竖向：图标 S(26)（半径 S(15)）→ 卡名 S(58) → 副标题 S(84），都要在 h 里
    const iconBot = S(26) + S(15);
    const nameTop = S(58) - F(15) / 2, nameBot = S(58) + F(15) / 2;
    const subTop = S(84) - F(12) / 2, subBot = S(84) + F(12) / 2;
    line.checks.push(check(nameTop >= iconBot - EPS, '卡名不与图标叠',
      `卡名顶 ${nameTop.toFixed(0)} vs 图标底 ${iconBot}`));
    line.checks.push(check(subTop >= nameBot - EPS, '副标题不与卡名叠',
      `副标题顶 ${subTop.toFixed(0)} vs 卡名底 ${nameBot.toFixed(0)}`));
    line.checks.push(check(subBot <= cards[0].h - S(4) + EPS, '副标题在卡片内',
      `副标题底 ${subBot.toFixed(0)} vs 卡高 ${cards[0].h}`));

    // 7c) 六个整屏版式必须落在屏内
    const pages = [
      ['菜单', LAY.menuTop, LAY.menuH],
      ['设置', LAY.setTop, LAY.setH],
      ['玩法', LAY.helpTop, LAY.helpH],
      ['图鉴', LAY.codexTop, LAY.codexH],
      ['弹窗', LAY.popTop, LAY.popH],
      ['结算', LAY.overTop, LAY.overH]
    ];
    for (const [nm, top, h] of pages) {
      line.checks.push(check(top >= (LAY.insetTop || 0) - EPS && top + h <= LAY.designH + EPS,
        nm + '版式在屏内', `块[${top}, ${top + h}] vs 设计高 ${Math.round(LAY.designH)}`));
    }

    /* 7c-2) 结算面板内部：六行数据（最后一行含「本局回响点」，字号 24）要落在面板里，
     *       且不与「再来一局」按钮叠。几何（S(170) 起、行距 S(44)、六行、按钮 S(424)）
     *       必须与 render.js 的 drawOver 一致 —— 往结算页加数据行时这里会先报出来。
     *       注意「本局新解锁」是**改写副标题**、不是新增一行：副标题与首行数据之间
     *       只有 S(52)，塞第三行字在大字号档下必挤（S 与 F 两条曲线不同源）。 */
    const ovPanelBottom = LAY.overTop + S(16) + S(602);
    const ovLastY = LAY.overTop + S(170) + 5 * S(44);
    const ovAgain = UI.againBtn();
    line.checks.push(check(ovLastY + F(24) / 2 <= ovPanelBottom + EPS, '结算数据行在面板内',
      `${(ovLastY + F(24) / 2).toFixed(0)} vs 面板底 ${ovPanelBottom.toFixed(0)}`));
    line.checks.push(check(ovLastY + F(24) / 2 <= ovAgain.y - EPS, '结算最后一行不与按钮叠',
      `${(ovLastY + F(24) / 2).toFixed(0)} vs 按钮顶 ${ovAgain.y.toFixed(0)}`));
    line.checks.push(check(ovAgain.y + ovAgain.h <= LAY.overTop + LAY.overH + EPS, '结算按钮在页面块内',
      `按钮底 ${(ovAgain.y + ovAgain.h).toFixed(0)} vs 块底 ${(LAY.overTop + LAY.overH).toFixed(0)}`));
    /* 副标题位在有新解锁时会被改写成「解锁 · XX」，所以它也可能变长、变粗 ——
     * 既要装得下面板宽，也要与首行数据留出间距。 */
    const ovSubY = LAY.overTop + S(118);
    const ovFirstY = LAY.overTop + S(170);
    line.checks.push(check(ovSubY + F(16) / 2 <= ovFirstY - F(16) / 2 + EPS, '结算副标题不与首行数据叠',
      `副标题底 ${(ovSubY + F(16) / 2).toFixed(0)} vs 首行顶 ${(ovFirstY - F(16) / 2).toFixed(0)}`));
    const worstUnlock = '解锁 · ' + CFG.UNLOCKS.map(l => l.name).join(' / ');
    line.checks.push(check(estW(worstUnlock, F(16)) <= 588 - 2 * S(24) + EPS,
      '结算解锁文案最坏情况装得下面板',
      `宽 ${estW(worstUnlock, F(16)).toFixed(0)} vs 可容 ${(588 - 2 * S(24)).toFixed(0)}（${worstUnlock}）`));
    /* 结算页必须同时给“再来一局”和“回到首页”：两个几何由 UI 提供，
     * 不允许 render/main 各自再拍一份坐标。 */
    const ovHome = typeof UI.againHome === 'function' ? UI.againHome() : null;
    line.checks.push(check(!!ovHome, '结算页提供回到首页按钮', ''));
    if (ovHome) {
      line.checks.push(check(ovHome.y >= ovAgain.y + ovAgain.h + S(12), '结算首页按钮在再来一局之下', ''));
      line.checks.push(check(ovHome.y + ovHome.h <= LAY.overTop + LAY.overH + EPS, '结算首页按钮在页面块内', ''));
    }

    // 7d) 玩法正文：底边在块内，且每行不越过右边框。
    //     文案写在 ui.js 的 UI.HELP 里，渲染与自检共用同一份，
    //     所以这里量出来的宽度就是真会画出来的宽度。
    const secs = UI.helpSections();
    line.checks.push(check(secs.length === UI.HELP.length, '玩法条目数与文案一致',
      `${secs.length} vs ${UI.HELP.length}`));
    line.checks.push(check(UI.helpContentBottom() <= LAY.helpTop + LAY.helpH, '玩法正文没溢出页面块',
      `正文底 ${Math.round(UI.helpContentBottom())} vs 块底 ${LAY.helpTop + LAY.helpH}`));
    const lineMaxX = 720 - 40;
    const overLines = [];
    for (const sec of secs) {
      if (124 + estW(sec.title, F(16)) > lineMaxX) overLines.push('标题:' + sec.title);
      for (const l of sec.lines) {
        if (124 + estW(l, F(12)) > lineMaxX) overLines.push(l);
      }
    }
    line.checks.push(check(overLines.length === 0, '玩法文字不越过右边框',
      overLines.join(' | ')));
    // 正文第一行不能压到页头分隔线（分隔线在 helpTop + S(104)）
    line.checks.push(check(secs[0].y >= LAY.helpTop + S(104) + 4, '玩法正文在分隔线之下',
      `正文顶 ${secs[0].y} vs 分隔线 ${LAY.helpTop + S(104)}`));

    // 7e) 设置页：行不叠、说明不与控件叠、返回按钮在最下
    const rowsR = UI.SET_ROWS.map((_, i) => UI.setRow(i));
    for (let i = 0; i < rowsR.length; i++) {
      const r = rowsR[i];
      line.checks.push(check(r.y >= LAY.setTop && r.y + r.h <= LAY.setTop + LAY.setH,
        `设置第 ${i + 1} 行在设置块内`, `行[${r.y}, ${r.y + r.h}] 块[${LAY.setTop}, ${LAY.setTop + LAY.setH}]`));
      if (i > 0) {
        line.checks.push(check(r.y >= rowsR[i - 1].y + rowsR[i - 1].h + S(8), `设置第 ${i} 行与第 ${i + 1} 行有间距`,
          `${rowsR[i - 1].y + rowsR[i - 1].h} → ${r.y}`));
      }
    }
    const fb = UI.setFontBtns();
    const tgSound = UI.setToggle(1), tgVib = UI.setToggle(3);
    const volMn = UI.volMinus(), volTr = UI.volTrack(), volPl = UI.volPlus();
    const ctrlLeft = [fb[0].x, tgSound.x, volMn.x, tgVib.x];
    for (let i = 0; i < rowsR.length; i++) {
      const r = rowsR[i];
      const txtRight = r.x + S(24) + Math.max(estW(UI.SET_LABEL[i], F(16)), estW(UI.SET_HINT[i], F(12)));
      line.checks.push(check(txtRight + 12 <= ctrlLeft[i], `设置第 ${i + 1} 行文字不与控件叠`,
        `文字右沿 ${txtRight.toFixed(0)} vs 控件左沿 ${ctrlLeft[i].toFixed(0)}`));
    }
    // 音量三个控件横向依次排开、不越出行的右边界
    line.checks.push(check(volMn.x + volMn.w <= volTr.x, '音量 − 在轨道左侧', ''));
    line.checks.push(check(volTr.x + volTr.w <= volPl.x, '音量 ＋ 在轨道右侧', ''));
    line.checks.push(check(volPl.x + volPl.w <= rowsR[2].x + rowsR[2].w - S(4), '音量控件不越出设置行', ''));
    // 百分比数字贴在 − 号左边，不能反压到说明文字上
    const pctLeft = volMn.x - S(14) - estW('100%', F(14));
    line.checks.push(check(pctLeft >= ctrlLeft[2] - estW('100%', F(14)) - S(14), '音量百分比在 − 号左侧', ''));
    // 预览条与返回按钮
    const pv = UI.setPreview(), back = UI.setBack();
    line.checks.push(check(pv.y >= rowsR[3].y + rowsR[3].h + S(8), '预览条在最后一行之下', ''));
    line.checks.push(check(back.y >= pv.y + pv.h + S(8), '返回按钮在预览条之下', ''));
    line.checks.push(check(back.y + back.h <= LAY.setTop + LAY.setH, '返回按钮在设置块内',
      `按钮底 ${back.y + back.h} vs 块底 ${LAY.setTop + LAY.setH}`));
    line.checks.push(check(
      pv.x + S(24) + estW(UI.SET_PREVIEW, F(14)) + 12 <=
      pv.x + pv.w - S(24) - estW(UI.SET_PREVIEW_RIGHT + '大', F(13)),
      '预览条左右两段不叠字', ''));
    /* 从战斗打开的设置页需要明确的“继续”和“返回首页”出口。 */
    const setContinue = typeof UI.setContinue === 'function' ? UI.setContinue() : null;
    const setHome = typeof UI.setHome === 'function' ? UI.setHome() : null;
    line.checks.push(check(!!setContinue && !!setHome, '设置页提供继续与返回首页按钮', ''));
    if (setContinue && setHome) {
      line.checks.push(check(setContinue.x + setContinue.w + S(12) <= setHome.x, '设置页两个出口不重叠', ''));
      line.checks.push(check(setContinue.y + setContinue.h <= LAY.setTop + LAY.setH + EPS &&
        setHome.y + setHome.h <= LAY.setTop + LAY.setH + EPS, '设置页两个出口在页面块内', ''));
    }

    // 7f) 菜单：全屏背景上的底部操作区。开始与四个次按钮都从安全区反推定位。
    const ms = UI.menuStart(), mh = UI.menuHelp(), mc = UI.menuCodex(), mst = UI.menuSet();
    const menuFooterY = UI.menuFooterY();
    line.checks.push(check(menuFooterY <= LAY.designH - LAY.insetBottom - S(24) &&
      menuFooterY >= LAY.designH - LAY.insetBottom - S(40),
    '菜单底部信息锚定在安全区上方 32px', ''));
    const subs = [mh, mc, mst];
    let subHit = 0;
    for (let a = 0; a < subs.length; a++) {
      for (let b = a + 1; b < subs.length; b++) {
        if (overlap({ x1: subs[a].x, y1: subs[a].y, x2: subs[a].x + subs[a].w, y2: subs[a].y + subs[a].h },
          { x1: subs[b].x, y1: subs[b].y, x2: subs[b].x + subs[b].w, y2: subs[b].y + subs[b].h })) subHit++;
      }
    }
    line.checks.push(check(subHit === 0, '菜单三个次按钮不重叠', String(subHit)));
    line.checks.push(check(subs[0].x >= 40 - EPS && subs[2].x + subs[2].w <= 680 + EPS,
      '菜单次按钮在屏内',
      `[${subs[0].x}, ${subs[2].x + subs[2].w}]`));
    line.checks.push(check(estW('图鉴', F(18)) + S(16) <= mc.w, '菜单次按钮容得下两字标签', ''));
    line.checks.push(check(ms.y + ms.h + S(8) <= mh.y, '菜单次按钮在主按钮之下', ''));
    line.checks.push(check(UI.menuFooterY() - S(38) - F(14) / 2 >= mh.y + mh.h, '菜单最高分在按钮之下', ''));
    line.checks.push(check(ms.y + ms.h <= LAY.designH - LAY.insetBottom - S(16),
      '菜单主按钮在底部安全区之上', ''));

    /* 7g) 浮动提示（Toast）贴在建造栏正上方。
     * 16:9 与平板这类「高度刚好装下」的机型，棋盘底下一点余量都没有，
     * 提示必然落进棋盘最底一行 —— 所以底线定在「不盖住核心格上的『核心』两个字」。
     * 下面这几个数必须跟 render.js 的 drawToast / drawBoard 一致（都过 CFG.S）。 */
    const toastTop = LAY.barY - S(54) - S(6);
    const coreLabelBottom = LAY.boardY + CFG.CORE_CELLS[0][1] * CFG.CELL +
      CFG.CELL / 2 - S(48) + F(13) / 2;
    line.checks.push(check(toastTop >= coreLabelBottom, '浮动提示不压「核心」标签',
      `提示顶 ${toastTop} vs 标签底 ${coreLabelBottom}`));

    /* 7h) 图鉴页：Tab 条 → 内容区（列表网格 / 详情）→ 详情才有的「返回列表」。
     *     图鉴是新页面，最容易出的两种错：格子铺到屏外、
     *     详情里的长文案顶到右边框 —— 后者只有按估算字宽量才看得出来。 */
    const tabsR = UI.codexTabs();
    line.checks.push(check(tabsR.length === UI.CODEX_TABS.length, '图鉴 Tab 数量与文案一致', ''));
    let tabHit = 0, tabOut = 0;
    for (let i = 0; i < tabsR.length; i++) {
      if (tabsR[i].x < 40 - EPS || tabsR[i].x + tabsR[i].w > 680 + EPS) tabOut++;
      if (i > 0 && tabsR[i].x < tabsR[i - 1].x + tabsR[i - 1].w) tabHit++;
    }
    line.checks.push(check(tabOut === 0, '图鉴 Tab 在屏内', ''));
    line.checks.push(check(tabHit === 0, '图鉴 Tab 不重叠', ''));
    line.checks.push(check(tabsR[0].y >= LAY.codexTop + S(104) + 4, '图鉴 Tab 在页头分隔线之下', ''));
    line.checks.push(check(tabsR[0].y + tabsR[0].h <= LAY.codexTop + S(UI.CODEX_BODY_Y), '图鉴 Tab 在内容区之上', ''));

    const allEnemies = G.Codex.enemyKeys(), allTowers = G.Codex.towerKeys();
    const NC = UI.CODEX_COLS * UI.CODEX_ROWS;
    const cellsR = [];
    for (let i = 0; i < NC; i++) cellsR.push(UI.codexCell(i));
    line.checks.push(check(cellsR[0].x >= 40 - EPS && cellsR[NC - 1].x + cellsR[NC - 1].w <= 680 + EPS,
      '图鉴格子横向在屏内', `[${cellsR[0].x}, ${cellsR[NC - 1].x + cellsR[NC - 1].w}]`));
    let cellHit = 0;
    for (let a = 0; a < NC; a++) {
      for (let b = a + 1; b < NC; b++) {
        if (overlap({ x1: cellsR[a].x, y1: cellsR[a].y, x2: cellsR[a].x + cellsR[a].w, y2: cellsR[a].y + cellsR[a].h },
          { x1: cellsR[b].x, y1: cellsR[b].y, x2: cellsR[b].x + cellsR[b].w, y2: cellsR[b].y + cellsR[b].h })) cellHit++;
      }
    }
    line.checks.push(check(cellHit === 0, '图鉴格子两两不重叠', String(cellHit)));
    line.checks.push(check(cellsR[1].x - (cellsR[0].x + cellsR[0].w) >= S(6) - EPS, '图鉴横向留了呼吸位', ''));
    line.checks.push(check(UI.codexGridBottom() <= LAY.codexTop + LAY.codexH, '图鉴网格在页面块内', ''));
    line.checks.push(check(UI.codexGridBottom() + S(16) <= UI.codexHint().y, '图鉴说明行在网格之下', ''));

    // 格内文字：名字 17px、副标题 12px（怪物取定位标签，炮台取「造价 · 攻击方式」）
    let widestName = 0, widestSub = 0;
    for (const k of allEnemies) {
      const info = G.Codex.enemy(k);
      widestName = Math.max(widestName, estW(info.name, F(17)));
      widestSub = Math.max(widestSub, estW(info.role, F(12)));
    }
    for (const k of allTowers) {
      const info = G.Codex.tower(k);
      widestName = Math.max(widestName, estW(info.name, F(17)));
      widestSub = Math.max(widestSub, estW(info.cost + ' · ' + info.kind, F(12)));
    }
    line.checks.push(check(widestName + S(16) <= cellsR[0].w, '图鉴格宽容得下最长名字',
      `需要 ${(widestName + S(16)).toFixed(0)} vs 格宽 ${cellsR[0].w}`));
    line.checks.push(check(widestSub + S(16) <= cellsR[0].w, '图鉴格宽容得下副标题',
      `需要 ${(widestSub + S(16)).toFixed(0)} vs 格宽 ${cellsR[0].w}`));
    /* 名称与副标题必须使用同源的格内锚点，且在最大字号下仍有独立行高。 */
    const cellText = typeof UI.codexCellText === 'function' ? UI.codexCellText(cellsR[0]) : null;
    line.checks.push(check(!!cellText, '图鉴格提供文字锚点', ''));
    if (cellText) {
      line.checks.push(check(cellText.nameY + F(17) / 2 + S(6) <= cellText.subY - F(12) / 2,
        '图鉴名称与副标题不遮盖', ''));
      line.checks.push(check(cellText.subY + F(12) / 2 <= cellsR[0].y + cellsR[0].h - S(8),
        '图鉴副标题不压格子底边', ''));
    }

    line.checks.push(check(G.Render && G.Render.TOWER_ICON_R >= 12,
      '炮台中央元素图标放大到清晰尺寸', String(G.Render && G.Render.TOWER_ICON_R)));
    line.checks.push(check(G.Render && G.Render.SHOW_TOWER_NETWORK === true,
      '同元素炮台渲染共振连线', String(G.Render && G.Render.SHOW_TOWER_NETWORK)));

    // 详情：四个块自上而下依次排开、不重叠、都在块内
    const heroR = UI.codexHero(), statR = UI.codexStatCells(),
      blkR = UI.codexBlock(), reactR = UI.codexReactBlock();
    line.checks.push(check(heroR.y >= LAY.codexTop + S(UI.CODEX_BODY_Y) - EPS, '图鉴头卡在内容区', ''));
    line.checks.push(check(statR[0].y >= heroR.y + heroR.h, '图鉴数值格在头卡之下', ''));
    line.checks.push(check(blkR.y >= statR[0].y + statR[0].h, '图鉴文字块在数值格之下', ''));
    line.checks.push(check(reactR.y >= blkR.y + blkR.h, '图鉴反应块在文字块之下', ''));
    line.checks.push(check(statR[3].x + statR[3].w <= 674 + EPS, '图鉴数值格横向在屏内', ''));
    const detBack = UI.codexDetailBack();
    line.checks.push(check(detBack.y >= reactR.y + reactR.h, '图鉴「返回列表」在反应块之下', ''));
    line.checks.push(check(detBack.y + detBack.h <= LAY.codexTop + LAY.codexH + EPS, '图鉴「返回列表」在页面块内',
      `按钮底 ${detBack.y + detBack.h} vs 块底 ${LAY.codexTop + LAY.codexH}`));

    /* 7i) 回响档案（图鉴第三页）：总览卡 → 三条解锁线 → 战功录 → 深渊开关 → 说明行。
     *     这一页刻意**不新开整屏版式**，而是塞进图鉴的第三个 tab —— 因为新页面的
     *     高度会进 pageNeed（= max(MENU_H, SET_H, HELP_H, OVER_H, CODEX_H, POP_H)），
     *     一旦超过 HELP_H(1150) 就会把短屏机型的整体缩放一起拉小，等于动战斗版式。
     *     下面这几条就是卡「全部内容都在 codexH 之内」的。 */
    const pfCard = UI.profileCard();
    const pfLines = CFG.UNLOCKS.map((_, i) => UI.profileLine(i));
    const pfBars = CFG.UNLOCKS.map((_, i) => UI.profileBar(i));
    const pfStats = UI.profileStats();
    const pfDeep = UI.profileDeepBtn();
    const pfBottom = LAY.codexTop + LAY.codexH;
    const pfLast = pfLines[pfLines.length - 1];

    line.checks.push(check(pfCard.y >= LAY.codexTop + S(UI.CODEX_BODY_Y) - EPS, '档案总览卡在内容区', ''));
    line.checks.push(check(pfLines.length === CFG.UNLOCKS.length, '档案解锁线条数与 CFG.UNLOCKS 一致', ''));
    let pfOut = 0, pfHit = 0;
    for (let i = 0; i < pfLines.length; i++) {
      if (pfLines[i].x < 40 - EPS || pfLines[i].x + pfLines[i].w > 680 + EPS) pfOut++;
      if (i > 0 && pfLines[i].y < pfLines[i - 1].y + pfLines[i - 1].h) pfHit++;
    }
    line.checks.push(check(pfOut === 0, '档案解锁线横向在屏内', ''));
    line.checks.push(check(pfHit === 0, '档案解锁线两两不重叠', String(pfHit)));
    line.checks.push(check(pfStats.y >= pfLast.y + pfLast.h, '战功录在解锁线之下',
      `${pfStats.y} vs ${pfLast.y + pfLast.h}`));
    line.checks.push(check(pfDeep.y >= pfStats.y + pfStats.h, '深渊开关在战功录之下', ''));
    line.checks.push(check(pfDeep.y + pfDeep.h <= pfBottom + EPS, '深渊开关在页面块内',
      `按钮底 ${pfDeep.y + pfDeep.h} vs 块底 ${pfBottom}`));
    line.checks.push(check(UI.codexHint().y >= pfDeep.y + pfDeep.h, '档案说明行在深渊开关之下', ''));
    /* 说明行按**基线**判在块内，不按文字半高 —— 它本来就是这个页面的最后一根基线，
     * 三个 tab 共用同一个 y（S(992)），而块高 S(1000) 只留 8 的余量；
     * 按半高（大号档 F(12)/2 = 12）量会差 3px，是假警。 */
    line.checks.push(check(UI.codexHint().y <= pfBottom + EPS, '档案说明行基线在页面块内',
      `${UI.codexHint().y} vs ${pfBottom}`));
    line.checks.push(check(pfBars[0].y + pfBars[0].h <= pfLines[0].y + pfLines[0].h + EPS, '档案进度条在解锁线之内', ''));

    /* 解锁线左右两列不叠字：左列是「名称 / 描述」，右列是「下一档门槛 / 档位标签」。
     * 两侧各自最宽的那一行决定了需要的宽度 —— 名称 17 号、标签 12 号、
     * 门槛文案 14 号，三条都要装得下且中间留 S(12) 的呼吸位。 */
    const pfOver = [];
    for (let i = 0; i < CFG.UNLOCKS.length; i++) {
      const ln = CFG.UNLOCKS[i], r = pfLines[i];
      const lastLbl = ln.tiers[ln.tiers.length - 1].label;
      const leftW = Math.max(estW(ln.name, F(17)), estW(ln.desc, F(12)));
      const rightW = Math.max(estW('下一档 9999 点', F(14)),
        estW(ln.tiers[0].label + ' / ' + lastLbl, F(12)));
      if (S(16) * 2 + leftW + S(12) + rightW > r.w) pfOver.push(ln.name);
    }
    line.checks.push(check(pfOver.length === 0, '档案解锁线左右两列不叠字', pfOver.join(', ')));

    // 头卡文字（名称 26 / 第二行 15 / 第三行 12）不越右边框
    const heroTx = heroR.x + S(172);
    const heroOver = [];
    for (const k of allEnemies) {
      const info = G.Codex.enemy(k);
      if (heroTx + estW(info.name, F(26)) > 674) heroOver.push('名:' + info.name);
      if (heroTx + estW(info.role, F(15)) > 674) heroOver.push('定位:' + info.name);
      if (heroTx + estW(info.tag, F(12)) > 674) heroOver.push('概括:' + info.name);
    }
    for (const k of allTowers) {
      const info = G.Codex.tower(k);
      if (heroTx + estW(info.name, F(26)) > 674) heroOver.push('名:' + info.name);
      if (heroTx + estW(info.elemName + '元素 · ' + info.kind, F(15)) > 674) heroOver.push('元素:' + info.name);
      if (heroTx + estW(info.cost + ' 能量 · ' + info.role, F(12)) > 674) heroOver.push('副行:' + info.name);
    }
    line.checks.push(check(heroOver.length === 0, '图鉴头卡文字不越出面板', heroOver.join(' | ')));

    // 文字块里的每一行
    const blkOver = [];
    for (const k of allEnemies) {
      for (const l of G.Codex.enemy(k).lines) {
        if (blkR.x + S(20) + estW(l, F(12)) > 674) blkOver.push(l);
      }
    }
    for (const k of allTowers) {
      for (const l of G.Codex.tower(k).lines) {
        if (blkR.x + S(20) + estW(l, F(12)) > 674) blkOver.push(l);
      }
    }
    line.checks.push(check(blkOver.length === 0, '图鉴文字块的行不越出面板', blkOver.join(' | ')));

    /* 反应行：左起「对手元素图标 + 元素名+反应名 + 效果」，右端右对齐「× 塔名」。
     * 三条要都放得下且互不相撞。列锚点读 UI.CODEX_REACT_COLS —— 渲染也是读它，
     * 所以这里量到的就是画出来的，不存在「自检按一套数、渲染按另一套数」。 */
    const rRow = UI.codexReactRow(0);
    const CO = UI.CODEX_REACT_COLS;
    const reactOver = [], reactTight = [];
    let maxRows = 0;
    for (const k of allTowers) {
      const info = G.Codex.tower(k);
      const rs = G.Codex.reactionsOf(info.elem);
      if (rs.length > maxRows) maxRows = rs.length;
      for (const r of rs) {
        const nameW = estW(CFG.ELEM[r.otherElem].name + ' ' + r.name, F(15));
        if (S(CO.nameX) + nameW + S(10) > S(CO.effectX)) reactTight.push(info.name + '/' + r.name);
        const tagW = estW(r.active ? ('× ' + r.otherTowerName) : '未上线', F(12));
        const rightLeft = reactR.x + reactR.w - S(16) - tagW;
        if (rRow.x + S(CO.effectX) + estW(r.effect, F(12)) > rightLeft - S(8)) reactOver.push(info.name + '/' + r.name);
      }
    }
    line.checks.push(check(maxRows <= 6, '元素反应条数 ≤ 6（反应块按 6 行预留）', String(maxRows)));
    line.checks.push(check(reactTight.length === 0, '反应名与效果两列不叠', reactTight.join(' | ')));
    line.checks.push(check(reactOver.length === 0, '反应效果文字不顶到右侧标注', reactOver.join(' | ')));
    const lastRow = UI.codexReactRow(Math.max(1, maxRows) - 1);
    line.checks.push(check(lastRow.y + lastRow.h <= reactR.y + reactR.h, '反应行都落在反应块内',
      `末行底 ${lastRow.y + lastRow.h} vs 块底 ${reactR.y + reactR.h}`));

    /* 7i) 「首次遭遇」弹窗：面板自上而下的每一块都要在面板内且不相压。
     *      形象那两条不用 r*k 估 —— 直接拿记账 ctx 把六只怪在弹窗里的真实位置
     *      画一遍量包围盒（脑袋/犄角会顶出身体半径，估是估不准的）。 */
    const pPanel = UI.popPanel(), pFig = UI.popFigure(), pStat = UI.popStatCells(),
      pBlk = UI.popBlock(), pOk = UI.popOk();
    line.checks.push(check(pPanel.x >= 40 - EPS && pPanel.x + pPanel.w <= 680 + EPS, '弹窗面板横向在屏内', ''));
    line.checks.push(check(pPanel.y >= (LAY.insetTop || 0) - EPS && pPanel.y + pPanel.h <= LAY.designH + EPS,
      '弹窗面板纵向在屏内', `块[${pPanel.y}, ${pPanel.y + pPanel.h}] vs 设计高 ${Math.round(LAY.designH)}`));
    const roleBottom = pPanel.y + S(UI.POP_LINES.role) + F(13) / 2;
    const tagTop = pPanel.y + S(UI.POP_LINES.tag) - F(13) / 2;
    const figTop = [], figBot = [], figSide = [];
    for (const k of allEnemies) {
      for (const t of PHASES) {
        const box = monBox(G, k, pFig.r, pFig.x, pFig.y, t);
        if (pFig.y - box.up < roleBottom + EPS) figTop.push(`${k} 形象顶 ${(pFig.y - box.up).toFixed(1)} vs 定位行底 ${roleBottom.toFixed(1)}`);
        if (pFig.y + box.down > tagTop - EPS) figBot.push(`${k} 形象底 ${(pFig.y + box.down).toFixed(1)} vs 概括行顶 ${tagTop.toFixed(1)}`);
        if (pFig.x - box.side < pPanel.x + S(16) || pFig.x + box.side > pPanel.x + pPanel.w - S(16)) {
          figSide.push(`${k} 形象半宽 ${box.side.toFixed(1)}`);
        }
      }
    }
    line.checks.push(check(figTop.length === 0, '弹窗形象不顶到定位标签', figTop.join(' | ')));
    line.checks.push(check(figBot.length === 0, '弹窗形象不压到一句话概括', figBot.join(' | ')));
    line.checks.push(check(figSide.length === 0, '弹窗形象不横向溢出面板', figSide.join(' | ')));
    line.checks.push(check(pStat[0].y >= tagTop + F(13) / 2 + S(6), '弹窗数值格在一句话概括之下', ''));
    line.checks.push(check(pBlk.y >= pStat[0].y + pStat[0].h, '弹窗要点块在数值格之下', ''));
    line.checks.push(check(pOk.y >= pBlk.y + pBlk.h, '弹窗按钮在要点块之下', ''));
    line.checks.push(check(pOk.y + pOk.h <= pPanel.y + pPanel.h - S(20), '弹窗按钮在面板内',
      `按钮底 ${pOk.y + pOk.h} vs 面板底 ${pPanel.y + pPanel.h}`));
    const popOver = [];
    const popMid = pPanel.x + pPanel.w / 2;
    for (const k of allEnemies) {
      const info = G.Codex.enemy(k);
      if (popMid + estW(info.name, F(26)) / 2 > pPanel.x + pPanel.w - S(24)) popOver.push('名:' + info.name);
      if (popMid + estW(info.role, F(13)) / 2 > pPanel.x + pPanel.w - S(24)) popOver.push('定位:' + info.name);
      if (popMid + estW(info.tag, F(13)) / 2 > pPanel.x + pPanel.w - S(24)) popOver.push('概括:' + info.name);
      for (const l of info.lines) {
        if (pBlk.x + S(18) + estW(l, F(12)) > pBlk.x + pBlk.w - S(16)) popOver.push(l);
      }
    }
    line.checks.push(check(popOver.length === 0, '弹窗文字不越出面板', popOver.join(' | ')));

    // 8) 建造栏不压 home 指示条
    line.checks.push(check(DY(LAY.barY + LAY.barH) <= screenH - homeInset + 1, '建造栏不压 home 条',
      `栏底 ${DY(LAY.barY + LAY.barH).toFixed(1)}px vs 安全线 ${(screenH - homeInset).toFixed(0)}px`));

    // 9) 棋盘左右不出设计区
    line.checks.push(check(LAY.boardX >= 0 && LAY.boardX + LAY.boardW <= 720, '棋盘横向在界内', ''));

    // 10) 安全区带来的尺寸损失不该超过 12%
    //     参照组 = 同一块屏幕 + 同一档字号，把状态栏/胶囊/home 条全部置 0 再跑一遍。
    //     历史口径是 ≤5%（仅状态栏 + home 条）。现主动把战斗 HUD 整体下移到胶囊下方
    //     （让右上角胶囊那一行完整让给系统 UI），这会额外吃掉顶部空间，短屏机型
    //     整体缩放再缩约 5~8%，故放宽到 ≤12%。真机短屏本就有黑边，影响有限。
    const bareE = env.wx ? wxEnv(env.w, env.h, env.screenH, 0, null, null) : env;
    const sBase = load(bareE, lv).Runtime.scale;
    line.checks.push(check(s >= sBase * 0.88, '安全区吃掉不超过 12% 的缩放',
      `缩放 ${s.toFixed(4)} vs 无安全区基准 ${sBase.toFixed(4)}`));

    /* 11) 浏览器路径 · 中档坐标锁：中档是全工程的基准，必须逐像素稳定。
     *      这几个数取自「回声条与主动技下线 + 卡片只剩 6 塔」这一版：
     *      HUD 右列顶格 680、开波按钮上移到 172、设置键挂在它右侧 176、
     *      卡片两行 3+3（卡宽 221）；改动布局时若无意动了别的东西，这里会立刻报出来。 */
    if (!env.wx && lv === 1) {
      const LOCK = {
        title: 36, sub: 74, hpLabel: 106,
        hpBarY: 122, waveBtnY: 184, settingsY: 187,
        hudRight: 680, contentTop: 268, boardY: 330, barY: 1302, designH: 1558,
        barH: 236, cardW: 221, cardH: 104
      };
      const now = {
        title: H.title, sub: H.sub, hpLabel: H.hpLabel,
        hpBarY: LAY.hpBar.y, waveBtnY: H.waveBtn.y, settingsY: LAY.settingsBtn.y,
        hudRight: H.hudRight, contentTop: LAY.contentTop,
        boardY: Math.round(LAY.boardY), barY: Math.round(LAY.barY),
        designH: Math.round(R.designH),
        barH: LAY.barH, cardW: LAY.cards[0].w, cardH: LAY.cards[0].h
      };
      const diff = Object.keys(LOCK).filter(k2 => now[k2] !== LOCK[k2]);
      line.checks.push(check(diff.length === 0, '中档浏览器路径逐像素不变（坐标锁）',
        diff.map(k2 => `${k2} ${LOCK[k2]}→${now[k2]}`).join(', ')));
    }

    rows.push(line);
  }
}

/* ---------------------- 输出 ---------------------- */
console.log('');
console.log('机型 · 字号档'.padEnd(30) + '布 局'.padEnd(7) + '缩 放'.padEnd(9) + '设计高'.padEnd(8) +
  '上留白'.padEnd(8) + '下留白'.padEnd(8) + '棋盘Y'.padEnd(7) + '栏Y'.padEnd(7) + '最小字');
console.log('-'.repeat(100));
for (const r of rows) {
  const i = r.info;
  console.log(
    r.name.padEnd(30) +
    String(i.layout).padEnd(7) +
    String(i.scale).padEnd(9) +
    String(i.designH).padEnd(8) +
    String(i.insetTop).padEnd(8) +
    String(i.insetBottom).padEnd(8) +
    String(i.boardY).padEnd(7) +
    String(i.barY).padEnd(7) +
    String(i.minFont) + 'px'
  );
}

console.log('');
let bad = 0;
for (const r of rows) {
  const bads = r.checks.filter(c => !c.ok);
  if (bads.length) {
    bad++;
    console.log('[FAIL] ' + r.name);
    for (const b of bads) console.log('       · ' + b.label + (b.detail ? '  —— ' + b.detail : ''));
  } else {
    console.log('[PASS] ' + r.name + '（' + r.checks.length + ' 项）');
  }
}

console.log('');
if (failures) {
  /* 结构断言（图标 / 怪物形象 / 图鉴数据 / 菜单绘制…）原来只在计数上加一，
   * 一条都不打 —— 失败时只看到「共 1 项未通过」，连是哪条都不知道。
   * 所以这里按「对象身份」挑出没进任何机型行的失败项，逐条打出来。 */
  const inRow = new Set();
  for (const r of rows) for (const c of r.checks) inRow.add(c);
  const structBad = allChecks.filter(c => !c.ok && !inRow.has(c));
  for (const b of structBad) console.log('       · ' + b.label + (b.detail ? '  —— ' + b.detail : ''));
  console.log(`>>> 共 ${failures} 项未通过`);
  process.exit(1);
} else {
  console.log(`>>> 全部通过：${rows.length} 组（${PROFILES.length} 机型 × ${LEVELS.length} 档字号）` +
    ` + ${checksTotal - rows.reduce((a, r) => a + r.checks.length, 0)} 项结构断言，` +
    `共 ${checksTotal} 项断言`);
}
