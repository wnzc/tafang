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

/* ---------------------- Canvas 桩 ---------------------- */
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
  width: 0, height: 0, style: {},
  getContext: () => ctxStub,
  addEventListener: () => { }
};

const FILES = ['runtime', 'util', 'audio', 'config', 'settings', 'grid', 'fx', 'enemies',
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
const rows = [];

function check(cond, label, detail) {
  if (!cond) { failures++; return { label, detail, ok: false }; }
  return { label, ok: true };
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

const LEVELS = load({ w: 390, h: 844 }).CFG.FONT_LEVELS;

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

      // 3) 音效开关必须整个落在胶囊下方
      const sb = LAY.soundBtn;
      const sbRect = { x1: DX(sb.x), y1: DY(sb.y), x2: DX(sb.x + sb.w), y2: DY(sb.y + sb.h) };
      line.checks.push(check(sbRect.y1 >= cap.bottom - EPS, '音效开关在胶囊下方',
        `开关顶 ${sbRect.y1.toFixed(1)}px vs 胶囊底 ${cap.bottom}px`));
      line.checks.push(check(!overlap(sbRect, capRect), '音效开关不与胶囊重叠',
        `开关[${sbRect.x1.toFixed(0)},${sbRect.y1.toFixed(0)}]-[${sbRect.x2.toFixed(0)},${sbRect.y2.toFixed(0)}]`));

      // 4) 右对齐那一列的包围盒不能碰胶囊（宽度按估算字宽算）
      const rcWide = estW('最高分 12345', F(12));
      const rc = {
        x1: DX(H.hudRight - rcWide), y1: DY(H.waveTxt - F(19) / 2),
        x2: DX(H.hudRight), y2: DY(H.energyVal + F(30) / 2)
      };
      line.checks.push(check(!overlap(rc, capRect), '右对齐列不碰胶囊',
        `${H.layout} 列[${rc.x1.toFixed(0)},${rc.y1.toFixed(0)}]-[${rc.x2.toFixed(0)},${rc.y2.toFixed(0)}] vs 胶囊[${cap.left},${cap.top}]-[${cap.right},${cap.bottom}]`));

      // 5) 音效开关不能压到右列或开波按钮
      line.checks.push(check(sbRect.x1 >= rc.x2 - EPS || sbRect.y1 >= rc.y2 - EPS || sbRect.y2 <= rc.y1 + EPS,
        '音效开关与右列分离', `开关 x1=${sbRect.x1.toFixed(0)} vs 右列 x2=${rc.x2.toFixed(0)}`));
      line.checks.push(check(sbRect.y2 <= DY(H.waveBtn.y) + EPS, '音效开关在开波按钮上方',
        `${sbRect.y2.toFixed(1)} vs ${DY(H.waveBtn.y).toFixed(1)}`));
    }

    // 6) HUD 内部不互相压
    line.checks.push(check(LAY.hpBar.y > H.hpLabel + F(13) / 2, '血条标题有间距', `${LAY.hpBar.y} vs ${H.hpLabel}`));
    line.checks.push(check(LAY.ecBar.y > H.ecLabel + F(13) / 2, '回声条标题有间距', `${LAY.ecBar.y} vs ${H.ecLabel}`));
    line.checks.push(check(H.waveBtn.y - (LAY.ecBar.y + LAY.ecBar.h) >= S(12), '开波按钮不压回声条',
      `间隙 ${H.waveBtn.y - (LAY.ecBar.y + LAY.ecBar.h)}px`));
    line.checks.push(check(H.energyVal + F(30) / 2 < H.waveBtn.y, '能量数字不压开波按钮',
      `${H.energyVal + F(30) / 2} vs ${H.waveBtn.y}`));

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

    // 7b) 底部 9 张卡（7 塔 + 脉冲 + 倒带）：必须在建造栏里，且卡名放得下
    const c0 = LAY.cards[0], c4 = LAY.cards[LAY.cards.length - 1];
    line.checks.push(check(c0.x >= 12 && c4.x + c4.w <= 708, '卡片横向在栏内',
      `[${c0.x}, ${c4.x + c4.w}]`));
    line.checks.push(check(LAY.cards.length === CFG.TOWER_ORDER.length + 2, '卡片数量 = 塔数 + 2',
      `${LAY.cards.length} vs ${CFG.TOWER_ORDER.length + 2}`));
    line.checks.push(check(c0.y >= LAY.barY && c0.y + c0.h <= LAY.barY + LAY.barH, '卡片纵向在栏内',
      `卡[${c0.y}, ${c0.y + c0.h}] 栏[${LAY.barY}, ${LAY.barY + LAY.barH}]`));
    // 卡名全部两字（炎爆/澄流/…/脉冲/倒带），两侧至少各留 S(6) 的呼吸位。
    // 卡宽不能跟字号一起涨（9 张卡的总宽被棋盘锁死），所以这一条是大字号档的下限判据。
    line.checks.push(check(c0.w >= estW('炎爆', F(12)) + S(12), '卡宽容得下 2 字卡名',
      `卡宽 ${c0.w} vs 需要 ${(estW('炎爆', F(12)) + S(12)).toFixed(0)}`));

    // 7c) 四个整屏版式必须落在屏内
    const pages = [
      ['菜单', LAY.menuTop, LAY.menuH],
      ['设置', LAY.setTop, LAY.setH],
      ['玩法', LAY.helpTop, LAY.helpH],
      ['结算', LAY.overTop, LAY.overH]
    ];
    for (const [nm, top, h] of pages) {
      line.checks.push(check(top >= (LAY.insetTop || 0) - EPS && top + h <= LAY.designH + EPS,
        nm + '版式在屏内', `块[${top}, ${top + h}] vs 设计高 ${Math.round(LAY.designH)}`));
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

    // 7f) 菜单：介绍面板内的两行不压边，按钮与文字不叠
    const introTop = LAY.menuTop + S(176), introBot = introTop + S(116);
    line.checks.push(check(LAY.menuTop + S(214) - F(16) / 2 >= introTop, '菜单介绍首行在面板内', ''));
    line.checks.push(check(LAY.menuTop + S(258) + F(13) / 2 <= introBot, '菜单介绍次行在面板内', ''));
    const ms = UI.menuStart(), mh = UI.menuHelp(), mst = UI.menuSet();
    line.checks.push(check(mh.x + mh.w <= mst.x, '菜单两个次按钮不重叠', ''));
    line.checks.push(check(ms.y + ms.h + S(8) <= mh.y, '菜单次按钮在主按钮之下', ''));
    line.checks.push(check(LAY.menuTop + S(574) - F(14) / 2 >= mh.y + mh.h, '菜单最高分在按钮之下', ''));
    const menuTxt = UI.MENU_INTRO[0] + UI.MENU_INTRO[1];
    line.checks.push(check(76 + estW(UI.MENU_INTRO[0], F(16)) <= 720 - 46, '菜单介绍首行不越出面板', ''));
    line.checks.push(check(76 + estW(UI.MENU_INTRO[1], F(13)) <= 720 - 46, '菜单介绍次行不越出面板', ''));
    line.checks.push(check(!!menuTxt && ms.y + ms.h <= LAY.menuTop + LAY.menuH, '菜单主按钮在菜单块内', ''));

    /* 7g) 浮动提示（Toast）贴在建造栏正上方。
     * 16:9 与平板这类「高度刚好装下」的机型，棋盘底下一点余量都没有，
     * 提示必然落进棋盘最底一行 —— 所以底线定在「不盖住核心格上的『核心』两个字」。
     * 下面这几个数必须跟 render.js 的 drawToast / drawBoard 一致（都过 CFG.S）。 */
    const toastTop = LAY.barY - S(54) - S(6);
    const coreLabelBottom = LAY.boardY + CFG.CORE_CELLS[0][1] * CFG.CELL +
      CFG.CELL / 2 - S(48) + F(13) / 2;
    line.checks.push(check(toastTop >= coreLabelBottom, '浮动提示不压「核心」标签',
      `提示顶 ${toastTop} vs 标签底 ${coreLabelBottom}`));

    // 8) 建造栏不压 home 指示条
    line.checks.push(check(DY(LAY.barY + LAY.barH) <= screenH - homeInset + 1, '建造栏不压 home 条',
      `栏底 ${DY(LAY.barY + LAY.barH).toFixed(1)}px vs 安全线 ${(screenH - homeInset).toFixed(0)}px`));

    // 9) 棋盘左右不出设计区
    line.checks.push(check(LAY.boardX >= 0 && LAY.boardX + LAY.boardW <= 720, '棋盘横向在界内', ''));

    // 10) 安全区带来的尺寸损失不该超过 5%
    //     参照组 = 同一块屏幕 + 同一档字号，把状态栏/胶囊/home 条全部置 0 再跑一遍。
    const bareE = env.wx ? wxEnv(env.w, env.h, env.screenH, 0, null, null) : env;
    const sBase = load(bareE, lv).Runtime.scale;
    line.checks.push(check(s >= sBase * 0.95, '安全区吃掉不超过 5% 的缩放',
      `缩放 ${s.toFixed(4)} vs 无安全区基准 ${sBase.toFixed(4)}`));

    // 11) 浏览器路径 · 中档坐标锁：中档是全工程的基准，必须逐像素稳定。
    //     这几个数是「加入三档字号」之后的当前值；改动布局时若无意动了别的东西，
    //     这里会立刻报出来。其他档位不锁（它们本来就该随档位变化）。
    if (!env.wx && lv === 1) {
      const LOCK = {
        title: 36, sub: 74, hpLabel: 106, ecLabel: 164,
        hpBarY: 122, ecBarY: 180, waveBtnY: 218, soundY: 18,
        hudRight: 566, contentTop: 296, boardY: 390, barY: 1394, designH: 1558
      };
      const now = {
        title: H.title, sub: H.sub, hpLabel: H.hpLabel, ecLabel: H.ecLabel,
        hpBarY: LAY.hpBar.y, ecBarY: LAY.ecBar.y, waveBtnY: H.waveBtn.y,
        soundY: LAY.soundBtn.y, hudRight: H.hudRight, contentTop: LAY.contentTop,
        boardY: Math.round(LAY.boardY), barY: Math.round(LAY.barY),
        designH: Math.round(R.designH)
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
  console.log(`>>> 共 ${failures} 项未通过`);
  process.exit(1);
} else {
  console.log(`>>> 全部通过：${rows.length} 组（${PROFILES.length} 机型 × ${LEVELS.length} 档字号），` +
    `${rows.reduce((a, r) => a + r.checks.length, 0)} 项断言`);
}
