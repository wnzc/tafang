/**
 * settings.js —— 用户设置（字体档位 / 音效 / 音量 / 震动）
 *
 * 为什么单独一个模块：
 *   这四个设置分属三个地方（字号在 config、音量与静音在 audio、震动在 runtime），
 *   如果各处自己读自己的存储，会出现「设置页改了、别处不知道」，或者
 *   「改完没重排布局」，字换了盒子没换 → 立刻撞车。
 *   所以统一从这里进出：读一次、存一处、改完顺手重排（R.fit）。
 *
 * 存储键与默认值：
 *   echo_fontLevel  0/1/2        中（1）
 *   echo_vol        0~1          1
 *   echo_muted      bool         false（audio.js 自己读写，这里只转发）
 *   echo_vibrate    bool         true
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG;

  var S = G.Settings = {};

  var KEYS = {
    fontLevel: 'echo_fontLevel',
    volume: 'echo_vol',
    muted: 'echo_muted',
    vibrate: 'echo_vibrate'
  };

  /** 当前生效值（Audio 未就绪时用默认值兜底） */
  S.get = function (key) {
    var A = G.Audio;
    if (key === 'fontLevel') return CFG.FONT_LEVEL;
    if (key === 'vibrate') return CFG.SET.vibrate !== false;
    if (key === 'volume') return A ? A.getVolume() : CFG.SET.volume;
    if (key === 'muted') return A ? A.isMuted() : !!CFG.SET.muted;
    return undefined;
  };

  /**
   * 写入并立即生效。返回生效后的值。
   * 注意：调用方负责保证此时 canvas 已经就绪（boot 之后），
   * 因为字号档位改完必须重排布局，否则字与盒子会对不上。
   */
  S.set = function (key, val) {
    var A = G.Audio;
    if (key === 'fontLevel') {
      CFG.setFontLevel(val);
      val = CFG.FONT_LEVEL;
    } else if (key === 'vibrate') {
      CFG.SET.vibrate = !!val;
      val = CFG.SET.vibrate;
    } else if (key === 'volume') {
      if (A) A.setVolume(val);
      else CFG.SET.volume = val;
      val = S.get('volume');
    } else if (key === 'muted') {
      if (A) A.setMuted(val);
      else CFG.SET.muted = !!val;
      val = !!val;
    } else {
      return undefined;
    }
    try { G.Runtime.store.set(KEYS[key], val); } catch (e) { /* ignore */ }

    // 字号档位会改变 neededH → 必须重排（其他三项不影响布局）
    if (key === 'fontLevel' && G.Runtime && G.Runtime.ctx) G.Runtime.fit();
    return val;
  };

  /** 启动时读一次存储并应用。必须在 R.fit() 之前调用，否则第一帧字号是错的。 */
  S.load = function () {
    var R = G.Runtime;
    var A = G.Audio;
    try {
      CFG.setFontLevel(R.store.get(KEYS.fontLevel, 1));
      CFG.SET.vibrate = R.store.get(KEYS.vibrate, true) !== false;
      if (A) {
        if (typeof A.setVolume === 'function') {
          A.setVolume(R.store.get(KEYS.volume, 1), true);   // true = 不重复写存储
        }
      } else {
        CFG.SET.volume = R.store.get(KEYS.volume, 1);
      }
    } catch (e) { /* 存储不可用时一律走默认值 */ }
    return CFG.FONT_LEVEL;
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
