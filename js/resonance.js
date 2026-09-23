/**
 * resonance.js —— 元素反应系统
 *
 * 规则：
 *   1) 相邻（上下左右）两座同元素塔 → 形成「共振链」，链越长，全链塔伤害与攻速越高。
 *   2) 相邻两座异元素塔 → 在交界处生成一个「反应节点」，周期性自动触发（七元素 20 对，草+冰不反应）：
 *        蒸发(火+水) / 融化(火+冰) → 高伤爆发
 *        超载(火+雷) → 爆炸 + 电弧跳射
 *        感电(水+雷) → 连锁闪电在怪群间跳跃
 *        超导(冰+雷) → 减速 + 易伤
 *        冻结(水+冰) → 范围定身
 *        扩散(风+X)  → 小伤害 + 大幅击退
 *        结晶(岩+X)  → 邻塔护盾，免疫啃咬
 *        绽放(草+水) / 激化(草+雷) / 燃烧(草+火)
 *   3) Boss「共鸣吞噬者」靠近时会压制周围的塔，使其临时脱离反应网络。
 *
 * 也就是说：摆位本身就是一套需要取舍的解题过程——想拉满伤害要同元素抱团，
 * 想吃到反应又必须让异元素贴边。
 *
 * 两条贯穿全表的设定（它们是「高护甲怪怎么打」的答案，改之前先想清楚）：
 *   · **反应伤害无视护甲**（damageEnemy 的 pierce 选项）。塔的单发伤害要先
 *     减 armor、最低压到 1 点，所以纯靠塔打高甲怪会很惨；反应是穿透的。
 *   · **击退是分帧走完的位移**（Enemies.push），不是瞬移。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, U = G.Util;

  var RES = G.Resonance = {
    links: [],
    nodes: [],
    nodeIndex: {},
    rebuildTimer: 0
  };

  /** 反应伤害：一律无视护甲，并在怪身上挂一枚反应名标签 */
  function reactHit(e, dmg, def) {
    G.Game.damageEnemy(e, dmg, def.color, { pierce: true });
    if (G.Game.tagReact) G.Game.tagReact(e, def.name, def.color);
  }

  function overloadHit(e, dmg, name, color) {
    G.Game.damageEnemy(e, dmg, color, { pierce: true });
    if (G.Game.tagReact) G.Game.tagReact(e, name, color);
  }

  function nearestAlive(list, x, y, radius, used) {
    var found = null, best = radius * radius;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.alive || (used && used[e.uid])) continue;
      var d2 = U.dist2(e.x, e.y, x, y);
      if (d2 <= best) { best = d2; found = e; }
    }
    return found;
  }

  function triggerPyroOverload(game, target, def) {
    var spec = CFG.RES.overload.pyro, list = game.enemies, used = {};
    var x = target.x, y = target.y;
    G.FX.flameBurst(x, y, def.color, 1.25);
    G.FX.flash(x, y, 38, '#fff3c4', 0.16);
    for (var i = 0; i <= spec.jumps; i++) {
      var e = nearestAlive(list, x, y, spec.radius, used);
      if (!e) break;
      used[e.uid] = 1;
      if (i > 0) {
        G.FX.bolt(x, y, e.x, e.y, def.color, 0.24);
        G.FX.flash(e.x, e.y, 34, def.color, 0.18);
      }
      overloadHit(e, spec.dmg, spec.name, def.color);
      e.burnT = Math.max(e.burnT || 0, spec.burnT);
      e.burnDps = Math.max(e.burnDps || 0, spec.burnDps);
      x = e.x; y = e.y;
    }
  }

  function triggerElectroOverload(game, target, def) {
    var spec = CFG.RES.overload.electro, towers = game.towers, used = {};
    var fired = 0;
    for (var i = 0; i < towers.length && fired < spec.maxBolts; i++) {
      var t = towers[i];
      if (t.elem !== 'electro' || t.suppressed) continue;
      var victim = nearestAlive(game.enemies, t.x, t.y, CFG.TOWERS.electro.range, used);
      if (!victim) continue;
      used[victim.uid] = 1;
      G.FX.bolt(t.x, t.y, victim.x, victim.y, def.color, 0.28);
      G.FX.spark(victim.x, victim.y, 0, Math.PI * 2, 5, def.color, 170, 0.3);
      overloadHit(victim, spec.dmg, spec.name, def.color);
      fired++;
    }
    if (!fired) {
      G.FX.flash(target.x, target.y, 42, def.color, 0.22);
      overloadHit(target, spec.dmg, spec.name, def.color);
    }
  }

  function triggerAnemoOverload(game, target, def) {
    var spec = CFG.RES.overload.anemo, list = game.enemies;
    G.FX.vortex(target.x, target.y, spec.radius, def.color);
    G.FX.spark(target.x, target.y, 0, Math.PI * 2, 10, '#e9fff8', 110, 0.46);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.alive || U.dist(e.x, e.y, target.x, target.y) > spec.radius + e.r) continue;
      if (G.Enemies.pull) G.Enemies.pull(e, target.x, target.y, spec.pull);
      overloadHit(e, spec.dmg, spec.name, def.color);
    }
  }

  RES.addOverload = function (game, node, target) {
    var st = game.overload, spec = CFG.RES.overload;
    var elem = node && node.def && node.def.overloadElem;
    if (!st || !target || !target.alive || !elem || !spec[elem] || st.cooldown > 0) return false;
    st.value = Math.min(spec.threshold, st.value + spec.charge);
    st.lastElem = elem;
    if (st.value < spec.threshold) return false;
    st.value = 0;
    st.elem = elem;
    st.cooldown = spec.cooldown;
    st.flash = spec.flash;
    game.shake = Math.max(game.shake, 8);
    if (G.Audio) G.Audio.reaction('overload');
    if (elem === 'pyro') triggerPyroOverload(game, target, node.def);
    else if (elem === 'electro') triggerElectroOverload(game, target, node.def);
    else if (elem === 'anemo') triggerAnemoOverload(game, target, node.def);
    return true;
  };

  RES.reset = function () {
    RES.links = [];
    RES.nodes = [];
    RES.nodeIndex = {};
    RES.rebuildTimer = 0;
  };

  RES.rebuild = function (game) {
    var towers = game.towers;
    var i, j, t;
    var byUid = {};

    for (i = 0; i < towers.length; i++) {
      t = towers[i];
      t.dmgMul = 1; t.rateMul = 1; t.clusterSize = 1; t.suppressed = false;
      byUid[t.uid] = t;
    }

    // --- Boss 压制 ---
    var boss = null;
    for (i = 0; i < game.enemies.length; i++) {
      if (game.enemies[i].key === 'boss') { boss = game.enemies[i]; break; }
    }
    if (boss) {
      var br = CFG.ENEMIES.boss.suppress;
      for (i = 0; i < towers.length; i++) {
        if (U.dist(towers[i].x, towers[i].y, boss.x, boss.y) <= br) towers[i].suppressed = true;
      }
    }

    // --- 邻接扫描 ---
    var occ = {};
    for (i = 0; i < towers.length; i++) occ[towers[i].col + ',' + towers[i].row] = towers[i];

    var sameEdges = [];
    var nodeMap = {};
    var DIRS = [[1, 0], [0, 1]];
    for (i = 0; i < towers.length; i++) {
      t = towers[i];
      if (t.suppressed) continue;
      for (j = 0; j < 2; j++) {
        var n = occ[(t.col + DIRS[j][0]) + ',' + (t.row + DIRS[j][1])];
        if (!n || n.suppressed) continue;
        if (t.elem === n.elem) {
          sameEdges.push({ a: t, b: n, elem: t.elem });
        } else {
          var k1 = Math.min(t.uid, n.uid) + '-' + Math.max(t.uid, n.uid);
          nodeMap[k1] = [t, n];
        }
      }
    }

    // --- 同元素连通簇 ---
    var adjMap = {};
    for (i = 0; i < sameEdges.length; i++) {
      var ua = sameEdges[i].a.uid, ub = sameEdges[i].b.uid;
      (adjMap[ua] = adjMap[ua] || []).push(ub);
      (adjMap[ub] = adjMap[ub] || []).push(ua);
    }
    var seen = {};
    for (i = 0; i < towers.length; i++) {
      t = towers[i];
      if (seen[t.uid] || t.suppressed) continue;
      var stack = [t], grp = [];
      seen[t.uid] = 1;
      while (stack.length) {
        var cur = stack.pop();
        grp.push(cur);
        var nb = adjMap[cur.uid];
        if (!nb) continue;
        for (j = 0; j < nb.length; j++) {
          if (seen[nb[j]]) continue;
          seen[nb[j]] = 1;
          if (byUid[nb[j]]) stack.push(byUid[nb[j]]);
        }
      }
      var size = Math.min(grp.length, CFG.RES.chainCap);
      for (j = 0; j < grp.length; j++) {
        grp[j].clusterSize = size;
        grp[j].dmgMul = 1 + CFG.RES.chainDmg * (size - 1);
        grp[j].rateMul = 1 + CFG.RES.chainRate * (size - 1);
      }
    }

    // --- 反应节点（保留原有冷却，避免反复重建导致冷却重置） ---
    var oldIndex = RES.nodeIndex;
    var nodes = [];
    for (var key in nodeMap) {
      if (!Object.prototype.hasOwnProperty.call(nodeMap, key)) continue;
      var pair = nodeMap[key];
      var e1 = pair[0].elem, e2 = pair[1].elem;
      var kk = (e1 < e2 ? e1 + '|' + e2 : e2 + '|' + e1);
      var def = CFG.RES.reactions[kk];
      if (!def) continue;
      var old = oldIndex[key];
      nodes.push({
        id: key, a: pair[0], b: pair[1], def: def,
        x: (pair[0].x + pair[1].x) / 2,
        y: (pair[0].y + pair[1].y) / 2,
        cd: old ? old.cd : def.cd * 0.3,
        flash: 0,
        lastTargetUid: old ? old.lastTargetUid : null
      });
    }
    RES.nodeIndex = {};
    for (i = 0; i < nodes.length; i++) RES.nodeIndex[nodes[i].id] = nodes[i];
    RES.nodes = nodes;
    RES.links = sameEdges;
  };

  /* ------------------------------------------------------------------ */

  function trigger(game, node) {
    var def = node.def;
    var list = game.enemies;
    var i, e, d;
    /* 交界节点只负责“发现”反应；真正的受力与特效锚在最近的怪物。
     * 这样玩家看到的是怪被蒸汽、冰晶或旋风击中，而不是炮台自己爆炸。 */
    var target = null, nearest = Infinity;
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (!e.alive) continue;
      d = U.dist(e.x, e.y, node.x, node.y);
      if (d <= def.radius + e.r && d < nearest) { target = e; nearest = d; }
    }
    node.flash = 0.35;
    if (G.Audio) G.Audio.reaction(def.kind);
    if (!target) {
      node.lastTargetUid = null;
      return;
    }
    node.lastTargetUid = target.uid;
    RES.addOverload(game, node, target);
    var ix = target.x, iy = target.y;
    G.FX.pop(ix, iy - target.r - 20, def.name, def.color, 15);

    if (def.kind === 'burst') {
      // 蒸发 / 融化：白热冲击波 + 外扩蒸汽，全表最高的单发反应伤害
      G.FX.plume(ix, iy, def.color, 1.15);
      G.FX.ember(ix, iy, 8, def.color);
      G.FX.flash(ix, iy, 40, '#fff6dc', 0.18);
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        if (U.dist(e.x, e.y, ix, iy) > def.radius + e.r) continue;
        reactHit(e, def.dmg, def);
        // 沿行进反方向推回去（分帧走完的位移，见 Enemies.push）
        G.Enemies.push(e, e.fx, e.fy, def.push);
        G.FX.spark(e.x, e.y, Math.atan2(e.fy, e.fx), 0.9, 3, def.color, 150, 0.26);
      }
      G.FX.burst(ix, iy, 12, def.color, 140);
      G.FX.shard(ix, iy, 5, '#ffe0a8', 120);

    } else if (def.kind === 'super') {
      // 超导：冰晶沿六个方向炸开 + 冷雾，命中目标进入易伤
      G.FX.ice(ix, iy, def.radius * 0.9, def.color);
      G.FX.shard(ix, iy, 11, '#d8f6ff', 135);
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        if (U.dist(e.x, e.y, ix, iy) > def.radius + e.r) continue;
        reactHit(e, def.dmg, def);
        e.slowAmt = Math.max(e.slowAmt, 0.35);
        e.slowT = Math.max(e.slowT, 1.4);
        e.superT = Math.max(e.superT, def.dur);
        G.FX.ice(e.x, e.y, e.r + 12, def.color);
      }
      G.FX.burst(ix, iy, 8, '#d8f6ff', 100);

    } else if (def.kind === 'overload') {
      // 超载：中心爆 + 分叉电弧跳向最近目标
      G.FX.flameBurst(ix, iy, def.color, 0.65);
      G.FX.flash(ix, iy, 46, def.color, 0.24);
      var hits = [];
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        d = U.dist(e.x, e.y, ix, iy);
        if (d > def.radius + e.r) continue;
        hits.push({ e: e, d: d });
      }
      hits.sort(function (p, q) { return p.d - q.d; });
      var n = Math.min(hits.length, def.jumps);
      for (i = 0; i < n; i++) {
        G.FX.bolt(ix, iy, hits[i].e.x, hits[i].e.y, def.color, 0.26);
        reactHit(hits[i].e, def.dmg, def);
        G.FX.spark(hits[i].e.x, hits[i].e.y, 0, Math.PI, 4, def.color, 140, 0.24);
      }
      if (n === 0) G.FX.spark(ix, iy, 0, Math.PI * 2, 7, def.color, 150, 0.28);
      G.FX.spark(ix, iy, 0, Math.PI * 2, 6, '#ffd7f2', 190, 0.3);

    } else if (def.kind === 'echain') {
      // 感电：连锁闪电在怪群之间连续跳跃（比超载跳得更远更多）
      var cured = ix, cyed = iy;
      var used = {};
      for (i = 0; i < def.jumps; i++) {
        var nx = null, nd = def.radius * def.radius;
        for (var j2 = 0; j2 < list.length; j2++) {
          e = list[j2];
          if (!e.alive || used[e.uid]) continue;
          var dd = U.dist2(e.x, e.y, cured, cyed);
          if (dd < nd) { nd = dd; nx = e; }
        }
        if (!nx) break;
        used[nx.uid] = 1;
        G.FX.bolt(cured, cyed, nx.x, nx.y, def.color, 0.22);
        reactHit(nx, def.dmg, def);
        G.FX.spark(nx.x, nx.y, 0, Math.PI * 2, 3, def.color, 120, 0.22);
        cured = nx.x; cyed = nx.y;
      }
      G.FX.flash(ix, iy, 30, def.color, 0.18);

    } else if (def.kind === 'freeze') {
      // 冻结：范围内敌人定身，冻成冰雕
      G.FX.ice(ix, iy, def.radius, def.color);
      G.FX.shard(ix, iy, 9, '#d0f4ff', 115);
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        if (U.dist(e.x, e.y, ix, iy) > def.radius + e.r) continue;
        reactHit(e, def.dmg, def);
        e.stunT = Math.max(e.stunT, def.dur);
        G.FX.ice(e.x, e.y, e.r + 14, '#d0f4ff');
      }

    } else if (def.kind === 'swirl') {
      // 扩散：风把接触到的元素和怪群卷进反应中心，小伤害 + 聚怪。
      G.FX.vortex(ix, iy, Math.min(78, def.radius * 0.78), def.color);
      G.FX.burst(ix, iy, 10, def.color, 150);
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        if (U.dist(e.x, e.y, ix, iy) > def.radius + e.r) continue;
        reactHit(e, def.dmg, def);
        G.Enemies.pull(e, ix, iy, def.pull);
        G.FX.spark(e.x, e.y, Math.atan2(iy - e.y, ix - e.x), 0.8, 2, def.color, 130, 0.24);
      }

    } else if (def.kind === 'crystal') {
      // 结晶：邻塔获得岩晶护盾，护盾期间免疫啃咬伤害
      G.FX.shard(ix, iy, 8, '#ffe0a8', 140);
      G.FX.ice(ix, iy, Math.min(72, def.radius * 0.7), '#fabb57');
      var tws = game.towers;
      for (i = 0; i < tws.length; i++) {
        var tw = tws[i];
        if (U.dist(tw.x, tw.y, node.x, node.y) > def.radius) continue;
        tw.shieldT = Math.max(tw.shieldT || 0, def.dur);
        G.FX.spark(tw.x, tw.y, 0, Math.PI * 2, 4, '#ffe0a8', 100, 0.3);
      }

    } else if (def.kind === 'bloom') {
      // 绽放：草原核炸开，范围二段伤害
      G.FX.burst(ix, iy, 14, '#b8f04c', 150);
      G.FX.shard(ix, iy, 10, '#dcff96', 125);
      G.FX.spark(ix, iy, 0, Math.PI * 2, 6, '#f5ffd0', 140, 0.32);
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        if (U.dist(e.x, e.y, ix, iy) > def.radius + e.r) continue;
        reactHit(e, def.dmg, def);
        e.burnT = Math.max(e.burnT || 0, 1.6);
        e.burnDps = Math.max(e.burnDps || 0, 10);
      }

    } else if (def.kind === 'quicken') {
      // 激化：范围内己方塔伤害临时提升
      G.FX.spark(ix, iy, 0, Math.PI * 2, 12, def.color, 155, 0.34);
      var tws2 = game.towers;
      for (i = 0; i < tws2.length; i++) {
        var tw2 = tws2[i];
        if (U.dist(tw2.x, tw2.y, node.x, node.y) > def.radius) continue;
        tw2.quickT = Math.max(tw2.quickT || 0, def.dur);
        G.FX.bolt(node.x, node.y, tw2.x, tw2.y, def.color, 0.2);
      }
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        if (U.dist(e.x, e.y, ix, iy) > def.radius * 0.6 + e.r) continue;
        reactHit(e, def.dmg, def);
      }

    } else if (def.kind === 'burn') {
      // 燃烧：范围内敌人点燃，持续掉血
      G.FX.ember(ix, iy, 10, def.color);
      G.FX.plume(ix, iy, def.color, 0.6);
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        if (U.dist(e.x, e.y, ix, iy) > def.radius + e.r) continue;
        e.burnT = Math.max(e.burnT || 0, def.dur);
        e.burnDps = Math.max(e.burnDps || 0, def.dps);
        // 燃烧本体没伤害（掉血在 enemies.js 每帧结算），但反应名照样要挂上去
        if (G.Game.tagReact) G.Game.tagReact(e, def.name, def.color);
        G.FX.spark(e.x, e.y, 0, Math.PI * 2, 2, def.color, 80, 0.32);
      }
    }
  }

  RES.update = function (game, dt) {
    RES.rebuildTimer -= dt;
    if (RES.rebuildTimer <= 0) {
      RES.rebuildTimer = 0.22;
      RES.rebuild(game);
    }
    var nodes = RES.nodes;
    for (var i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      if (nd.flash > 0) nd.flash -= dt;
      nd.cd -= dt;
      if (nd.cd <= 0) {
        nd.cd = nd.def.cd;
        trigger(game, nd);
      }
    }
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
