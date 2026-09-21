/**
 * render.js —— 全部绘制
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, U = G.Util, R = G.Runtime;

  var Render = G.Render = {};
  /* 图标比旧版 7px 明显增大，但仍保留炮管与冷却环的轮廓。 */
  Render.TOWER_ICON_R = 12;
  /* 元素反应只在被命中的怪物处呈现，炮台之间不绘制网络或节点特效。 */
  Render.SHOW_TOWER_NETWORK = false;

  /* 字号统一入口：调用点写基础字号，这里查当前档位的字号表。
   * 全工程只有这两个函数 + fx.js 的飘字会设置 ctx.font，
   * 所以切档位时不会漏掉任何一处。 */
  function fontOf(size, weight) {
    return (weight || '') + ' ' + CFG.FS(size) + 'px sans-serif';
  }

  /* 布局尺寸统一入口：与字号同源（同一个 LAY_K），
   * 所以「字变大」时行距、盒子、内边距一起变大，不会互相压。 */
  function S(v) { return CFG.S(v); }

  function txt(ctx, s, x, y, size, color, align, weight) {
    ctx.font = fontOf(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }

  function stroke(ctx, s, x, y, size, color, align, weight, lw) {
    ctx.font = fontOf(size, weight);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 4;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.strokeText(s, x, y);
  }

  function bar(ctx, x, y, w, h, pct, c1, c2, bg) {
    U.roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = bg || CFG.C.barTrack;
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,220,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    pct = U.clamp(pct, 0, 1);
    if (pct > 0.001) {
      var g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2 || c1);
      U.roundRect(ctx, x, y, Math.max(h, w * pct), h, h / 2);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  /* 七元素图标：矢量路径数据直接在 G.Icons 里画（见 js/icons.js），
   * 不再自己描形状——自己画的「像不像」永远是个问题。
   * 着色也交给 G.Icons.draw（缺省取元素色），调用处不用管 fillStyle。
   * 传 color 可覆盖（例如塔身核心要压浅色保证对比度）。 */
  function elemIcon(ctx, elem, cx, cy, r, color) {
    return !!(G.Icons && G.Icons.draw(ctx, elem, cx, cy, r, color));
  }

  /* ------------------------------------------------------------------ */
  /*  怪物血条与「反应名」标签的几何                                        */
  /* ------------------------------------------------------------------ */
  /* 这两块是**渲染与自检共用的一份数**：layout-check 的「怪物形象不顶到血条」
   * 断言直接调 Render.barRect()，不再两边各写一个 13 和 5
   * （原来断言里硬编码的 5 与 drawEnemies 里的 5 是两处，改一处就会悄悄失准）。
   *
   * 为什么首领要单独一套 gap（13 → 25）：
   * 首领的体型最大（r=27），血条要显示「1600 / 1600」这种数字就必须更厚。
   * 加厚只能往下长，而往下就是它的脑袋 —— 所以先把整条槽**往上挪** 12，
   * 腾出位置再加厚。gap 与 h 是一对，改一个必须看另一个。
   */
  var BAR = Render.BAR = {
    gap: 13,        // 血条顶边离身体半径顶点的距离（普通怪）
    h: 6,           // 血条厚度（5 → 6：手机上实际只有 3 个物理像素，5 太细）
    wMin: 26,       // 最小宽度（小体型怪也不至于细成一根线）
    wRatio: 2.4,    // 宽度 = r × 这个系数（与最小宽度取大）
    bossGap: 25,    // 首领专用的 gap
    bossH: 14,      // 首领血条厚度（要装得下血量数字）
    bossW: 96,
    bossNumFont: 12
  };

  /** 某只怪的血条矩形（x 以怪为原点算，y 是槽顶边） */
  Render.barRect = function (e) {
    var boss = !!(e.def && e.def.boss);
    var w = boss ? Math.max(BAR.bossW, e.r * BAR.wRatio) : Math.max(BAR.wMin, e.r * BAR.wRatio);
    var h = boss ? BAR.bossH : BAR.h;
    var gap = boss ? BAR.bossGap : BAR.gap;
    return { x: e.x - w / 2, y: e.y - e.r - gap, w: w, h: h, boss: boss };
  };

  /* 「刚被什么反应打中」的标签：贴在血条上方的一条小胶囊。
   * 高度按字号档走（它是文字），而血条不走 —— 血条属于棋盘坐标，
   * 棋盘格子不随字号变，血条跟着变粗就会压到怪。 */
  var TAG = Render.TAG = { font: 12, h: 20, padX: 8, gapAboveBar: 4 };

  /* ------------------------------------------------------------------ */

  Render.draw = function (game) {
    var ctx = R.ctx;
    if (!ctx) return;
    var LAY = G.LAY;
    R.applyTransform(ctx);

    /* 底色：深海军蓝的竖向渐变 + 中上部一片很淡的冷光。
     * 纯色底在手机上会显得又平又闷（也容易和塔身、怪物糊成一片），
     * 一层几乎看不见的光晕就能把层次带出来，而且不抢任何元素的对比度。 */
    var g = ctx.createLinearGradient(0, -300, 0, LAY.designH + 300);
    g.addColorStop(0, CFG.C.bg0);
    g.addColorStop(0.45, CFG.C.bg1);
    g.addColorStop(1, CFG.C.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(-400, -500, 1520, LAY.designH + 1000);

    var gx = 360, gy = LAY.designH * 0.34, gr = LAY.designH * 0.78;
    var glow = ctx.createRadialGradient(gx, gy, 40, gx, gy, gr);
    glow.addColorStop(0, 'rgba(122,172,255,0.11)');
    glow.addColorStop(0.55, 'rgba(122,172,255,0.045)');
    glow.addColorStop(1, 'rgba(122,172,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-400, -500, 1520, LAY.designH + 1000);

    var sx = 0, sy = 0;
    if (game.shake > 0) { sx = U.rand(-1, 1) * game.shake; sy = U.rand(-1, 1) * game.shake; }

    ctx.save();
    ctx.translate(sx, sy);
    drawBoard(ctx, game, LAY);
    drawTowers(ctx, game, LAY);
    if (Render.SHOW_TOWER_NETWORK) {
      drawLinks(ctx, game);
      drawNodes(ctx, game);
    }
    drawEnemies(ctx, game);
    drawBullets(ctx, game);
    G.FX.draw(ctx);
    ctx.restore();

    /* playing：底部建造栏、选中面板、提示照常画。
     * 「首次遭遇」弹窗（pop）也走这里 —— 它是「被暂停的画面」，
     * 玩家该看到完整的战场，弹窗只是叠在上面的一层。 */
    var playing = (game.state === 'prep' || game.state === 'wave' || game.state === 'pop');
    /* paging：整屏版式，连 HUD 都不画（图鉴页整块盖住屏幕，也在此列） */
    var paging = (game.state === 'menu' || game.state === 'set' ||
      game.state === 'help' || game.state === 'codex');
    if (!paging) drawHUD(ctx, game, LAY);
    if (playing) {
      drawBottomBar(ctx, game, LAY);
      if (game.sel) drawTowerPanel(ctx, game);
      drawBanner(ctx, game, LAY);
      drawToast(ctx, game, LAY);
    }

    // 受击：边缘红色晕染（比整屏平铺更有压迫感，也不糊画面）
    if (game.redFlash > 0) {
      var ra = U.clamp(game.redFlash, 0, 1);
      var cy0 = LAY.designH / 2;
      var vg = ctx.createRadialGradient(360, cy0, LAY.designH * 0.22, 360, cy0, LAY.designH * 0.72);
      vg.addColorStop(0, 'rgba(255,60,80,0)');
      vg.addColorStop(0.62, 'rgba(255,60,80,' + (ra * 0.16).toFixed(3) + ')');
      vg.addColorStop(1, 'rgba(255,40,70,' + (ra * 0.62).toFixed(3) + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, 720, LAY.designH);
    }

    // 大事件白闪
    if (game.whiteFlash > 0) {
      ctx.fillStyle = 'rgba(226,244,255,' + (U.clamp(game.whiteFlash, 0, 1) * 0.30).toFixed(3) + ')';
      ctx.fillRect(0, 0, 720, LAY.designH);
    }

    if (game.state === 'menu') drawMenu(ctx, game, LAY);
    if (game.state === 'set') drawSet(ctx, game, LAY);
    if (game.state === 'help') drawHelp(ctx, game, LAY);
    if (game.state === 'codex') drawCodex(ctx, game, LAY);
    if (game.state === 'pop') drawMonsterPop(ctx, game, LAY);
    if (game.state === 'over') drawOver(ctx, game, LAY, false);
    if (game.state === 'win') drawOver(ctx, game, LAY, true);

    // 整屏版式也要能看到提示（比如切字号后的回执），
    // 位置仍贴着建造栏顶边，所以不会压到版式内容。
    // 图鉴与弹窗不画：那两页没有 toast 的落脚处，弹窗更是盖在一切之上。
    if (game.state === 'set' || game.state === 'help') drawToast(ctx, game, LAY);

    // 音效快捷开关：游戏与菜单都能点；设置/玩法/图鉴/弹窗不画 ——
    // 大字号下它会和这些页面自己的按钮挤在同一块地方
    // （玩法页的返回药丸已经被 boot 自检抓到过一次），设置页里另有音效开关。
    if (game.state !== 'set' && game.state !== 'help' &&
      game.state !== 'codex' && game.state !== 'pop') drawSettingsBtn(ctx, game, LAY);
  };

  /* ------------------------- 设置按钮 ------------------------- */
  function drawSettingsBtn(ctx, game, LAY) {
    var sb = LAY.settingsBtn;
    var cy = sb.y + sb.h / 2;
    U.roundRect(ctx, sb.x, sb.y, sb.w, sb.h, S(14));
    ctx.fillStyle = 'rgba(120,150,200,0.13)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,255,0.40)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    /* 齿轮：自绘几何，不依赖图标字体。放在胶囊下方右侧空档，不挡战斗 */
    var u = sb.h / 54, cx = sb.x + 26 * u;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(u, u);
    ctx.fillStyle = '#9fd0ff';
    for (var gi = 0; gi < 8; gi++) {
      ctx.save();
      ctx.rotate(gi / 8 * Math.PI * 2);
      ctx.fillRect(-2.4, -13, 4.8, 6);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CFG.C.board;
    ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    txt(ctx, '设置', sb.x + 64, cy, 13, '#cfe3ff', 'center', 'bold');
  }

  /* ---------------------------- 棋盘 ---------------------------- */
  function drawBoard(ctx, game, LAY) {
    var CELL = CFG.CELL, COLS = CFG.COLS, ROWS = CFG.ROWS;
    var bx = LAY.boardX, by = LAY.boardY;
    var t = game.time;

    U.roundRect(ctx, bx - 9, by - 9, LAY.boardW + 18, LAY.boardH + 18, 20);
    ctx.fillStyle = CFG.C.board;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = bx + c * CELL, y = by + r * CELL;
        U.roundRect(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8);
        ctx.fillStyle = ((r + c) % 2 === 0) ? CFG.C.cellA : CFG.C.cellB;
        ctx.fill();
      }
    }

    // 出怪口
    for (var s = 0; s < CFG.SPAWN_COLS.length; s++) {
      var sc = CFG.SPAWN_COLS[s];
      var cx = bx + (sc + 0.5) * CELL;
      var pulse = 0.5 + 0.5 * Math.sin(t * 3 + s * 2);
      ctx.globalAlpha = 0.35 + pulse * 0.4;
      U.poly(ctx, cx, by + 26, 14, 3, Math.PI / 2);
      ctx.fillStyle = '#ff5d6c';
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 核心
    var c0 = CFG.CORE_CELLS[0];
    var c1 = CFG.CORE_CELLS[1];
    var x0 = bx + c0[0] * CELL, y0 = by + c0[1] * CELL;
    var w = (c1[0] - c0[0] + 1) * CELL;
    var hh = CELL;
    var pulse2 = 0.5 + 0.5 * Math.sin(t * 2.4);
    U.roundRect(ctx, x0 + 5, y0 + 7, w - 10, hh - 14, 14);
    var cg = ctx.createLinearGradient(x0, y0, x0 + w, y0 + hh);
    cg.addColorStop(0, 'rgba(69,214,255,0.30)');
    cg.addColorStop(1, 'rgba(80,110,255,0.18)');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,230,255,' + (0.5 + pulse2 * 0.5) + ')';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    var mx = x0 + w / 2, my = y0 + hh / 2;
    ctx.strokeStyle = 'rgba(180,240,255,' + (0.55 + pulse2 * 0.45) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 22 + pulse2 * 5, 0, Math.PI * 2);
    ctx.stroke();
    /* 双格反应堆：中心菱形是能量芯，两侧短栅提示两个核心通道。 */
    U.poly(ctx, mx, my, 18, 4, Math.PI / 4);
    ctx.fillStyle = 'rgba(150,235,255,' + (0.55 + pulse2 * 0.35) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,252,255,0.9)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    for (var coreBar = -1; coreBar <= 1; coreBar += 2) {
      ctx.beginPath();
      ctx.moveTo(mx + coreBar * 31, my - 14);
      ctx.lineTo(mx + coreBar * 31, my + 14);
      ctx.stroke();
    }
    /* 字比核心图标大一档，挂在核心上方 48：既离开图标本体（半径 25），
     * 又给底部那一行留出余地 —— 浮动提示压在棋盘底时不会盖到这两个字。 */
    txt(ctx, 'ECHO CORE', mx, my - S(48), 13, 'rgba(180,240,255,0.8)', 'center', 'bold');

    // 脉冲瞄准提示已随脉冲一起移除
  }

  /* --------------------------- 共振网络 --------------------------- */
  /** 画在塔之上：链是核心机制，必须一眼可读 */
  function drawLinks(ctx, game) {
    var links = G.Resonance.links;
    var i, l;
    if (!links.length) return;
    var dash = (game.time * 26) % 22;
    var hasOffset = (typeof ctx.lineDashOffset !== 'undefined');
    var hasDash = (typeof ctx.setLineDash === 'function');
    var t0 = game.time;

    // 底层柔光
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < links.length; i++) {
      l = links[i];
      ctx.strokeStyle = U.hexToRgba(CFG.ELEM[l.elem].color, 0.16);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 中层：流动虚线
    if (hasDash) ctx.setLineDash([9, 13]);
    ctx.lineCap = 'round';
    for (i = 0; i < links.length; i++) {
      l = links[i];
      var col = CFG.ELEM[l.elem].color;
      ctx.strokeStyle = U.hexToRgba(col, 0.72);
      ctx.lineWidth = 3;
      if (hasOffset) ctx.lineDashOffset = -dash;
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
    }
    if (hasDash) ctx.setLineDash([]);

    // 上层：沿链流动的能量光点，链越长越亮、越多
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < links.length; i++) {
      l = links[i];
      var c2 = CFG.ELEM[l.elem].color;
      var cl = Math.min(l.a.clusterSize || 1, CFG.RES.chainCap);
      var strength = 0.42 + 0.12 * (cl - 1);
      var speed = CFG.VIS.linkFlow;
      var dots = 3;
      for (var k = 0; k < dots; k++) {
        var ph = ((t0 * speed + k / dots + i * 0.17) % 1);
        var fx = l.a.x + (l.b.x - l.a.x) * ph;
        var fy = l.a.y + (l.b.y - l.a.y) * ph;
        ctx.globalAlpha = strength * Math.sin(ph * Math.PI);
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(fx, fy, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(fx, fy, 1.7, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** 反应节点画在塔之上，否则会被塔身挡住 */
  function drawNodes(ctx, game) {
    var nodes = G.Resonance.nodes;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var k = 1 - n.cd / n.def.cd;
      var pulse = 0.5 + 0.5 * Math.sin(game.time * 5 + i);
      var rad = 12 + pulse * 2 + (n.flash > 0 ? n.flash * 30 : 0);

      ctx.globalAlpha = 0.9;
      U.poly(ctx, n.x, n.y, rad, 4, game.time * 1.6);
      ctx.fillStyle = n.def.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(10,18,32,0.8)';
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 冷却环
      ctx.strokeStyle = U.hexToRgba(n.def.color, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();

      // 触发瞬间扩散
      if (n.flash > 0) {
        ctx.globalAlpha = n.flash / 0.35;
        ctx.strokeStyle = n.def.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 26 + (1 - n.flash / 0.35) * 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ----------------------------- 塔 ----------------------------- */
  function drawTowers(ctx, game, LAY) {
    var arr = game.towers;
    var t0 = game.time;

    // 选中塔的射程圈（先画，免得盖住塔身）
    if (game.sel) {
      var st0 = G.Towers.stats(game.sel);
      ctx.fillStyle = 'rgba(159,216,255,0.06)';
      ctx.beginPath();
      ctx.arc(game.sel.x, game.sel.y, st0.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(159,216,255,0.5)';
      ctx.lineWidth = 2;
      var dashable = (typeof ctx.setLineDash === 'function');
      if (dashable) ctx.setLineDash([6, 8]);
      if (typeof ctx.lineDashOffset !== 'undefined') ctx.lineDashOffset = -(t0 * 22) % 14;
      ctx.beginPath();
      ctx.arc(game.sel.x, game.sel.y, st0.range, 0, Math.PI * 2);
      ctx.stroke();
      if (dashable) ctx.setLineDash([]);
      if (typeof ctx.lineDashOffset !== 'undefined') ctx.lineDashOffset = 0;
    }

    for (var i = 0; i < arr.length; i++) {
      var t = arr[i];
      var sup = !!t.suppressed;
      var el = CFG.ELEM[t.elem];
      var st = G.Towers.stats(t);
      var cyc = 1 / Math.max(0.1, st.rate);
      var ck = U.clamp(1 - t.cool / cyc, 0, 1);
      drawTowerBody(ctx, t, el, sup, ck, t0, i);
    }
  }

  function drawTowerBody(ctx, t, el, sup, ck, t0, seed) {
    var x = t.x, y = t.y;
    var col = sup ? '#8494b3' : el.color;
    var soft = sup ? '#adb8cf' : el.soft;

    // 1) 地面余光（只露出一圈边，形成元素色描边感）
    ctx.globalAlpha = sup ? 0.08 : 0.16;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // 2) 六边形底盘（半径收到 22：塔在格子里少占一点，留出格子边界感）
    U.poly(ctx, x, y, 22, 6, Math.PI / 6);
    ctx.fillStyle = sup ? '#24344f' : '#20304c';
    ctx.fill();
    ctx.strokeStyle = U.hexToRgba(col, sup ? 0.35 : 0.8);
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 内层暗底，做出厚度
    U.poly(ctx, x, y, 15.5, 6, Math.PI / 6);
    ctx.fillStyle = 'rgba(10,18,32,0.6)';
    ctx.fill();

    // 2.5) 等级华丽度：等级越高装饰越多，一眼看出「这是座老塔」
    //   Lv2 内环 / Lv3 六角饰钻 / Lv4 双旋环 / Lv5 光晕 + 环绕晶石（逐级叠加）
    var lv = t.level || 1;
    if (lv >= 2) {
      ctx.strokeStyle = U.hexToRgba(soft, sup ? 0.2 : 0.55);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
    }
    if (lv >= 3) {
      for (var vi = 0; vi < 6; vi++) {
        var va = Math.PI / 6 + vi * Math.PI / 3;
        var vx = x + Math.cos(va) * 22, vy = y + Math.sin(va) * 22;
        U.poly(ctx, vx, vy, 3.2, 4, va);
        ctx.fillStyle = U.hexToRgba(col, sup ? 0.4 : 0.95);
        ctx.fill();
      }
    }
    if (lv >= 4) {
      // 双旋环：两段圆弧反向慢转，塔动不动都在呼吸
      var ra1 = t0 * 1.4 + seed, ra2 = -t0 * 1.1 + seed * 2;
      ctx.strokeStyle = U.hexToRgba(soft, sup ? 0.25 : 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 25.5, ra1, ra1 + 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 25.5, ra2 + Math.PI, ra2 + Math.PI + 1.9); ctx.stroke();
    }
    if (lv >= 5) {
      // 光晕 + 三枚环绕晶石
      ctx.globalAlpha = 0.10 + 0.06 * Math.sin(t0 * 3 + seed);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 31, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      for (var gi = 0; gi < 3; gi++) {
        var ga = t0 * 2.2 + seed + gi * Math.PI * 2 / 3;
        var gx = x + Math.cos(ga) * 29.5, gy = y + Math.sin(ga) * 29.5 * 0.5;
        U.poly(ctx, gx, gy, 2.8, 4, ga);
        ctx.fillStyle = soft;
        ctx.fill();
      }
    }

    // 2.6) 结晶护盾 / 激化增益的驻留指示
    if ((t.shieldT || 0) > 0) {
      ctx.strokeStyle = 'rgba(250,187,87,' + (0.55 + 0.25 * Math.sin(t0 * 5)) + ')';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.stroke();
    }
    if ((t.quickT || 0) > 0) {
      ctx.strokeStyle = 'rgba(165,236,37,' + (0.5 + 0.3 * Math.sin(t0 * 6)) + ')';
      ctx.lineWidth = 1.8;
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(x, y, 32.5, t0 * 2, t0 * 2 + Math.PI * 2); ctx.stroke();
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
    }

    // 3) 共振链外环：虚线绕塔旋转
    if ((t.clusterSize || 1) >= 2 && !sup) {
      var ca = 0.30 + 0.16 * Math.sin(t0 * 2.6 + seed * 1.7);
      ctx.strokeStyle = U.hexToRgba(col, ca);
      ctx.lineWidth = 3;
      var d2 = (typeof ctx.setLineDash === 'function');
      if (d2) ctx.setLineDash([5, 7]);
      if (typeof ctx.lineDashOffset !== 'undefined') ctx.lineDashOffset = -(t0 * 16) % 12;
      U.poly(ctx, x, y, 30, 6, Math.PI / 6);
      ctx.stroke();
      if (d2) ctx.setLineDash([]);
      if (typeof ctx.lineDashOffset !== 'undefined') ctx.lineDashOffset = 0;
    }

    // 4) 冷却环：走完一圈就是一次开火，节奏一眼看清
    if (CFG.VIS.towerCoolRing) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.stroke();
      if (ck > 0.012) {
        ctx.strokeStyle = U.hexToRgba(col, 0.85);
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ck);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }

    // 5) 炮管（含后坐）—— 必须伸出底盘，否则埋在底座里看不出是座炮
    var rec = t.recoil || 0;
    var back = rec * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.angle === undefined ? -Math.PI / 2 : t.angle);
    // 管身：从核心一直伸到 27px（底盘半径 25 之外）
    U.roundRect(ctx, 5 - back, -5, 22, 10, 5);
    ctx.fillStyle = sup ? '#34435f' : '#35547d';
    ctx.fill();
    ctx.strokeStyle = U.hexToRgba(col, sup ? 0.4 : 1);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // 中心高光条，让管身有圆柱感
    ctx.strokeStyle = U.hexToRgba(soft, sup ? 0.3 : 0.6);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(9 - back, 0);
    ctx.lineTo(23 - back, 0);
    ctx.stroke();
    // 管口：统一小圆头。元素身份交给塔身核心的元素图标去表达，
    // 这里再画一套自创符号只会和真图标打架（两套符号看着都不像）。
    ctx.translate(29 - back, 0);
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = U.hexToRgba(soft, sup ? 0.5 : 0.95);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,18,32,0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // 6) 中心核心：元素图标就是这座塔的身份证。
    //    底下垫一圈元素色暗盘，图标才在深色底盘上站得住。
    var pul = 0.5 + 0.5 * Math.sin(t0 * 4 + seed);
    ctx.beginPath();
    ctx.arc(x, y, Render.TOWER_ICON_R + 3 + pul * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = sup ? 'rgba(120,133,158,0.9)' : U.hexToRgba(col, 0.22);
    ctx.fill();
    ctx.strokeStyle = U.hexToRgba(sup ? '#adb8cf' : col, 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    elemIcon(ctx, t.elem, x, y, Render.TOWER_ICON_R, sup ? '#a0abc0' : soft);

    // 7) 等级刻度
    var maxLv = CFG.MAX_LEVEL, pw = 5, pg = 2.5;
    var tw = maxLv * pw + (maxLv - 1) * pg;
    var px0 = x - tw / 2;
    for (var L = 0; L < maxLv; L++) {
      ctx.fillStyle = L < t.level ? soft : 'rgba(255,255,255,0.13)';
      ctx.fillRect(px0 + L * (pw + pg), y + 16, pw, 3);
    }

    // 8) 被压制：短路电弧乱跳
    if (sup) {
      ctx.strokeStyle = 'rgba(150,165,195,0.7)';
      ctx.lineWidth = 1.6;
      for (var q = 0; q < 2; q++) {
        var a0 = t0 * 9 + q * 3.1 + seed;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a0) * 23, y + Math.sin(a0) * 23);
        ctx.lineTo(x + Math.cos(a0) * 13 + U.rand(-4, 4), y + Math.sin(a0) * 13 + U.rand(-4, 4));
        ctx.lineTo(x + Math.cos(a0 + 1.9) * 21, y + Math.sin(a0 + 1.9) * 21);
        ctx.stroke();
      }
    }

    // 9) 开火余光
    if (t.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (t.flash / 0.12) * 0.5;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 10) 血条
    if (t.hp < t.maxHp - 0.5) {
      var hp = U.clamp(t.hp / t.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      U.roundRect(ctx, x - 22, y - 35, 44, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = hp > 0.4 ? '#4ade80' : '#ff5d6c';
      U.roundRect(ctx, x - 22, y - 35, 44 * hp, 5, 2.5);
      ctx.fill();
    }

    // 11) 受击闪白
    if (t.hitFlash > 0) {
      ctx.globalAlpha = (t.hitFlash / 0.2) * 0.5;
      U.poly(ctx, x, y, 22, 6, Math.PI / 6);
      ctx.fillStyle = '#ffd9de';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------------------- 敌人 ---------------------------- */
  function drawEnemies(ctx, game) {
    var arr = game.enemies;

    // 先画「拆塔连线」，避免压住怪物本体
    for (var q = 0; q < arr.length; q++) {
      var c = arr[q];
      if (c.mode !== 'chew' || !c.target) continue;
      ctx.strokeStyle = 'rgba(255,124,86,0.9)';
      ctx.lineWidth = 2.5;
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([5, 5]);
      if (typeof ctx.lineDashOffset !== 'undefined') ctx.lineDashOffset = -(game.time * 40) % 10;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.target.x, c.target.y);
      ctx.stroke();
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,160,90,' + (0.4 + 0.4 * Math.sin(game.time * 18)) + ')';
      ctx.beginPath();
      ctx.arc((c.x + c.target.x) / 2, (c.y + c.target.y) / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 体积光晕：单独一趟走 lighter，避免每个敌人来回切换合成模式
    ctx.globalCompositeOperation = 'lighter';
    for (var q2 = 0; q2 < arr.length; q2++) {
      var e2 = arr[q2];
      var gr = e2.r + (e2.def && e2.def.boss ? 16 : 7);
      ctx.globalAlpha = (e2.hitFlash > 0 ? 0.30 : 0.15) * (e2.phaseT > 0 ? 0.35 : 1);
      ctx.fillStyle = e2.hitFlash > 0 ? '#ffffff' : e2.color;
      ctx.beginPath();
      ctx.arc(e2.x, e2.y, gr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      var col = e.color;
      var r = e.r;
      var sc = e.spawnT > 0 ? U.lerp(0.2, 1, 1 - e.spawnT / 0.35) : 1;
      if (e.hitFlash > 0) col = '#ffffff';

      ctx.globalAlpha = e.phaseT > 0 ? 0.45 : 1;

      /* 怪物形象：矢量手绘、逐部件动画，全部在 js/monsters.js 里
       * （朝向镜像、出生缩放、受击白闪、相位重影都在那一层处理）。
       * 万一某个 key 没有形象，退回一个圆点兜底，保证逻辑自检也不崩。 */
      if (!G.Monsters || !G.Monsters.draw(ctx, e, game.time, sc)) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * sc, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      }

      if (e.def && e.def.boss) {
        ctx.strokeStyle = U.hexToRgba('#ff4d6d', 0.5);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 10 + 3 * Math.sin(game.time * 4), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 状态环
      if (e.slowAmt > 0) {
        ctx.strokeStyle = U.hexToRgba(CFG.ELEM.cryo.color, 0.8);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 5, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.superT > 0) {
        ctx.strokeStyle = U.hexToRgba('#ff7bd0', 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 9, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.stunT > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        for (var k = 0; k < 3; k++) {
          var a = game.time * 6 + k * 2.09;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * (r + 7), e.y + Math.sin(a) * (r + 7) - 4, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      }

      /* 血条：几何走 Render.barRect（渲染与自检同源），
       * 位置跟怪物形象挂钩 —— 形象按 r/14 缩放，四角会伸到约 r 的 1.15 倍，
       * 所以槽顶要退到 -r-gap 才不与角/耳朵/牙打架。
       *
       * 常显（原来只在掉血时画、还只有 5px 无边框）：满血的怪也有一条完整的槽，
       * 玩家才能一眼看出「这只有多厚」—— 打高血怪时这是最关键的信息。
       * 槽加深底 + 浅描边 + 顶部高光，免得和提亮后的棋盘底糊在一起。 */
      var hpPct = U.clamp(e.hp / e.maxHp, 0, 1);
      var br = Render.barRect(e);
      ctx.fillStyle = 'rgba(9,17,31,0.80)';
      U.roundRect(ctx, br.x - 1.5, br.y - 1.5, br.w + 3, br.h + 3, (br.h + 3) / 2);
      ctx.fill();
      ctx.strokeStyle = br.boss ? 'rgba(255,180,195,0.75)' : 'rgba(190,220,255,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      U.roundRect(ctx, br.x, br.y, br.w, br.h, br.h / 2);
      ctx.fill();
      if (hpPct > 0.002) {
        ctx.fillStyle = hpPct > 0.5 ? '#5df2a8' : (hpPct > 0.22 ? '#ffd166' : '#ff5d6c');
        U.roundRect(ctx, br.x, br.y, Math.max(br.h, br.w * hpPct), br.h, br.h / 2);
        ctx.fill();
        if (!br.boss) {
          // 顶部高光：暗底上的一条亮线，暗处也能看出血条的「形状」
          ctx.fillStyle = 'rgba(255,255,255,0.42)';
          U.roundRect(ctx, br.x + br.h * 0.5, br.y + br.h * 0.16,
            Math.max(2, br.w * hpPct - br.h), Math.max(1.4, br.h * 0.28), br.h * 0.14);
          ctx.fill();
        }
      }
      // 首领：槽里直接写血量数字（槽加厚到 14 就是为了装它）
      if (br.boss) {
        txt(ctx, Math.ceil(Math.max(0, e.hp)) + ' / ' + Math.ceil(e.maxHp),
          e.x, br.y + br.h / 2, BAR.bossNumFont, '#ffffff', 'center', 'bold');
      }

      /* 元素反应名：反应打中它时挂上，1 秒多自己淡掉（不飞走、不叠列）。
       * 画在血条上方 —— 画在身体上会糊住形象，而这块位置本来就是空的。 */
      if (e.reactT > 0 && e.reactName) {
        var ta = U.clamp(e.reactT / 0.45, 0, 1);
        var tw = (ctx.measureText ? (function () {
          ctx.font = fontOf(TAG.font, 'bold');
          return ctx.measureText(e.reactName).width;
        })() : 0) || (e.reactName.length * CFG.FS(TAG.font) * 0.62);
        var th = S(TAG.h);
        var tx = e.x - tw / 2, ty = br.y - th - S(TAG.gapAboveBar);
        ctx.globalAlpha = ta;
        U.roundRect(ctx, tx - S(TAG.padX), ty, tw + S(TAG.padX) * 2, th, th / 2);
        ctx.fillStyle = 'rgba(12,20,35,0.88)';
        ctx.fill();
        ctx.strokeStyle = U.hexToRgba(e.reactColor || '#ffffff', 0.85);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        txt(ctx, e.reactName, e.x, ty + th / 2, TAG.font,
          e.reactColor || '#ffffff', 'center', 'bold');
        ctx.globalAlpha = 1;
      }
      // 状态特效常驻标签：减速 / 击退 / 易伤 / 定身 / 燃烧
      effectBadges(ctx, e);
    }
  }

  /* ----------------------- 状态特效常驻标签 -----------------------
   * 减速 / 击退 / 易伤 / 定身 / 燃烧 各自一枚带文字的小药丸，画在怪物身体正下方。
   * 用户明确要求：效果施加了就要在怪身上看得见文字，而且直到效果消失才撤下
   * —— 不是像反应名那样 1 秒淡出，是常驻的「当前被控状态」。
   * 怪与怪之间最不挤的位置就是脚下那一格，所以放身体正下方、横向居中排列；
   * 颜色取各效果主色：减速=冰蓝、击退=风青、易伤=粉、定身=白、燃烧=暖橙。 */
  function effectBadges(ctx, e) {
    var items = [];
    if (e.slowAmt > 0) items.push({ t: '减速', c: CFG.ELEM.cryo.color });
    if (e.kbT > 0)      items.push({ t: '击退', c: CFG.ELEM.anemo.color });
    if (e.superT > 0)   items.push({ t: '易伤', c: '#ff7bd0' });
    if (e.stunT > 0)    items.push({ t: '定身', c: '#ffffff' });
    if (e.burnT > 0)    items.push({ t: '燃烧', c: '#ffae5e' });
    if (!items.length) return;

    var fs = 12, padX = S(8), gap = S(5), bh = S(22);
    var by = e.y + e.r + S(11);
    ctx.font = fontOf(fs, 'bold');
    var widths = [], total = 0;
    for (var i = 0; i < items.length; i++) {
      var w = (ctx.measureText ? ctx.measureText(items[i].t).width : 0) ||
              (items[i].t.length * CFG.FS(fs) * 0.62);
      w += padX * 2;
      widths.push(w);
      total += w + (i ? gap : 0);
    }
    var x = e.x - total / 2;
    if (x < 4) x = 4;                               // 贴边时收进画布，别被裁掉
    else if (x + total > 716) x = 716 - total;
    for (var j = 0; j < items.length; j++) {
      var ww = widths[j];
      U.roundRect(ctx, x, by, ww, bh, bh / 2);
      ctx.fillStyle = 'rgba(10,18,32,0.82)';
      ctx.fill();
      ctx.strokeStyle = U.hexToRgba(items[j].c, 0.85);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      txt(ctx, items[j].t, x + ww / 2, by + bh / 2, fs, items[j].c, 'center', 'bold');
      x += ww + gap;
    }
  }

  function drawBullets(ctx, game) {
    var b = game.bullets;
    if (!b.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (var i = 0; i < b.length; i++) {
      var p = b[i];
      var el = CFG.ELEM[p.elem];
      var col = el ? el.color : '#ffd27a';

      // 拖尾：按实际位移拉出锥形尾迹
      if (p.px !== undefined) {
        var dx = p.x - p.px, dy = p.y - p.py;
        var sp = Math.sqrt(dx * dx + dy * dy);
        if (sp > 0.4) {
          var k = Math.min(1, 16 / sp);
          var tx = p.x - dx * k * 1.8, ty = p.y - dy * k * 1.8;
          ctx.strokeStyle = U.hexToRgba(col, 0.30);
          ctx.lineWidth = p.r * 2.2;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.strokeStyle = U.hexToRgba('#ffffff', 0.6);
          ctx.lineWidth = p.r * 0.85;
          ctx.beginPath();
          ctx.moveTo(tx + (p.x - tx) * 0.45, ty + (p.y - ty) * 0.45);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }

      // 光晕 + 核心
      ctx.fillStyle = U.hexToRgba(col, 0.20);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = U.hexToRgba(col, 0.46);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6e2';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ----------------------------- HUD ----------------------------- */
  function drawHUD(ctx, game, LAY) {
    // 所有 y 都从 LAY.hud 取：微信下会整体下移避开状态栏，
    // 右对齐那一列还会再下移避开右上角胶囊
    var H = LAY.hud;
    var hr = H.hudRight;

    txt(ctx, '回声防线', 40, H.title, 28, CFG.C.text, 'left', 'bold');
    txt(ctx, 'ECHO LINE · 共振塔防', 40, H.sub, 12, CFG.C.dim, 'left');

    /* 波次文案刻意保持极短：右列是右对齐到 hudRight 的，
     * 字放大一倍后「第 20 / 20 波」这种长串会向左顶到标题上。 */
    var wtxt = '第 ' + Math.max(1, game.wave) + ' 波';
    txt(ctx, wtxt, hr, H.waveTxt, 19,
      game.state === 'wave' ? '#ffd27a' : CFG.C.text, 'right', 'bold');
    txt(ctx, '最高分 ' + game.best, hr, H.bestTxt, 12, CFG.C.dim, 'right');

    // 核心完整度
    txt(ctx, '核心完整度', 40, H.hpLabel, 13, CFG.C.dim);
    var hpPct = U.clamp(game.coreHp / game.coreMax, 0, 1);
    bar(ctx, LAY.hpBar.x, LAY.hpBar.y, LAY.hpBar.w, LAY.hpBar.h, hpPct,
      hpPct > 0.35 ? '#2ee6a8' : '#ff5d6c', '#8ef7d8', CFG.C.barTrack);
    txt(ctx, Math.ceil(game.coreHp) + ' / ' + game.coreMax, 428, H.hpLabel, 14, CFG.C.text, 'right', 'bold');

    // 回声充能条已随倒带机制一起移除

    // 能量
    txt(ctx, '能量', hr, H.energyLabel, 13, CFG.C.dim, 'right');
    /* 字号 30 → 20：能量是四位数，30 号时数字会向左压到血条那一列（遮挡），
     * 缩小后不碍事。**必须是字号表里有的值** —— 22 / 26 这类不在表里的数会走
     * FONT_K 兜底（22 → 实际 60px），比原来还大，font-check 会直接报出来。 */
    txt(ctx, String(Math.floor(game.energy)), hr, H.energyVal, 20, '#ffd27a', 'right', 'bold');

    // 开波按钮
    if (game.state === 'prep') {
      var r = LAY.waveBtn;
      var pr = game.prepT / CFG.PREP_TIME;
      U.roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fillStyle = 'rgba(46,230,168,0.13)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(46,230,168,0.6)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      U.roundRect(ctx, r.x, r.y + r.h - 6, r.w * (1 - pr), 6, 3);
      ctx.fillStyle = 'rgba(46,230,168,0.85)';
      ctx.fill();
      var bonus = Math.floor(game.prepT * CFG.PREP_BONUS) + CFG.EARLY_WAVE_BONUS;
      txt(ctx, '提前开波  第 ' + (game.wave + 1) + ' 波', r.x + S(20), r.y + r.h / 2, 20, '#8ef7d8', 'left', 'bold');
      txt(ctx, '+' + bonus + ' 能量', r.x + r.w - S(20), r.y + r.h / 2, 18, '#ffd27a', 'right', 'bold');
    } else if (game.state === 'wave' && game.waveData) {
      var left = game.waveData.events.length - game.spawnIdx + game.enemies.length;
      var r2 = LAY.waveBtn;
      U.roundRect(ctx, r2.x, r2.y, r2.w, r2.h, 16);
      ctx.fillStyle = CFG.C.offFill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,190,255,0.25)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      txt(ctx, '剩余目标 ' + left, r2.x + S(20), r2.y + r2.h / 2, 18, CFG.C.dim, 'left');
    // 回声后遗症提示已随倒带一起移除
    }
  }

  /* --------------------------- 底部建造栏 --------------------------- */
  function drawBottomBar(ctx, game, LAY) {
    var y = LAY.barY;
    U.roundRect(ctx, 12, y + S(3), 696, LAY.barH - S(6), S(22));
    ctx.fillStyle = 'rgba(26,40,66,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (var i = 0; i < LAY.cards.length; i++) {
      drawCard(ctx, LAY.cards[i], G.UI.cardKind(i), game);
    }
  }

  function drawCard(ctx, r, kind, game) {
    var active = false, col = '#7b8cae', title = '', sub = '', disabled = false;

    if (kind.type === 'tower') {
      var d = CFG.TOWERS[kind.key];
      col = CFG.ELEM[d.elem].color;
      title = d.name;
      sub = String(d.cost);
      active = game.selCard === kind.key;
      disabled = game.energy < d.cost;
    }

    ctx.globalAlpha = disabled ? 0.42 : 1;
    U.roundRect(ctx, r.x, r.y, r.w, r.h, S(16));
    ctx.fillStyle = active ? U.hexToRgba(col, 0.18) : CFG.C.chip;
    ctx.fill();
    ctx.strokeStyle = active ? col : 'rgba(150,190,255,0.22)';
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.stroke();

    var icx = r.x + r.w / 2, icy = r.y + S(26);
    if (kind.type === 'tower') {
      elemIcon(ctx, CFG.TOWERS[kind.key].elem, icx, icy, S(15));
    }

    txt(ctx, title, r.x + r.w / 2, r.y + S(58), 15, CFG.C.text, 'center', 'bold');
    txt(ctx, '◈ ' + sub, r.x + r.w / 2, r.y + S(84), 12,
      disabled ? CFG.C.dim : '#ffd27a', 'center', 'bold');
    ctx.globalAlpha = 1;
  }

  /* --------------------------- 塔面板 --------------------------- */
  function drawTowerPanel(ctx, game) {
    var t = game.sel;
    if (!t) return;
    var p = G.UI.towerPanel(t);
    var el = CFG.ELEM[t.elem];
    var st = G.Towers.stats(t);

    ctx.globalAlpha = 0.98;
    U.roundRect(ctx, p.x, p.y, p.w, p.h, S(14));
    ctx.fillStyle = CFG.C.panelFill;
    ctx.fill();
    ctx.strokeStyle = U.hexToRgba(el.color, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    txt(ctx, t.def.name + '  Lv.' + t.level, p.x + S(12), p.y + S(24), 17, el.soft, 'left', 'bold');
    txt(ctx, '伤害 ' + st.dmg.toFixed(0) + ' · 射程 ' + st.range.toFixed(0),
      p.x + S(12), p.y + S(54), 12, CFG.C.dim);
    if (t.clusterSize >= 2) {
      txt(ctx, '共振链 ×' + t.clusterSize, p.x + p.w - S(12), p.y + S(54), 12, el.color, 'right', 'bold');
    } else if (t.suppressed) {
      txt(ctx, '被压制', p.x + p.w - S(12), p.y + S(54), 12, '#ff5d6c', 'right', 'bold');
    }

    var actCost = G.Towers.actionCost(t);
    var actLabel = G.Towers.actionLabel(t);
    var canUp = actLabel !== '已满级' && game.energy >= actCost;
    btn(ctx, p.up, actLabel + ' ' + actCost, canUp, el.color);

    var sv = G.Towers.sellValue(t);
    btn(ctx, p.sell, '回收 +' + sv, true, '#ffd27a');
  }

  function btn(ctx, r, label, enabled, col) {
    U.roundRect(ctx, r.x, r.y, r.w, r.h, S(12));
    ctx.fillStyle = enabled ? U.hexToRgba(col, 0.16) : CFG.C.offFill;
    ctx.fill();
    ctx.strokeStyle = enabled ? U.hexToRgba(col, 0.8) : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, label, r.x + r.w / 2, r.y + r.h / 2, 14, enabled ? col : CFG.C.dim, 'center', 'bold');
  }

  /* --------------------------- 提示层 --------------------------- */
  function drawBanner(ctx, game, LAY) {
    if (game.bannerT <= 0) return;
    var a = U.clamp(game.bannerT / 1.2, 0, 1);
    ctx.globalAlpha = a;
    str(ctx, game.bannerMsg, 360, LAY.boardY + S(60), 34, 'rgba(200,230,255,0.95)', 'center', 'bold', 5);
    ctx.globalAlpha = 1;
  }
  function str(ctx, s, x, y, size, color, align, weight, lw) {
    stroke(ctx, s, x, y, size, 'rgba(5,8,16,0.85)', align, weight, lw || 5);
    txt(ctx, s, x, y, size, color, align, weight);
  }

  function drawToast(ctx, game, LAY) {
    if (game.toastT <= 0) return;
    var a = U.clamp(game.toastT / 0.6, 0, 1);
    ctx.globalAlpha = a;
    /* 提示条：宽度按**实测文字宽度**来，不再固定 300。
     * 固定宽度的老问题是文案稍微长一点就溢出药丸外（原来那条「点下方卡片选塔…」
     * 就已经超出去了），而提示文案是随手写的，很难保证不超。
     * 需要断行时在文案里写 '|' —— 中文自动断行要处理禁则，不值得做，
     * 而提示本来就是我们自己写的，断在哪一段最清楚。
     * 高度两行以内（S(18)+S(26)*2 = S(70)），不超过 config 里给提示预留的
     * RESERVE_BELOW（S(78)），所以两行也不会压到棋盘最后一行核心格。 */
    ctx.font = fontOf(15);
    var lines = String(game.toastMsg).split('|');
    var maxW = 0;
    for (var li = 0; li < lines.length; li++) {
      var lw = (ctx.measureText ? ctx.measureText(lines[li]).width : 0) || 0;
      if (lw > maxW) maxW = lw;
    }
    // 桩 ctx（Node 自检）量不出宽度时按字数估一个，避免药丸退化成一条线
    if (!(maxW > 0)) maxW = lines[0].length * CFG.FS(15) * 0.6;
    var w = Math.min(664, Math.max(S(200), maxW + S(46)));
    var lh = S(26), h = S(18) + lh * lines.length;
    var x = 360 - w / 2, y = LAY.barY - h - S(6);
    U.roundRect(ctx, x, y, w, h, S(16));
    ctx.fillStyle = 'rgba(26,38,62,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (var k = 0; k < lines.length; k++) {
      txt(ctx, lines[k], 360, y + h / 2 + (k - (lines.length - 1) / 2) * lh, 15, CFG.C.text, 'center');
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------- 整屏版式：菜单 / 设置 / 玩法 / 结算 ------------------- */

  /** 整屏版式的底色。必须近乎不透明：底下还画着棋盘与塔（尤其从结算页进来时） */
  function pageBg(ctx, LAY) {
    ctx.fillStyle = CFG.C.page;
    ctx.fillRect(0, 0, 720, LAY.designH);
  }

  function panel(ctx, x, y, w, h, fill) {
    U.roundRect(ctx, x, y, w, h, S(20));
    ctx.fillStyle = fill || CFG.C.panelFill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** 次级按钮（设置 / 玩法 / 返回）：描边是主色，底色很淡 */
  function ghostBtn(ctx, r, label, size, col) {
    U.roundRect(ctx, r.x, r.y, r.w, r.h, S(18));
    ctx.fillStyle = U.hexToRgba(col, 0.12);
    ctx.fill();
    ctx.strokeStyle = U.hexToRgba(col, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, label, r.x + r.w / 2, r.y + r.h / 2, size, col, 'center', 'bold');
  }

  /** 主按钮（开始防守 / 再来一局）：渐变底 + 呼吸描边 */
  function mainBtn(ctx, r, label, size, t) {
    var pulse = 0.5 + 0.5 * Math.sin(t * 3);
    U.roundRect(ctx, r.x, r.y, r.w, r.h, S(22));
    var g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    g.addColorStop(0, 'rgba(47,143,255,' + (0.25 + pulse * 0.16) + ')');
    g.addColorStop(1, 'rgba(46,230,168,' + (0.25 + pulse * 0.16) + ')');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,230,255,' + (0.55 + pulse * 0.45) + ')';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    str(ctx, label, r.x + r.w / 2, r.y + r.h / 2, size, '#e9f2ff', 'center', 'bold', 5);
  }

  /** 设置页的开关（开 / 关） */
  function toggle(ctx, r, on, onCol) {
    var col = onCol || '#5fc8ff';
    U.roundRect(ctx, r.x, r.y, r.w, r.h, S(14));
    ctx.fillStyle = on ? U.hexToRgba(col, 0.16) : CFG.C.offFill;
    ctx.fill();
    ctx.strokeStyle = on ? U.hexToRgba(col, 0.7) : 'rgba(140,160,190,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, on ? '开' : '关', r.x + r.w / 2, r.y + r.h / 2, 16,
      on ? col : CFG.C.dim, 'center', 'bold');
  }

  function drawMenu(ctx, game, LAY) {
    pageBg(ctx, LAY);
    // 整块由 config.buildLayout 按内容高度垂直居中算好，不再钉死在 1280 基准
    var oy = LAY.menuTop;

    str(ctx, '回声防线', 360, oy + S(58), 46, '#e9f2ff', 'center', 'bold', 6);
    txt(ctx, 'E C H O   L I N E', 360, oy + S(118), 14, '#5fc8ff', 'center', 'bold');

    /* 游戏介绍只留两句：这是什么游戏、目标是什么。
     * 具体怎么打全在「玩法」里 —— 菜单不再是说明书的复印件。 */
    panel(ctx, 46, oy + S(176), 628, S(116));
    txt(ctx, G.UI.MENU_INTRO[0], 76, oy + S(214), 16, CFG.C.text, 'left', 'bold');
    txt(ctx, G.UI.MENU_INTRO[1], 76, oy + S(258), 13, CFG.C.dim);

    mainBtn(ctx, G.UI.menuStart(), '开始防守', 26, game.time);
    // 次级按钮统一遍历 UI.menuSubBtns()：漏画一个的 bug 从结构上就不可能再发生
    var subs = G.UI.menuSubBtns();
    for (var si = 0; si < subs.length; si++) {
      ghostBtn(ctx, subs[si].rect, subs[si].label, 18, subs[si].color);
    }

    txt(ctx, '最高分 ' + game.best, 360, oy + S(574), 14, CFG.C.dim, 'center');
    txt(ctx, '微信小游戏 · Canvas 2D 运行，无外部资源', 360, oy + S(612), 12, '#7d90b3', 'center');
  }

  /* ----------------------------- 设置页 ----------------------------- */
  function drawSet(ctx, game, LAY) {
    var SET_LABEL = G.UI.SET_LABEL, SET_HINT = G.UI.SET_HINT;
    pageBg(ctx, LAY);
    var oy = LAY.setTop;
    var i, r;

    str(ctx, '设置', 360, oy + S(46), 34, '#e9f2ff', 'center', 'bold', 6);
    txt(ctx, 'S E T T I N G S', 360, oy + S(86), 12, '#5fc8ff', 'center', 'bold');

    // 四行：标签 + 说明在左，控件贴右边线
    for (i = 0; i < G.UI.SET_ROWS.length; i++) {
      r = G.UI.setRow(i);
      panel(ctx, r.x, r.y, r.w, r.h, CFG.C.panelSoft);
      txt(ctx, SET_LABEL[i], r.x + S(24), r.y + r.h / 2 - S(14), 16, CFG.C.text, 'left', 'bold');
      txt(ctx, SET_HINT[i], r.x + S(24), r.y + r.h / 2 + S(16), 12, CFG.C.dim);
    }

    // 字体大小：小 / 中 / 大
    var fb = G.UI.setFontBtns();
    for (i = 0; i < fb.length; i++) {
      var on = (i === CFG.FONT_LEVEL);
      U.roundRect(ctx, fb[i].x, fb[i].y, fb[i].w, fb[i].h, S(14));
      ctx.fillStyle = on ? 'rgba(95,200,255,0.20)' : CFG.C.offFill;
      ctx.fill();
      ctx.strokeStyle = on ? 'rgba(143,230,255,0.85)' : 'rgba(140,160,190,0.3)';
      ctx.lineWidth = on ? 2.4 : 1.6;
      ctx.stroke();
      txt(ctx, CFG.FONT_LEVELS[i].name, fb[i].x + fb[i].w / 2, fb[i].y + fb[i].h / 2,
        18, on ? '#cdefff' : CFG.C.dim, 'center', 'bold');
    }

    // 音效 / 震动开关
    var A = G.Audio;
    toggle(ctx, G.UI.setToggle(1), A ? !A.isMuted() : false);
    toggle(ctx, G.UI.setToggle(3), G.Settings.get('vibrate'), '#2ee6a8');

    // 音量：− / 轨道 / ＋，轨道可直接点
    var vol = G.Settings.get('volume');
    var mn = G.UI.volMinus(), pl = G.UI.volPlus(), tr = G.UI.volTrack(), inner = G.UI.volInner();
    smallRoundBtn(ctx, mn, '−');
    smallRoundBtn(ctx, pl, '＋');
    U.roundRect(ctx, tr.x, tr.y, tr.w, tr.h, S(14));
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,160,190,0.3)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    var fw = Math.max(S(6), inner.w * vol);
    U.roundRect(ctx, inner.x, tr.y + S(14), fw, tr.h - S(28), (tr.h - S(28)) / 2);
    var vg = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0);
    vg.addColorStop(0, '#2f8fff');
    vg.addColorStop(1, '#8fe6ff');
    ctx.fillStyle = vg;
    ctx.fill();
    // 百分比贴在 − 号左边：轨道里塞不下数字，塞了就和滑块打架
    txt(ctx, Math.round(vol * 100) + '%', mn.x - S(14), tr.y + tr.h / 2, 14, '#ffd27a', 'right', 'bold');

    /* 字号预览：改档位后立刻能看出效果，不用回菜单再点进来 */
    var pv = G.UI.setPreview();
    panel(ctx, pv.x, pv.y, pv.w, pv.h, CFG.C.panelSoft);
    txt(ctx, G.UI.SET_PREVIEW, pv.x + S(24), pv.y + pv.h / 2, 14, CFG.C.text, 'left');
    txt(ctx, G.UI.SET_PREVIEW_RIGHT + CFG.FONT_LEVELS[CFG.FONT_LEVEL].name,
      pv.x + pv.w - S(24), pv.y + pv.h / 2, 13, '#8fe6ff', 'right', 'bold');

    ghostBtn(ctx, G.UI.setContinue(), '继续', 20, '#8fe6ff');
    ghostBtn(ctx, G.UI.setHome(), '回到首页', 18, '#ffd27a');
  }

  function smallRoundBtn(ctx, r, label) {
    U.roundRect(ctx, r.x, r.y, r.w, r.h, S(14));
    ctx.fillStyle = 'rgba(95,200,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(143,230,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, label, r.x + r.w / 2, r.y + r.h / 2, 20, '#cdefff', 'center', 'bold');
  }

  /* ----------------------------- 玩法页 ----------------------------- */
  function drawHelp(ctx, game, LAY) {
    pageBg(ctx, LAY);
    var oy = LAY.helpTop;

    str(ctx, '玩法说明', 40, oy + S(46), 34, '#e9f2ff', 'left', 'bold', 6);
    txt(ctx, 'HOW TO PLAY · 规则', 40, oy + S(86), 12, '#5fc8ff', 'left', 'bold');
    ghostBtn(ctx, G.UI.helpBack(), '返回', 18, '#8fe6ff');

    /* 分隔线：标题与正文之间拉一条，视觉上把「页头」和「条目」分开 */
    ctx.strokeStyle = 'rgba(150,190,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, oy + S(104));
    ctx.lineTo(680, oy + S(104));
    ctx.stroke();

    var secs = G.UI.helpSections();
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i];

      // 编号徽章
      U.roundRect(ctx, 52, s.y + S(8), S(52), S(52), S(16));
      ctx.fillStyle = 'rgba(95,200,255,0.13)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(143,230,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      txt(ctx, String(i + 1), 52 + S(26), s.y + S(34), 20, '#8fe6ff', 'center', 'bold');

      txt(ctx, s.title, 124, s.y + S(26), 16, CFG.C.text, 'left', 'bold');
      for (var k = 0; k < s.lines.length; k++) {
        txt(ctx, s.lines[k], 124, s.y + S(52 + k * 24), 12, CFG.C.dim);
      }
    }
  }

  /* ----------------------------- 结算页 ----------------------------- */
  function drawOver(ctx, game, LAY, win) {
    pageBg(ctx, LAY);

    var oy = LAY.overTop;
    panel(ctx, 66, oy + S(16), 588, S(602));
    var col = win ? '#2ee6a8' : '#ff5d6c';
    str(ctx, win ? '防线守住了' : '核心被击穿', 360, oy + S(74), 34, col, 'center', 'bold', 6);
    /* 副标题位：有「本局新解锁」时改报解锁（那是成长系统里最该被看见的一刻，
     * 而「20 波全部清空」与下面数据行的「坚守波次」本来就是重复信息），
     * 平时保持原样。做成改写而不是新增一行 —— 副标题与首行数据之间只有
     * S(52) 的纵向余量，塞第三行字在大字号档下必挤（S 与 F 不同源，量出来的）。 */
    var lg = game.lastGain;
    var subLine = win ? '20 波全部清空' : '防线在第 ' + game.wave + ' 波崩溃';
    var subCol = CFG.C.dim;
    if (lg && lg.unlocked && lg.unlocked.length) {
      var unames = [];
      for (var u = 0; u < lg.unlocked.length; u++) unames.push(lg.unlocked[u].name);
      subLine = '解锁 · ' + unames.join(' / ');
      subCol = '#7ef2c0';
    }
    txt(ctx, subLine, 360, oy + S(118), 16, subCol, 'center', subCol === CFG.C.dim ? '' : 'bold');

    var rows = [
      ['最终得分', String(game.score)],
      ['坚守波次', game.wave + ' / ' + game.wavesTotal],
      ['击杀总数', String(game.kills)],
      ['漏怪数量', String(game.leaked)],
      ['本局回响点', '+' + (lg ? lg.gain : 0)],
      ['历史最高', String(game.best)]
    ];
    /* 行距 52 → 44：多了「本局回响点」一行，得把六行塞进按钮上方的空间。
     * 44 对 16/20 号字仍有富余（原 52 是给五行留的），版式自检按文本高度量，过不了会报。 */
    for (var i = 0; i < rows.length; i++) {
      var y = oy + S(170 + i * 44);
      var hot = rows[i][0] === '本局回响点';
      txt(ctx, rows[i][0], 140, y, 16, hot ? '#7ef2c0' : CFG.C.dim);
      txt(ctx, rows[i][1], 580, y, hot ? 24 : 20, hot ? '#7ef2c0' : CFG.C.text, 'right', 'bold');
    }

    var b = G.UI.againBtn();
    U.roundRect(ctx, b.x, b.y, b.w, b.h, S(22));
    ctx.fillStyle = 'rgba(47,143,255,0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,230,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    str(ctx, '再来一局', b.x + b.w / 2, b.y + b.h / 2, 22, '#e9f2ff', 'center', 'bold', 5);
    ghostBtn(ctx, G.UI.againHome(), '回到首页', 20, '#8fe6ff');
  }

  /* ------------------------ 图鉴 / 首次遭遇 ------------------------ */

  /** 图鉴里画怪物形象需要一个「实体」：Monsters.draw 只读这几个字段。
   *  x/y 就是圆心、r 是想要的半径 —— 同一份形象代码在棋盘与图鉴里尺寸不同，
   *  所以图鉴不必维护第二套形象。 */
  function codexMonster(key, x, y, r) {
    var d = CFG.ENEMIES[key];
    return {
      uid: 7, key: key, def: d, color: d.color, r: r, x: x, y: y,
      fx: 0, fy: 1, hitFlash: 0, off: 5.5, phaseT: 0, mode: 'path'
    };
  }

  /** 圆角面板 + 内部径向光晕 + 描边。
   *  光晕必须 clip 到圆角内：不 clip 会把面板的四角与描边一起糊掉，
   *  这种问题数字全合法，只有截图看得出来。 */
  function glowPanel(ctx, rc, rad, baseFill, glowCol, strokeCol, lw) {
    U.roundRect(ctx, rc.x, rc.y, rc.w, rc.h, rad);
    ctx.fillStyle = baseFill;
    ctx.fill();
    if (glowCol) {
      ctx.save();
      U.roundRect(ctx, rc.x, rc.y, rc.w, rc.h, rad);
      ctx.clip();
      var gx = rc.x + rc.w / 2, gy = rc.y + rc.h * 0.34;
      var g = ctx.createRadialGradient(gx, gy, 10, gx, gy, Math.max(rc.w, rc.h) * 0.5);
      g.addColorStop(0, glowCol);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
      ctx.restore();
    }
    U.roundRect(ctx, rc.x, rc.y, rc.w, rc.h, rad);
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
  }

  /* —— 图鉴：整屏页 —— */
  function drawCodex(ctx, game, LAY) {
    pageBg(ctx, LAY);
    var oy = LAY.codexTop;
    /* 三个 tab：0 怪物 / 1 炮台 / 2 回响档案。越界值一律夹回 0，
     * 免得存档或状态串味时画出空白页。 */
    var tab = Math.max(0, Math.min(2, game.codexTab || 0));
    var enemies = G.Codex.enemyKeys();
    var towers = G.Codex.towerKeys();

    str(ctx, '图鉴', 40, oy + S(46), 34, '#e9f2ff', 'left', 'bold', 6);
    txt(ctx, tab === 0
      ? 'C O D E X · 已遭遇 ' + G.Codex.seenCount() + ' / ' + enemies.length + ' 种'
      : tab === 1
        ? 'C O D E X · ' + towers.length + ' 座炮台与元素反应'
        : 'E C H O   P R O F I L E · 累计回响点 ' + (G.Profile ? G.Profile.pts() : 0),
      40, oy + S(86), 12, '#5fc8ff', 'left', 'bold');
    ghostBtn(ctx, G.UI.codexBack(), '返回', 18, '#8fe6ff');

    ctx.strokeStyle = 'rgba(150,190,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, oy + S(104));
    ctx.lineTo(680, oy + S(104));
    ctx.stroke();

    var tabs = G.UI.codexTabs();
    for (var i = 0; i < tabs.length; i++) {
      var tr = tabs[i], on = (i === tab);
      U.roundRect(ctx, tr.x, tr.y, tr.w, tr.h, S(16));
      ctx.fillStyle = on ? 'rgba(95,200,255,0.18)' : 'rgba(255,255,255,0.03)';
      ctx.fill();
      ctx.strokeStyle = on ? 'rgba(143,230,255,0.8)' : 'rgba(140,160,190,0.25)';
      ctx.lineWidth = on ? 2.4 : 1.5;
      ctx.stroke();
      txt(ctx, G.UI.CODEX_TABS[i], tr.x + tr.w / 2, tr.y + tr.h / 2, 18,
        on ? '#cdefff' : CFG.C.dim, 'center', 'bold');
    }

    /* 第三页：回响档案。整页只有一个可交互控件（深渊开关），三条解锁线是纯展示，
     * 所以在 tab 判定处就分流，不走下面的「格子 / 详情」逻辑。 */
    if (tab === 2) {
      drawProfile(ctx, game);
      return;
    }

    if (game.codexSel) {
      if (tab === 0) drawCodexEnemyDetail(ctx, G.Codex.enemy(game.codexSel), game);
      else drawCodexTowerDetail(ctx, G.Codex.tower(game.codexSel), game);
      return;
    }

    var keys = (tab === 0) ? enemies : towers;
    for (var k = 0; k < keys.length; k++) {
      if (tab === 0) drawCodexEnemyCell(ctx, G.UI.codexCell(k), keys[k], game.time);
      else drawCodexTowerCell(ctx, G.UI.codexCell(k), keys[k]);
    }
    txt(ctx, tab === 0 ? '点条目查看详情 · 未遭遇的显示三个问号'
      : '点条目查看数值，以及它参与的全部元素反应',
      360, G.UI.codexHint().y, 12, CFG.C.dim, 'center');
  }

  /* —— 回响档案：图鉴第三页（成长系统） ——
   * 结构与另两页不同：没有格子、没有详情，只有「一张总览卡 + 三条解锁线
   * + 战功录 + 一个开关」。三条线的门槛是累计制，所以画的是**进度**而不是价格。 */
  function drawProfile(ctx, game) {
    var P = G.Profile;
    if (!P) return;                    // 模块缺失时静默不画（兜底，正常不会发生）
    var COL = CFG.C;
    var pts = P.pts();

    /* 1) 回响点总览。结算公式那行是特意写出来的 ——
     * 玩家要能自己算出「再打几局能解锁」，成长感才成立。 */
    var c = G.UI.profileCard();
    glowPanel(ctx, c, S(16), 'rgba(42,60,94,0.9)', 'rgba(126,242,192,0.16)',
      'rgba(126,242,192,0.45)', 2);
    txt(ctx, '累计回响点', c.x + S(24), c.y + S(34), 14, COL.dim, 'left');
    txt(ctx, String(pts), c.x + c.w - S(24), c.y + S(56), 34, '#7ef2c0', 'right', 'bold');
    txt(ctx, '每局结算：波次 × 12 + 击杀 ÷ 8 − 漏怪 × 15 · 通关额外 +200',
      c.x + S(24), c.y + S(84), 12, COL.dim, 'left');

    /* 2) 三条解锁线：名称 / 描述 / 当前档 / 下一档门槛 / 进度条。
     * 进度按「当前档门槛 → 下一档门槛」算，所以每一条读出来都是「还差多少」。 */
    var lines = CFG.UNLOCKS;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var r = G.UI.profileLine(i);
      var ti = P.tierOf(line);
      var done = P.has(line.key);
      var curAt = ti >= 0 ? line.tiers[ti].at : 0;
      var next = ti + 1 < line.tiers.length ? line.tiers[ti + 1] : null;
      var lastLabel = line.tiers[line.tiers.length - 1].label;
      var curLabel = line.tiers[ti >= 0 ? ti : 0].label;

      panel(ctx, r.x, r.y, r.w, r.h, 'rgba(36,53,84,0.9)');
      U.roundRect(ctx, r.x, r.y, r.w, r.h, S(12));
      ctx.strokeStyle = done ? U.hexToRgba(line.color, 0.55) : 'rgba(140,160,190,0.22)';
      ctx.lineWidth = done ? 1.6 : 1;
      ctx.stroke();

      txt(ctx, line.name, r.x + S(16), r.y + S(30), 17,
        done ? line.color : COL.text, 'left', 'bold');
      txt(ctx, line.desc, r.x + S(16), r.y + S(52), 12, COL.dim, 'left');

      txt(ctx, done ? '已解锁' : '下一档 ' + next.at + ' 点',
        r.x + r.w - S(16), r.y + S(30), 14, done ? '#7ef2c0' : COL.text, 'right', 'bold');
      /* 档位进度只对多档线有意义。单档线（凝霜 / 深渊）写成「上架 / 上架」
       * 「开启 / 开启」是废话 —— 那两条的右列只留「已解锁 / 下一档 N 点」。 */
      if (line.tiers.length > 1) {
        txt(ctx, curLabel + ' / ' + lastLabel,
          r.x + r.w - S(16), r.y + S(52), 12, COL.dim, 'right');
      }

      var b = G.UI.profileBar(i);
      var pct = 1;
      if (next) {
        pct = (pts - curAt) / Math.max(1, next.at - curAt);
        if (pct < 0) pct = 0;
        if (pct > 1) pct = 1;
      }
      bar(ctx, b.x, b.y, b.w, b.h, pct, line.color, line.color);
    }

    /* 3) 战功录：一行四格，上标签下数值。纯展示，不可点。 */
    var st = P.stats();
    var sb = G.UI.profileStats();
    panel(ctx, sb.x, sb.y, sb.w, sb.h, 'rgba(36,53,84,0.9)');
    txt(ctx, '战功录', sb.x + S(16), sb.y + S(32), 15, COL.text, 'left', 'bold');
    var cells = [
      ['开局次数', String(st.runs)],
      ['累计击杀', String(st.kills)],
      ['通关次数', String(st.wins)],
      ['最高波次', st.best + ' / ' + CFG.TOTAL_WAVES]
    ];
    var cw = (sb.w - S(32)) / cells.length;
    for (var k = 0; k < cells.length; k++) {
      var cx = sb.x + S(16) + k * cw;
      txt(ctx, cells[k][0], cx, sb.y + S(76), 12, COL.dim, 'left');
      txt(ctx, cells[k][1], cx, sb.y + S(110), 20, COL.text, 'left', 'bold');
    }

    /* 4) 深渊开关。没解锁也画（写明门槛），让玩家知道上面还有一层。 */
    var db = G.UI.profileDeepBtn();
    var unlocked = P.has('deep');
    var on = P.deepOn();
    var gate = 0;
    for (var q = 0; q < CFG.UNLOCKS.length; q++) {
      if (CFG.UNLOCKS[q].key === 'deep') gate = CFG.UNLOCKS[q].tiers[0].at;
    }
    btn(ctx, db, unlocked
      ? (on ? '深渊 · 已开启' : '深渊 · 未开启')
      : '深渊 · ' + gate + ' 点解锁',
      unlocked, on ? '#ff4d6d' : '#8fa6c8');
    if (unlocked) {
      /* 深渊成绩单独立榜，所以这里必须把 deepBest 带出来 —— 只说「独立记录」
       * 而不给数字，玩家不知道该去哪看自己的深渊成绩。未打过就不显示数字。 */
      var deepLine = '开启后下一局生效 · 敌人血量 ×' + CFG.DEEP.hpMul;
      deepLine += st.deepBest > 0
        ? ' · 深渊最深 ' + st.deepBest + ' 波'
        : '，成绩独立记录';
      txt(ctx, deepLine, db.x + db.w / 2, db.y + db.h + S(22), 12, COL.dim, 'center');
    }

    txt(ctx, '三条解锁线按累计回响点自动开启，不需要选择花费',
      360, G.UI.codexHint().y, 12, COL.dim, 'center');
  }

  /* —— 图鉴：怪物格子（未遭遇 → 三个问号） —— */
  function drawCodexEnemyCell(ctx, rc, key, t) {
    var seen = G.Codex.isSeen(key);
    var d = CFG.ENEMIES[key];
    var cx = rc.x + rc.w / 2, icy = rc.y + S(48);
    var col = seen ? d.color : '#93a7c6';

    glowPanel(ctx, rc, S(18), seen ? 'rgba(42,60,94,0.9)' : 'rgba(24,36,58,0.8)',
      seen ? U.hexToRgba(d.color, 0.20) : null,
      seen ? U.hexToRgba(d.color, 0.5) : 'rgba(150,190,255,0.16)', seen ? 2 : 1.5);

    if (seen && G.Monsters) {
      G.Monsters.draw(ctx, codexMonster(key, cx, icy + S(10), S(24)), t, 1);
    } else {
      // 未遭遇：一个大问号当「剪影」，不是把真身涂黑（涂黑会被认成已解锁）
      // 字号 46 是字号表里最大的一档 —— 表外的值（如 40）会走 FONT_K 兜底被放大 1.5 倍，
      // 看起来「反而更大」，font-check 的「用到的字号都在表里」就是防这个。
      txt(ctx, '?', cx, icy + S(4), 46, 'rgba(139,160,198,0.30)', 'center', 'bold');
    }
    var textPos = G.UI.codexCellText(rc);
    txt(ctx, seen ? d.name : '? ? ?', cx, textPos.nameY, 17,
      seen ? CFG.C.text : '#9db0cf', 'center', 'bold');
    txt(ctx, seen ? G.Codex.enemy(key).role : '未遭遇',
      cx, textPos.subY, 12, seen ? col : '#93a7c6', 'center');
  }

  /* —— 图鉴：炮台格子 —— */
  function drawCodexTowerCell(ctx, rc, key) {
    var info = G.Codex.tower(key);
    if (!info) return;
    var cx = rc.x + rc.w / 2;
    glowPanel(ctx, rc, S(18), 'rgba(42,60,94,0.9)', U.hexToRgba(info.color, 0.20),
      U.hexToRgba(info.color, 0.5), 2);
    elemIcon(ctx, info.elem, cx, rc.y + S(60), S(22), info.soft);
    var textPos = G.UI.codexCellText(rc);
    txt(ctx, info.name, cx, textPos.nameY, 17, CFG.C.text, 'center', 'bold');
    /* 副标题只写「造价 · 攻击方式」：格宽 204 在放大的字号档下容得下
     * 「60 能量 · 连锁闪电」这种长串（layout-check 的「格宽容得下副标题」量着） */
    txt(ctx, info.cost + ' · ' + info.kind, cx, textPos.subY, 12, CFG.C.dim, 'center');
  }

  /* —— 图鉴：怪物详情 —— */
  function drawCodexEnemyDetail(ctx, info, game) {
    if (!info) return;
    var hero = G.UI.codexHero();
    glowPanel(ctx, hero, S(20), CFG.C.panelSoft, U.hexToRgba(info.color, 0.22),
      U.hexToRgba(info.color, 0.42), 2);

    var cx = hero.x + S(84), cy = hero.y + hero.h / 2;
    if (G.Monsters) {
      G.Monsters.draw(ctx, codexMonster(info.key, cx, cy + S(12), S(42)), game.time, 1);
    }
    txt(ctx, info.name, hero.x + S(172), hero.y + S(52), 26, '#e9f2ff', 'left', 'bold');
    txt(ctx, info.role, hero.x + S(172), hero.y + S(96), 15, info.color, 'left', 'bold');
    txt(ctx, info.tag, hero.x + S(172), hero.y + S(130), 12, CFG.C.dim);

    drawCodexStats(ctx, [['生命', info.hp], ['速度', info.speed],
      ['护甲', info.armor], ['赏金', info.reward]]);

    var b = G.UI.codexBlock();
    panel(ctx, b.x, b.y, b.w, b.h, CFG.C.panelSoft);
    txt(ctx, '要点', b.x + S(20), b.y + S(28), 16, CFG.C.text, 'left', 'bold');
    for (var i = 0; i < info.lines.length; i++) {
      txt(ctx, info.lines[i], b.x + S(20), b.y + S(58) + i * S(28), 12, CFG.C.dim);
    }

    /* 打法：怪物详情独有的第三块（炮台详情这里放的是元素反应）。
     * 数字标注（护甲 / 压制半径）现读 CFG，右对齐在同一行 —— 它跟
     * 平衡数值一起变，写死在文案里迟早对不上。 */
    var hb = G.UI.codexHowtoBlock();
    panel(ctx, hb.x, hb.y, hb.w, hb.h, CFG.C.panelSoft);
    txt(ctx, '打法', hb.x + S(20), hb.y + S(28), 16, info.color, 'left', 'bold');
    txt(ctx, info.counter, hb.x + hb.w - S(20), hb.y + S(28), 12, CFG.C.dim, 'right');
    for (var i2 = 0; i2 < info.howto.length && i2 < 2; i2++) {
      txt(ctx, info.howto[i2], hb.x + S(20), hb.y + S(60) + i2 * S(28), 12, CFG.C.text);
    }

    ghostBtn(ctx, G.UI.codexDetailBack(), '返回列表', 18, '#8fe6ff');
  }

  /* —— 图鉴：炮台详情（含该元素参与的全部反应） —— */
  function drawCodexTowerDetail(ctx, info, game) {
    if (!info) return;
    var hero = G.UI.codexHero();
    glowPanel(ctx, hero, S(20), CFG.C.panelSoft, U.hexToRgba(info.color, 0.22),
      U.hexToRgba(info.color, 0.42), 2);

    elemIcon(ctx, info.elem, hero.x + S(84), hero.y + hero.h / 2, S(40), info.soft);
    txt(ctx, info.name, hero.x + S(172), hero.y + S(46), 26, '#e9f2ff', 'left', 'bold');
    txt(ctx, info.elemName + '元素 · ' + info.kind,
      hero.x + S(172), hero.y + S(88), 15, info.color, 'left', 'bold');
    txt(ctx, info.cost + ' 能量 · ' + info.role, hero.x + S(172), hero.y + S(126), 12, CFG.C.dim);

    drawCodexStats(ctx, [['伤害', info.dmg], ['射程', info.range],
      ['攻速', info.rate.toFixed(2)], ['耐久', info.hp]]);

    var b = G.UI.codexBlock();
    panel(ctx, b.x, b.y, b.w, b.h, CFG.C.panelSoft);
    txt(ctx, '攻击方式', b.x + S(20), b.y + S(28), 16, CFG.C.text, 'left', 'bold');
    for (var i = 0; i < info.lines.length; i++) {
      txt(ctx, info.lines[i], b.x + S(20), b.y + S(58) + i * S(28), 12, CFG.C.dim);
    }

    var rb = G.UI.codexReactBlock();
    panel(ctx, rb.x, rb.y, rb.w, rb.h, CFG.C.panelSoft);
    txt(ctx, '元素反应', rb.x + S(20), rb.y + S(28), 16, CFG.C.text, 'left', 'bold');

    var rs = G.Codex.reactionsOf(info.elem);
    var CO = G.UI.CODEX_REACT_COLS;
    for (var k = 0; k < rs.length; k++) {
      var row = G.UI.codexReactRow(k);
      var ry = row.y + row.h / 2;
      var on = rs[k].active;
      var oc = CFG.ELEM[rs[k].otherElem];
      /* 对手元素的图标：没上场的元素（比如留档的冰）画成灰的，
       * 一眼能看出「这条反应现在打不出来」，而不是让人以为漏了。 */
      elemIcon(ctx, rs[k].otherElem, row.x + S(CO.icon), ry, S(CO.side),
        on ? oc.soft : 'rgba(140,160,190,0.5)');
      txt(ctx, oc.name + ' ' + rs[k].name, row.x + S(CO.nameX), ry, 15,
        on ? rs[k].color : '#9db0cf', 'left', 'bold');
      txt(ctx, rs[k].effect, row.x + S(CO.effectX), ry, 12, on ? CFG.C.dim : '#93a7c6');
      txt(ctx, on ? ('× ' + rs[k].otherTowerName) : '未上线',
        rb.x + rb.w - S(16), ry, 12, on ? U.hexToRgba(rs[k].color, 0.95) : '#93a7c6',
        'right', on ? 'bold' : '');
    }

    ghostBtn(ctx, G.UI.codexDetailBack(), '返回列表', 18, '#8fe6ff');
  }

  /** 详情页与弹窗共用的数值格：一行四格，标签在上、数值在下 */
  function drawCodexStats(ctx, stats) {
    var cells = G.UI.codexStatCells();
    for (var i = 0; i < cells.length && i < stats.length; i++) {
      var c = cells[i];
      U.roundRect(ctx, c.x + S(4), c.y, c.w - S(8), c.h, S(14));
      ctx.fillStyle = CFG.C.chip;
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,190,255,0.16)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      txt(ctx, stats[i][0], c.x + c.w / 2, c.y + S(26), 12, CFG.C.dim, 'center');
      txt(ctx, String(stats[i][1]), c.x + c.w / 2, c.y + S(54), 20, CFG.C.text, 'center', 'bold');
    }
  }

  /* —— 首次遭遇：暂停下的弹窗 ——
   * 战斗在这一刻是停的（main.js 的 update 在图鉴/弹窗状态直接早退），
   * 但 game.time 照常走 —— 所以形象还在做动画：一个完全静止的弹窗
   * 看起来像卡死了，动起来才像「暂停」。 */
  function drawMonsterPop(ctx, game, LAY) {
    var info = G.Codex ? G.Codex.enemy(game.popKey) : null;
    if (!info) return;
    var p = G.UI.popPanel();
    var t = game.time;

    // 遮罩：刻意留一点透，让玩家看到「战场还在，只是停了」
    ctx.fillStyle = 'rgba(10,18,32,0.80)';
    ctx.fillRect(0, 0, 720, LAY.designH);

    var pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    glowPanel(ctx, p, S(24), CFG.C.panel2, U.hexToRgba(info.color, 0.20),
      U.hexToRgba(info.color, 0.5 + pulse * 0.3), 2.5);

    var L = G.UI.POP_LINES;
    txt(ctx, '首 次 遭 遇', p.x + p.w / 2, p.y + S(L.title), 15, '#ffd27a', 'center', 'bold');
    txt(ctx, info.name, p.x + p.w / 2, p.y + S(L.name), 26, '#e9f2ff', 'center', 'bold');
    txt(ctx, info.role, p.x + p.w / 2, p.y + S(L.role), 13, info.color, 'center', 'bold');

    /* 形象圆心直接取 UI.popFigure() 的结果 —— 那里已经按 CFG.MON_EXTENT
     * 把「上躲定位行、下躲概括行」算进去了，不要在这里再补偏移。 */
    var f = G.UI.popFigure();
    if (G.Monsters) G.Monsters.draw(ctx, codexMonster(info.key, f.x, f.y, f.r), t, 1);

    txt(ctx, info.tag, p.x + p.w / 2, p.y + S(L.tag), 13, CFG.C.text, 'center');

    /* 弹窗里的数值格复用详情页那一套，但坐标要落在弹窗面板里 ——
     * 所以这里临时按 popStatCells 画（与 detail 用的 codexStatCells 不同源）。 */
    var cells = G.UI.popStatCells();
    var stats = [['生命', info.hp], ['速度', info.speed],
      ['护甲', info.armor], ['赏金', info.reward]];
    for (var i = 0; i < cells.length && i < stats.length; i++) {
      var c = cells[i];
      U.roundRect(ctx, c.x + S(3), c.y, c.w - S(6), c.h, S(12));
      ctx.fillStyle = CFG.C.chip;
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,190,255,0.16)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      txt(ctx, stats[i][0], c.x + c.w / 2, c.y + S(26), 12, CFG.C.dim, 'center');
      txt(ctx, String(stats[i][1]), c.x + c.w / 2, c.y + S(54), 20, CFG.C.text, 'center', 'bold');
    }

    var b = G.UI.popBlock();
    panel(ctx, b.x, b.y, b.w, b.h, CFG.C.chip);
    txt(ctx, '要点 · 打法', b.x + S(18), b.y + S(28), 16, CFG.C.text, 'left', 'bold');
    var row = 0;
    for (var k = 0; k < info.lines.length; k++, row++) {
      txt(ctx, info.lines[k], b.x + S(18), b.y + S(58) + row * S(28), 12, CFG.C.dim);
    }
    /* 首次遭遇这一屏是全流程里唯一「必须看懂」的一屏：新怪第一次出现时
     * 玩家还不知道它要什么对策。所以这里除了要点，还把打法第 1 条单独
     * 提亮一行放在最后（色用这只怪的主色，跟标题呼应）。 */
    if (info.howto && info.howto.length) {
      row++;
      txt(ctx, '▸ ' + info.howto[0], b.x + S(18), b.y + S(58) + row * S(28), 12, info.color);
    }

    mainBtn(ctx, G.UI.popOk(), '继续', 22, t);
  }

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
