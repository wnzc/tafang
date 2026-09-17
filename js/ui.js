/**
 * ui.js —— 界面几何与命中区（渲染与输入共用同一份坐标）
 *
 * 所有尺寸都过 CFG.S()：它乘的是当前字号档的布局倍率，
 * 所以「设置页切成大字号」时，字和盒子会一起长大，不会字大框小互相压。
 * 中档 k=1 是恒等映射 —— 历史坐标逐像素不变。
 *
 * 玩法页的正文（UI.HELP）也放在这里，因为它是**版式的一部分**：
 * 渲染按它排版，自检按它验高度，改文案不能只改一边。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, U = G.Util;

  var UI = G.UI = {};

  UI.init = function () { /* 预留 */ };

  function S(v) { return CFG.S(v); }

  /** 居中横放一个宽 w 的块 */
  function mid(w) { return Math.round((720 - w) / 2); }

  /** 音效开关（右上角，任何界面都能点：游戏中的快捷静音） */
  UI.soundBtn = function () {
    return G.LAY.soundBtn;
  };

  /** 底部九张卡：七元素塔 + 脉冲 + 倒带（顺序跟 CFG.TOWER_ORDER 走） */
  UI.cardKind = function (i) {
    if (i < CFG.TOWER_ORDER.length) return { type: 'tower', key: CFG.TOWER_ORDER[i] };
    if (i === CFG.TOWER_ORDER.length) return { type: 'pulse' };
    return { type: 'echo' };
  };

  UI.towerPanel = function (t) {
    var LAY = G.LAY;
    // 面板尺寸跟着字号档走：29px 标题 + 21px 属性 + 40px 按钮
    // 宽必须容得下「伤害 152 · 射程 168」加右对齐的「共振链 ×7」两段不叠字
    var w = S(280), h = S(116), pad = S(12);
    var x = U.clamp(t.x - w / 2, LAY.boardX + 4, LAY.boardX + LAY.boardW - w - 4);
    var y = t.y - CFG.CELL / 2 - h - 8;
    if (y < LAY.boardY + 4) y = t.y + CFG.CELL / 2 + 8;
    if (y + h > LAY.boardY + LAY.boardH - 4) y = LAY.boardY + LAY.boardH - h - 4;
    var bw = S(124), bh = S(40), by = y + S(70);
    return {
      x: x, y: y, w: w, h: h,
      up: { x: x + pad, y: by, w: bw, h: bh },
      sell: { x: x + w - pad - bw, y: by, w: bw, h: bh }
    };
  };

  /* ------------------------------------------------------------------ */
  /*  菜单 / 结算（位置挂在整块版式顶端，config.buildLayout 已按内容高度居中） */
  /* ------------------------------------------------------------------ */
  UI.menuStart = function () {
    return { x: mid(256), y: G.LAY.menuTop + S(340), w: 256, h: S(88) };
  };
  UI.menuHelp = function () {
    return { x: 98, y: G.LAY.menuTop + S(452), w: 252, h: S(72) };
  };
  UI.menuSet = function () {
    return { x: 370, y: G.LAY.menuTop + S(452), w: 252, h: S(72) };
  };
  UI.againBtn = function () {
    return { x: mid(256), y: G.LAY.overTop + S(424), w: 256, h: S(88) };
  };

  /* ------------------------------------------------------------------ */
  /*  设置页                                                              */
  /*  四行：字体大小 / 音效 / 音量 / 震动，行高与间距都由 S() 定            */
  /* ------------------------------------------------------------------ */
  UI.SET_ROWS = ['font', 'sound', 'volume', 'vibrate'];
  /* 行标签与说明。说明刻意压到 8 个字以内：大字号档下控件会被往左推，
   * 说明再长就顶到 − 号上了（layout-check 有一条按估算字宽量的断言盯着）。 */
  UI.SET_LABEL = ['字体大小', '音效', '音量', '震动'];
  UI.SET_HINT = ['影响所有界面文字', '关闭即完全静音', '调整音效响度', '操作时的触感'];
  UI.SET_PREVIEW = '预览：回声防线 · 第 20 波';
  UI.SET_PREVIEW_RIGHT = '当前：';
  /* 菜单上的游戏介绍：只留两句，详细规则在 UI.HELP */
  UI.MENU_INTRO = [
    '敌人会绕开你造的塔 —— 边打边造迷宫',
    '守住核心，撑过 20 波。完整规则见「玩法」'
  ];

  UI.setRow = function (i) {
    return {
      x: 46, y: G.LAY.setTop + S(120 + i * 104), w: 628, h: S(92)
    };
  };
  /** 行内控件的右边界：所有控件都贴这条线右对齐，字号一变也不会挤到标签上 */
  function rowRight(r) { return r.x + r.w - S(20); }

  /** 字体档位：三选一 */
  UI.setFontBtns = function () {
    var r = UI.setRow(0);
    var w = S(76), gap = S(8), n = CFG.FONT_LEVELS.length;
    var right = rowRight(r);
    var x0 = right - (n * w + (n - 1) * gap);
    var y = r.y + (r.h - S(56)) / 2;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ x: x0 + i * (w + gap), y: y, w: w, h: S(56), idx: i });
    return out;
  };

  /** 音效 / 震动共用的开关按钮 */
  UI.setToggle = function (i) {
    var r = UI.setRow(i);
    var w = S(110), h = S(56);
    return { x: rowRight(r) - w, y: r.y + (r.h - h) / 2, w: w, h: h };
  };

  /** 音量：− / 轨道 / ＋。轨道同时是可点可拖的区域 */
  UI.volTrack = function () {
    var r = UI.setRow(2);
    var w = S(158), h = S(56);
    return { x: rowRight(r) - S(56) - S(12) - w, y: r.y + (r.h - h) / 2, w: w, h: h };
  };
  UI.volMinus = function () {
    var r = UI.setRow(2), t = UI.volTrack(), w = S(56), h = S(56);
    return { x: t.x - S(12) - w, y: r.y + (r.h - h) / 2, w: w, h: h };
  };
  UI.volPlus = function () {
    var r = UI.setRow(2), t = UI.volTrack(), w = S(56), h = S(56);
    return { x: t.x + t.w + S(12), y: r.y + (r.h - h) / 2, w: w, h: h };
  };
  /** 音量条上真正画进度的那一段（左右各留一点圆角余量） */
  UI.volInner = function () {
    var t = UI.volTrack();
    return { x: t.x + S(10), y: t.y, w: t.w - S(20), h: t.h };
  };
  /** 字号预览条 */
  UI.setPreview = function () {
    return { x: 46, y: G.LAY.setTop + S(540), w: 628, h: S(60) };
  };
  UI.setBack = function () {
    return { x: mid(256), y: G.LAY.setTop + S(622), w: 256, h: S(80) };
  };

  /* ------------------------------------------------------------------ */
  /*  玩法页                                                              */
  /* ------------------------------------------------------------------ */
  /** 顶部右边的返回药丸：放在标题同一行，版式因此不必为按钮再长一截 */
  UI.helpBack = function () {
    return { x: 720 - 46 - 170, y: G.LAY.helpTop + S(24), w: 170, h: S(56) };
  };

  /* 玩法正文。行数直接决定版式高度（见 helpSections 与 config 的 HELP_H），
   * 所以每一行都控制在 21 个汉字以内 —— 再长在大字号下会顶到右边框。
   * 这里刻意写得比菜单详细：菜单只讲「这是什么游戏」，规则在这里讲清。 */
  UI.HELP = [
    { t: '目标', lines: [
      '守住核心，撑过 20 波（第 20 波是 Boss）',
      '核心完整度 100，漏一个怪就扣，扣光即失败'
    ] },
    { t: '建造即造迷宫', lines: [
      '点底部卡片选塔，再点棋盘空格放下',
      '塔占格即成为墙，敌人会实时重新寻路绕开你',
      '完全封死时，它们会直接拆塔（塔有血量）'
    ] },
    { t: '七元素炮塔', lines: [
      '火直射 · 水/冰减速波 · 雷连锁闪电',
      '风龙卷推开 · 岩重击定身 · 草落孢毒域'
    ] },
    { t: '元素共振 · 成链', lines: [
      '同元素相邻自动成链，链内每多 1 座塔',
      '伤害 +16%、攻速 +8%，最多叠 7 座'
    ] },
    { t: '元素反应 · 对齐原神', lines: [
      '火+水=蒸发 · 火+冰=融化：高爆发',
      '火+雷=超载：爆炸并跳电弧',
      '水+雷=感电 · 冰+雷=超导（易伤）',
      '水+冰=冻结：范围定身',
      '风+任意=扩散 · 岩+任意=结晶护盾',
      '草+水=绽放 · 草+雷=激化 · 草+火=燃烧'
    ] },
    { t: '能量与升级', lines: [
      '击杀与清波获得能量，用来建塔和升级',
      '每级 +32% 伤害；回收塔返还 70% 造价'
    ] },
    { t: '主动技与倒带', lines: [
      '脉冲：40 能量，范围伤害 + 定身 1.3 秒',
      '倒带：战场回退 4 秒，敌人提速 18%'
    ] },
    { t: '提前开波', lines: [
      '备战 12 秒，提前开波每秒 +3 能量',
      '另有 25 能量起步奖励'
    ] }
  ];

  /** 逐节算出实际坐标（渲染与自检共用，避免两边各算一遍算岔） */
  UI.helpSections = function () {
    var top = G.LAY.helpTop + S(120);
    var out = [];
    for (var i = 0; i < UI.HELP.length; i++) {
      var lines = UI.HELP[i].lines.length;
      var h = S(52 + lines * 24 + 12);
      out.push({ y: top, h: h, title: UI.HELP[i].t, lines: UI.HELP[i].lines, idx: i });
      top += h;
    }
    return out;
  };
  /** 玩法正文的底边（自检用：必须落在 helpTop + helpH 之内） */
  UI.helpContentBottom = function () {
    var s = UI.helpSections();
    return s.length ? s[s.length - 1].y + s[s.length - 1].h : G.LAY.helpTop;
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
