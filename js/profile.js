/**
 * profile.js —— 回响档案（局外成长存档）
 *
 * 这一层管「跨局留下的东西」，只有两类：
 *   1. 回响点（pts）—— 每局结算累加，只用来**解锁内容**，不换数值；
 *   2. 战功录（runs / kills / wins / best / deepBest）—— 纯展示的累计统计。
 *
 * 为什么不给永久数值加成：见 config.js 里 CFG.UNLOCKS 上方那段注释 ——
 * 本作难度是阈值型的，超过约 3% 的永久输出提升就会把 20 波曲线打塌。
 *
 * 存档键 echo_profile，值是一个纯对象（可 JSON 化）：
 *   { pts, runs, kills, wins, best, deepBest, deep }
 * 读写走 R.store（微信 wx.*StorageSync / 浏览器 localStorage）；
 * 注意 R.store **只有 get/set、没有 remove** —— 想「清档」是覆盖写一个默认值，
 * 不是删键（环境里 Node 无 window，R.store 会自动落进 catch 返回默认值，
 * 所以自检脚本里读到的永远是空档案）。
 *
 * 本模块在 config.js 之后、main.js 之前加载，且**加载时就应用一次**解锁状态
 * （改写 CFG.TOWER_ORDER），这样后面所有模块拿到的都是正确的上架塔表。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, R = G.Runtime;

  var SKEY = 'echo_profile';

  /* 默认档案。加字段只管往这里加 —— normalize 会照着这张表补齐，
   * 所以老存档（少字段）不会崩，新字段自动拿默认值。 */
  var DEFAULTS = {
    pts: 0,        // 累计回响点
    runs: 0,       // 累计开局数
    kills: 0,      // 累计击杀
    wins: 0,       // 累计通关次数
    best: 0,       // 最高到达波次
    deepBest: 0,   // 深渊档最高到达波次（独立）
    deep: 0        // 深渊档是否开启（0/1）
  };

  var P = G.Profile = {};

  var data = normalize(null);

  /* ------------------------------------------------------------------ */
  /*  存档读写                                                            */
  /* ------------------------------------------------------------------ */
  /** 把任意来源的原始值整理成一份合法的档案：缺字段补默认、数值防 NaN/负数。
   *  存档是**可以被玩家改**的本地数据，所以一律当不可信输入处理。 */
  function normalize(raw) {
    var out = {};
    var k;
    if (raw && typeof raw === 'object') {
      for (k in DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== null) out[k] = raw[k];
      }
    }
    for (k in DEFAULTS) {
      if (out[k] === undefined) out[k] = DEFAULTS[k];
    }
    var nums = ['pts', 'runs', 'kills', 'wins', 'best', 'deepBest', 'deep'];
    for (var i = 0; i < nums.length; i++) {
      var v = Number(out[nums[i]]);
      out[nums[i]] = (isFinite(v) && v > 0) ? Math.floor(v) : 0;
    }
    return out;
  }

  P.load = function () {
    data = normalize(R && R.store ? R.store.get(SKEY, null) : null);
    return data;
  };

  P.save = function () {
    if (R && R.store) R.store.set(SKEY, data);
    return data;
  };

  /** 清档：覆盖写一份默认值（R.store 没有 remove，只能这么清） */
  P.wipe = function () {
    data = normalize(null);
    P.refresh();
    P.save();
    return data;
  };

  /* ------------------------------------------------------------------ */
  /*  解锁判定                                                            */
  /* ------------------------------------------------------------------ */
  /** 已完全解锁的线，形如 { cryo: true, deep: true }。查询走 P.has()。 */
  P.flags = {};

  /** 某条线当前达成的档位下标；-1 = 第一档都没到。
   *  tiers[0].at 通常是 0（起始即达成），所以这类线恒 >= 0。 */
  P.tierOf = function (line) {
    var t = -1;
    for (var i = 0; i < line.tiers.length; i++) {
      if (data.pts >= line.tiers[i].at) t = i;
    }
    return t;
  };

  P.has = function (key) { return !!P.flags[key]; };

  /** 重算解锁状态，并把结果同步到 CFG.TOWER_ORDER。
   *  返回 true = 上架塔表发生了变化（调用方据此决定要不要重排版式）。 */
  P.refresh = function () {
    var flags = {};
    for (var i = 0; i < CFG.UNLOCKS.length; i++) {
      var line = CFG.UNLOCKS[i];
      var last = line.tiers[line.tiers.length - 1];
      if (data.pts >= last.at) flags[line.key] = true;
    }
    P.flags = flags;
    return P.applyToConfig();
  };

  /** 按解锁状态改写「当前上架塔表」CFG.TOWER_ORDER。
   *  没解锁凝霜 → 从完整表里剔掉它；解锁了就原样保留完整表。
   *  —— 这是全工程唯一动 TOWER_ORDER 的地方，渲染/输入/布局都只读不判。 */
  P.applyToConfig = function () {
    var all = CFG.TOWER_ORDER_ALL || CFG.TOWER_ORDER;
    var out = [], i;
    for (i = 0; i < all.length; i++) {
      var key = all[i];
      if (key === 'cryo' && !P.has('cryo')) continue;   // 未解锁 → 剔出上架表
      out.push(key);
    }
    /* 变化的判据是「新表和旧表不一致」，不能拿「剔掉过东西」当变化 ——
     * 未解锁阶段每次 refresh 都会剔一次 cryo，但结果与上次完全相同，
     * 版式并不需要重排（早年这里误判成 true，每次结算都谎报一次）。 */
    var changed = (out.length !== CFG.TOWER_ORDER.length);
    if (!changed) {
      for (i = 0; i < out.length; i++) {
        if (out[i] !== CFG.TOWER_ORDER[i]) { changed = true; break; }
      }
    }
    CFG.TOWER_ORDER = out;
    return changed;
  };

  /* ------------------------------------------------------------------ */
  /*  回响点                                                              */
  /* ------------------------------------------------------------------ */
  P.pts = function () { return data.pts; };
  P.stats = function () {
    return {
      pts: data.pts, runs: data.runs, kills: data.kills,
      wins: data.wins, best: data.best, deepBest: data.deepBest
    };
  };

  /** 一局的回响点：波次 × perWave + ⌊击杀 ÷ perKillDiv⌋ − 漏怪 × leakPenalty
   *  +（通关 ? winBonus : 0）。失败也给点，只是少拿 —— 这是设计的一部分。 */
  P.gainOf = function (g, isWin) {
    var c = CFG.ECHO_POINT;
    var gain = g.wave * c.perWave +
      Math.floor(g.kills / c.perKillDiv) -
      g.leaked * c.leakPenalty +
      (isWin ? c.winBonus : 0);
    return gain > 0 ? Math.floor(gain) : 0;
  };

  /**
   * 结算一局：累加点数与战功，写盘。
   * 返回 { gain, unlocked:[], changed } —— unlocked 是**本次新解锁**的线，
   * 用来在结算面板上给一句「解锁了 XX」的提示；changed 表示上架塔表变了
   * （需要重排版式，否则建造栏会少一张卡的位置）。
   */
  P.settle = function (g, isWin) {
    var before = {};
    var k;
    for (k in P.flags) before[k] = true;

    var gain = P.gainOf(g, isWin);
    data.pts += gain;
    data.runs++;
    data.kills += g.kills | 0;
    if (isWin) data.wins++;
    if (g.wave > data.best) data.best = g.wave;
    if (g.deep && isWin && g.wave > data.deepBest) data.deepBest = g.wave;

    var changed = P.refresh();
    P.save();

    var fresh = [];
    for (var i = 0; i < CFG.UNLOCKS.length; i++) {
      var key = CFG.UNLOCKS[i].key;
      if (P.flags[key] && !before[key]) fresh.push(CFG.UNLOCKS[i]);
    }
    return { gain: gain, unlocked: fresh, changed: changed };
  };

  /* ------------------------------------------------------------------ */
  /*  突变池（地脉谱系）                                                   */
  /* ------------------------------------------------------------------ */
  /** 当前可用的地脉突变子集。条数由「地脉谱系」那条线的档位决定：
   *  未解锁第 2 档时只放前 CFG.MUT_BASE 条 —— 前几局随机性可控一点，
   *  解锁后再往「更混沌」放开。注意是**截前 N 条**而不是随机挑，
   *  这样起始池是固定的一组，玩家能记住、也方便自检。 */
  P.mutPool = function () {
    var n = CFG.MUT_BASE;
    for (var i = 0; i < CFG.UNLOCKS.length; i++) {
      var line = CFG.UNLOCKS[i];
      if (line.key !== 'muts') continue;
      var t = P.tierOf(line);
      if (t < 0) t = 0;
      if (line.counts && line.counts[t] !== undefined) n = line.counts[t];
      break;
    }
    if (n > CFG.MUTATIONS.length) n = CFG.MUTATIONS.length;
    if (n < 1) n = 1;
    return CFG.MUTATIONS.slice(0, n);
  };

  /* ------------------------------------------------------------------ */
  /*  深渊档                                                              */
  /* ------------------------------------------------------------------ */
  /** 是否开启了深渊（未解锁时恒 false，即使存档被改成 1 也不认） */
  P.deepOn = function () { return P.has('deep') && data.deep === 1; };
  P.setDeep = function (on) {
    if (!P.has('deep')) return false;
    data.deep = on ? 1 : 0;
    P.save();
    return true;
  };
  P.deepBest = function () { return data.deepBest; };

  /* ------------------------------------------------------------------ */
  /*  加载：读档 + 应用一次解锁状态                                        */
  /* ------------------------------------------------------------------ */
  P.load();
  P.refresh();

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
