/**
 * towers.js —— 防御塔：建造、索敌、开火、弹道
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, U = G.Util;

  var uidSeq = 1;
  var T = G.Towers = {};

  T.create = function (key, col, row) {
    var d = CFG.TOWERS[key];
    var t = {
      uid: uidSeq++,
      key: key,
      def: d,
      elem: d.elem,
      col: col,
      row: row,
      x: G.Grid.cellCX(col),
      y: G.Grid.cellCY(row),
      level: 1,
      maxHp: d.hp,
      hp: d.hp,
      cool: U.rand(0, 0.3),
      angle: -Math.PI / 2,
      recoil: 0,
      dmgMul: 1,
      rateMul: 1,
      clusterSize: 1,
      suppressed: false,
      hitFlash: 0,
      flash: 0,
      spent: d.cost
    };
    return t;
  };

  T.stats = function (t) {
    var d = t.def, lv = t.level - 1;
    var dmg = d.dmg * (1 + CFG.LV.dmg * lv) * t.dmgMul;
    var range = d.range * (1 + CFG.LV.range * lv);
    var rate = d.rate * (1 + CFG.LV.rate * lv) * t.rateMul;
    if (t.quickT > 0) dmg *= 1.3;              // 激化：草+雷反应的临时增益
    if (t.suppressed) { dmg *= 0.85; rate *= 0.85; }
    return { dmg: dmg, range: range, rate: rate };
  };

  T.upgradeCost = function (t) {
    return Math.round(t.def.cost * CFG.UP_COST * t.level);
  };
  /** 当前可执行操作的花费（升级 / 维修） */
  T.actionCost = function (t) {
    if (t.level >= CFG.MAX_LEVEL) return Math.round(t.def.cost * 0.5);
    return T.upgradeCost(t);
  };
  T.actionLabel = function (t) {
    var damaged = t.hp < t.maxHp - 0.5;
    if (t.level >= CFG.MAX_LEVEL) return damaged ? '维修' : '已满级';
    return damaged ? '整备' : '升级';
  };
  T.sellValue = function (t) {
    return Math.round(t.spent * CFG.SELL_RATIO);
  };
  T.maxHp = function (t) {
    return t.def.hp * (1 + CFG.LV.hp * (t.level - 1));
  };

  function pickTarget(game, t, range) {
    var arr = game.enemies;
    var best = null, bestV = 1e12, bestD = 1e12;
    var r2 = range * range;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e.alive || e.spawnT > 0) continue;
      var d2 = U.dist2(e.x, e.y, t.x, t.y);
      if (d2 > r2) continue;
      var c = U.clamp(Math.floor((e.x - CFG.BX) / CFG.CELL), 0, CFG.COLS - 1);
      var r = U.clamp(Math.floor((e.y - G.LAY.boardY) / CFG.CELL), 0, CFG.ROWS - 1);
      var v = G.Grid.at(G.Grid.flow, c, r);
      if (v < 0) v = 9000 + d2 * 1e-6;
      if (v < bestV || (v === bestV && d2 < bestD)) { bestV = v; best = e; bestD = d2; }
    }
    return best;
  }

  function shoot(game, t, st, target) {
    var d = t.def;
    var ang = Math.atan2(target.y - t.y, target.x - t.x);
    t.angle = ang;
    t.flash = 0.12;
    t.recoil = 1;

    var col = CFG.ELEM[t.elem].color;
    // 炮口对齐渲染里的管口圆心（x=29）。这里用未后坐的位置：
    // 后坐是开火之后才发生的，闪光该出现在管子全长伸展的位置
    var mx = t.x + Math.cos(ang) * 29;
    var my = t.y + Math.sin(ang) * 29;
    G.FX.muzzle(mx, my, ang, CFG.VIS.muzzleLen, col);
    if (G.Audio) G.Audio.shoot(t.elem);

    if (d.kind === 'bolt') {
      var b = {
        x: mx, y: my, px: mx, py: my, target: target, dmg: st.dmg,
        speed: d.bspeed, life: d.blife, elem: t.elem, r: 4.2,
        color: CFG.ELEM[t.elem].soft
      };
      game.bullets.push(b);
      G.FX.spark(mx, my, ang, 0.4, 3, col, 130, 0.18);

    } else if (d.kind === 'wave') {
      var x = target.x, y = target.y;
      // 一道冷光从管口连到落点，再炸开水花/冰晶
      G.FX.beam(mx, my, x, y, col, 0.16, 3);
      G.FX.ring(x, y, 8, d.aoe, col, 0.42, 3);
      if (t.elem === 'cryo') G.FX.ice(x, y, d.aoe * 0.85, col);
      else G.FX.ember(x, y, 4, col);
      applyAoE(game, x, y, d.aoe, st.dmg, function (e) {
        e.slowAmt = Math.max(e.slowAmt, d.slow);
        e.slowT = Math.max(e.slowT, d.slowT);
        // 冰元素的波有概率冻结（原神冻结的塔防化简版）
        if (d.freezeChance && U.rand(0, 1) < d.freezeChance) {
          e.stunT = Math.max(e.stunT, d.freezeT);
          G.FX.ice(e.x, e.y, e.r + 10, col);
        }
      });

    } else if (d.kind === 'chain') {
      var hitUids = {};
      var cur = target;
      var n = d.chain;
      var from = { x: mx, y: my };
      for (var i = 0; i < n; i++) {
        if (!cur) break;
        hitUids[cur.uid] = 1;
        if (i === 0) G.FX.bolt(from.x, from.y, cur.x, cur.y, col, 0.24);
        else G.FX.arc(from.x, from.y, cur.x, cur.y, col, 0.18, 3);
        G.Game.damageEnemy(cur, st.dmg, col);
        from = { x: cur.x, y: cur.y };
        cur = nextChainTarget(game, from, d.chainRange, hitUids);
      }

    } else if (d.kind === 'gust') {
      // 流风：龙卷扫过，范围伤害 + 沿行进反方向推开
      G.FX.ring(mx, my, 10, d.aoe, col, 0.4, 3);
      G.FX.burst(target.x, target.y, 8, col, 120);
      applyAoE(game, target.x, target.y, d.aoe, st.dmg, function (e) {
        e.x -= e.fx * d.push;
        e.y -= e.fy * d.push;
        G.FX.spark(e.x, e.y, Math.atan2(e.fy, e.fx), 0.7, 2, col, 120, 0.22);
      });

    } else if (d.kind === 'spike') {
      // 磐岩：重击单体，高伤害 + 短定身（岩晶破地而出）
      G.FX.shock(target.x, target.y, 34, col, 0.3, 3);
      G.FX.shard(target.x, target.y, 6, col, 130);
      G.Game.damageEnemy(target, st.dmg, col);
      target.stunT = Math.max(target.stunT, d.stun);

    } else if (d.kind === 'spore') {
      // 青蔓：落孢毒域，范围内敌人持续掉血（燃烧/绽放的前置状态）
      G.FX.ring(target.x, target.y, 8, d.aoe, col, 0.42, 3);
      G.FX.ember(target.x, target.y, 5, col);
      applyAoE(game, target.x, target.y, d.aoe, st.dmg, function (e) {
        e.burnT = Math.max(e.burnT || 0, d.burnT);
        e.burnDps = Math.max(e.burnDps || 0, d.burnDps);
        G.FX.spark(e.x, e.y, 0, Math.PI * 2, 2, col, 90, 0.3);
      });
    }
  }

  function applyAoE(game, x, y, radius, dmg, cb) {
    var arr = game.enemies;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e.alive) continue;
      if (U.dist(e.x, e.y, x, y) > radius + e.r) continue;
      G.Game.damageEnemy(e, dmg, null);
      if (cb) cb(e);
    }
  }

  function nextChainTarget(game, from, range, hitUids) {
    var arr = game.enemies, best = null, bd = range * range;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e.alive || hitUids[e.uid]) continue;
      var d2 = U.dist2(e.x, e.y, from.x, from.y);
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  T.update = function (game, dt) {
    var arr = game.towers;
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i];
      if (t.hitFlash > 0) t.hitFlash -= dt;
      if (t.flash > 0) t.flash -= dt;
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 7.5);
      if (t.shieldT > 0) t.shieldT -= dt;   // 结晶护盾倒计时
      if (t.quickT > 0) t.quickT -= dt;     // 激化增益倒计时
      t.cool -= dt;
      if (t.cool > 0) continue;
      var st = T.stats(t);
      var target = pickTarget(game, t, st.range);
      if (!target) { t.cool = 0.05; continue; }
      t.cool = 1 / Math.max(0.1, st.rate);
      shoot(game, t, st, target);
    }
  };

  T.updateBullets = function (game, dt) {
    var b = game.bullets;
    for (var i = b.length - 1; i >= 0; i--) {
      var p = b[i];
      p.life -= dt;
      var tx, ty;
      if (p.target && p.target.alive) { tx = p.target.x; ty = p.target.y; }
      else { tx = p.lx !== undefined ? p.lx : p.x; ty = p.ly !== undefined ? p.ly : p.y; p.target = null; }
      p.lx = tx; p.ly = ty;
      var dx = tx - p.x, dy = ty - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var step = p.speed * dt;
      // 记录上一帧位置，渲染层靠它拉拖尾
      p.px = p.x; p.py = p.y;
      if (d <= step + (p.target ? p.target.r : 0)) {
        if (p.target && p.target.alive) {
          G.Game.damageEnemy(p.target, p.dmg, p.color);
          // 命中：按飞行方向溅射火花，比无方向的圆点爆开更有撞击感
          var ia = Math.atan2(dy, dx);
          G.FX.impact(p.x, p.y, p.color, 1);
          G.FX.spark(p.x, p.y, ia + Math.PI, 1.1, 4, p.color, 170, 0.28);
        }
        b.splice(i, 1);
        continue;
      }
      p.x += dx / d * step;
      p.y += dy / d * step;
      if (p.life <= 0) b.splice(i, 1);
    }
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
