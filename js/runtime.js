/**
 * runtime.js —— 运行时适配层
 * 同时兼容「微信小游戏(wx / GameGlobal)」与「浏览器预览(window)」。
 * 设计坐标系固定为 720 宽，高度按屏幕比例动态延伸。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};

  var isWeapp = (typeof wx !== 'undefined') &&
    (typeof wx.createCanvas === 'function') &&
    (typeof wx.getSystemInfoSync === 'function');

  // 浏览器里模拟微信安全区时打开（真机不使用，见 R.debugSafeArea）
  var forceInsets = false;

  var R = G.Runtime = {
    isWeapp: isWeapp,
    vw: 375,
    vh: 667,
    dpr: 2,
    scale: 1,
    ox: 0,
    oy: 0,
    W: 720,
    designH: 1280,
    canvas: null,
    ctx: null,
    time: 0,

    /* ---- 安全区（全部换算成设计坐标，浏览器下恒为 0）----
     * insetTop     顶部留白：微信里就是状态栏高度（时间/信号所在那条）
     * insetBottom  底部留白：iPhone home 指示条
     * capsuleLeft/capsuleBottom 右上角胶囊按钮的左沿与下沿
     */
    insetTop: 0,
    insetBottom: 0,
    capsuleLeft: 0,
    capsuleBottom: 0,
    /* ---- 原始 px 值，便于排查 ---- */
    statusBarH: 0,      // px
    safeArea: null,     // px
    screenH: 0,         // px
    capsuleRect: null   // px {left,top,right,bottom,width,height}
  };

  /** 微信系统信息：优先 getWindowInfo，老基础库回退 getSystemInfoSync */
  function readInfo() {
    var info = null;
    try {
      if (typeof wx.getWindowInfo === 'function') info = wx.getWindowInfo();
    } catch (e) { info = null; }
    if (!info) { try { info = wx.getSystemInfoSync(); } catch (e2) { info = null; } }
    return info || {};
  }

  /** 右上角胶囊按钮的真实矩形（只有它能给出准确位置和高度） */
  function readCapsule() {
    try {
      if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
        var r = wx.getMenuButtonBoundingClientRect();
        if (r && r.height > 0 && r.bottom > 0 && r.left > 0) return r;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /** 把 px 安全区换算成设计坐标 */
  function syncInsets() {
    if (!(isWeapp || forceInsets) || !R.scale) {
      R.insetTop = 0; R.insetBottom = 0;
      R.capsuleLeft = 0; R.capsuleBottom = 0;
      return;
    }
    var s = R.scale;
    /* 左右黑边：设计坐标 x=0 落在屏幕的 ox 处。
     * 屏幕 X = 设计 x * s + ox，所以横向上「离屏幕左边多少 px」
     * 换算成设计坐标时必须先减掉 ox，否则窄屏有黑边时，
     * 右列会以为自己还有位置，实际已经压到胶囊上。 */
    var ox = (R.vw - R.W * s) / 2;

    // 顶部：状态栏高度。胶囊压在状态栏右侧且更靠下，所以左沿/下沿单独记。
    // 取整方向要保守：宁可多留半个像素，也不能让 UI 压到系统 UI 上。
    R.insetTop = Math.max(0, Math.ceil((R.statusBarH || 0) / s));
    if (R.capsuleRect && R.capsuleRect.height > 0) {
      R.capsuleLeft = Math.max(0, Math.floor(((R.capsuleRect.left || 0) - ox) / s));
      R.capsuleBottom = Math.max(0, Math.ceil((R.capsuleRect.bottom || 0) / s));
    } else {
      R.capsuleLeft = 0; R.capsuleBottom = 0;
    }

    // 底部：home 指示条。只有画布真的铺到屏幕最底部时才需要让位，
    // 否则（windowHeight 已经扣掉了底部条）再加就会白留一条空白。
    var botPx = 0;
    if (R.safeArea && R.safeArea.bottom && R.screenH && R.vh >= R.screenH - 1) {
      botPx = Math.max(0, R.screenH - R.safeArea.bottom);
    }
    R.insetBottom = Math.min(120, Math.max(0, Math.ceil(botPx / s)));
  }

  /**
   * 在浏览器 / 开发者工具里模拟微信安全区，专门用来肉眼验收顶部适配。
   * 传 px 值（与 wx.getWindowInfo 同量纲），内部照常走换算逻辑：
   *   R.debugSafeArea({ statusBarHeight: 47, screenHeight: 844,
   *                     safeArea: { bottom: 810 },
   *                     capsule: { left: 279, top: 51, right: 366, bottom: 83, height: 32 } })
   * 传 null / 不传即关闭模拟。
   */
  R.debugSafeArea = function (o) {
    if (!o) {
      forceInsets = false;
      R.statusBarH = 0; R.safeArea = null; R.capsuleRect = null; R.screenH = 0;
    } else {
      forceInsets = true;
      R.statusBarH = o.statusBarHeight || 0;
      R.screenH = o.screenHeight || R.vh;
      R.safeArea = o.safeArea || null;
      R.capsuleRect = (o.capsule && o.capsule.height > 0) ? o.capsule : null;
    }
    R.fit();
    return R;
  };

  R.init = function () {
    var canvas, ctx;
    /* 先应用用户设置：字号档位会改变 neededH，必须在第一次 fit() 之前定下来，
     * 否则首帧按错的档位排好版，切档时才跳一下。 */
    if (G.Settings) G.Settings.load();
    if (isWeapp) {
      canvas = wx.createCanvas(); // 首次调用返回上屏 canvas
      var info = readInfo();
      R.vw = info.windowWidth;
      R.vh = info.windowHeight;
      R.dpr = info.pixelRatio || 2;
      R.screenH = info.screenHeight || R.vh;
      R.statusBarH = info.statusBarHeight || 0;
      R.safeArea = info.safeArea || null;
      R.capsuleRect = readCapsule();
      canvas.width = Math.floor(R.vw * R.dpr);
      canvas.height = Math.floor(R.vh * R.dpr);

      // 折叠屏 / 横竖屏切换 / 分屏：尺寸和安全区都会变，必须重算
      try {
        if (typeof wx.onWindowResize === 'function') wx.onWindowResize(function () { R.refresh(); });
      } catch (e) { /* ignore */ }
    } else {
      canvas = document.getElementById('game');
      R.vw = window.innerWidth;
      R.vh = window.innerHeight;
      R.dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.floor(R.vw * R.dpr);
      canvas.height = Math.floor(R.vh * R.dpr);
      canvas.style.width = R.vw + 'px';
      canvas.style.height = R.vh + 'px';
    }
    ctx = canvas.getContext('2d');
    R.canvas = canvas;
    R.ctx = ctx;
    R.fit();
    return R;
  };

  /** 屏幕尺寸变化后重新取系统信息并重排 */
  R.refresh = function () {
    if (!isWeapp) { R.fit(); return; }
    try {
      var info = readInfo();
      if (info.windowWidth) R.vw = info.windowWidth;
      if (info.windowHeight) R.vh = info.windowHeight;
      R.dpr = info.pixelRatio || R.dpr;
      R.screenH = info.screenHeight || R.vh;
      R.statusBarH = info.statusBarHeight || 0;
      R.safeArea = info.safeArea || R.safeArea;
      R.capsuleRect = readCapsule();
      if (R.canvas) {
        R.canvas.width = Math.floor(R.vw * R.dpr);
        R.canvas.height = Math.floor(R.vh * R.dpr);
      }
    } catch (e) { /* ignore */ }
    R.fit();
  };

  R.fit = function () {
    if (!G.CFG || !G.CFG.buildLayout) return;

    function capArg() { return { left: R.capsuleLeft, bottom: R.capsuleBottom }; }

    /* 安全区（px）换算成设计单位要除以 scale，而 scale 又取决于安全区吃掉多少高度
     * —— 两者互相依赖。迭代几轮即可收敛，比一次近似靠谱：
     * 让 buildLayout 自己报「我需要多高」，而不是外部拍一个 1280 常数。 */
    var s = R.vw / R.W;
    var need = 1280;
    for (var pass = 0; pass < 5; pass++) {
      R.scale = s;
      syncInsets();
      need = G.CFG.buildLayout(R.vh / s, R.insetTop, R.insetBottom, capArg()).neededH;
      if (R.vh / s >= need - 0.5) break;
      s = Math.min(R.vw / R.W, R.vh / need);
    }

    R.scale = s;
    syncInsets();
    need = G.CFG.buildLayout(R.vh / s, R.insetTop, R.insetBottom, capArg()).neededH;

    var h = Math.max(R.vh / s, need);
    R.designH = h;
    R.ox = (R.vw - R.W * s) / 2;
    R.oy = (R.vh - h * s) / 2;
    G.LAY = G.CFG.buildLayout(h, R.insetTop, R.insetBottom, capArg());
  };

  /** 把屏幕坐标转换成设计坐标 */
  R.toDesign = function (cx, cy, out) {
    out = out || {};
    out.x = (cx - R.ox) / R.scale;
    out.y = (cy - R.oy) / R.scale;
    return out;
  };

  R.applyTransform = function (ctx) {
    var s = R.scale * R.dpr;
    ctx.setTransform(s, 0, 0, s, R.ox * R.dpr, R.oy * R.dpr);
  };

  /* ------------------------- 输入 ------------------------- */
  var pointer = { down: null, move: null, up: null };
  var pTmp = { x: 0, y: 0 };

  R.onPointer = function (o) { pointer = o || pointer; };

  R.bindInput = function () {
    if (isWeapp) {
      wx.onTouchStart(function (e) {
        if (!pointer.down) return;
        var t = e.touches[0] || e.changedTouches[0];
        if (!t) return;
        R.toDesign(t.clientX, t.clientY, pTmp);
        pointer.down(pTmp.x, pTmp.y);
      });
      wx.onTouchMove(function (e) {
        if (!pointer.move) return;
        var t = e.touches[0] || e.changedTouches[0];
        if (!t) return;
        R.toDesign(t.clientX, t.clientY, pTmp);
        pointer.move(pTmp.x, pTmp.y);
      });
      var end = function (e) {
        if (!pointer.up) return;
        var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
        if (!t) return;
        R.toDesign(t.clientX, t.clientY, pTmp);
        pointer.up(pTmp.x, pTmp.y);
      };
      wx.onTouchEnd(end);
      wx.onTouchCancel(end);
      return;
    }

    var cv = R.canvas;
    var usePointer = (typeof window !== 'undefined' && 'PointerEvent' in window);
    var pick = function (e) {
      if (e.touches && e.touches[0]) return e.touches[0];
      if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0];
      return e;
    };
    var onDown = function (e) {
      e.preventDefault();
      var t = pick(e);
      R.toDesign(t.clientX, t.clientY, pTmp);
      if (pointer.down) pointer.down(pTmp.x, pTmp.y);
    };
    var onMove = function (e) {
      e.preventDefault();
      var t = pick(e);
      R.toDesign(t.clientX, t.clientY, pTmp);
      if (pointer.move) pointer.move(pTmp.x, pTmp.y);
    };
    var onUp = function (e) {
      e.preventDefault();
      var t = pick(e);
      R.toDesign(t.clientX, t.clientY, pTmp);
      if (pointer.up) pointer.up(pTmp.x, pTmp.y);
    };
    var d = usePointer ? 'pointerdown' : 'mousedown';
    var m = usePointer ? 'pointermove' : 'mousemove';
    var u = usePointer ? 'pointerup' : 'mouseup';
    cv.addEventListener(d, onDown, { passive: false });
    cv.addEventListener(m, onMove, { passive: false });
    cv.addEventListener(u, onUp, { passive: false });
    cv.addEventListener('touchstart', onDown, { passive: false });
    cv.addEventListener('touchmove', onMove, { passive: false });
    cv.addEventListener('touchend', onUp, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('resize', function () { R.fit(); });
  };

  /* ------------------------- 帧循环 ------------------------- */
  /*
   * 注意：不能写成 `R.raf = requestAnimationFrame`。
   * 那样之后用 R.raf(cb) 调用时 this 会变成 R 这个普通对象，
   * 浏览器会抛 `TypeError: Illegal invocation`，主循环起不来。
   * 必须包一层，让 requestAnimationFrame 以裸名调用（this 为 undefined）。
   */
  R.raf = (typeof requestAnimationFrame === 'function')
    ? function (cb) { return requestAnimationFrame(cb); }
    : function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); };

  /* ------------------------- 存储 ------------------------- */
  R.store = {
    get: function (key, dft) {
      try {
        if (isWeapp) {
          var v = wx.getStorageSync(key);
          return (v === '' || v === null || v === undefined) ? dft : v;
        }
        var s = window.localStorage.getItem(key);
        return s === null ? dft : JSON.parse(s);
      } catch (e) { return dft; }
    },
    set: function (key, val) {
      try {
        if (isWeapp) wx.setStorageSync(key, val);
        else window.localStorage.setItem(key, JSON.stringify(val));
      } catch (e) { /* ignore */ }
    }
  };

  /* ------------------------- 震动 -------------------------
   * 设置页可关（CFG.SET.vibrate）。关掉时直接返回，不去碰系统 API。
   * 浏览器里 WebKit 从未实现 navigator.vibrate（iPhone 上永远不震），
   * 但 Android Chrome 支持，顺手接上，方便在浏览器里验手感。 */
  R.buzz = function (type) {
    if (G.CFG && G.CFG.SET && G.CFG.SET.vibrate === false) return false;
    try {
      if (isWeapp) {
        if (wx.vibrateShort) wx.vibrateShort({ type: type || 'light' });
        return true;
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(type === 'heavy' ? 30 : type === 'medium' ? 18 : 10);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
