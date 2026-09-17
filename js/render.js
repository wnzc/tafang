/**
 * render.js —— 全部绘制
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, U = G.Util, R = G.Runtime;

  var Render = G.Render = {};

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
    ctx.fillStyle = bg || 'rgba(255,255,255,0.07)';
    ctx.fill();
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

  /* 七元素图标：几何近似原神元素符号，自包含上色（调用处不再 fill）。
   * 火焰/水滴/雷/岩/草为填充形，冰/风为线条形——都用单一颜色，缩到多小都认得出。 */
  function elemIcon(ctx, elem, cx, cy, r) {
    var el = CFG.ELEM[elem];
    var col = el ? el.color : '#9fd8ff';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;

    if (elem === 'pyro') {
      // 火焰：上尖下圆的火苗，内部再挖一个小火苗的暗芯
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.72, r * 0.6, 0, r);
      ctx.bezierCurveTo(-r * 0.72, r * 0.6, -r * 0.9, -r * 0.2, 0, -r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(4,8,18,0.55)';
      ctx.beginPath();
      ctx.moveTo(0, r * 0.62);
      ctx.bezierCurveTo(r * 0.42, r * 0.28, r * 0.28, -r * 0.12, 0, -r * 0.38);
      ctx.bezierCurveTo(-r * 0.28, -r * 0.12, -r * 0.42, r * 0.28, 0, r * 0.62);
      ctx.closePath();
      ctx.fill();

    } else if (elem === 'hydro') {
      // 水滴：上尖下圆
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.95, r * 0.12, r * 0.6, r, 0, r);
      ctx.bezierCurveTo(-r * 0.6, r, -r * 0.95, r * 0.12, 0, -r);
      ctx.closePath();
      ctx.fill();

    } else if (elem === 'cryo') {
      // 冰晶：六向雪花，每根辐条带一对雪枝
      ctx.lineWidth = Math.max(1.3, r * 0.16);
      ctx.lineCap = 'round';
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3;
        var ca = Math.cos(a), sa = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ca * r, sa * r);
        ctx.stroke();
        var bx = ca * r * 0.55, by = sa * r * 0.55;
        for (var s = -1; s <= 1; s += 2) {
          var ba = a + s * 0.95;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ba) * r * 0.3, by + Math.sin(ba) * r * 0.3);
          ctx.stroke();
        }
      }

    } else if (elem === 'electro') {
      // 雷：闪电折线多边形
      ctx.beginPath();
      ctx.moveTo(r * 0.28, -r);
      ctx.lineTo(-r * 0.42, r * 0.08);
      ctx.lineTo(-r * 0.02, r * 0.08);
      ctx.lineTo(-r * 0.28, r);
      ctx.lineTo(r * 0.46, -r * 0.14);
      ctx.lineTo(r * 0.04, -r * 0.14);
      ctx.closePath();
      ctx.fill();

    } else if (elem === 'anemo') {
      // 风：三段旋臂组成的涡旋
      ctx.lineWidth = Math.max(1.5, r * 0.2);
      ctx.lineCap = 'round';
      for (var k = 0; k < 3; k++) {
        var a0 = k * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a0) * r * 0.42, Math.sin(a0) * r * 0.42,
          r * 0.56, a0 + Math.PI * 0.75, a0 + Math.PI * 1.85);
        ctx.stroke();
      }

    } else if (elem === 'geo') {
      // 岩：外菱形 + 内菱形暗芯，宝石感
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.72, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.72, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(4,8,18,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.48);
      ctx.lineTo(r * 0.34, 0);
      ctx.lineTo(0, r * 0.48);
      ctx.lineTo(-r * 0.34, 0);
      ctx.closePath();
      ctx.fill();

    } else {
      // 草：斜放的叶片 + 中脉
      ctx.rotate(0.72);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r * 0.88, -r * 0.22, 0, r);
      ctx.quadraticCurveTo(-r * 0.88, -r * 0.22, 0, -r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(4,8,18,0.5)';
      ctx.lineWidth = Math.max(1.1, r * 0.14);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.62);
      ctx.lineTo(0, r * 0.68);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */

  Render.draw = function (game) {
    var ctx = R.ctx;
    if (!ctx) return;
    var LAY = G.LAY;
    R.applyTransform(ctx);

    var g = ctx.createLinearGradient(0, -300, 0, LAY.designH + 300);
    g.addColorStop(0, '#04060d');
    g.addColorStop(0.45, '#080e1c');
    g.addColorStop(1, '#04060d');
    ctx.fillStyle = g;
    ctx.fillRect(-400, -500, 1520, LAY.designH + 1000);

    var sx = 0, sy = 0;
    if (game.shake > 0) { sx = U.rand(-1, 1) * game.shake; sy = U.rand(-1, 1) * game.shake; }

    ctx.save();
    ctx.translate(sx, sy);
    drawBoard(ctx, game, LAY);
    // 塔先画，再画链：相邻塔只隔 64px，链画在下层会被塔身整段盖住，
    // 而「哪里成链了」是玩家最需要一眼看懂的信息，必须浮在塔之上
    drawTowers(ctx, game, LAY);
    drawLinks(ctx, game);
    drawNodes(ctx, game);
    drawEnemies(ctx, game);
    drawBullets(ctx, game);
    G.FX.draw(ctx);
    ctx.restore();

    var playing = (game.state === 'prep' || game.state === 'wave');
    var paging = (game.state === 'menu' || game.state === 'set' || game.state === 'help');
    // HUD 只在「打的时候」和结算时画；菜单/设置/玩法是整屏版式，不画 HUD
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
    if (game.state === 'over') drawOver(ctx, game, LAY, false);
    if (game.state === 'win') drawOver(ctx, game, LAY, true);

    // 整屏版式也要能看到提示（比如切字号后的回执），
    // 位置仍贴着建造栏顶边，所以不会压到版式内容
    if (game.state === 'set' || game.state === 'help') drawToast(ctx, game, LAY);

    // 音效快捷开关：游戏与菜单都能点；设置/玩法页不画 ——
    // 大字号下它和玩法页的返回药丸会重叠（boot 自检抓到过），且设置页里已有音效开关
    if (game.state !== 'set' && game.state !== 'help') drawSoundBtn(ctx, game, LAY);
  };

  /* ------------------------- 音效开关 ------------------------- */
  function drawSoundBtn(ctx, game, LAY) {
    var sb = LAY.soundBtn;
    var A = G.Audio;
    var m = A ? A.isMuted() : true;
    var on = !m;
    var cy = sb.y + sb.h / 2;

    U.roundRect(ctx, sb.x, sb.y, sb.w, sb.h, S(14));
    ctx.fillStyle = on ? 'rgba(95,200,255,0.13)' : 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = on ? 'rgba(143,230,255,0.62)' : 'rgba(140,160,190,0.35)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    /* 喇叭：自绘几何图形，不用任何图标字体。按钮只有 100 宽，
     * 放不下「音效 开」四个大字，所以只留图标 + 一个字的开关状态。
     * 图形整体按按钮高度等比缩放（u），字号一变图标不会还是个小米粒。 */
    var u = sb.h / 54;
    ctx.save();
    ctx.translate(sb.x + 30 * u, cy);
    ctx.scale(u, u);
    ctx.fillStyle = on ? '#8fe6ff' : '#7c8aa4';
    ctx.beginPath();
    ctx.moveTo(-5, -3);
    ctx.lineTo(-1, -3);
    ctx.lineTo(5, -8);
    ctx.lineTo(5, 8);
    ctx.lineTo(-1, 3);
    ctx.lineTo(-5, 3);
    ctx.closePath();
    ctx.fill();

    if (on) {
      ctx.strokeStyle = 'rgba(143,230,255,0.9)';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(2, 0, 6, -0.95, 0.95); ctx.stroke();
      ctx.beginPath(); ctx.arc(2, 0, 10, -0.9, 0.9); ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,125,140,0.9)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(15, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(15, -7); ctx.lineTo(6, 7); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.restore();

    txt(ctx, on ? '开' : '关', sb.x + 72, cy, 13,
      on ? '#cdefff' : '#8ba0c6', 'center', 'bold');
  }

  /* ---------------------------- 棋盘 ---------------------------- */
  function drawBoard(ctx, game, LAY) {
    var CELL = CFG.CELL, COLS = CFG.COLS, ROWS = CFG.ROWS;
    var bx = LAY.boardX, by = LAY.boardY;
    var t = game.time;

    U.roundRect(ctx, bx - 9, by - 9, LAY.boardW + 18, LAY.boardH + 18, 20);
    ctx.fillStyle = '#0a1120';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,164,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = bx + c * CELL, y = by + r * CELL;
        U.roundRect(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8);
        ctx.fillStyle = ((r + c) % 2 === 0) ? '#0d1728' : '#0b1424';
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
    U.roundRect(ctx, x0 + 6, y0 + 6, w - 12, hh - 12, 14);
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
    ctx.arc(mx, my, 20 + pulse2 * 5, 0, Math.PI * 2);
    ctx.stroke();
    U.poly(ctx, mx, my, 16, 4, 0);
    ctx.fillStyle = 'rgba(150,235,255,' + (0.55 + pulse2 * 0.35) + ')';
    ctx.fill();
    /* 字比核心图标大一档，挂在核心上方 48：既离开图标本体（半径 25），
     * 又给底部那一行留出余地 —— 浮动提示压在棋盘底时不会盖到这两个字。 */
    txt(ctx, '核心', mx, my - S(48), 13, 'rgba(180,240,255,0.8)', 'center');

    // 脉冲瞄准提示
    if (game.pulseMode) {
      ctx.strokeStyle = 'rgba(159,216,255,0.55)';
      ctx.lineWidth = 2;
      U.roundRect(ctx, bx - 3, by - 3, LAY.boardW + 6, LAY.boardH + 6, 18);
      ctx.stroke();
    }
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
      ctx.strokeStyle = 'rgba(4,8,18,0.8)';
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
    var col = sup ? '#6b7893' : el.color;
    var soft = sup ? '#98a3ba' : el.soft;

    // 1) 地面余光（只露出一圈边，形成元素色描边感）
    ctx.globalAlpha = sup ? 0.08 : 0.16;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // 2) 六边形底盘（半径收到 22：塔在格子里少占一点，留出格子边界感）
    U.poly(ctx, x, y, 22, 6, Math.PI / 6);
    ctx.fillStyle = sup ? '#141a26' : '#111c30';
    ctx.fill();
    ctx.strokeStyle = U.hexToRgba(col, sup ? 0.35 : 0.8);
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 内层暗底，做出厚度
    U.poly(ctx, x, y, 15.5, 6, Math.PI / 6);
    ctx.fillStyle = 'rgba(4,8,18,0.6)';
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
    ctx.fillStyle = sup ? '#232c3d' : '#25405e';
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
    // 管口：七种元素七种小形状（半径收到 5 上下——图标要小，不抢格子的戏）
    ctx.translate(29 - back, 0);
    if (t.elem === 'pyro') U.poly(ctx, 0, 0, 5.2, 3, 0);
    else if (t.elem === 'hydro') U.poly(ctx, 0, 0, 5.6, 4, Math.PI / 4);
    else if (t.elem === 'cryo') { U.poly(ctx, 0, 0, 5.6, 4, Math.PI / 4); U.poly(ctx, 0, 0, 3.2, 4, 0); }
    else if (t.elem === 'electro') U.star(ctx, 0, 0, 5.8, 3, 4, 0);
    else if (t.elem === 'anemo') { ctx.beginPath(); ctx.arc(0, 0, 5, 0.6, 5.2); ctx.stroke(); }
    else if (t.elem === 'geo') U.poly(ctx, 0, 0, 5.4, 4, 0);
    else U.poly(ctx, 0, 0, 5.4, 3, Math.PI / 2);
    ctx.fillStyle = U.hexToRgba(soft, sup ? 0.5 : 0.95);
    ctx.fill();
    ctx.strokeStyle = 'rgba(4,6,13,0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // 6) 中心核心（缩一档，给格子留白）
    var pul = 0.5 + 0.5 * Math.sin(t0 * 4 + seed);
    ctx.beginPath();
    ctx.arc(x, y, 5.6 + pul * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = sup ? '#5c6679' : U.hexToRgba(col, 0.9);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = sup ? '#8b95a8' : '#ffffff';
    ctx.fill();

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

      if (e.shape === 'circle') {
        ctx.beginPath(); ctx.arc(e.x, e.y, r * sc, 0, Math.PI * 2);
      } else if (e.shape === 'tri') {
        U.poly(ctx, e.x, e.y, r * sc * 1.15, 3, Math.atan2(e.fy, e.fx) + Math.PI / 2);
      } else if (e.shape === 'hex') {
        U.poly(ctx, e.x, e.y, r * sc, 6, Math.PI / 6);
      } else if (e.shape === 'sq') {
        U.poly(ctx, e.x, e.y, r * sc * 1.15, 4, Math.PI / 4 + game.time * 2);
      } else if (e.shape === 'diamond') {
        U.poly(ctx, e.x, e.y, r * sc * 1.2, 4, Math.PI / 4);
      } else {
        U.poly(ctx, e.x, e.y, r * sc, 6, game.time * 1.2);
      }
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(4,8,18,0.8)';
      ctx.stroke();

      if (e.shape === 'boss') {
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

      // 血条
      var hpPct = U.clamp(e.hp / e.maxHp, 0, 1);
      if (hpPct < 0.999) {
        var w = Math.max(20, r * 2.2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        U.roundRect(ctx, e.x - w / 2, e.y - r - 11, w, 5, 2.5);
        ctx.fill();
        ctx.fillStyle = hpPct > 0.5 ? '#7ef2c0' : (hpPct > 0.22 ? '#ffd166' : '#ff5d6c');
        U.roundRect(ctx, e.x - w / 2, e.y - r - 11, w * hpPct, 5, 2.5);
        ctx.fill();
      }
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
      hpPct > 0.35 ? '#2ee6a8' : '#ff5d6c', '#8ef7d8', 'rgba(255,255,255,0.07)');
    txt(ctx, Math.ceil(game.coreHp) + ' / ' + game.coreMax, 428, H.hpLabel, 14, CFG.C.text, 'right', 'bold');

    // 回声充能
    txt(ctx, '回声充能', 40, H.ecLabel, 13, CFG.C.dim);
    var ep = game.echo / CFG.ECHO.max;
    bar(ctx, LAY.ecBar.x, LAY.ecBar.y, LAY.ecBar.w, LAY.ecBar.h, ep, '#2f8fff', '#8fe6ff');
    txt(ctx, ep >= 1 ? '就绪' : Math.floor(ep * 100) + '%', 428, H.ecLabel, 14,
      ep >= 1 ? '#8fe6ff' : CFG.C.text, 'right', 'bold');

    // 能量
    txt(ctx, '能量', hr, H.energyLabel, 13, CFG.C.dim, 'right');
    txt(ctx, String(Math.floor(game.energy)), hr, H.energyVal, 30, '#ffd27a', 'right', 'bold');

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
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,164,255,0.25)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      txt(ctx, '剩余目标 ' + left, r2.x + S(20), r2.y + r2.h / 2, 18, CFG.C.dim, 'left');
      if (game.echoBuffT > 0) {
        txt(ctx, '回声后遗症 +18% 敌方移速 ' + game.echoBuffT.toFixed(1) + 's',
          r2.x + r2.w - S(20), r2.y + r2.h / 2, 12, '#ff9d6b', 'right');
      }
    }
  }

  /* --------------------------- 底部建造栏 --------------------------- */
  function drawBottomBar(ctx, game, LAY) {
    var y = LAY.barY;
    U.roundRect(ctx, 12, y + S(3), 696, LAY.barH - S(6), S(22));
    ctx.fillStyle = 'rgba(13,20,36,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,164,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (var i = 0; i < LAY.cards.length; i++) {
      drawCard(ctx, LAY.cards[i], G.UI.cardKind(i), game);
    }
  }

  function drawCard(ctx, r, kind, game) {
    var active = false, col = '#5f7398', title = '', sub = '', disabled = false;

    if (kind.type === 'tower') {
      var d = CFG.TOWERS[kind.key];
      col = CFG.ELEM[d.elem].color;
      title = d.name;
      sub = String(d.cost);
      active = game.selCard === kind.key;
      disabled = game.energy < d.cost;
    } else if (kind.type === 'pulse') {
      col = '#5fc8ff';
      title = '脉冲';
      sub = String(CFG.PULSE.cost);
      active = game.pulseMode;
      disabled = game.energy < CFG.PULSE.cost;
    } else {
      col = '#8fe6ff';
      title = '倒带';
      sub = '4s';
      disabled = game.echo < CFG.ECHO.max;
      active = game.echo >= CFG.ECHO.max;
    }

    ctx.globalAlpha = disabled ? 0.42 : 1;
    U.roundRect(ctx, r.x, r.y, r.w, r.h, S(16));
    ctx.fillStyle = active ? U.hexToRgba(col, 0.18) : 'rgba(22,33,58,0.9)';
    ctx.fill();
    ctx.strokeStyle = active ? col : 'rgba(120,164,255,0.22)';
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.stroke();

    // 图标：9 卡一屏后卡宽只有 72，图标同步缩一档（elemIcon 自带颜色）
    var icx = r.x + r.w / 2, icy = r.y + S(30);
    if (kind.type === 'tower') {
      elemIcon(ctx, CFG.TOWERS[kind.key].elem, icx, icy, S(12));
    } else if (kind.type === 'pulse') {
      ctx.strokeStyle = col; ctx.lineWidth = 2.4;
      for (var k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(icx, icy, S(7) + k * S(5), 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      var p = game.echo / CFG.ECHO.max;
      U.roundRect(ctx, icx - S(17), icy - S(13), S(34), S(26), S(7));
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      U.poly(ctx, icx, icy, S(8), 3, -Math.PI / 2);
      ctx.fillStyle = col; ctx.fill();
      // 充能进度挪到卡片顶边：副标题下面已经排不下第二条了
      if (p < 1) {
        U.roundRect(ctx, r.x + S(10), r.y + S(10), (r.w - S(20)) * p, S(6), S(3));
        ctx.fillStyle = 'rgba(143,230,255,0.8)';
        ctx.fill();
      }
    }

    txt(ctx, title, r.x + r.w / 2, r.y + S(68), 12, CFG.C.text, 'center', 'bold');
    txt(ctx, kind.type === 'echo' ? (disabled ? '未充能' : '就绪') : '◈ ' + sub,
      r.x + r.w / 2, r.y + S(94), 12, disabled ? CFG.C.dim : '#ffd27a', 'center', kind.type === 'echo' ? '' : 'bold');
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
    ctx.fillStyle = '#131e34';
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
    ctx.fillStyle = enabled ? U.hexToRgba(col, 0.16) : 'rgba(255,255,255,0.04)';
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
    /* 贴着建造栏顶边往上挂：这样它落在棋盘与建造栏之间的空档底部。
     * 屏幕高度紧张时这个空档会被压扁，靠 config 的 RESERVE_BELOW 兜底。 */
    var w = S(300), h = S(54), x = 360 - w / 2, y = LAY.barY - h - S(6);
    U.roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(20,28,48,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,164,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    txt(ctx, game.toastMsg, 360, y + h / 2, 15, CFG.C.text, 'center');
    ctx.globalAlpha = 1;
  }

  /* ------------------- 整屏版式：菜单 / 设置 / 玩法 / 结算 ------------------- */

  /** 整屏版式的底色。必须近乎不透明：底下还画着棋盘与塔（尤其从结算页进来时） */
  function pageBg(ctx, LAY) {
    ctx.fillStyle = 'rgba(4,6,13,0.985)';
    ctx.fillRect(0, 0, 720, LAY.designH);
  }

  function panel(ctx, x, y, w, h, fill) {
    U.roundRect(ctx, x, y, w, h, S(20));
    ctx.fillStyle = fill || 'rgba(9,14,26,0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,164,255,0.22)';
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
    ctx.fillStyle = on ? U.hexToRgba(col, 0.16) : 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = on ? U.hexToRgba(col, 0.7) : 'rgba(140,160,190,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, on ? '开' : '关', r.x + r.w / 2, r.y + r.h / 2, 16,
      on ? col : '#8ba0c6', 'center', 'bold');
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
    ghostBtn(ctx, G.UI.menuHelp(), '玩法说明', 18, '#5fc8ff');
    ghostBtn(ctx, G.UI.menuSet(), '设置', 18, '#b06bff');

    txt(ctx, '最高分 ' + game.best, 360, oy + S(574), 14, CFG.C.dim, 'center');
    txt(ctx, '微信小游戏 · Canvas 2D 运行，无外部资源', 360, oy + S(612), 12, '#4b5c7d', 'center');
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
      panel(ctx, r.x, r.y, r.w, r.h, 'rgba(15,23,41,0.9)');
      txt(ctx, SET_LABEL[i], r.x + S(24), r.y + r.h / 2 - S(14), 16, CFG.C.text, 'left', 'bold');
      txt(ctx, SET_HINT[i], r.x + S(24), r.y + r.h / 2 + S(16), 12, CFG.C.dim);
    }

    // 字体大小：小 / 中 / 大
    var fb = G.UI.setFontBtns();
    for (i = 0; i < fb.length; i++) {
      var on = (i === CFG.FONT_LEVEL);
      U.roundRect(ctx, fb[i].x, fb[i].y, fb[i].w, fb[i].h, S(14));
      ctx.fillStyle = on ? 'rgba(95,200,255,0.20)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = on ? 'rgba(143,230,255,0.85)' : 'rgba(140,160,190,0.3)';
      ctx.lineWidth = on ? 2.4 : 1.6;
      ctx.stroke();
      txt(ctx, CFG.FONT_LEVELS[i].name, fb[i].x + fb[i].w / 2, fb[i].y + fb[i].h / 2,
        18, on ? '#cdefff' : '#8ba0c6', 'center', 'bold');
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
    panel(ctx, pv.x, pv.y, pv.w, pv.h, 'rgba(15,23,41,0.9)');
    txt(ctx, G.UI.SET_PREVIEW, pv.x + S(24), pv.y + pv.h / 2, 14, CFG.C.text, 'left');
    txt(ctx, G.UI.SET_PREVIEW_RIGHT + CFG.FONT_LEVELS[CFG.FONT_LEVEL].name,
      pv.x + pv.w - S(24), pv.y + pv.h / 2, 13, '#8fe6ff', 'right', 'bold');

    ghostBtn(ctx, G.UI.setBack(), '返回', 20, '#8fe6ff');
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
    ctx.strokeStyle = 'rgba(120,164,255,0.18)';
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
    panel(ctx, 66, oy + S(16), 588, S(516));
    var col = win ? '#2ee6a8' : '#ff5d6c';
    str(ctx, win ? '防线守住了' : '核心被击穿', 360, oy + S(74), 34, col, 'center', 'bold', 6);
    txt(ctx, win ? '20 波全部清空' : '防线在第 ' + game.wave + ' 波崩溃', 360, oy + S(118), 16, CFG.C.dim, 'center');

    var rows = [
      ['最终得分', String(game.score)],
      ['坚守波次', game.wave + ' / ' + game.wavesTotal],
      ['击杀总数', String(game.kills)],
      ['漏怪数量', String(game.leaked)],
      ['历史最高', String(game.best)]
    ];
    for (var i = 0; i < rows.length; i++) {
      var y = oy + S(170 + i * 52);
      txt(ctx, rows[i][0], 140, y, 16, CFG.C.dim);
      txt(ctx, rows[i][1], 580, y, 20, CFG.C.text, 'right', 'bold');
    }

    var b = G.UI.againBtn();
    U.roundRect(ctx, b.x, b.y, b.w, b.h, S(22));
    ctx.fillStyle = 'rgba(47,143,255,0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,230,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    str(ctx, '再来一局', b.x + b.w / 2, b.y + b.h / 2, 24, '#e9f2ff', 'center', 'bold', 5);
  }

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
