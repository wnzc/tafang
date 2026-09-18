/**
 * util.js —— 通用工具
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var U = G.Util = {};

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  U.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.randInt = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };

  /** 圆角矩形路径（自绘，避免依赖 ctx.roundRect） */
  U.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  /** 正多边形路径 */
  U.poly = function (ctx, cx, cy, r, sides, rot) {
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var a = rot + i * Math.PI * 2 / sides;
      var x = cx + Math.cos(a) * r;
      var y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  /** 星形路径 */
  U.star = function (ctx, cx, cy, r1, r2, points, rot) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? r1 : r2;
      var a = rot + i * Math.PI / points;
      var x = cx + Math.cos(a) * r;
      var y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  U.hexToRgba = function (hex, a) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#') {
      // 已经是 rgba()/颜色名等直接原样返回，避免特效层拿到 NaN 色值
      return hex;
    }
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  /* 颜色工具：给怪物形象调「明暗/高光/受击白闪」用。
   * 只吃 #rrggbb / #rgb；别的格式（rgba()、颜色名）原样返回，调用处不用判断。 */
  function parseHex(hex) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#') return null;
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    var n = parseInt(h, 16);
    if (isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(r, g, b) {
    function p2(v) {
      v = v < 0 ? 0 : (v > 255 ? 255 : Math.round(v));
      var s = v.toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + p2(r) + p2(g) + p2(b);
  }

  /** 往白里混：t=0 原色、t=1 纯白（受击白闪） */
  U.tint = function (hex, t) {
    if (!(t > 0)) return hex;
    var c = parseHex(hex);
    if (!c) return hex;
    if (t > 1) t = 1;
    return toHex(c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t);
  };

  /** 变亮/变暗：amt<0 按比例压暗、amt>0 往白里提（做描边色与高光色） */
  U.shade = function (hex, amt) {
    var c = parseHex(hex);
    if (!c) return hex;
    if (amt < 0) {
      var k = 1 + amt;
      if (k < 0) k = 0;
      return toHex(c[0] * k, c[1] * k, c[2] * k);
    }
    return U.tint(hex, amt);
  };

  U.fmt = function (n) { return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)); };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
