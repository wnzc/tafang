/**
 * enemies.js —— 敌人实体与行进逻辑
 *
 * 敌人不沿固定路径行进，而是每帧读取流场（flow field）选择代价更低的邻格，
 * 因此玩家的每一次建造都会实时改变所有敌人的行进路线。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, U = G.Util, Grid = G.Grid;

  var DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var uidSeq = 1;

  var E = G.Enemies = {};

  E.create = function (key, hpMul, spawnCol, rewardMul) {
    var d = CFG.ENEMIES[key];
    var LAY = G.LAY;
    var e = {
      uid: uidSeq++,
      key: key,
      def: d,
      shape: d.shape,
      color: d.color,
      r: d.r,
      col: spawnCol,
      row: -1,
      x: Grid.cellCX(spawnCol),
      y: LAY.boardY - CFG.CELL * 0.5,
      speed: d.speed,
      maxHp: d.hp * hpMul,
      hp: d.hp * hpMul,
      armor: d.armor,
      dmg: d.dmg,
      reward: Math.round(d.reward * (rewardMul || 1)),
      alive: true,
      mode: 'path',
      slowT: 0, slowAmt: 0, superT: 0, stunT: 0, burnT: 0, burnDps: 0,
      phaseT: 0, phaseCd: d.phaseCycle ? d.phaseCycle * 0.6 : 0,
      hitFlash: 0,
      fx: 0, fy: 1,
      off: U.rand(-15, 15),
      spawnT: 0.35
    };
    return e;
  };

  /** 复活 / 回退用的重建 */
  E.rebuild = function (s) {
    var e = E.create(s.key, 1, 0, 1);
    e.maxHp = s.maxHp;
    e.hp = s.hp;
    e.reward = s.reward;
    return e;
  };

  E.snapshot = function (e) {
    return {
      uid: e.uid, key: e.key, x: e.x, y: e.y,
      hp: e.hp, maxHp: e.maxHp, reward: e.reward,
      slowT: e.slowT, slowAmt: e.slowAmt, superT: e.superT,
      stunT: e.stunT, burnT: e.burnT || 0, burnDps: e.burnDps || 0,
      phaseT: e.phaseT, phaseCd: e.phaseCd,
      alive: e.alive, off: e.off, mode: e.mode
    };
  };

  E.restore = function (e, s) {
    e.x = s.x; e.y = s.y;
    e.hp = s.hp; e.maxHp = s.maxHp; e.reward = s.reward;
    e.slowT = s.slowT; e.slowAmt = s.slowAmt; e.superT = s.superT;
    e.stunT = s.stunT; e.burnT = s.burnT || 0; e.burnDps = s.burnDps || 0;
    e.phaseT = s.phaseT; e.phaseCd = s.phaseCd;
    e.alive = true; e.off = s.off; e.mode = s.mode;
    e.hitFlash = 0;
    return e;
  };

  function findTowerNear(game, e, range) {
    var list = game.towers, best = null, bd = range * range;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var d2 = U.dist2(e.x, e.y, t.x, t.y);
      if (d2 <= bd) { bd = d2; best = t; }
    }
    return best;
  }
  E.findTowerNear = findTowerNear;

  /** 沿流场走一步 */
  function steer(e, flow, dt, speed) {
    var BX = CFG.BX, BY = G.LAY.boardY, CELL = CFG.CELL;
    var COLS = CFG.COLS, ROWS = CFG.ROWS;
    var r = Math.floor((e.y - BY) / CELL);
    var c = Math.floor((e.x - BX) / CELL);
    var tx, ty;

    if (r < 0 || !flow) {
      c = U.clamp(c, 0, COLS - 1);
      tx = BX + (c + 0.5) * CELL;
      ty = BY + 0.5 * CELL;
    } else {
      c = U.clamp(c, 0, COLS - 1);
      r = U.clamp(r, 0, ROWS - 1);
      var curV = Grid.at(flow, c, r);
      var best = -1, bc = c, br = r;
      for (var k = 0; k < 8; k++) {
        var dc = DIR8[k][0], dr = DIR8[k][1];
        var nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        var v = Grid.at(flow, nc, nr);
        if (v < 0) continue;
        if (dc !== 0 && dr !== 0) {
          if (Grid.isBlocked(nc, r) || Grid.isBlocked(c, nr)) continue;
        }
        if (best < 0 || v < best) { best = v; bc = nc; br = nr; }
      }
      if (best < 0 || (curV >= 0 && best >= curV)) { bc = c; br = r; }
      tx = BX + (bc + 0.5) * CELL;
      ty = BY + (br + 0.5) * CELL;
    }

    // 侧向偏移，让怪流呈带状而不是一条直线
    var dx = tx - e.x, dy = ty - e.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.0001) return;
    var ux = dx / d, uy = dy / d;
    var gx = tx + (-uy) * e.off;
    var gy = ty + (ux) * e.off;
    dx = gx - e.x; dy = gy - e.y;
    d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.0001) return;
    ux = dx / d; uy = dy / d;
    var sp = speed * dt;
    if (d <= sp) { e.x = gx; e.y = gy; } else { e.x += ux * sp; e.y += uy * sp; }
    e.fx = ux; e.fy = uy;
  }
  E.steer = steer;

  E.update = function (game, dt) {
    var list = game.enemies;
    var flow = Grid.flow, phaseFlow = Grid.phaseFlow, towerFlow = Grid.towerFlow;
    var buff = game.echoBuffT > 0 ? CFG.ECHO.buffSpeed : 0;

    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if (!e.alive) { list.splice(i, 1); continue; }

      if (e.spawnT > 0) e.spawnT -= dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowAmt = 0; }
      if (e.superT > 0) e.superT -= dt;
      if (e.stunT > 0) e.stunT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        // 草系持续伤害：无视护甲直接扣血；击杀走 damageEnemy 的统一结算
        e.hp -= e.burnDps * dt;
        if (e.hp <= 0) G.Game.damageEnemy(e, 1, null);
      }

      var phasing = false;
      if (e.def.phaseCycle) {
        e.phaseCd -= dt;
        if (e.phaseCd <= 0) { e.phaseT = e.def.phaseDur; e.phaseCd = e.def.phaseCycle; }
        if (e.phaseT > 0) { e.phaseT -= dt; phasing = true; }
      }

      var speed = e.speed * (1 - e.slowAmt) * (1 + buff);
      var frozen = e.stunT > 0;

      // 出生保护：先往下走进棋盘
      if (e.y < G.LAY.boardY - 2) {
        if (!frozen) e.y += speed * dt;
        continue;
      }

      if (!frozen) {
        var tRange = e.def.towerRange || 74;
        if (e.def.towerDps && !phasing) {
          // 破墙者：以拆塔为第一优先（结晶护盾期间啃不动）
          var tt = findTowerNear(game, e, tRange);
          if (tt) {
            e.mode = 'chew';
            e.target = tt;
            if (tt.shieldT > 0) {
              // 啃在结晶护盾上：不掉血，敌人被护盾顶住原地磨（护盾的目的就在这）
            } else {
              tt.hp -= e.def.towerDps * dt;
              tt.hitFlash = 0.2;
              if (tt.hp <= 0) G.Game.destroyTower(tt);
            }
          } else {
            e.mode = 'path';
            steer(e, towerFlow || flow, dt, speed);
          }
        } else {
          var cc = U.clamp(Math.floor((e.x - CFG.BX) / CFG.CELL), 0, CFG.COLS - 1);
          var rr = U.clamp(Math.floor((e.y - G.LAY.boardY) / CFG.CELL), 0, CFG.ROWS - 1);
          var field = phasing ? phaseFlow : flow;
          var v = Grid.at(field, cc, rr);
          if (!phasing && v < 0) {
            // 无路可走 —— 敌人会开始啃塔（反龟缩机制）
            var t2 = findTowerNear(game, e, tRange);
            if (t2) {
              e.mode = 'chew';
              e.target = t2;
              if (t2.shieldT > 0) {
                // 结晶护盾免疫啃咬
              } else {
                t2.hp -= 13 * dt;
                t2.hitFlash = 0.2;
                if (t2.hp <= 0) G.Game.destroyTower(t2);
              }
            } else {
              steer(e, towerFlow || flow, dt, speed);
            }
          } else {
            e.mode = 'path';
            e.target = null;
            steer(e, field, dt, speed);
          }
        }
      }

      // 抵达核心？
      var c2 = Math.floor((e.x - CFG.BX) / CFG.CELL);
      var r2 = Math.floor((e.y - G.LAY.boardY) / CFG.CELL);
      if (Grid.isCore(c2, r2)) {
        G.Game.leak(e);
        list.splice(i, 1);
      }
    }
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
