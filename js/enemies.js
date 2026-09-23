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

  E.create = function (key, hpMul, spawnCol, rewardMul, mut) {
    var d = CFG.ENEMIES[key];
    var LAY = G.LAY;
    /* mut 来自本波的地脉突变（见 waves.js）：speed/armor/dmg/regen 在此套用，
     * 而 hp 与 reward 的乘子已由 main 在调用前乘进 hpMul / rewardMul，这里不再乘。 */
    var speedMul = (mut && mut.speedMul) || 1;
    var armorAdd = (mut && mut.armorAdd) || 0;
    var dmgMul = (mut && mut.dmgMul) || 1;
    var regen = (mut && mut.regen) || 0;
    var themeKey = mut && mut.list && mut.list[0] && mut.list[0].key;
    var theme = CFG.BOARD_THEMES && (CFG.BOARD_THEMES[themeKey] || CFG.BOARD_THEMES.base);
    var e = {
      uid: uidSeq++,
      key: key,
      def: d,
      /* 地图用低饱和暗色，怪物取同主题的亮前景色，绝不与地面融在一起。 */
      color: (theme && theme.enemy) || d.color,
      themeKey: (theme && theme.key) || 'base',
      r: d.r,
      col: spawnCol,
      row: -1,
      x: Grid.cellCX(spawnCol),
      y: LAY.boardY - CFG.CELL * 0.5,
      speed: d.speed * speedMul,
      maxHp: d.hp * hpMul,
      hp: d.hp * hpMul,
      armor: d.armor + armorAdd,
      dmg: d.dmg * dmgMul,
      regen: regen,
      reward: Math.round(d.reward * (rewardMul || 1)),
      alive: true,
      mode: 'path',
      slowT: 0, slowAmt: 0, superT: 0, stunT: 0, burnT: 0, burnDps: 0,
      phaseT: 0, phaseCd: d.phaseCycle ? d.phaseCycle * 0.6 : 0,
      hitFlash: 0,
      /* 击退（风/爆发类反应）的速度场，见 E.push */
      kbvx: 0, kbvy: 0, kbT: 0, kbImmune: 0,
      /* 风眼牵引：和击退分开，避免两个相反的外力同帧叠成抖动。 */
      pullVx: 0, pullVy: 0, pullT: 0,
      /* 最近一次打在它身上的元素反应名（画成它身上的一枚小标签） */
      reactT: 0, reactName: '', reactColor: '',
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
    kbvx: e.kbvx || 0, kbvy: e.kbvy || 0, kbT: e.kbT || 0, kbImmune: e.kbImmune || 0,
    pullVx: e.pullVx || 0, pullVy: e.pullVy || 0, pullT: e.pullT || 0,
    alive: e.alive, off: e.off, mode: e.mode, themeKey: e.themeKey
  };
};

E.restore = function (e, s) {
  e.x = s.x; e.y = s.y;
  e.hp = s.hp; e.maxHp = s.maxHp; e.reward = s.reward;
  e.slowT = s.slowT; e.slowAmt = s.slowAmt; e.superT = s.superT;
  e.stunT = s.stunT; e.burnT = s.burnT || 0; e.burnDps = s.burnDps || 0;
  e.phaseT = s.phaseT; e.phaseCd = s.phaseCd;
  /* 击退速度要一起回退：不回退的话，倒带后怪会带着「未来的推力」继续滑，
   * 而快照里它的位置还是旧的 —— 两者对不上就是凭空位移。 */
  e.kbvx = s.kbvx || 0; e.kbvy = s.kbvy || 0;
  e.kbT = s.kbT || 0; e.kbImmune = s.kbImmune || 0;
  e.pullVx = s.pullVx || 0; e.pullVy = s.pullVy || 0; e.pullT = s.pullT || 0;
  if (s.themeKey && CFG.BOARD_THEMES && CFG.BOARD_THEMES[s.themeKey]) {
    e.themeKey = s.themeKey; e.color = CFG.BOARD_THEMES[s.themeKey].enemy || e.color;
  }
  e.alive = true; e.off = s.off; e.mode = s.mode;
  e.hitFlash = 0;
  return e;
};

/* ------------------------------------------------------------------ */
/*  击退：连续位移，不是瞬移                                              */
/* ------------------------------------------------------------------ */
/* 早期版本是「命中瞬间 e.x -= fx * push」—— 位置在某一帧直接跳过去。
 * 风反应叠上减速时最难看：怪被瞬移推回去，下一帧又沿流场慢慢挪回来，
 * 两帧之间位置突变，观感就是「一卡一卡」。
 *
 * 现在改成速度场：击退给一个初速度，之后每帧按指数衰减，
 * 总位移 = ∫v dt = v0 · KB_TAU —— 所以「退多少像素」仍然由调用方决定
 * （反应表里的 push 就是这个数），只是分成约 0.2 秒走完，后退看得见过程。
 *
 * 三个配套约束，缺一个都会重新变难看：
 *   · 击退期间**不前进**（steer 那段被跳过）—— 否则前进与后退同时生效，
 *     净位移趋近 0，怪就在原地抖，这正是「一卡一卡」的成因。
 *   · kbImmune 让同一只怪最短 KB_IMMUNE 秒才被推第二次 —— 多个反应节点
 *     同帧命中时，击退不会叠成一次超长位移。
 *   · 位移夹在棋盘内 —— 被吹回出生区（y < boardY）会重新走「出生保护」
 *     分支，看起来就是「被吹上去卡住了」。
 */
var KB_TAU = 0.20;          // 击退速度的衰减时间常数（秒）
var KB_IMMUNE = 0.55;       // 两次击退之间的最小间隔（秒）
/** 这两个数要让自检能读（断言「免疫窗 < 最短的带击退反应周期」） */
E.KB = { tau: KB_TAU, immune: KB_IMMUNE };

/**
 * 施加一次击退。dirX/dirY 传**敌人当前的行进方向**（内部会反过来），
 * dist 是总共要后退的像素数。被免疫窗挡住或还没进棋盘时返回 false。
 */
E.push = function (e, dirX, dirY, dist) {
  if (!e || !e.alive || !(dist > 0)) return false;
  if (e.kbImmune > 0) return false;
  // 还在出生通道里的怪不吃击退：那段走的是「出生保护」分支，
  // 推力会被丢掉而 kbT 留着，等它进棋盘时凭空滑一下
  if (e.y < G.LAY.boardY) return false;
  /* 被减速的怪吃到的击退按比例缩水 —— 这是「减速 + 击退一起削弱」的直接耦合：
   * 击退期间怪不前进（steer 那段被跳过），若击退距离 ≈ 减速后的前进距离，
   * 两者正好抵消，怪就钉在原地来回（用户反馈的「卡住不前进」）。
   * 缩水后「慢 + 退」组合仍是净前进，而单独挨击退（没被减速）完全不受影响。 */
  if (e.slowAmt > 0) dist *= (1 - 0.55 * e.slowAmt);
  /* 质量衰减：体积 / 护甲越大的敌人越难被推 —— 修复「风系一吹全退」超模。
   * 脆皮小怪（群涌 / 疾行）几乎不受影响，照常被风塔成片推开（割草爽点保留）；
   * 重甲 / 巨体（装甲体 / 巨岩 / Boss）击退距离被砍到约 1/3，风塔不再能
   * 把它们一路推回出生线，逼你用元素反应和重击塔去磨肉。 */
  var mass = 1 + (e.def.r - 10) * 0.09 + (e.def.armor || 0) * 0.18;
  if (mass > 1.0001) dist = dist / mass;
  var d = Math.sqrt(dirX * dirX + dirY * dirY);
  if (d < 0.0001) return false;
  var v0 = dist / KB_TAU;
  e.kbvx = -(dirX / d) * v0;
  e.kbvy = -(dirY / d) * v0;
  e.kbT = KB_TAU * 3.5;      // 到 3.5τ 速度只剩 3%，可以收手
  e.kbImmune = KB_IMMUNE;
  return true;
};

/* 风眼牵引也用连续速度场，但与击退互斥：被风眼吸住的敌人不会同时被
 * 普通风反应推回去。候选落点若进入塔格则整帧停住，绝不穿墙。 */
var PULL_TAU = 0.18;
E.pull = function (e, x, y, dist) {
  if (!e || !e.alive || !(dist > 0) || e.y < G.LAY.boardY || e.kbT > 0) return false;
  var dx = x - e.x, dy = y - e.y;
  var d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1 || d > dist * 3) return false;
  var mass = 1 + (e.def.r - 10) * 0.09 + (e.def.armor || 0) * 0.18;
  var v0 = (dist / mass) / PULL_TAU;
  e.pullVx = (dx / d) * v0;
  e.pullVy = (dy / d) * v0;
  e.pullT = PULL_TAU * 3.2;
  return true;
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
    /* 这里原有一条「回声后遗症」敌人移速加成（buff）。回声倒带整条下线后
     * game.echoBuffT 字段已被删除，那一行恒为 `undefined > 0 === false` ——
     * 逻辑上恰好不出错（倒带没了，敌人本就不该有加速），但它会让 CFG.ECHO
     * 的删除变成隐患，所以整条清掉。 */

    /* 织愈体群体治疗：每个 mender 给半径内友军回血（不含自身）。
     * 放在主循环之前单独成 pass，避免与「死亡 splice」纠缠。 */
    for (var a = 0; a < list.length; a++) {
      var src = list[a];
      if (!src.alive || !src.def.healRange) continue;
      var hr2 = src.def.healRange * src.def.healRange;
      var healAmt = src.def.healPerSec * dt;
      for (var b = 0; b < list.length; b++) {
        var tgt = list[b];
        if (tgt === src || !tgt.alive) continue;
        if (U.dist2(src.x, src.y, tgt.x, tgt.y) <= hr2) {
          if (tgt.hp < tgt.maxHp) tgt.hp = Math.min(tgt.maxHp, tgt.hp + healAmt);
        }
      }
    }

    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if (!e.alive) { list.splice(i, 1); continue; }

      if (e.spawnT > 0) e.spawnT -= dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.reactT > 0) e.reactT -= dt;
      if (e.kbImmune > 0) e.kbImmune -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowAmt = 0; }
      if (e.superT > 0) e.superT -= dt;
      if (e.stunT > 0) e.stunT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        // 草系持续伤害：无视护甲直接扣血；击杀走 damageEnemy 的统一结算
        e.hp -= e.burnDps * dt;
        if (e.hp <= 0) G.Game.damageEnemy(e, 1, null);
      }

      // 地脉突变回血：每秒回血（来自 regrowth 等突变），不超过上限
      if (e.regen > 0 && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
      }

      var phasing = false;
      if (e.def.phaseCycle) {
        e.phaseCd -= dt;
        if (e.phaseCd <= 0) { e.phaseT = e.def.phaseDur; e.phaseCd = e.def.phaseCycle; }
        if (e.phaseT > 0) { e.phaseT -= dt; phasing = true; }
      }

      var speed = e.speed * (1 - e.slowAmt);
      var frozen = e.stunT > 0;

      // 出生保护：先往下走进棋盘
      if (e.y < G.LAY.boardY - 2) {
        if (!frozen) e.y += speed * dt;
        continue;
      }

      /* 击退位移：独立于寻路。定身期间照样被吹（这是外力，不是它自己在走），
       * 但**前进**那一段会被跳过 —— 两者同时生效就变成原地抖。 */
      if (e.kbT > 0) {
        e.kbT -= dt;
        // 时长取小步长：hitStop / 掉帧时 dt 可能很大，一步跨过衰减窗口会变成瞬移
        var kdt = Math.min(dt, 0.05);
        e.x += e.kbvx * kdt;
        e.y += e.kbvy * kdt;
        var decay = Math.exp(-kdt / KB_TAU);
        e.kbvx *= decay; e.kbvy *= decay;
        var kMinX = CFG.BX + 6, kMaxX = CFG.BX + CFG.BOARD_W - 6;
        var kMinY = G.LAY.boardY + 6;
        if (e.x < kMinX) { e.x = kMinX; e.kbvx = 0; }
        if (e.x > kMaxX) { e.x = kMaxX; e.kbvx = 0; }
        if (e.y < kMinY) { e.y = kMinY; e.kbvy = 0; }
        if (e.kbT <= 0) { e.kbvx = 0; e.kbvy = 0; }
      } else if (e.pullT > 0) {
        e.pullT -= dt;
        var pdt = Math.min(dt, 0.05);
        var px = e.x + e.pullVx * pdt;
        var py = e.y + e.pullVy * pdt;
        px = U.clamp(px, CFG.BX + 6, CFG.BX + CFG.BOARD_W - 6);
        py = Math.max(G.LAY.boardY + 6, py);
        var pc = U.clamp(Math.floor((px - CFG.BX) / CFG.CELL), 0, CFG.COLS - 1);
        var pr = U.clamp(Math.floor((py - G.LAY.boardY) / CFG.CELL), 0, CFG.ROWS - 1);
        if (!Grid.isBlocked(pc, pr)) { e.x = px; e.y = py; }
        else { e.pullVx = 0; e.pullVy = 0; e.pullT = 0; }
        var pullDecay = Math.exp(-pdt / PULL_TAU);
        e.pullVx *= pullDecay; e.pullVy *= pullDecay;
        if (e.pullT <= 0) { e.pullVx = 0; e.pullVy = 0; }
      }

      if (!frozen && e.kbT <= 0 && e.pullT <= 0) {
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
