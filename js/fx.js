/**
 * fx.js —— 表现层特效（不参与任何伤害结算）
 *
 * 分两个绘制层：
 *   glow —— 用 'lighter' 叠加混合，负责辉光（冲击波、电弧、光束、爆闪）
 *   solid —— 常规混合，负责实体（粒子、碎片、余烬、文字）
 * 这样每帧只需切换两次合成模式，几十上百个特效也不掉帧。
 *
 * 所有特效共享一个总量上限，超出时丢最旧的，防止极端情况下内存/耗时失控。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var U = G.Util;
  var CFG = G.CFG;   // 字号统一走 CFG.FS()，跟 HUD 一起整体缩放

  var CAP = 1100;

  var FX = G.FX = {};

  var glow = [];    // lighter 混合层
  var solid = [];   // 常规混合层

  /** 需要走 lighter 的类型 */
  var GLOW_TYPE = {
    ring: 1, arc: 1, shock: 1, spark: 1, beam: 1,
    flash: 1, muzzle: 1, bolt: 1, ice: 1, ripple: 1
  };

  function push(f) {
    if (GLOW_TYPE[f.t]) glow.push(f); else solid.push(f);
    if (glow.length + solid.length > CAP) {
      if (glow.length > solid.length) glow.splice(0, Math.ceil(CAP * 0.05));
      else solid.splice(0, Math.ceil(CAP * 0.05));
    }
    return f;
  }

  FX.clear = function () { glow.length = 0; solid.length = 0; };
  FX.count = function () { return glow.length + solid.length; };
  FX.list = solid;   // 兼容旧引用

  /* ------------------------------------------------------------------ */
  /*  基础曲线                                                            */
  /* ------------------------------------------------------------------ */
  function easeOut(k) { var u = 1 - k; return 1 - u * u; }
  function fade(k, p) { return Math.pow(1 - k, p || 1.4); }

  /* ------------------------------------------------------------------ */
  /*  特效 API                                                            */
  /* ------------------------------------------------------------------ */

  /** 普通扩散圆环 */
  FX.ring = function (x, y, r0, r1, color, dur, w) {
    return push({ t: 'ring', x: x, y: y, r0: r0, r1: r1, color: color, a: 0, dur: dur || 0.45, w: w || 3 });
  };

  /** 冲击波：填充盘 + 双环，比 ring 更有质量感 */
  FX.shock = function (x, y, r, color, dur, w) {
    return push({ t: 'shock', x: x, y: y, r1: r, color: color, a: 0, dur: dur || 0.42, w: w || 4 });
  };

  /** 涟漪：三层错开扩散，用于建造落成 */
  FX.ripple = function (x, y, r, color) {
    for (var i = 0; i < 3; i++) {
      push({
        t: 'ripple', x: x, y: y, r1: r, color: color, a: 0,
        dur: 0.55 + i * 0.12, delay: i * 0.09, w: 2.6 - i * 0.5
      });
    }
  };

  /** 折线闪电（塔的普攻电弧） */
  FX.arc = function (x1, y1, x2, y2, color, dur, w) {
    return push({ t: 'arc', pts: jag(x1, y1, x2, y2, 7, 9), color: color, a: 0, dur: dur || 0.18, w: w || 3 });
  };

  /** 重电弧：三层描边 + 分叉，用于过载/雷击 */
  FX.bolt = function (x1, y1, x2, y2, color, dur) {
    var main = jag(x1, y1, x2, y2, 9, 15);
    var branches = [];
    // 从主干中段分叉两条
    for (var b = 0; b < 2; b++) {
      var i = 3 + b * 3;
      if (i * 2 + 1 >= main.length) break;
      var bx = main[i * 2], by = main[i * 2 + 1];
      var ang = Math.atan2(y2 - y1, x2 - x1) + (b ? 0.8 : -0.8);
      var len = U.rand(26, 54);
      branches.push(jag(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len, 4, 8));
    }
    return push({ t: 'bolt', pts: main, branches: branches, color: color, a: 0, dur: dur || 0.22 });
  };

  /** 直线光束 */
  FX.beam = function (x1, y1, x2, y2, color, dur, w) {
    return push({ t: 'beam', x1: x1, y1: y1, x2: x2, y2: y2, color: color, a: 0, dur: dur || 0.16, w: w || 4 });
  };

  /** 定向火花：带方向的线段，冲击感强于圆点 */
  FX.spark = function (x, y, ang, spread, n, color, speed, dur) {
    for (var i = 0; i < n; i++) {
      var a = ang + U.rand(-spread, spread);
      var sp = U.rand(speed * 0.45, speed);
      push({
        t: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: color, a: 0, dur: (dur || 0.34) * U.rand(0.7, 1.25),
        len: U.rand(9, 22), w: U.rand(1.4, 3.2)
      });
    }
  };

  /** 炮口锥形闪光 */
  FX.muzzle = function (x, y, ang, len, color) {
    return push({ t: 'muzzle', x: x, y: y, ang: ang, len: len || 22, color: color, a: 0, dur: 0.11 });
  };

  /** 径向爆闪 */
  FX.flash = function (x, y, r, color, dur) {
    return push({ t: 'flash', x: x, y: y, r: r, color: color, a: 0, dur: dur || 0.28 });
  };

  /** 冰晶：六向晶体扩散 */
  FX.ice = function (x, y, r, color) {
    return push({ t: 'ice', x: x, y: y, r: r, color: color, a: 0, dur: 0.5, rot: U.rand(0, 1) });
  };

  /** 通用粒子 */
  FX.burst = function (x, y, n, color, speed) {
    for (var i = 0; i < n; i++) {
      var a = U.rand(0, Math.PI * 2);
      var sp = U.rand(speed * 0.4, speed);
      push({
        t: 'p', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: color, a: 0, dur: U.rand(0.3, 0.6), r: U.rand(2, 4)
      });
    }
  };

  /** 旋转碎片 */
  FX.shard = function (x, y, n, color, speed) {
    for (var i = 0; i < n; i++) {
      var a = U.rand(0, Math.PI * 2);
      var sp = U.rand(speed * 0.35, speed);
      push({
        t: 'shard', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: color, a: 0, dur: U.rand(0.4, 0.8),
        s: U.rand(3, 6.5), rot: U.rand(0, 6.28), vr: U.rand(-9, 9)
      });
    }
  };

  /** 上浮余烬 */
  FX.ember = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      push({
        t: 'ember', x: x + U.rand(-10, 10), y: y + U.rand(-6, 6),
        vx: U.rand(-16, 16), vy: U.rand(-46, -20),
        color: color, a: 0, dur: U.rand(0.6, 1.15),
        s: U.rand(1.4, 3), ph: U.rand(0, 6.28)
      });
    }
  };

  /** 落地尘土环 */
  FX.dust = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      var a = U.rand(0, Math.PI * 2);
      var sp = U.rand(30, 80);
      push({
        t: 'p', x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 12,
        color: color, a: 0, dur: U.rand(0.35, 0.6), r: U.rand(3, 6)
      });
    }
  };

  /** 飘字（伤害/得分提示） */
  FX.text = function (x, y, str, color, size) {
    return push({ t: 'text', x: x, y: y, str: str, color: color, a: 0, dur: 0.78, size: size || 18 });
  };

  /** 弹出数字：带缩放冲击，用于击杀/能量 */
  FX.pop = function (x, y, str, color, size) {
    return push({ t: 'pop', x: x, y: y, str: str, color: color, a: 0, dur: 0.72, size: size || 18 });
  };

  /** 单点拖尾斑（子弹尾迹） */
  FX.trail = function (x, y, color, r, dur) {
    return push({ t: 'p', x: x, y: y, vx: 0, vy: 0, color: color, a: 0, dur: dur || 0.22, r: r || 2.4, noDrag: 1 });
  };

  /* ------------------------------------------------------------------ */
  /*  组合特效：把常用搭配封成一句调用                                     */
  /* ------------------------------------------------------------------ */

  /** 命中：小火花 + 微闪 */
  FX.impact = function (x, y, color, power) {
    power = power || 1;
    FX.spark(x, y, U.rand(0, 6.28), 3.14, Math.round(3 * power) + 1, color, 110 * power, 0.3);
    FX.flash(x, y, 11 * power + 5, color, 0.16);
  };

  /** 爆炸：爆闪 + 双层冲击波 + 放射火花 + 碎片 + 余烬 */
  FX.explode = function (x, y, color, r, power) {
    power = power || 1;
    FX.flash(x, y, r * 0.8, color, 0.26);
    FX.shock(x, y, r, color, 0.42, 4);
    FX.shock(x, y, r * 0.48, '#ffffff', 0.24, 3);
    FX.spark(x, y, 0, Math.PI * 2, Math.round(9 * power), color, 230 * power, 0.36);
    FX.burst(x, y, Math.round(9 * power), color, 150 * power);
    FX.shard(x, y, Math.round(5 * power), color, 130 * power);
    FX.ember(x, y, Math.round(5 * power), color);
  };

  /** 折线：在两点之间生成带抖动的路径 */
  function jag(x1, y1, x2, y2, segs, amp) {
    var pts = [];
    var dx = x2 - x1, dy = y2 - y1;
    for (var i = 0; i <= segs; i++) {
      var k = i / segs;
      var jx = (i === 0 || i === segs) ? 0 : U.rand(-amp, amp);
      var jy = (i === 0 || i === segs) ? 0 : U.rand(-amp, amp);
      pts.push(x1 + dx * k + jx, y1 + dy * k + jy);
    }
    return pts;
  }

  /* ------------------------------------------------------------------ */
  /*  更新                                                                */
  /* ------------------------------------------------------------------ */
  function step(arr, dt) {
    for (var i = arr.length - 1; i >= 0; i--) {
      var f = arr[i];
      f.a += dt;
      var t = f.t;
      if (t === 'p' || t === 'shard' || t === 'spark' || t === 'ember') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (!f.noDrag) {
          var drag = (t === 'ember') ? 0.965 : 0.94;
          f.vx *= drag; f.vy *= drag;
        }
        if (t === 'shard') f.rot += f.vr * dt;
      }
      var live = f.dur + (f.delay || 0);
      if (f.a >= live) arr.splice(i, 1);
    }
  }

  FX.update = function (dt) {
    step(glow, dt);
    step(solid, dt);
  };

  /* ------------------------------------------------------------------ */
  /*  绘制                                                                */
  /* ------------------------------------------------------------------ */

  function pathPts(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
    ctx.stroke();
  }

  function drawGlow(ctx, f, k, t) {
    if (t === 'ring') {
      var r = U.lerp(f.r0, f.r1, easeOut(k));
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.w * (1 - k) + 0.8;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
      // 内层高光
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.7, f.w * 0.34 * (1 - k));
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.97, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha /= 0.5;

    } else if (t === 'shock') {
      var rr = f.r1 * easeOut(k);
      // 填充盘
      var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr));
      g.addColorStop(0, U.hexToRgba(f.color, 0.62 * (1 - k)));
      g.addColorStop(0.5, U.hexToRgba(f.color, 0.28 * (1 - k)));
      g.addColorStop(1, U.hexToRgba(f.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.fill();
      // 前缘环
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.w * (1 - k) + 0.8;
      ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.6, f.w * 0.34 * (1 - k));
      ctx.beginPath(); ctx.arc(f.x, f.y, rr * 0.93, 0, Math.PI * 2); ctx.stroke();

    } else if (t === 'ripple') {
      var rp = f.r1 * easeOut(k);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.w * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, rp, 0, Math.PI * 2); ctx.stroke();

    } else if (t === 'arc') {
      ctx.strokeStyle = f.color;
      ctx.lineJoin = 'round';
      ctx.lineWidth = f.w * (1 - k) + 0.8;
      pathPts(ctx, f.pts);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.6, f.w * 0.32 * (1 - k));
      pathPts(ctx, f.pts);

    } else if (t === 'bolt') {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = U.hexToRgba(f.color, 0.42 * (1 - k));
      ctx.lineWidth = 11 * (1 - k) + 1;
      pathPts(ctx, f.pts);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 5 * (1 - k) + 0.8;
      pathPts(ctx, f.pts);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.8, 1.8 * (1 - k));
      pathPts(ctx, f.pts);
      for (var b = 0; b < f.branches.length; b++) {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2 * (1 - k) + 0.5;
        pathPts(ctx, f.branches[b]);
      }

    } else if (t === 'beam') {
      var dx = f.x2 - f.x1, dy = f.y2 - f.y1;
      ctx.lineCap = 'round';
      ctx.strokeStyle = U.hexToRgba(f.color, 0.35 * (1 - k));
      ctx.lineWidth = f.w * 3.4 * (1 - k) + 1;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.w * (1 - k) + 0.8;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.7, f.w * 0.3 * (1 - k));
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();

    } else if (t === 'spark') {
      var sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
      if (sp < 1) return;
      var ux = f.vx / sp, uy = f.vy / sp;
      var len = Math.min(f.len, sp * 0.055);
      ctx.strokeStyle = f.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = f.w * (1 - k) + 0.4;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - ux * len, f.y - uy * len);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.4, f.w * 0.4 * (1 - k));
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - ux * len * 0.45, f.y - uy * len * 0.45);
      ctx.stroke();

    } else if (t === 'muzzle') {
      var L = f.len * (0.5 + easeOut(k) * 0.9);
      var w = 0.36 * (1 - k * 0.5);
      var ca = Math.cos(f.ang), sa = Math.sin(f.ang);
      ctx.fillStyle = U.hexToRgba('#ffffff', 0.85 * (1 - k));
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + (ca * Math.cos(w) - sa * Math.sin(w)) * L, f.y + (sa * Math.cos(w) + ca * Math.sin(w)) * L);
      ctx.lineTo(f.x + (ca * Math.cos(-w) - sa * Math.sin(-w)) * L, f.y + (sa * Math.cos(-w) + ca * Math.sin(-w)) * L);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = U.hexToRgba(f.color, 0.55 * (1 - k));
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + (ca * Math.cos(w * 2) - sa * Math.sin(w * 2)) * L * 1.15, f.y + (sa * Math.cos(w * 2) + ca * Math.sin(w * 2)) * L * 1.15);
      ctx.lineTo(f.x + (ca * Math.cos(-w * 2) - sa * Math.sin(-w * 2)) * L * 1.15, f.y + (sa * Math.cos(-w * 2) + ca * Math.sin(-w * 2)) * L * 1.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x, f.y, 4.5 * (1 - k) + 1, 0, Math.PI * 2); ctx.fill();

    } else if (t === 'flash') {
      // 快涨快灭：半径克制、亮度衰减快，才像「爆闪」而不是一枚半透明圆盘
      var rr2 = f.r * (0.3 + easeOut(k) * 0.62);
      var g2 = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, rr2));
      g2.addColorStop(0, U.hexToRgba('#ffffff', 0.98 * fade(k, 3)));
      g2.addColorStop(0.32, U.hexToRgba(f.color, 0.72 * fade(k, 2.8)));
      g2.addColorStop(1, U.hexToRgba(f.color, 0));
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(f.x, f.y, rr2, 0, Math.PI * 2); ctx.fill();

    } else if (t === 'ice') {
      var ir = f.r * (0.3 + easeOut(k) * 0.85);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      for (var s = 0; s < 6; s++) {
        var a2 = f.rot * 6.28 + s * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a2) * ir * 0.35, f.y + Math.sin(a2) * ir * 0.35);
        ctx.lineTo(f.x + Math.cos(a2) * ir, f.y + Math.sin(a2) * ir);
        ctx.stroke();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2 * (1 - k);
      U.poly(ctx, f.x, f.y, ir * 0.6, 6, f.rot * 6.28);
      ctx.stroke();
    }
  }

  function drawSolid(ctx, f, k, t) {
    if (t === 'p') {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(0.3, f.r * (1 - k * 0.6)), 0, Math.PI * 2);
      ctx.fill();

    } else if (t === 'shard') {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.fillStyle = f.color;
      ctx.fillRect(-f.s / 2, -f.s / 2, f.s, f.s * 0.62);
      ctx.restore();

    } else if (t === 'ember') {
      var fl = 0.6 + 0.4 * Math.sin(f.a * 22 + f.ph);
      ctx.fillStyle = f.color;
      ctx.globalAlpha *= fl;
      ctx.beginPath();
      ctx.arc(f.x + Math.sin(f.a * 5 + f.ph) * 4, f.y, Math.max(0.3, f.s * (1 - k)), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= fl;

    } else if (t === 'text') {
      ctx.fillStyle = f.color;
      ctx.font = 'bold ' + CFG.FS(f.size) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(4,8,16,0.85)';
      ctx.lineWidth = 5;
      ctx.strokeText(f.str, f.x, f.y - 40 * k);
      ctx.fillText(f.str, f.x, f.y - 40 * k);

    } else if (t === 'pop') {
      // 前 22% 弹出放大，之后回到 1 倍
      var sc = k < 0.22 ? (0.4 + (k / 0.22) * 0.75) : (1.15 - (k - 0.22) * 0.19);
      ctx.save();
      ctx.translate(f.x, f.y - 48 * k);
      ctx.scale(sc, sc);
      ctx.font = 'bold ' + CFG.FS(f.size) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(4,8,16,0.9)';
      ctx.lineWidth = 6;
      ctx.strokeText(f.str, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.str, 0, 0);
      ctx.restore();
    }
  }

  FX.draw = function (ctx) {
    var i, f, k, t;

    // 第一趟：辉光层
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < glow.length; i++) {
      f = glow[i];
      if (f.delay && f.a < f.delay) continue;
      var ag = f.a - (f.delay || 0);
      k = U.clamp(ag / f.dur, 0, 1);
      ctx.globalAlpha = fade(k, f.t === 'ripple' ? 1.6 : 1.5);
      drawGlow(ctx, f, k, f.t);
    }

    // 第二趟：实体层
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < solid.length; i++) {
      f = solid[i];
      if (f.delay && f.a < f.delay) continue;
      var asd = f.a - (f.delay || 0);
      k = U.clamp(asd / f.dur, 0, 1);
      ctx.globalAlpha = 1 - k;
      drawSolid(ctx, f, k, f.t);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
