/**
 * audio.js —— 程序化音效（实时合成，零音频文件）
 *
 * 为什么不用音频文件：
 *   1) 小游戏包体越小越好，一段 wav 就几百 KB，这里全部用振荡器 + 噪声现场合成；
 *   2) 同一个音可以随机微调频率，几十座塔同时开火也不会变成「复读机」。
 *
 * 双端：浏览器走 WebAudio，微信小游戏走 wx.createWebAudioContext()。
 * 任何一步失败都静默降级为「无声」，绝不影响游戏逻辑。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};

  var A = G.Audio = {};

  var ac = null;             // AudioContext
  var master = null;         // 主输出（同时是静音开关）
  var makeup = null;         // 压缩后的补偿增益
  var noiseBuf = null;       // 复用的白噪声
  var ok = false;            // 音频链路是否可用
  var unlocked = false;      // 是否已拿到用户手势（浏览器必须）
  var muted = false;
  var VOLUME = 1;            // 用户音量 0~1（设置页），存 echo_vol

  /* ------------------------------------------------------------------ */
  /*  音量总旋钮：整体想调响 / 调轻，只动这两个数                            */
  /*    MASTER_VOL —— 送进压缩器之前的电平                                  */
  /*    MAKEUP_VOL —— 压缩之后再补回来，避免「一压就闷」                     */
  /*  实际增益 = MASTER_VOL × VOLUME（VOLUME 由设置页控制，1 = 不衰减）      */
  /* ------------------------------------------------------------------ */
  var MASTER_VOL = 0.85;
  var MAKEUP_VOL = 1.30;

  /** 把「静音 + 用户音量」合成到主增益上。所有改增益的地方都走这里，别再各写各的 */
  function applyGain() {
    try {
      if (master) master.gain.value = muted ? 0 : MASTER_VOL * VOLUME;
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ */
  /*  初始化                                                              */
  /* ------------------------------------------------------------------ */
  A.init = function () {
    if (ok) return true;
    try {
      if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
        ac = wx.createWebAudioContext();
      } else if (typeof window !== 'undefined') {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (Ctor) ac = new Ctor();
      }
      if (!ac || typeof ac.createGain !== 'function') { ac = null; return false; }

      master = ac.createGain();
      master.gain.value = MASTER_VOL;

      makeup = ac.createGain();
      makeup.gain.value = MAKEUP_VOL;

      // 塔一多会有几十路音同时响，挂个压缩器兜住峰值，防止爆音。
      // 阈值不能压太低：-16dB 那种会把「单个音头」也一起削掉，
      // 听感上不是变稳，而是整体发闷、变小 —— 这里只拦真正的峰值。
      var tail = master;
      try {
        if (typeof ac.createDynamicsCompressor === 'function') {
          var cp = ac.createDynamicsCompressor();
          if (cp.threshold && cp.ratio) {
            cp.threshold.value = -10;
            cp.knee.value = 22;
            cp.ratio.value = 5;
            cp.attack.value = 0.003;
            cp.release.value = 0.25;
            master.connect(cp);
            tail = cp;
          }
        }
      } catch (e) { tail = master; }
      tail.connect(makeup);
      makeup.connect(ac.destination);

      noiseBuf = makeNoise();

      try { muted = !!G.Runtime.store.get('echo_muted', false); } catch (e) { muted = false; }
      try {
        var v = G.Runtime.store.get('echo_vol', 1);
        VOLUME = (typeof v === 'number' && v >= 0 && v <= 1) ? v : 1;
      } catch (e2) { VOLUME = 1; }
      applyGain();

      ok = true;
      return true;
    } catch (e) {
      ac = null; ok = false; return false;
    }
  };

  function makeNoise() {
    try {
      var sr = ac.sampleRate || 44100;
      var len = Math.max(1, Math.floor(sr * 0.5));
      var buf = ac.createBuffer(1, len, sr);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    } catch (e) { return null; }
  }

  /** 必须在用户手势里调用一次，否则浏览器不出声 */
  A.unlock = function () {
    if (!ac) A.init();
    if (!ac) return;
    try {
      if (ac.state === 'suspended' && typeof ac.resume === 'function') ac.resume();
    } catch (e) { /* ignore */ }
    unlocked = true;
  };

  A.available = function () { return ok && !muted; };

  /** 切到后台时挂起音频上下文：省电，也避免在后台继续出声 */
  A.suspend = function () {
    try { if (ac && typeof ac.suspend === 'function') ac.suspend(); } catch (e) { /* ignore */ }
  };

  /** 回到前台时恢复；未解锁过则等首次用户手势（A.unlock）再响 */
  A.resume = function () {
    try {
      if (ac && ac.state === 'suspended' && typeof ac.resume === 'function') ac.resume();
    } catch (e) { /* ignore */ }
  };

  /** 供自检读取当前增益链，确认音量旋钮真的作用到了节点上 */
  A.levels = function () {
    return {
      masterNominal: MASTER_VOL,
      makeupNominal: MAKEUP_VOL,
      volume: VOLUME,
      expectGain: muted ? 0 : MASTER_VOL * VOLUME,
      master: master ? master.gain.value : null,
      makeup: makeup ? makeup.gain.value : null,
      muted: muted
    };
  };

  /* ------------------------------------------------------------------ */
  /*  静音开关                                                            */
  /* ------------------------------------------------------------------ */
  A.isMuted = function () { return muted; };

  A.setMuted = function (m) {
    muted = !!m;
    applyGain();
    try { G.Runtime.store.set('echo_muted', muted); } catch (e) { /* ignore */ }
  };

  /* ------------------------------------------------------------------ */
  /*  用户音量（设置页 0~1）                                               */
  /* ------------------------------------------------------------------ */
  A.getVolume = function () { return VOLUME; };

  /** @param {number} v 0~1；@param {boolean} quiet 只应用不写存储（启动加载时用）
   *  越界按边界处理（不是「非法就回 1」）：− 号连点到底要停在 0，不能跳回满音量 */
  A.setVolume = function (v, quiet) {
    v = Number(v);
    if (isNaN(v)) v = 1;
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    VOLUME = Math.round(v * 100) / 100;      // 量化到 1%，避免存储里出现一长串小数
    applyGain();
    if (!quiet) {
      try { G.Runtime.store.set('echo_vol', VOLUME); } catch (e) { /* ignore */ }
    }
    return VOLUME;
  };

  /** 步进调节（设置页的 − / ＋），到边界就停住 */
  A.stepVolume = function (d) {
    return A.setVolume(Math.round((VOLUME + d) * 100) / 100);
  };

  A.toggleMute = function () {
    A.unlock();
    A.setMuted(!muted);
    if (!muted) LIB.ui();
    return muted;
  };

  /* ------------------------------------------------------------------ */
  /*  节流：这是音效不炸的关键                                             */
  /* ------------------------------------------------------------------ */
  var lastAt = {};

  function gate(key, ms) {
    var t = Date.now();
    if (lastAt[key] !== undefined && t - lastAt[key] < ms) return false;
    lastAt[key] = t;
    return true;
  }

  // 开火音单独做「预算」：140ms 内最多 3 声，否则塔一多就是白噪音
  var shotWin = [];
  function shotBudget() {
    var t = Date.now();
    while (shotWin.length && t - shotWin[0] > 140) shotWin.shift();
    if (shotWin.length >= 3) return false;
    shotWin.push(t);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  合成原语                                                            */
  /* ------------------------------------------------------------------ */
  function now() { return ac ? ac.currentTime : 0; }

  /** 单振荡器 + 包络，可扫频 */
  function tone(o) {
    if (!ok || muted || !unlocked) return;
    try {
      var t = now() + (o.delay || 0);
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = o.type || 'sine';
      var f0 = Math.max(20, o.f0);
      osc.frequency.setValueAtTime(f0, t);
      if (o.f1 && o.f1 !== o.f0) {
        var f1 = Math.max(20, o.f1);
        if (o.exp) osc.frequency.exponentialRampToValueAtTime(f1, t + o.dur);
        else osc.frequency.linearRampToValueAtTime(f1, t + o.dur);
      }
      var vol = o.vol === undefined ? 0.25 : o.vol;
      var atk = o.attack === undefined ? 0.005 : o.attack;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

      var node = osc;
      if (o.lp) {
        var lf = ac.createBiquadFilter();
        lf.type = 'lowpass';
        lf.frequency.setValueAtTime(o.lp, t);
        osc.connect(lf);
        node = lf;
      }
      node.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + o.dur + 0.03);
    } catch (e) { /* ignore */ }
  }

  /** 噪声 + 滤波扫频，负责「质感」 */
  function noise(o) {
    if (!ok || muted || !unlocked || !noiseBuf) return;
    try {
      var t = now() + (o.delay || 0);
      var src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      var f = ac.createBiquadFilter();
      f.type = o.ft || 'bandpass';
      f.frequency.setValueAtTime(Math.max(20, o.f0), t);
      if (o.f1 && o.f1 !== o.f0) {
        f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
      }
      f.Q.value = o.q === undefined ? 1 : o.q;
      var g = ac.createGain();
      var vol = o.vol === undefined ? 0.2 : o.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + o.dur + 0.03);
    } catch (e) { /* ignore */ }
  }

  /** 随机微调，避免重复感刺耳 */
  function jit(f, k) { return f * (1 + (Math.random() * 2 - 1) * (k || 0.04)); }

  /* ------------------------------------------------------------------ */
  /*  音色库                                                              */
  /* ------------------------------------------------------------------ */
  var LIB = {};

  /* —— 建造：落地闷响 + 上行确认音 —— */
  LIB.build = function () {
    tone({ type: 'sine', f0: 130, f1: 46, dur: 0.26, vol: 0.40, exp: true });
    noise({ ft: 'lowpass', f0: 1500, f1: 240, dur: 0.15, vol: 0.20, q: 0.8 });
    tone({ type: 'triangle', f0: jit(540), f1: jit(920), dur: 0.18, vol: 0.13, delay: 0.07, exp: true });
  };

  /* —— 升级：三音上行琶音 —— */
  LIB.upgrade = function () {
    var seq = [523, 659, 880];
    for (var i = 0; i < seq.length; i++) {
      tone({ type: 'sine', f0: seq[i], f1: seq[i], dur: 0.20, vol: 0.16, delay: i * 0.062, attack: 0.008 });
      tone({ type: 'triangle', f0: seq[i] * 2, f1: seq[i] * 2, dur: 0.12, vol: 0.05, delay: i * 0.062 });
    }
    noise({ ft: 'highpass', f0: 2600, f1: 5200, dur: 0.24, vol: 0.06, delay: 0.06 });
  };

  /* —— 回收 —— */
  LIB.sell = function () {
    tone({ type: 'triangle', f0: 920, f1: 620, dur: 0.12, vol: 0.14, exp: true });
    tone({ type: 'triangle', f0: 620, f1: 400, dur: 0.18, vol: 0.13, delay: 0.09, exp: true });
  };

  /* —— 赤炎开火：闷爆 + 低频推力 —— */
  LIB.shootFire = function () {
    noise({ ft: 'lowpass', f0: jit(1000), f1: 240, dur: 0.10, vol: 0.11, q: 0.9 });
    tone({ type: 'triangle', f0: jit(430), f1: 150, dur: 0.10, vol: 0.055, exp: true });
  };

  /* —— 寒霜开火：清脆叮 + 冷风 —— */
  LIB.shootFrost = function () {
    tone({ type: 'sine', f0: jit(1500), f1: 940, dur: 0.13, vol: 0.085, exp: true });
    noise({ ft: 'highpass', f0: 3200, f1: 1900, dur: 0.18, vol: 0.055, q: 0.7 });
  };

  /* —— 雷引开火：电流撕裂 —— */
  LIB.shootVolt = function () {
    noise({ ft: 'bandpass', f0: jit(2600), f1: 720, dur: 0.11, vol: 0.095, q: 3.2 });
    tone({ type: 'sawtooth', f0: 190, f1: 92, dur: 0.09, vol: 0.045, exp: true });
  };

  /* —— 命中：极短 click（高频度，必须最轻） —— */
  LIB.hit = function () {
    noise({ ft: 'bandpass', f0: jit(2300, 0.12), dur: 0.035, vol: 0.06, q: 5 });
    tone({ type: 'square', f0: jit(760, 0.1), f1: 420, dur: 0.03, vol: 0.03, exp: true });
  };

  /* —— 击杀 —— */
  LIB.kill = function () {
    tone({ type: 'triangle', f0: jit(310), f1: 118, dur: 0.15, vol: 0.10, exp: true });
    noise({ ft: 'lowpass', f0: 1700, f1: 380, dur: 0.13, vol: 0.085 });
  };

  /* —— Boss 倒下 —— */
  LIB.bossDown = function () {
    tone({ type: 'sine', f0: 150, f1: 36, dur: 0.95, vol: 0.42, exp: true });
    noise({ ft: 'lowpass', f0: 950, f1: 80, dur: 0.85, vol: 0.28 });
    tone({ type: 'sawtooth', f0: 220, f1: 52, dur: 0.65, vol: 0.12, exp: true });
  };

  /* —— 漏怪 / 核心受损：重击 + 警报 —— */
  LIB.leak = function () {
    tone({ type: 'sine', f0: 72, f1: 34, dur: 0.55, vol: 0.46, exp: true });
    noise({ ft: 'lowpass', f0: 520, f1: 70, dur: 0.48, vol: 0.24 });
    tone({ type: 'square', f0: 640, f1: 300, dur: 0.30, vol: 0.10, delay: 0.04, exp: true });
    tone({ type: 'square', f0: 640, f1: 300, dur: 0.30, vol: 0.09, delay: 0.24, exp: true });
  };

  /* —— 共振脉冲 —— */
  LIB.pulse = function () {
    tone({ type: 'sine', f0: 980, f1: 110, dur: 0.40, vol: 0.24, exp: true });
    noise({ ft: 'bandpass', f0: 1900, f1: 190, dur: 0.36, vol: 0.18, q: 1.4 });
    tone({ type: 'triangle', f0: 2400, f1: 600, dur: 0.16, vol: 0.08 });
  };

  /* —— 回声倒带：磁带反向扫频 —— */
  LIB.echo = function () {
    tone({ type: 'sine', f0: 110, f1: 1600, dur: 0.52, vol: 0.20, exp: true });
    tone({ type: 'sine', f0: 1600, f1: 120, dur: 0.50, vol: 0.15, delay: 0.20, exp: true });
    noise({ ft: 'bandpass', f0: 380, f1: 2900, dur: 0.44, vol: 0.10, q: 2.2 });
    tone({ type: 'triangle', f0: 70, f1: 40, dur: 0.7, vol: 0.22, exp: true, delay: 0.3 });
  };

  /* —— 反应：汽爆 —— */
  LIB.reactBurst = function () {
    noise({ ft: 'lowpass', f0: 2100, f1: 140, dur: 0.32, vol: 0.26 });
    tone({ type: 'sine', f0: 270, f1: 66, dur: 0.30, vol: 0.20, exp: true });
  };

  /* —— 反应：超导 —— */
  LIB.reactSuper = function () {
    tone({ type: 'sine', f0: 1750, f1: 2650, dur: 0.16, vol: 0.11 });
    tone({ type: 'sine', f0: 2650, f1: 3500, dur: 0.22, vol: 0.085, delay: 0.10 });
    noise({ ft: 'highpass', f0: 4200, f1: 6200, dur: 0.20, vol: 0.065 });
  };

  /* —— 反应：过载 —— */
  LIB.reactOverload = function () {
    noise({ ft: 'bandpass', f0: 900, f1: 3400, dur: 0.13, vol: 0.15, q: 2 });
    tone({ type: 'sawtooth', f0: 330, f1: 88, dur: 0.28, vol: 0.13, exp: true });
    tone({ type: 'square', f0: 1900, f1: 640, dur: 0.20, vol: 0.07, delay: 0.03, exp: true });
  };

  /* —— 开波号角 —— */
  LIB.waveStart = function () {
    tone({ type: 'sine', f0: 98, f1: 76, dur: 0.34, vol: 0.26, exp: true });
    tone({ type: 'sawtooth', f0: 196, f1: 196, dur: 0.30, vol: 0.10, lp: 900 });
    tone({ type: 'sawtooth', f0: 294, f1: 294, dur: 0.36, vol: 0.10, delay: 0.15, lp: 1200 });
  };

  /* —— 波次清空 —— */
  LIB.waveClear = function () {
    var seq = [660, 880, 1170];
    for (var i = 0; i < seq.length; i++) {
      tone({ type: 'sine', f0: seq[i], f1: seq[i], dur: 0.26, vol: 0.13, delay: i * 0.075 });
    }
  };

  /* —— 通关 —— */
  LIB.win = function () {
    var seq = [523, 659, 784, 1047, 1319];
    for (var i = 0; i < seq.length; i++) {
      tone({ type: 'sine', f0: seq[i], f1: seq[i], dur: 0.55, vol: 0.17, delay: i * 0.11, attack: 0.01 });
      tone({ type: 'triangle', f0: seq[i] * 0.5, f1: seq[i] * 0.5, dur: 0.5, vol: 0.06, delay: i * 0.11 });
    }
  };

  /* —— 失败 —— */
  LIB.over = function () {
    var seq = [440, 392, 330, 247];
    for (var i = 0; i < seq.length; i++) {
      tone({ type: 'sine', f0: seq[i], f1: seq[i] * 0.98, dur: 0.7, vol: 0.17, delay: i * 0.17, attack: 0.012 });
      tone({ type: 'sawtooth', f0: seq[i] * 0.5, f1: seq[i] * 0.5, dur: 0.7, vol: 0.045, delay: i * 0.17, lp: 700 });
    }
  };

  /* —— 拒绝（能量不足） —— */
  LIB.deny = function () {
    tone({ type: 'square', f0: 158, f1: 112, dur: 0.085, vol: 0.11, exp: true });
    tone({ type: 'square', f0: 132, f1: 96, dur: 0.11, vol: 0.11, delay: 0.10, exp: true });
  };

  /* —— 轻交互 —— */
  LIB.ui = function () {
    tone({ type: 'sine', f0: 900, f1: 1260, dur: 0.055, vol: 0.07 });
  };

  LIB.select = function () {
    tone({ type: 'sine', f0: 680, f1: 900, dur: 0.07, vol: 0.075 });
  };

  /* ------------------------------------------------------------------ */
  /*  对外播放接口                                                        */
  /* ------------------------------------------------------------------ */
  var GATES = {
    shootFire: 55, shootFrost: 70, shootVolt: 65,
    hit: 48, kill: 60, deny: 320,
    build: 90, upgrade: 120, sell: 120, select: 90, ui: 60,
    reactBurst: 150, reactSuper: 150, reactOverload: 150,
    leak: 200, pulse: 220, echo: 400
  };

  /** 返回是否真的发出声（被节流挡掉 / 静音 / 未解锁都返回 false），便于自检 */
  A.play = function (name) {
    if (!ok || muted || !unlocked) return false;
    var fn = LIB[name];
    if (!fn) return false;
    var g = GATES[name];
    if (g && !gate(name, g)) return false;
    if ((name === 'shootFire' || name === 'shootFrost' || name === 'shootVolt') && !shotBudget()) return false;
    try { fn(); return true; } catch (e) { return false; }
  };

  /** 开火音统一入口，按元素派发（7 元素共享 3 种音色的变体） */
  A.shoot = function (elem) {
    if (elem === 'hydro' || elem === 'cryo' || elem === 'anemo') A.play('shootFrost');
    else if (elem === 'electro' || elem === 'dendro') A.play('shootVolt');
    else A.play('shootFire');
  };

  /** 反应音：全部 11 类反应归并到 3 种音色上（冻结/结晶偏冷，感电/激化偏电） */
  A.reaction = function (kind) {
    if (kind === 'super' || kind === 'freeze' || kind === 'crystal') A.play('reactSuper');
    else if (kind === 'overload' || kind === 'echain' || kind === 'quicken') A.play('reactOverload');
    else A.play('reactBurst');
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
