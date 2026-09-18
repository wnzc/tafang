/**
 * waves.js —— 波次编排
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG;

  var NAMES = {
    drifter: '游荡体',
    sprinter: '疾行体',
    bulwark: '装甲体',
    sunder: '破墙者',
    phaser: '相位体',
    boss: '共鸣吞噬者'
  };

  var W = G.Waves = {};

  W.plan = function (n) {
    /* 血量成长曲线。这一版是**下调过**的：
     *   旧式 1 + 0.46(n-1) + 0.020(n-1)² 在 n=20 时是 16.96 倍 ——
     *   游荡体 62 血变 1052，第 5 波的 Boss 更是 4448 血，
     *   而玩家那时手上只有四五座一级塔（合计不到 60 秒伤），
     *   打完要七十多秒、它走完全程只要 25 秒 —— 体验就是「血太厚，打不动」。
     *   现在改成 1 + 0.30(n-1) + 0.014(n-1)²：n=5 是 2.42（旧 3.16）、
     *   n=20 是 11.75（旧 16.96），后期约降三成。
     * 二次项保留（后期仍然指数感），只是把斜率压下来 —— 成长曲线一改，
     * simulate.js 会重跑一遍「能不能打到第 20 波」的判定。 */
    var hpMul = 1 + 0.30 * (n - 1) + 0.014 * (n - 1) * (n - 1);
    var rewardMul = 1 + 0.10 * (n - 1);
    var isBoss = (n % 5 === 0);
    var base = 4 + Math.floor(n * 1.15);
    var events = [];

    var pool = ['drifter'];
    if (n >= 2) pool.push('sprinter');
    if (n >= 4) pool.push('bulwark');
    if (n >= 6) pool.push('sunder');
    if (n >= 8) pool.push('phaser');

    var mainType = pool[(n - 1) % pool.length];
    var subType = pool[(n * 2 + 1) % pool.length];

    if (isBoss) {
      events.push({ type: 'boss', time: 1.6, spawn: n % 2, hpMul: hpMul * 0.88 });
      base = Math.max(4, Math.round(base * 0.55));
    }

    var c1 = Math.ceil(base * 0.62);
    var c2 = base - c1;
    var i;
    for (i = 0; i < c1; i++) {
      events.push({ type: mainType, time: 0.4 + i * 0.72, spawn: i % 2, hpMul: hpMul });
    }
    for (i = 0; i < c2; i++) {
      events.push({ type: subType, time: 3.6 + i * 0.58, spawn: 0, hpMul: hpMul });
    }

    // 破墙者小队：专门拆龟缩阵，但只在部分波次出现，避免跨波次累积
    if (n >= 6 && n % 3 === 0) {
      var sn = 1 + Math.floor(n / 10);
      for (i = 0; i < sn; i++) {
        events.push({ type: 'sunder', time: 6 + i * 1.1, spawn: 1, hpMul: hpMul * 0.85 });
      }
    }

    events.sort(function (a, b) { return a.time - b.time; });

    var title = isBoss ? '共鸣吞噬者' : NAMES[mainType];
    return {
      index: n,
      events: events,
      hpMul: hpMul,
      rewardMul: rewardMul,
      isBoss: isBoss,
      total: events.length,
      name: title
    };
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
