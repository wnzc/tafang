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

  /** 底部卡片：上场元素塔 + 脉冲 + 倒带（顺序跟 CFG.TOWER_ORDER 走，塔数变了这里不用改） */
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
  /* 三个次级按钮并排：玩法 / 图鉴 / 设置。
   * 从两个（252 宽）改成三个（196 宽）：三块加两道间距正好 628，
   * 与上面的介绍面板同宽对齐；两字标签在 196 里很宽松，大字号档也不会顶边。
   *
   * **这张表是唯一的一份**：渲染遍历它画、命中遍历它判，谁也不用自己记坐标。
   * 早先三处各写一遍（几何在 ui、绘制在 render、命中在 main），加「图鉴」时就漏了 render —— 
   * 按钮点得到却看不见，纯几何断言一条都查不出来。 */
  var SUB_W = 196, SUB_GAP = 20;
  function subBtn(i) {
    return { x: 46 + i * (SUB_W + SUB_GAP), y: G.LAY.menuTop + S(452), w: SUB_W, h: S(72) };
  }
  UI.menuSubBtns = function () {
    return [
      { key: 'help', label: '玩法说明', color: '#5fc8ff', rect: subBtn(0) },
      { key: 'codex', label: '图鉴', color: '#ffd27a', rect: subBtn(1) },
      { key: 'set', label: '设置', color: '#b06bff', rect: subBtn(2) }
    ];
  };
  UI.menuHelp = function () { return subBtn(0); };
  UI.menuCodex = function () { return subBtn(1); };
  UI.menuSet = function () { return subBtn(2); };
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
    { t: '六元素炮塔', lines: [
      '火直射 · 水减速波 · 雷连锁闪电',
      '风龙卷推开 · 岩重击定身 · 草落孢毒域'
    ] },
    { t: '元素共振 · 成链', lines: [
      '同元素相邻自动成链，链内每多 1 座塔',
      '伤害 +16%、攻速 +8%，最多叠 7 座'
    ] },
    { t: '元素反应 · 对齐原神', lines: [
      '火+水=蒸发：白热汽爆，高爆发',
      '火+雷=超载：爆炸并跳电弧',
      '水+雷=感电：闪电在怪群间跳跃',
      '风+任意=扩散：扯出元素并击退',
      '岩+任意=结晶：给邻塔上护盾',
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

  /* ------------------------------------------------------------------ */
  /*  图鉴页                                                              */
  /*  两个 Tab（怪物 / 炮台），每个 Tab 两种视图：列表（3×2 网格）与详情。  */
  /*  几何全部在这里算，渲染与输入共用 —— 格子与它内部的字号是两套曲线    */
  /*  （S 与 F），分开算迟早会错位。                                       */
  /* ------------------------------------------------------------------ */
  UI.CODEX_TABS = ['怪物', '炮台'];
  /** 内容区顶边（相对 codexTop）：页头 + 分隔线 + Tab 条之下 */
  UI.CODEX_BODY_Y = 198;
  /** 列表网格 3 列 × 2 行 */
  UI.CODEX_COLS = 3;
  UI.CODEX_ROWS = 2;

  /** 回菜单（页头右上，与玩法页的返回药丸同款同位） */
  UI.codexBack = function () {
    return { x: 720 - 46 - 170, y: G.LAY.codexTop + S(24), w: 170, h: S(56) };
  };

  UI.codexTabs = function () {
    var w = 300, gap = S(12), n = UI.CODEX_TABS.length;
    var x0 = Math.round((720 - (n * w + (n - 1) * gap)) / 2);
    var y = G.LAY.codexTop + S(118);
    var out = [];
    for (var i = 0; i < n; i++) out.push({ x: x0 + i * (w + gap), y: y, w: w, h: S(64), idx: i });
    return out;
  };

  /** 列表里的第 i 格（3 列 × 2 行铺开，左右各留 40）。不足一格也按格算。 */
  UI.codexCell = function (i) {
    var n = UI.CODEX_COLS, gap = S(14), left = 40;
    var w = Math.floor((720 - left * 2 - (n - 1) * gap) / n);
    var h = S(230);
    return {
      x: left + (i % n) * (w + gap),
      y: G.LAY.codexTop + S(UI.CODEX_BODY_Y) + Math.floor(i / n) * (h + gap),
      w: w, h: h, idx: i
    };
  };
  /** 列表网格的底边（自检用） */
  UI.codexGridBottom = function () {
    var c = UI.codexCell(UI.CODEX_COLS * UI.CODEX_ROWS - 1);
    return c.y + c.h;
  };
  /** 列表下方的说明行 */
  UI.codexHint = function () {
    return { y: G.LAY.codexTop + S(716) };
  };

  /* —— 详情视图 —— */
  /** 头部卡：左侧图标/形象，右侧名称、定位、造价 */
  UI.codexHero = function () {
    return { x: 46, y: G.LAY.codexTop + S(UI.CODEX_BODY_Y), w: 628, h: S(168) };
  };
  /** 数值格：一行四格（生命/速度/护甲/赏金，或伤害/射程/攻速/耐久） */
  UI.codexStatCells = function () {
    var r = UI.codexHero();
    var y = r.y + r.h + S(14), w = 628, n = 4;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ x: 46 + i * (w / n), y: y, w: w / n, h: S(78), idx: i });
    return out;
  };
  /** 文字块（怪物=特性，炮台=攻击方式） */
  UI.codexBlock = function () {
    var c = UI.codexStatCells();
    return { x: 46, y: c[0].y + c[0].h + S(14), w: 628, h: S(96) };
  };
  /** 炮台详情的元素反应块：标题 + 最多 6 行 */
  UI.CODEX_REACT_H = 272;
  UI.codexReactBlock = function () {
    var b = UI.codexBlock();
    return { x: 46, y: b.y + b.h + S(14), w: 628, h: S(UI.CODEX_REACT_H) };
  };
  /** 反应块里第 i 行的文字起点与可用宽度（自检量宽度用） */
  UI.codexReactRow = function (i) {
    var b = UI.codexReactBlock();
    return { x: b.x + S(16), y: b.y + S(44) + i * S(38), w: b.w - S(32), h: S(34), idx: i };
  };
  /* 反应行的三列锚点（相对 row.x）：对手元素图标 / 「元素 反应名」 / 效果文字。
   * 右侧还有一列右对齐的「× 塔名」或「未上线」。
   *
   * 这三个数是量出来的，不是估的 —— 图鉴面板宽 628 是**定值**（不过 CFG.S），
   * 字却跟着档位涨，所以大号档最挤：效果列在「大」下只剩约 13.9 em 的余量。
   *   名字列：需要 S(nameX)+nameW+S(10) ≤ S(effectX)。
   *     名宽（「水 蒸发」）小 81.7 / 中 92.3 / 大 103.0（估宽），最紧的是小号档，
   *     所以 effectX 不能小于 149 —— 取 150。
   *   效果列：需要 S(effectX)+效果宽 ≤ 右标注左沿-S(8)。
   *     最长的一条是大号档下的「燃烧」13.05 em（改文案时按这个上限卡）。
   * 渲染与自检都读这一份，避免各写一个数、改一处忘一处。 */
  UI.CODEX_REACT_COLS = { icon: 18, side: 13, nameX: 44, effectX: 150 };
  /** 详情里的「返回列表」按钮。刻意与列表视图的说明行不在同一位置，
   *  但两者都在块高之内 —— 自检会各量一次。 */
  UI.codexDetailBack = function () {
    return { x: mid(256), y: G.LAY.codexTop + S(888), w: 256, h: S(76) };
  };

  /* ------------------------------------------------------------------ */
  /*  「首次遭遇」弹窗                                                    */
  /*  战斗中被新怪触发：半透明遮罩 + 面板，面板下的战场仍在（暂停但可见）， */
  /*  所以这里的每一块都要落在 popH 之内，别把按钮顶出屏幕。               */
  /* ------------------------------------------------------------------ */
  UI.popPanel = function () {
    return { x: 48, y: G.LAY.popTop, w: 624, h: G.LAY.popH };
  };
  /* 弹窗里的四行文字锚点（相对面板顶）。渲染和自检都读这一份：
   * 形象要躲开「定位」行、又不能压到「一句话概括」，两处都按这几个数算。
   * 「一句话概括」以下的三块（数值格 / 要点 / 按钮）在面板加高到 760 时
   * 一起下移了 60 —— 让出来的那段纵向空间全给形象。 */
  UI.POP_LINES = { title: 52, name: 104, role: 142, tag: 356, statY: 380, blockY: 472, okY: 630 };
  /** 弹窗里的怪物形象圆心与半径。
   *  形象不是一个圆：脑袋、耳朵、犄角会顶出身体半径，实测外扩上限见 CFG.MON_EXTENT
   *  （最高的游荡体到 1.44r）。所以圆心不能拍脑袋写 —— 这里按「上躲定位行、
   *  下躲概括行」的剩余空隙取中点，两边各留 S(8)。
   *  r = 56 是「塞得下的最大值」：再大一点，最高的那只怪就会顶到定位行。 */
  UI.popFigure = function () {
    var p = UI.popPanel(), L = UI.POP_LINES, e = CFG.MON_EXTENT;
    var r = S(56);
    var top = p.y + S(L.role) + CFG.FS(13) / 2 + S(8);   // 视觉盒顶要≥这里
    var bot = p.y + S(L.tag) - CFG.FS(13) / 2 - S(8);    // 视觉盒底要≤这里
    var y = Math.round((top + e.up * r + bot - e.down * r) / 2);
    return { x: p.x + p.w / 2, y: y, r: r };
  };
  /** 弹窗数值格：一行四格 */
  UI.popStatCells = function () {
    var p = UI.popPanel();
    var y = p.y + S(UI.POP_LINES.statY), w = p.w - S(60), x0 = p.x + S(30), n = 4;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ x: x0 + i * (w / n), y: y, w: w / n, h: S(76), idx: i });
    return out;
  };
  /** 弹窗里的特性块 */
  UI.popBlock = function () {
    return { x: 48 + S(30), y: G.LAY.popTop + S(UI.POP_LINES.blockY), w: 624 - S(60), h: S(120) };
  };
  /** 「继续」按钮：关掉弹窗、解除暂停 */
  UI.popOk = function () {
    return { x: mid(256), y: G.LAY.popTop + S(UI.POP_LINES.okY), w: 256, h: S(76) };
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
