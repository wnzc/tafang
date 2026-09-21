/**
 * waves.js —— 波次编排
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG;

  var NAMES = {
    drifter: '游荡体', sprinter: '疾行体', bulwark: '装甲体', sunder: '破墙者',
    phaser: '相位体', boss: '共鸣吞噬者',
    swarmling: '群涌体', wraith: '虚影体', titan: '巨岩体', tinker: '机巧体', mender: '织愈体'
  };

  /* 所有怪按波次解锁门槛（roguelike 化后新怪也走这套门槛）。
   * 早期就放 swarmling（第 3 波）制造「成群涌来」的观感；titan/mender 靠后。 */
  var UNLOCK = {
    drifter: 1, sprinter: 2, swarmling: 3, bulwark: 4, wraith: 5,
    sunder: 6, titan: 7, phaser: 8, tinker: 9, mender: 10
  };

  /* 肉盾类怪作为「主体怪」时的数量折扣。
   * 起因：某个种子第 19 波抽到巨岩体当主体，138 只里约 86 只是巨岩体
   * （每只 300 基础血 × 8.6 倍血、还带护甲），20 秒一波内根本清不掉 ——
   * 直接推平核心。那不是「难」，是组合本身无解。肉盾的正确形态是
   * 「少量硬点 + 大量杂兵」，所以主体是肉盾时按折扣减量，
   * 差额自动落到副怪身上 —— **总怪量不变**，割草的密度感一点不丢。 */
  var HEAVY_K = { titan: 0.42, bulwark: 0.70 };

  /* 确定性伪随机：同一 (seed, n) 永远得到同一串数，保证「种子决定本局」。 */
  function rngFrom(seed, n) {
    var s = ((seed >>> 0) ^ Math.imul(n, 0x9E3779B1)) >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 从候选里不重复抽 k 条 */
  function pickSome(arr, k, rnd) {
    var pool = arr.slice();
    var out = [];
    while (out.length < k && pool.length) {
      var idx = Math.floor(rnd() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  var W = G.Waves = {};

  W.plan = function (n, seed, deep) {
    /* seed 来自 main.startRun 给本局生成的随机种子；同一 (seed,n) 出同一波，
     * 这就是「roguelike：每局/每波不一样，但可复现」。无 seed 时退化为确定性。
     * deep 为真时套用深渊档（血量 ×CFG.DEEP.hpMul、收益略增）；不传＝常规档。 */
    var rnd = rngFrom(seed || 1, n);

    /* 血量成长曲线：怪量已经拉满（爽游怪海），难度就压在血线上。
     * 这版**没有动斜率** —— 0.245/0.0099（n=20 约 9.23 倍）是上一个迭代验收过的甜区，
     * 成长系统这轮只修了三处缺陷、没有调难度：
     *   ① 巨岩体 armor 6 → 4（比 Boss 还高，等于废掉平砍）；
     *   ② 肉盾作为主体时减量（HEAVY_K，修「一整面肉盾墙」的无解组合）；
     *   ③ 突变池顺序按烈度重排（原来起始池里三条都是硬货，与注释的意图相反）。
     * 供参考的其它档位实测：0.26/0.011（n=20 约 9.91 倍）太狠 —— 第 19 波
     * 「巨岩体 + 疾风 + 蚀影」会漏掉 14 只、核心 100→16，第 20 波 Boss 收尾即崩；
     * 0.22/0.008（约 8.07 倍）太松，理想 AI 满血通关。 */
    var hpMul = 1 + 0.245 * (n - 1) + 0.0099 * (n - 1) * (n - 1);
    var rewardMul = 1 + 0.10 * (n - 1);
    /* 深渊档：在常规血线之上再乘一层，收益略增作补偿。
     * deep 由 main.startWave 传进来（＝存档里开了深渊）；不开时为假，
     * 两条乘法都不执行 —— 常规路径一个数都不变。 */
    if (deep) {
      hpMul *= CFG.DEEP.hpMul;
      rewardMul *= CFG.DEEP.rewardMul;
    }
    var isBoss = (n % 5 === 0);

    /* —— 地脉突变：每波随机抽 1~2 条，套到本波敌人 ——
     * 突变数值已在 config.js 的 CFG.MUTATIONS 定义，这里只负责抽 + 汇总。 */
    var mutCount = 1 + (rnd() < 0.3 ? 1 : 0);
    /* 突变池按「地脉谱系」的解锁档位取子集：开局只有前 4 条（随机性可控），
     * 解锁后逐步放到 8 条。注意 pickSome 每抽一条只消耗一次 rnd()，
     * 与池子大小无关 —— 所以换池子不会打乱后面的随机序列，
     * 同一 (seed, n) 的敌群组合仍然稳定可复现。 */
    var mutPool = (G.Profile && G.Profile.mutPool) ? G.Profile.mutPool() : CFG.MUTATIONS;
    var muts = pickSome(mutPool, mutCount, rnd);
    var mut = { speedMul: 1, armorAdd: 0, hpMul: 1, dmgMul: 1, spawnMul: 1, regen: 0, rewardMul: 1, list: muts };
    for (var mi = 0; mi < muts.length; mi++) {
      var m = muts[mi];
      if (m.speedMul) mut.speedMul *= m.speedMul;
      if (m.armorAdd) mut.armorAdd += m.armorAdd;
      if (m.hpMul) mut.hpMul *= m.hpMul;
      if (m.dmgMul) mut.dmgMul *= m.dmgMul;
      if (m.spawnMul) mut.spawnMul *= m.spawnMul;
      if (m.regen) mut.regen += m.regen;
      if (m.rewardMul) mut.rewardMul *= m.rewardMul;
    }
    /* 双抽温和化：两条倍率**相乘**会爆表 ——「巨力 1.35 × 血怒 1.22」= 1.65 倍血，
     * 再乘后期血线（第 19 波 8.6 倍）就是 14 倍，表现是「前 18 波满血、第 19 波突然
     * 打不动、一波漏 12 只直接崩盘」的断崖。双抽时把倍率往 1 收一拳（保留「两条一起上」
     * 的差异感，但不让它变成断崖），护甲按加法同比例收敛，收益下降也一并收敛。 */
    if (muts.length > 1) {
      mut.speedMul = 1 + (mut.speedMul - 1) * 0.65;
      mut.hpMul = 1 + (mut.hpMul - 1) * 0.65;
      mut.dmgMul = 1 + (mut.dmgMul - 1) * 0.65;
      mut.spawnMul = 1 + (mut.spawnMul - 1) * 0.65;
      mut.rewardMul = 1 + (mut.rewardMul - 1) * 0.65;
      mut.armorAdd = mut.armorAdd * 0.65;
    }

    /* 本波可用敌池（按门槛解锁）；主/副类型随机抽，组合随波变化 */
    var pool = [];
    for (var k in UNLOCK) { if (UNLOCK[k] <= n) pool.push(k); }
    var mainType = pool[Math.floor(rnd() * pool.length)];
    var subType = pool[Math.floor(rnd() * pool.length)];
    /* 主副怪不能同型：一波里交替出现轻怪与肉盾/快怪，玩家才能读到组合关系，
     * 而不是清完一整批游荡体才突然换装甲体。 */
    if (pool.length > 1) {
      while (subType === mainType) subType = pool[Math.floor(rnd() * pool.length)];
    }

    /* —— 爽游密度：怪量整体翻倍有余，间隔减半让同屏成团 —— */
    var base = Math.round((16 + Math.floor(n * 2.8)) * mut.spawnMul);
    var events = [];

    if (isBoss) {
      events.push({ type: 'boss', time: 1.6, spawn: n % 2, hpMul: hpMul * 0.88 * mut.hpMul });
      // boss 波也带一群杂兵一起上（缩水从 0.5 放宽到 0.62，更热闹）
      base = Math.max(4, Math.round(base * 0.62));
    }

    /* 主体是肉盾时减量（差额给副怪），避免「一整面肉盾墙」的无解组合 */
    var heavyK = HEAVY_K[mainType] || 1;
    var c1 = Math.ceil(base * 0.62 * heavyK);
    var c2 = base - c1;
    var i;
    /* 主/副怪按对交错：每 0.34 秒一组，组内错开 0.17 秒。
     * 保持旧版怪海的密度与总量，但让两种行为在同一屏上互动。 */
    var pairs = Math.max(c1, c2);
    for (i = 0; i < pairs; i++) {
      if (i < c1) events.push({ type: mainType, time: 0.3 + i * 0.34, spawn: i % 2, hpMul: hpMul * mut.hpMul });
      if (i < c2) events.push({ type: subType, time: 0.47 + i * 0.34, spawn: (i + 1) % 2, hpMul: hpMul * mut.hpMul });
    }

    // 破墙者小队：专门拆龟缩阵，但只在部分波次出现，避免跨波次累积
    if (n >= 6 && n % 3 === 0) {
      var sn = 1 + Math.floor(n / 10);
      for (i = 0; i < sn; i++) {
        events.push({ type: 'sunder', time: 6 + i * 1.1, spawn: 1, hpMul: hpMul * 0.85 * mut.hpMul });
      }
    }

    // 群涌体成群：制造「割草」主视觉。n>=3 解锁后每波成团压上，
    // 脆小怪靠数量吃饭，配合 AOE 塔形成清屏快感。
    if (n >= 3) {
      var swGroups = 3 + Math.floor(n / 3); // 第 20 波约 10 组
      for (var gi = 0; gi < swGroups; gi++) {
        var swPer = 5 + Math.floor(rnd() * 5); // 每组 5~9 只，成团压上
        for (var si = 0; si < swPer; si++) {
          events.push({
            type: 'swarmling',
            time: 1.2 + gi * 1.4 + si * 0.12,
            spawn: (gi + si) % 2,
            hpMul: hpMul * 0.9 * mut.hpMul
          });
        }
      }
    }

    events.sort(function (a, b) { return a.time - b.time; });

    var mutName = muts.length ? muts[0].name + (muts[1] ? ' + ' + muts[1].name : '') : '';
    return {
      index: n,
      events: events,
      hpMul: hpMul * mut.hpMul,
      rewardMul: rewardMul * mut.rewardMul,
      isBoss: isBoss,
      total: events.length,
      /* HUD 横幅只承载状态，不塞怪名与突变名；详细突变仍由 Toast 给出。 */
      name: isBoss ? '首领来袭' : '敌群来袭',
      label: isBoss ? '首领来袭' : '敌群来袭',
      primary: mainType,
      secondary: subType,
      mut: mut,
      mutName: mutName,
      seed: seed || 1
    };
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
