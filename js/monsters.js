/**
 * monsters.js —— 怪物形象（矢量手绘，逐部件可动画）
 *
 * 为什么是「矢量画」而不是图片：
 *   1. 微信小游戏加载图片必须异步（wx.createImage + onload），渲染层要处理
 *      「图还没到」的中间态；这个工程从第一行起就是零外部资源、同步绘制，
 *      换成图片会把这个地基拆掉。
 *   2. 动画要「逐部件」——腿在摆、尾巴在甩、锤子在抡、大嘴在开合。
 *      一张静态图只能整体平移缩放，做不出这些。
 *   3. 任意尺寸都清晰：卡片、棋盘、结算页只是同一个函数传不同的半径。
 *
 * 坐标约定：
 *   每只怪都在「单位空间」里作画，身体半径固定 UNIT（=14）单位，绘制时按 r/UNIT 缩放。
 *   所以同一份代码，小怪（r=11）和 Boss（r=27）都自动对版。
 *   取 14 而不是 16 是量出来的：形象的四角（耳朵、角、锤子）会伸到 ±16 单位，
 *   按 14 缩放正好把 r 的格子占满；按 16 缩会小一圈，棋盘上看着像「没长开」。
 *   上界统一压在 y ∈ [-18, +16] 单位内 —— 血条画在 e.y - r - 13（见 render.js），
 *   形象冒上去就会顶到血条，这一条由 tools/layout-check.js 的「形象不顶血条」断言守着。
 *
 * 六只怪的形象与动画：
 *   drifter  游荡体  果冻水母：上下浮动、四条触须摆动、呼吸压扁、独眼追视、眨眼、天线球发光
 *   sprinter 疾行体  小走兽：前倾猛跑、双腿反摆、耳朵后压、尾巴甩、身后速度线
 *   bulwark  装甲体  厚壳小坦克：沉重左右摇摆、双脚交替抬、壳檐一排铆钉、信号灯呼吸、观察缝里眨眼
 *   sunder   破墙者  戴安全帽抡锤：啃塔时 8Hz 大力抡锤（平时扛着轻晃）、怒眉、咬牙
 *   phaser   相位体  小幽灵：波浪下摆飘、手臂轻摆、相位时错位重影、身后残影
 *   boss     共鸣吞噬者  大嘴怪：呼吸缩放、大嘴开合（牙齿跟着开合）、共鸣角脉动、双臂张开
 *
 * 约定：每个形象函数都自己画「地面投影」，因为每只怪脚底高度不同（见 SHADOW_Y）。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, U = G.Util;

  if (!U) return;                    // util.js 没加载时静默跳过（顺序错了另有自检兜底）

  var M = G.Monsters = {};
  var UNIT = 14;                     // 单位空间里「身体半径」= 14 单位（缩放时 k = r / UNIT）
  var INK = '#0a1020';               // 统一描边色：比背景深一点，边缘才不脏
  var BLUSH = 'rgba(255,124,166,0.45)';
  var WOOD = '#c99a5f';
  var STEEL = '#c3cede';

  /* ------------------------------------------------------------------ *
   * 1) 基础零件
   * ------------------------------------------------------------------ */

  /** 椭圆（用 4 段贝塞尔画，不依赖 ctx.ellipse —— 老基础库没有） */
  function oval(ctx, x, y, rx, ry) {
    var k = 0.5522847498;
    ctx.beginPath();
    ctx.moveTo(x - rx, y);
    ctx.bezierCurveTo(x - rx, y - ry * k, x - rx * k, y - ry, x, y - ry);
    ctx.bezierCurveTo(x + rx * k, y - ry, x + rx, y - ry * k, x + rx, y);
    ctx.bezierCurveTo(x + rx, y + ry * k, x + rx * k, y + ry, x, y + ry);
    ctx.bezierCurveTo(x - rx * k, y + ry, x - rx, y + ry * k, x - rx, y);
    ctx.closePath();
  }

  /** 上半椭圆（底边闭合）：头盔、壳、幽灵头顶都用它 */
  function dome(ctx, x, y, rx, ry) {
    var k = 0.5522847498;
    ctx.beginPath();
    ctx.moveTo(x - rx, y);
    ctx.bezierCurveTo(x - rx, y - ry * k, x - rx * k, y - ry, x, y - ry);
    ctx.bezierCurveTo(x + rx * k, y - ry, x + rx, y - ry * k, x + rx, y);
    ctx.closePath();
  }

  /** 果冻身：上圆下分瓣（游荡体） */
  function jelly(ctx, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(-rx, 0);
    ctx.bezierCurveTo(-rx, -ry * 1.3, rx, -ry * 1.3, rx, 0);
    ctx.quadraticCurveTo(rx * 0.94, ry * 0.84, rx * 0.44, ry * 0.76);
    ctx.quadraticCurveTo(0, ry * 1.08, -rx * 0.44, ry * 0.76);
    ctx.quadraticCurveTo(-rx * 0.94, ry * 0.84, -rx, 0);
    ctx.closePath();
  }

  /** 幽灵身：圆顶 + 三段波浪下摆（wav 控制波动相位） */
  function ghostBody(ctx, wav) {
    var rx = 10, ry = 10.6, k = 0.5522847498;
    ctx.beginPath();
    ctx.moveTo(-rx, 0);
    ctx.bezierCurveTo(-rx, -ry * k, -rx * k, -ry, 0, -ry);
    ctx.bezierCurveTo(rx * k, -ry, rx, -ry * k, rx, 0);
    ctx.lineTo(rx, 3.2);
    for (var i = 0; i < 3; i++) {
      var cx1 = rx - (i * 2 + 1) * (rx * 2 / 6);
      var x2 = rx - (i + 1) * (rx * 2 / 3);
      var up = (i % 2 === 0) ? 1 : -1;
      ctx.quadraticCurveTo(cx1, 3.2 + 3.4 + up * wav, x2, 3.2);
    }
    ctx.closePath();
  }

  /** 粗肢体：先画一圈深描边，再压上本色（可爱的「描边卡通」质感） */
  function limb(ctx, x1, y1, x2, y2, w, col) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = w + 3.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  /** 脚（小圆掌） */
  function foot(ctx, x, y, rx, ry, col) {
    oval(ctx, x, y, rx, ry);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /** 地面投影：每只怪脚底高度不同，所以由各形象自己调 */
  function ground(ctx, y, rx, ry, sc) {
    ctx.globalAlpha = 0.26 * sc;
    oval(ctx, 0, y, rx, ry);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** 充填 + 描边（九成零件都是这一步，抽出来少写一半行） */
  function ink(ctx, col, w) {
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = w;
    ctx.stroke();
}

  /** 眨眼：用 seed 让每只怪错开，不会全场同时闭眼 */
  function blinkAt(t, sd) {
    var p = (t * 0.62 + sd * 0.41 + 1.3) % 3.7;
    return p < 0.1;
  }

  /**
   * 眼睛：白眼球 + 追着行进方向看的瞳孔 + 高光；closed 时画成闭眼的弧。
   * lx/ly 是行进方向单位向量，瞳孔偏移不超过 0.34r，看起来是「在看路」。
   */
  function eye(ctx, x, y, r, lx, ly, closed) {
    if (closed) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.6, r * 0.7);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y + r * 0.3, r * 0.86, Math.PI + 0.42, -0.42);
      ctx.stroke();
      return;
    }
    oval(ctx, x, y, r, r * 1.06);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.1, r * 0.45);
    ctx.stroke();

    var px = x + lx * r * 0.34, py = y + ly * r * 0.34;
    oval(ctx, px, py, r * 0.48, r * 0.54);
    ctx.fillStyle = INK;
    ctx.fill();
    oval(ctx, px - r * 0.16, py - r * 0.2, r * 0.2, r * 0.2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
  }

  /** 腮红 */
  function blush(ctx, x, y, r) {
    oval(ctx, x, y, r, r * 0.7);
    ctx.fillStyle = BLUSH;
    ctx.fill();
  }

  /** 三角牙：dir=+1 尖朝下、dir=-1 尖朝上 */
  function tooth(ctx, x, y, hw, h, dir) {
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + dir * h);
    ctx.closePath();
    ctx.fillStyle = '#fff6ec';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  /** 三角形耳朵 / 爪子：整体偏移 + 描边 */
  function tri(ctx, ax, ay, bx, by, cx, cy, col, w) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = w || 1.7;
    ctx.stroke();
  }

  /* ------------------------------------------------------------------ *
   * 2) 六只怪
   * ------------------------------------------------------------------ */

  /* 游荡体 —— 果冻水母：一浮一沉，触须跟着飘，独眼追着路看 */
  function drawDrifter(ctx, P, t, sd, sc) {
    var ph = t * 2.1 + sd;
    var bob = Math.sin(ph) * 1.6;
    var br = Math.sin(ph) * 0.07;
    ground(ctx, 13.6, 10, 3.2, sc);

    ctx.save();
    ctx.translate(0, bob);

    // 触须（先画，上端被身体盖住）：四条，长短错开，摆起来像水母
    ctx.strokeStyle = P.d;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    for (var i = 0; i < 4; i++) {
      var x0 = -7.5 + i * 5;
      var sw = Math.sin(t * 3.1 + i * 1.9 + sd) * 2.8;
      var len = 12 + (i % 2) * 2.4;
      ctx.beginPath();
      ctx.moveTo(x0, 0.5);
      ctx.quadraticCurveTo(x0 + sw, len * 0.55, x0 + sw * 1.8, len);
      ctx.stroke();
    }

    // 身体（呼吸：横向压、纵向抻）
    ctx.save();
    ctx.scale(1 - br, 1 + br);
    jelly(ctx, 11.5, 10);
    ink(ctx, P.c, 2.1);
    // 果冻高光
    oval(ctx, -4.4, -5.4, 3.4, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
    ctx.restore();

    // 天线 + 发光球
    var aw = Math.sin(t * 2.4 + sd) * 2.2;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -9.4);
    ctx.quadraticCurveTo(aw * 0.6, -12.2, aw * 1.4, -13.6);
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    oval(ctx, aw * 1.4, -14.4, 4.2, 4.2);
    ctx.fillStyle = P.c;
    ctx.fill();
    ctx.globalAlpha = 1;
    oval(ctx, aw * 1.4, -14.4, 2.2, 2.2);
    ink(ctx, P.l, 1.5);

    // 独眼（大眼是「可爱」的第一来源，但要留出腮红和嘴的位置）
    eye(ctx, 0, -3.4, 3.9, P.lx, P.ly, P.blink);

    // 小嘴 + 腮红
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 4.4, 1.7, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
    blush(ctx, -7.8, 2.6, 2.3);
    blush(ctx, 7.8, 2.6, 2.3);

    ctx.restore();
  }

  /* 疾行体 —— 小走兽：前倾猛跑，腿摆快，尾巴甩，身后拉速度线 */
  function drawSprinter(ctx, P, t, sd, sc) {
    var run = t * 13 + sd * 3.1;
    var lean = 0.13 + 0.05 * Math.sin(run * 0.5);
    var earBack = -0.5 - 0.9 * Math.sin(run * 0.5);
    ground(ctx, 11.6, 8.6, 2.8, sc);

    // 速度线（在身后，越跑越长。细+淡，粗了会变成梯子）
    ctx.strokeStyle = U.hexToRgba(P.l, 0.3);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (var k = 0; k < 2; k++) {
      var yy = -2.6 + k * 5.2;
      var len = 4 + 3 * (0.5 + 0.5 * Math.sin(run * 0.7 + k * 1.6));
      ctx.beginPath();
      ctx.moveTo(-9, yy);
      ctx.lineTo(-9 - len, yy);
      ctx.stroke();
    }

    // 尾巴（细一点的鞭状，甩起来）
    var tw = Math.sin(run * 0.9) * 3.2;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7.5, -0.5);
    ctx.quadraticCurveTo(-13.5, -4.5 + tw, -16, -9 + tw);
    ctx.stroke();
    ctx.strokeStyle = P.d;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7.5, -0.5);
    ctx.quadraticCurveTo(-13.5, -4.5 + tw, -16, -9 + tw);
    ctx.stroke();

    ctx.save();
    ctx.rotate(-lean);                 // 整体前倾（像在冲刺）

    // 后腿 / 前腿（反相交替）
    var la = Math.sin(run), lb = -la;
    limb(ctx, -3.2, 3.5, -3.2 + la * 4.6, 10.8, 3.2, P.d);
    limb(ctx, 3.4, 3.5, 3.4 + lb * 4.6, 10.8, 3.2, P.c);

    // 身体
    oval(ctx, 0, 1, 9, 7.4);
    ink(ctx, P.c, 2.1);
    oval(ctx, 0, 3.8, 5.2, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();

    /* 耳朵：画在头之前（根部被头盖住，不会在脸上留下描边线），
     * 底边做宽、尖做高 —— 只露出上半截才看得清是「两只耳朵」。 */
    tri(ctx, 4.6 + earBack, -6.6, 7.4 + earBack - 0.6, -16.4, 11.4 + earBack - 1.4, -8, P.c);
    tri(ctx, 9.4 + earBack, -7.4, 13 + earBack - 0.8, -15.6, 16.6 + earBack - 1.8, -8.2, P.c);

    // 头
    oval(ctx, 9.4, -4.6, 6.6, 6.2);
    ink(ctx, P.c, 2.1);

    // 脸
    eye(ctx, 12, -5.6, 2.3, P.lx, P.ly, P.blink);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();                     // 眉（自信）
    ctx.moveTo(10.6, -9.4); ctx.lineTo(12.6, -8.8); ctx.stroke();
    // 张着的小嘴
    ctx.beginPath();
    ctx.moveTo(9.8, -2);
    ctx.quadraticCurveTo(11.6, 0.8, 13.6, -2.2);
    ctx.quadraticCurveTo(11.6, -0.8, 9.8, -2);
    ctx.closePath();
    ctx.fillStyle = '#5a2233';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    blush(ctx, 7.4, -1.4, 1.8);

    ctx.restore();
  }

  /* 装甲体 —— 厚壳小坦克：一步一颠、左右摇，壳檐一排铆钉，信号灯呼吸 */
  function drawBulwark(ctx, P, t, sd, sc) {
    var wad = Math.sin(t * 3.4 + sd);
    ground(ctx, 15, 10.4, 3.4, sc);

    // 脚（交替抬起）
    foot(ctx, -6.6, 12.2 + Math.max(0, wad) * 1.3, 3.8, 2.9, P.d);
    foot(ctx, 6.6, 12.2 + Math.max(0, -wad) * 1.3, 3.8, 2.9, P.d);

    ctx.save();
    ctx.translate(wad * 0.7, -Math.abs(wad) * 0.8);
    ctx.rotate(wad * 0.05);

    // 身体（软肚）
    oval(ctx, 0, 2, 12, 8.6);
    ink(ctx, P.c, 2.2);

    // 壳（罩住上半身）
    dome(ctx, 0, 2.2, 13.2, 13);
    ink(ctx, U.shade(P.c, -0.24), 2.4);
    ctx.save();
    ctx.clip();
    oval(ctx, -4.6, -6.6, 5.6, 3.4);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.restore();

    // 壳檐的一排铆钉（贴在壳底边上，别放到壳中央 —— 那样会被当成眼睛）
    var bx = [-10.2, -3.4, 3.4, 10.2];
    for (var i = 0; i < 4; i++) {
      oval(ctx, bx[i], 1.2, 1.4, 1.4);
      ink(ctx, P.l, 1.1);
    }

    // 观察缝 + 两只发光眼
    U.roundRect(ctx, -9.6, 3.4, 19.2, 5.6, 2.8);
    ink(ctx, 'rgba(8,14,26,0.86)', 1.6);
    var er = P.blink ? 0.5 : 1;
    oval(ctx, -4.1, 6.2, 2.1, 2 * er);
    ctx.fillStyle = P.l;
    ctx.fill();
    oval(ctx, 4.1, 6.2, 2.1, 2 * er);
    ctx.fillStyle = P.l;
    ctx.fill();
    if (!P.blink) {
      oval(ctx, -4.6, 5.7, 0.8, 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      oval(ctx, 3.6, 5.7, 0.8, 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }

    // 壳顶信号灯（呼吸）
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -10.6);
    ctx.lineTo(0, -12.4);
    ctx.stroke();
    ctx.globalAlpha = 0.3 + 0.24 * Math.sin(t * 5 + sd);
    oval(ctx, 0, -13.3, 4.2, 4.2);
    ctx.fillStyle = P.c;
    ctx.fill();
    ctx.globalAlpha = 1;
    oval(ctx, 0, -13.3, 1.8, 1.8);
    ink(ctx, P.l, 1.4);

    ctx.restore();
  }

  /* 破墙者 —— 戴安全帽抡锤：啃塔时抡得飞快，平时扛在肩上轻晃 */
  function drawSunder(ctx, P, t, sd, sc) {
    var stomp = Math.sin(t * 5.2 + sd);
    ground(ctx, 12.4, 9.4, 3, sc);

    foot(ctx, -4.6, 8.8 + Math.max(0, stomp) * 1.2, 3.4, 2.4, P.d);
    foot(ctx, 4.6, 8.8 + Math.max(0, -stomp) * 1.2, 3.4, 2.4, P.d);

    // 身体
    oval(ctx, 0, 1, 10.4, 9.4);
    ink(ctx, P.c, 2.2);
    // 工装腰带
    U.roundRect(ctx, -9.4, 6.8, 18.8, 2.8, 1.4);
    ink(ctx, U.shade(P.c, -0.36), 1.5);

    // 后臂
    limb(ctx, -7.4, 0.8, -11.2, 4.8, 3, P.d);
    // 前臂（握锤）
    limb(ctx, 5.6, 0.8, 7.6, 1.2, 3, P.c);

    /* 锤子：画在身体之后 —— 先画会被身体盖住，看起来就像「手里漂着个锤子」。
     * chew 时 8Hz 抡下去，平时扛着轻晃。 */
    var chew = P.st === 'chew';
    var swing = chew
      ? -0.8 + Math.abs(Math.sin(t * 8.4 + sd)) * 1.8
      : -0.8 + Math.sin(t * 1.8 + sd) * 0.07;
    ctx.save();
    ctx.translate(7, 1.2);
    ctx.rotate(swing);
    limb(ctx, 0, 0, 6.4, 0, 2.6, WOOD);
    U.roundRect(ctx, 5.6, -4.4, 7, 8.8, 2.3);
    ink(ctx, STEEL, 2);
    U.roundRect(ctx, 7.1, -2.8, 4.1, 1.5, 0.75);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();

    // 安全帽
    dome(ctx, 0, -4.4, 8.4, 7.8);
    ink(ctx, '#ffcf4d', 2.1);
    ctx.strokeStyle = U.shade('#ffcf4d', -0.3);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3.6, -10.6);
    ctx.quadraticCurveTo(0, -12.8, 3.6, -10.6);
    ctx.stroke();
    U.roundRect(ctx, -10.4, -5.3, 20.8, 2.7, 1.35);
    ink(ctx, '#ffd968', 1.7);

    // 怒眉
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6.2, -2.4); ctx.lineTo(-1.8, -1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6.2, -2.4); ctx.lineTo(1.8, -1.2); ctx.stroke();

    // 眼睛
    eye(ctx, -3.9, 0.4, 2.4, P.lx, P.ly, P.blink);
    eye(ctx, 3.9, 0.4, 2.4, P.lx, P.ly, P.blink);

    // 咬牙：深色口腔 + 三颗小尖牙（白横线会被看成胡子）
    U.roundRect(ctx, -3.8, 3.4, 7.6, 3, 1);
    ink(ctx, '#59203a', 1.5);
    for (var i = 0; i < 3; i++) {
      tri(ctx, -2.2 + i * 2.2, 3.5, -0.9 + i * 2.2, 3.5, -1.55 + i * 2.2, 5.6,
        '#fff6ec', 0.9);
    }
  }

  /* 相位体 —— 小幽灵：下摆波浪飘、相位时错位重影 */
  function drawPhaser(ctx, P, t, sd, sc) {
    var bob = Math.sin(t * 2.8 + sd) * 1.6;
    var wav = Math.sin(t * 3.2 + sd) * 1.1;
    var phasing = P.phasing || P.fl > 0;
    ground(ctx, 12.6, 9.4, 3, sc);

    ctx.save();
    ctx.translate(0, bob);
    ctx.globalAlpha = P.alpha;

    /* 身后残影：把幽灵轮廓淡淡再画一份更靠下的。
     * 用「重影」而不是「几个圆点」—— 点状残影会看成一串糖葫芦。 */
    ctx.globalAlpha = P.alpha * 0.15;
    ctx.save();
    ctx.translate(0, 6.2);
    ctx.scale(0.9, 0.86);
    ghostBody(ctx, wav * 0.6);
    ctx.fillStyle = P.l;
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = P.alpha;

    // 相位：左右各留一个错位重影
    if (phasing) {
      for (var g = -1; g <= 1; g += 2) {
        ctx.save();
        ctx.globalAlpha = P.alpha * 0.3;
        ctx.translate(g * 4.2, g * 0.8);
        ghostBody(ctx, wav);
        ctx.fillStyle = P.l;
        ctx.fill();
        ctx.restore();
      }
    }

    // 手臂（先画，根部被身体盖住）
    var sw = Math.sin(t * 3 + sd) * 1.6;
    limb(ctx, -8, 0.6, -11.4, 5 + sw, 2.6, P.c);
    limb(ctx, 8, 0.6, 11.4, 5 - sw, 2.6, P.c);

    ghostBody(ctx, wav);
    ink(ctx, P.c, 2.1);

    // 眼睛（黑眼窝，相位时发亮）
    var ex = [-3.9, 3.9];
    for (var k = 0; k < 2; k++) {
      if (P.blink) {
        eye(ctx, ex[k], -1.4, 2.8, 0, 0, true);
      } else {
        oval(ctx, ex[k], -1.6, 2.5, 2.8);
        ctx.fillStyle = INK;
        ctx.fill();
        oval(ctx, ex[k] + P.lx * 0.7 - 0.7, -2.6, 0.9, 0.9);
        ctx.fillStyle = phasing ? '#ffffff' : U.hexToRgba(P.l, 0.9);
        ctx.fill();
      }
    }
    blush(ctx, -7.6, 2.6, 1.9);
    blush(ctx, 7.6, 2.6, 1.9);

    // 小嘴
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 4.6, 1.8, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();

    ctx.restore();
  }

  /* 共鸣吞噬者 —— 大嘴怪：呼吸缩放、大嘴开合、共鸣角脉动、双臂张开 */
  function drawBoss(ctx, P, t, sd, sc) {
    var br = Math.sin(t * 2.4 + sd) * 0.045;
    var open = 0.5 + 0.5 * Math.sin(t * 1.5 + sd);
    ground(ctx, 13.6, 14, 4.6, sc);

    ctx.save();
    ctx.scale(1 - br, 1 + br);

    /* 双臂（用本色而不是暗色 —— 暗色在深底上会糊成一对黑翅膀）。
     * 臂展收在 ~19 单位内：爪子伸太远会压到邻格（layout-check 的「不横向溢出」守着）。 */
    for (var s = -1; s <= 1; s += 2) {
      var sw = 0.5 + 0.5 * Math.sin(t * 1.9 + (s > 0 ? 0 : 1.6) + sd);
      var ex = s * (12.2 + sw * 1.4), ey = 9.6 - sw * 1.8;
      limb(ctx, s * 9, 0.6, ex, ey, 4.4, P.c);
      for (var c = -1; c <= 1; c++) {
        tri(ctx, ex + c * 1.5 * s, ey + 1.2,
          ex + c * 3.8 * s, ey + 5.4,
          ex + c * 4.6 * s + 0.6 * s, ey + 1.6, U.shade(P.c, 0.22), 1.4);
      }
    }

    // 身体
    oval(ctx, 0, -2, 14.2, 13);
    ink(ctx, P.c, 2.8);
    ctx.save();
    ctx.clip();
    oval(ctx, 0, 3.4, 11.4, 8);
    ctx.fillStyle = U.shade(P.c, 0.18);
    ctx.fill();
    ctx.restore();

    /* 共鸣角：长、往外撇、比身体亮一点 —— 否则挤在晶石后面糊成一顶帽子 */
    for (var h = -1; h <= 1; h += 2) {
      ctx.beginPath();
      ctx.moveTo(h * 6.6, -11.4);
      ctx.quadraticCurveTo(h * 11.6, -14.6, h * 11.4, -18.2);
      ctx.quadraticCurveTo(h * 15.4, -14.4, h * 11.6, -9.6);
      ctx.closePath();
      ink(ctx, U.shade(P.c, 0.14), 2);
    }
    var pulse = 0.5 + 0.5 * Math.sin(t * 3.4 + sd);
    ctx.globalAlpha = 0.16 + 0.24 * pulse;
    oval(ctx, 0, -14.6, 3.4 + pulse * 1.1, 3.4 + pulse * 1.1);
    ctx.fillStyle = P.l;
    ctx.fill();
    ctx.globalAlpha = 1;
    oval(ctx, 0, -14.6, 2.3, 2.3);
    ink(ctx, '#fff2f6', 1.5);

    // 眼睛（发光）+ 怒眉
    var er = P.blink ? 0.6 : 1;
    for (var e2 = -1; e2 <= 1; e2 += 2) {
      oval(ctx, e2 * 6, -7.6, 3.4, 3.6 * er);
      ink(ctx, '#fff2f6', 1.7);
      if (!P.blink) {
        oval(ctx, e2 * 6 + P.lx * 1.1, -7.4 + P.ly * 1.1, 1.4, 2.2);
        ctx.fillStyle = INK;
        ctx.fill();
        oval(ctx, e2 * 6 + P.lx * 1.1 - 0.7, -8.2, 0.7, 0.7);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
      }
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9.8, -12.6); ctx.lineTo(-3.6, -10.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9.8, -12.6); ctx.lineTo(3.6, -10.8); ctx.stroke();

    // 大嘴（牙齿跟着开合走）
    var my = 2.6 + open * 3.2;
    var mr = 2.4 + open * 3;
    oval(ctx, 0, my, 9.8, mr);
    ink(ctx, '#2a0b16', 2.2);
    for (var u = 0; u < 4; u++) {
      tooth(ctx, -6.6 + u * 4.4, my - mr + 0.6, 2, 3, 1);
    }
    for (var d = 0; d < 3; d++) {
      tooth(ctx, -5.4 + d * 5.4, my + mr - 0.6, 1.9, 2.8, -1);
    }

    ctx.restore();
  }

  var ART = {
    drifter: drawDrifter,
    sprinter: drawSprinter,
    bulwark: drawBulwark,
    sunder: drawSunder,
    phaser: drawPhaser,
    boss: drawBoss
  };
  M.ART = ART;

  /* 地面投影高度：每只怪脚底不一样，投影贴错位置会像「悬空」或「陷进去」 */
  var SHADOW_Y = {
    drifter: 13.6, sprinter: 11.6, bulwark: 15,
    sunder: 12.4, phaser: 12.6, boss: 13.6
  };
  M.SHADOW_Y = SHADOW_Y;

  /* ------------------------------------------------------------------ *
   * 3) 对外接口
   * ------------------------------------------------------------------ */

  /** 这只怪有没有专属形象（自检用） */
  M.has = function (key) { return !!ART[key]; };

  M.keys = function () {
    var out = [];
    for (var k in ART) if (ART.hasOwnProperty(k)) out.push(k);
    return out;
  };

  /**
   * 画一只怪。
   *   ctx  目标上下文（调用方已完成屏幕变换）
   *   e    敌人实体（读 key/def/color/r/x/y/fx/fy/hitFlash/phaseT/mode/off/uid）
   *   t    全局时间（秒，驱动所有动画相位）
   *   sc   出生缩放（0..1，spawnT 期间由 0 长到 1）
   * 返回是否画了；没有形象的 key 返回 false，调用方可自行兜底。
   */
  M.draw = function (ctx, e, t, sc) {
    var key = e.key;
    var art = ART[key];
    if (!art) return false;
    var def = e.def || (CFG.ENEMIES && CFG.ENEMIES[key]);
    if (!def) return false;

    var k = e.r / UNIT;
    if (!(k > 0)) return false;

    var base = e.color || def.color || '#9fd8ff';
    var fl = e.hitFlash > 0 ? 0.78 : 0;
    var c0 = U.tint(base, fl);

    // 行进方向（瞳孔追视用）：没有方向就默认朝下
    var lx = e.fx || 0, ly = e.fy || 0;
    var len = Math.sqrt(lx * lx + ly * ly);
    if (len < 0.0001) { lx = 0; ly = 1; len = 1; }

    var sd = (e.off || 0) * 0.13 + (e.uid % 13) * 0.47;

    var P = {
      c: c0,
      d: U.shade(c0, -0.4),
      l: U.shade(c0, 0.52),
      fl: fl,
      lx: lx / len,
      ly: ly / len,
      blink: blinkAt(t, sd),
      phasing: e.phaseT > 0,
      st: e.mode,
      alpha: e.phaseT > 0 ? 0.55 : 1
    };

    // 朝向：朝左走就镜像（留 0.12 的死区，避免来回抖）
    if (e.fx < -0.12) e._flip = 1;
    else if (e.fx > 0.12) e._flip = 0;

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(k * sc, k * sc);
    if (e._flip) ctx.scale(-1, 1);

    art(ctx, P, t, sd, sc);

    ctx.restore();
    return true;
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
