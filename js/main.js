/**
 * main.js —— 游戏主逻辑（状态机 / 建造 / 回声倒带 / 主动技能 / 输入分发）
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG, U = G.Util, Grid = G.Grid, R = G.Runtime;

  var game = G.Game = {
    state: 'menu',          // menu | set | help | codex | pop | prep | wave | over | win
    prevState: 'menu',      // 从哪个整屏版式进来的（设置/玩法/图鉴的「返回」回到这里；
                            // 「首次遭遇」弹窗也用它记住暂停在哪——prep 还是 wave）
    time: 0,
    coreHp: 100,
    coreMax: 100,
    energy: 0,
    score: 0,
    kills: 0,
    leaked: 0,
    wave: 0,
    wavesTotal: CFG.TOTAL_WAVES,
    enemies: [],
    towers: [],
    bullets: [],
    waveData: null,
    spawnIdx: 0,
    waveTime: 0,
    prepT: 0,
    echo: 0,
    echoBuffT: 0,
    snaps: [],
    snapT: 0,
    sel: null,
    selCard: null,
    pulseMode: false,
    shake: 0,
    redFlash: 0,
    whiteFlash: 0,
    hitStop: 0,
    toastMsg: '',
    toastT: 0,
    best: 0,
    bannerT: 0,
    bannerMsg: '',
    /* —— 图鉴 —— */
    codexTab: 0,            // 0 = 怪物，1 = 炮台
    codexSel: null,         // 详情视图里选中的条目（null = 列表视图）
    /* —— 首次遭遇弹窗 —— */
    codexQueue: [],         // 待弹的新怪（同帧刷出两只就排两个）
    popKey: null            // 当前弹窗展示的怪（非 null 即处于暂停）
  };

  /* ------------------------------------------------------------------ */
  /*  音效快捷（音频不可用时静默，不抛错）                                  */
  /* ------------------------------------------------------------------ */
  function A(name) {
    if (G.Audio) G.Audio.play(name);
  }

  /* ------------------------------------------------------------------ */
  /*  初始化                                                              */
  /* ------------------------------------------------------------------ */
  G.Game.reset = function () {
    var g = game;
    g.state = 'menu';
    g.prevState = 'menu';
    g.time = 0;
    g.coreMax = CFG.CORE_HP;
    g.coreHp = CFG.CORE_HP;
    g.energy = CFG.START_ENERGY;
    g.score = 0;
    g.kills = 0;
    g.leaked = 0;
    g.wave = 0;
    g.enemies.length = 0;
    g.towers.length = 0;
    g.bullets.length = 0;
    g.waveData = null;
    g.spawnIdx = 0;
    g.waveTime = 0;
    g.prepT = 0;
    g.echo = 0;
    g.echoBuffT = 0;
    g.snaps.length = 0;
    g.snapT = 0;
    g.sel = null;
    g.selCard = null;
    g.pulseMode = false;
    g.shake = 0;
    g.redFlash = 0;
    g.whiteFlash = 0;
    g.hitStop = 0;
    g.toastT = 0;
    g.bannerT = 0;
    /* 图鉴的选中项与待弹队列要清；已解锁记录不动 —— 那是跨局的（存在 echo_seen 里） */
    g.codexSel = null;
    g.codexQueue.length = 0;
    g.popKey = null;
    G.FX.clear();
    G.Resonance.reset();
    Grid.reset();
    Grid.recompute(g.towers);
    g.best = R.store.get('echo_best', 0) || 0;
  };

  G.Game.startRun = function () {
    game.state = 'prep';
    game.prepT = CFG.PREP_TIME;
    game.bannerMsg = '备战 · 第 1 波';
    game.bannerT = 2.2;
    game.toastMsg = '点下方卡片选塔 → 点棋盘空格建造';
    game.toastT = 4.5;
  };

  G.Game.toast = function (msg) {
    game.toastMsg = msg;
    game.toastT = 1.5;
  };

  /* ------------------------------------------------------------------ */
  /*  建造 / 升级 / 回收                                                   */
  /* ------------------------------------------------------------------ */
  G.Game.tryBuild = function (col, row) {
    var key = game.selCard;
    if (!key) return false;
    var d = CFG.TOWERS[key];
    if (!d || !Grid.canPlace(col, row)) { G.Game.toast('此处无法建造'); A('deny'); return false; }
    for (var i = 0; i < game.towers.length; i++) {
      if (game.towers[i].col === col && game.towers[i].row === row) { G.Game.toast('此处无法建造'); A('deny'); return false; }
    }
    if (game.energy < d.cost) { G.Game.toast('能量不足'); A('deny'); return false; }

    game.energy -= d.cost;
    var t = G.Towers.create(key, col, row);
    game.towers.push(t);
    Grid.recompute(game.towers);
    G.Resonance.rebuild(game);

    // 落成：三层涟漪 + 尘土 + 元素色火花
    var col0 = CFG.ELEM[d.elem].color;
    G.FX.ripple(t.x, t.y, CFG.CELL * 0.58, col0);
    G.FX.dust(t.x, t.y, 7, U.hexToRgba(col0, 1));
    G.FX.spark(t.x, t.y, -Math.PI / 2, Math.PI, 6, col0, 150, 0.36);
    G.FX.flash(t.x, t.y, 34, col0, 0.26);
    G.FX.pop(t.x, t.y - 6, '−' + d.cost, '#ffd27a', 15);
    A('build');
    R.buzz('light');
    if (game.energy < d.cost) game.selCard = null;
    return true;
  };

  G.Game.upgradeTower = function (t) {
    if (!t) return;
    // 满级的塔可以付费维修
    if (t.level >= CFG.MAX_LEVEL) {
      if (t.hp >= t.maxHp - 0.5) { G.Game.toast('已达最高等级'); A('deny'); return; }
      var rc = G.Towers.actionCost(t);
      if (game.energy < rc) { G.Game.toast('能量不足'); A('deny'); return; }
      game.energy -= rc;
      t.spent += rc;
      t.hp = t.maxHp;
      G.FX.ripple(t.x, t.y, 40, '#7ef2c0');
      G.FX.ember(t.x, t.y, 6, '#7ef2c0');
      G.FX.pop(t.x, t.y, '维修完成', '#7ef2c0', 17);
      G.FX.pop(t.x, t.y + 22, '−' + rc, '#ffd27a', 14);
      A('upgrade');
      R.buzz('light');
      return;
    }
    var cost = G.Towers.actionCost(t);
    if (game.energy < cost) { G.Game.toast('能量不足'); A('deny'); return; }
    game.energy -= cost;
    t.spent += cost;
    t.level++;
    t.maxHp = G.Towers.maxHp(t);
    t.hp = t.maxHp;
    var col = CFG.ELEM[t.elem].color;
    t.recoil = 0.6;
    G.FX.ripple(t.x, t.y, 52, col);
    G.FX.flash(t.x, t.y, 44, col, 0.3);
    G.FX.spark(t.x, t.y, -Math.PI / 2, Math.PI, 10, CFG.ELEM[t.elem].soft, 190, 0.42);
    G.FX.ember(t.x, t.y, 7, col);
    G.FX.pop(t.x, t.y, 'Lv.' + t.level, CFG.ELEM[t.elem].soft, 19);
    G.FX.pop(t.x, t.y + 24, '−' + cost, '#ffd27a', 14);
    G.Resonance.rebuild(game);
    A('upgrade');
    R.buzz('light');
  };

  G.Game.sellTower = function (t) {
    if (!t) return;
    var v = G.Towers.sellValue(t);
    game.energy += v;
    G.FX.ripple(t.x, t.y, 46, '#ffd27a');
    G.FX.spark(t.x, t.y, -Math.PI / 2, Math.PI, 8, '#ffd27a', 160, 0.34);
    G.FX.pop(t.x, t.y, '+' + v, '#ffd27a', 19);
    G.Game.removeTower(t);
    game.sel = null;
    A('sell');
  };

  G.Game.removeTower = function (t) {
    var i = game.towers.indexOf(t);
    if (i >= 0) game.towers.splice(i, 1);
    Grid.recompute(game.towers);
    G.Resonance.rebuild(game);
  };

  G.Game.destroyTower = function (t) {
    G.FX.explode(t.x, t.y, '#ff8f9b', 78, 1.5);
    G.FX.pop(t.x, t.y, '塔被摧毁', '#ff8f9b', 16);
    G.Game.removeTower(t);
    if (game.sel === t) game.sel = null;
    game.shake = Math.max(game.shake, 7);
    game.hitStop = Math.max(game.hitStop, 0.05);
    A('hit');
  };

  /* ------------------------------------------------------------------ */
  /*  伤害 / 漏怪                                                          */
  /* ------------------------------------------------------------------ */
  /**
   * 对敌人造成一次伤害。
   *   opts.pierce = true → **无视护甲**（元素反应、以及将来的真伤技能走这条）。
   * 护甲是平砍减伤（最低压到 1 点），所以它是「低伤高频的塔打高甲怪很吃亏」
   * 这条规则的实现；反应的输出必须绕过它，否则高甲怪对谁都硬，
   * 玩家手上就没有任何解法了（第 5 波那只 Boss 就是这么变成「打不动」的）。
   */
  G.Game.damageEnemy = function (e, amt, color, opts) {
    if (!e || !e.alive) return;
    var dmg = (opts && opts.pierce) ? amt : amt - e.armor;
    if (dmg < 1) dmg = 1;
    if (e.superT > 0) dmg *= (1 + CFG.RES.reactions['cryo|electro'].extra);
    e.hp -= dmg;
    e.hitFlash = 0.12;

    // 小伤害不飘字（塔一多会糊屏），只有重击才报数
    if (CFG.VIS.hitText && dmg >= CFG.VIS.hitTextMin && e.hp > 0) {
      G.FX.pop(e.x, e.y - e.r - 6, String(Math.round(dmg)), color || '#ffffff', 15);
    }

    if (e.hp <= 0) {
      e.alive = false;
      game.kills++;
      game.energy += e.reward;
      game.score += e.reward * 2;
      game.echo = Math.min(CFG.ECHO.max, game.echo + CFG.ECHO.perKill);

      if (e.def.boss) {
        G.FX.explode(e.x, e.y, e.color, 150, 3);
        G.FX.shock(e.x, e.y, 240, '#ffffff', 0.8, 6);
        G.FX.spark(e.x, e.y, 0, Math.PI * 2, 26, e.color, 320, 0.7);
        G.FX.pop(e.x, e.y - 30, '+' + e.reward, '#ffd27a', 26);
        game.shake = 14;
        game.whiteFlash = 0.55;
        game.hitStop = 0.1;
        A('bossDown');
      } else {
        G.FX.explode(e.x, e.y, e.color, 34, 0.9);
        A('kill');
      }
    } else {
      A('hit');
    }
  };

  /**
   * 把「刚被哪个元素反应打中」记到敌人身上 —— render.js 会在它血条上方
   * 画一枚小标签（名字带元素色描边），然后自己淡掉。
   *
   * 为什么记在敌人身上而不是用飘字：飘字会往上飞走，怪一动两者就错开；
   * 而且同一只怪被连续打时，飘字会叠成一列，看不出「现在挂着什么」。
   * 只记最新的一条 —— 一只怪同时挂三行反应名反而更难读。
   */
  G.Game.tagReact = function (e, name, color) {
    if (!e || !e.alive || !name) return;
    e.reactT = CFG.VIS.reactTagT;
    e.reactName = name;
    e.reactColor = color || '#ffffff';
  };

  G.Game.leak = function (e) {
    game.coreHp -= e.dmg;
    game.leaked++;
    game.shake = Math.max(game.shake, 9);
    game.redFlash = 0.6;
    game.hitStop = Math.max(game.hitStop, 0.06);
    G.FX.explode(e.x, e.y, '#ff5d6c', 86, 1.6);
    G.FX.pop(e.x, e.y - 24, '−' + e.dmg + ' 核心', '#ff8f9b', 20);
    A('leak');
    R.buzz('heavy');
    if (game.coreHp <= 0) {
      game.coreHp = 0;
      G.Game.gameOver();
    }
  };

  G.Game.gameOver = function () {
    game.state = 'over';
    game.redFlash = 1;
    game.whiteFlash = 0.7;
    if (game.score > game.best) { game.best = game.score; R.store.set('echo_best', game.score); }
    A('over');
    R.buzz('heavy');
  };

  G.Game.win = function () {
    game.state = 'win';
    game.whiteFlash = 0.8;
    if (game.score > game.best) { game.best = game.score; R.store.set('echo_best', game.score); }
    A('win');
    R.buzz('heavy');
  };

  /* ------------------------------------------------------------------ */
  /*  主动技能：共振脉冲                                                   */
  /* ------------------------------------------------------------------ */
  G.Game.castPulse = function (x, y) {
    if (game.energy < CFG.PULSE.cost) { G.Game.toast('能量不足'); A('deny'); return; }
    game.energy -= CFG.PULSE.cost;
    var arr = game.enemies;
    var n = 0;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e.alive) continue;
      if (U.dist(e.x, e.y, x, y) > CFG.PULSE.radius + e.r) continue;
      G.Game.damageEnemy(e, CFG.PULSE.dmg, '#9fd8ff');
      e.stunT = Math.max(e.stunT, CFG.PULSE.stun);
      G.FX.ring(e.x, e.y, 4, 30, '#9fd8ff', 0.36, 2.5);
      n++;
    }
    G.FX.shock(x, y, CFG.PULSE.radius, '#9fd8ff', 0.55, 5);
    G.FX.shock(x, y, CFG.PULSE.radius * 0.62, '#ffffff', 0.34, 3);
    G.FX.spark(x, y, 0, Math.PI * 2, 18, '#cfeaff', 260, 0.5);
    G.FX.ember(x, y, 12, '#9fd8ff');
    if (n) G.FX.pop(x, y - 26, '震击 ' + n, '#cfeaff', 18);
    game.shake = Math.max(game.shake, 6);
    game.hitStop = Math.max(game.hitStop, 0.05);
    A('pulse');
    R.buzz('medium');
  };

  /* ------------------------------------------------------------------ */
  /*  核心特色：回声倒带                                                   */
  /* ------------------------------------------------------------------ */
  function takeSnapshot() {
    var g = game;
    var s = {
      core: g.coreHp, energy: g.energy, score: g.score,
      enemies: [], towers: []
    };
    var i;
    for (i = 0; i < g.enemies.length; i++) s.enemies.push(G.Enemies.snapshot(g.enemies[i]));
    for (i = 0; i < g.towers.length; i++) {
      var t = g.towers[i];
      s.towers.push({ key: t.key, col: t.col, row: t.row, level: t.level, hp: t.hp, spent: t.spent });
    }
    return s;
  }

  G.Game.castEcho = function () {
    if (game.echo < CFG.ECHO.max) {
      G.Game.toast('回声充能不足 ' + Math.floor(game.echo) + '%');
      A('deny');
      R.buzz('heavy');
      return;
    }
    if (!game.snaps.length) { G.Game.toast('无可回溯的记录'); A('deny'); return; }
    var s = game.snaps[0];
    game.snaps.length = 0;
    game.snapT = 0;

    // 还原数值
    game.coreHp = s.core;
    game.energy = s.energy;
    game.score = s.score;

    // 还原塔
    var i, t;
    var newTowers = [];
    for (i = 0; i < s.towers.length; i++) {
      var st = s.towers[i];
      t = G.Towers.create(st.key, st.col, st.row);
      t.level = st.level;
      t.maxHp = G.Towers.maxHp(t);
      t.hp = Math.min(st.hp, t.maxHp);
      t.spent = st.spent;
      newTowers.push(t);
    }
    game.towers = newTowers;
    Grid.recompute(game.towers);

    // 还原敌人
    var live = {};
    for (i = 0; i < game.enemies.length; i++) live[game.enemies[i].uid] = game.enemies[i];
    var out = [];
    for (i = 0; i < s.enemies.length; i++) {
      var se = s.enemies[i];
      var e = live[se.uid];
      if (!e) e = G.Enemies.rebuild(se);
      G.Enemies.restore(e, se);
      out.push(e);
    }
    game.enemies = out;
    game.bullets.length = 0;

    // 后遗症：敌人适应加速
    game.echoBuffT = CFG.ECHO.buffTime;
    game.echo = 0;
    game.sel = null;
    game.selCard = null;
    game.pulseMode = false;
    G.Resonance.rebuild(game);

    // 倒带视觉：向内收束的时间环 + 全屏冷闪
    var cx0 = CENTER_X(), cy0 = CENTER_Y();
    G.FX.shock(cx0, cy0, 300, '#8fe6ff', 0.95, 6);
    G.FX.shock(cx0, cy0, 190, '#ffffff', 0.6, 3);
    G.FX.ring(cx0, cy0, 20, 620, '#8fe6ff', 0.9, 6);
    G.FX.ring(cx0, cy0, 10, 420, '#ffffff', 0.6, 3);
    G.FX.spark(cx0, cy0, 0, Math.PI * 2, 30, '#bfeeff', 340, 0.85);
    for (var q = 0; q < 8; q++) {
      var qa = q / 8 * Math.PI * 2;
      G.FX.ember(cx0 + Math.cos(qa) * 120, cy0 + Math.sin(qa) * 120, 3, '#8fe6ff');
    }
    game.shake = 13;
    game.whiteFlash = 0.45;
    game.hitStop = 0.08;
    game.bannerMsg = '回声倒带 · 时间回退 4 秒';
    game.bannerT = 1.8;
    A('echo');
    R.buzz('heavy');
  };

  function CENTER_X() { return CFG.BX + CFG.BOARD_W / 2; }
  function CENTER_Y() { return G.LAY.boardY + CFG.BOARD_H / 2; }

  /* ------------------------------------------------------------------ */
  /*  波次                                                                 */
  /* ------------------------------------------------------------------ */
  G.Game.startWave = function (manual) {
    if (game.state !== 'prep') return;
    if (manual) {
      var bonus = Math.floor(game.prepT * CFG.PREP_BONUS) + CFG.EARLY_WAVE_BONUS;
      game.energy += bonus;
      // 飘字放大一倍后不能再往棋盘上边飘（会压到开波按钮），改落在第一行格子上
      G.FX.text(CENTER_X(), G.LAY.boardY + 70, '提前开波 +' + bonus, '#7ef2c0', 20);
    }
    game.wave++;
    game.waveData = G.Waves.plan(game.wave);
    game.spawnIdx = 0;
    game.waveTime = 0;
    game.state = 'wave';
    game.bannerMsg = '第 ' + game.wave + ' 波 · ' + game.waveData.name;
    game.bannerT = 2.2;
    /* Boss 波给一条「怎么打」的提示。
     * 会这么写是因为实测过：Boss 的护甲把低伤塔压到 1 点，玩家的第一反应
     * 是「再多堆两座同样的塔」—— 方向正好反了。提示必须直接给出解法：
     * 元素反应是穿甲的，而它的压制圈会把贴上去的塔踢出共振网络。
     * '|' 是 drawToast 的手动换行（见 render.js）。 */
    if (game.waveData.isBoss) {
      game.toastMsg = 'Boss 来袭：元素反应无视护甲|别把塔贴在它的行进路线上';
      game.toastT = 4.5;
    }
    G.FX.shock(CFG.BX + CFG.BOARD_W / 2, G.LAY.boardY + 10, 220, '#ff8f9b', 0.6, 4);
    A('waveStart');
    R.buzz('medium');
  };

  function waveComplete() {
    game.echo = Math.min(CFG.ECHO.max, game.echo + CFG.ECHO.perWave);
    game.score += 60 + game.wave * 20;
    game.energy += 42 + game.wave * 8;
    var gain = 42 + game.wave * 8;
    G.FX.ripple(CENTER_X(), CENTER_Y(), 220, '#7ef2c0');
    G.FX.shock(CENTER_X(), CENTER_Y(), 300, '#7ef2c0', 0.7, 5);
    G.FX.spark(CENTER_X(), CENTER_Y(), -Math.PI / 2, Math.PI, 20, '#9dffd8', 280, 0.7);
    G.FX.ember(CENTER_X(), CENTER_Y(), 14, '#7ef2c0');
    // 字号用 24 而不是原来的 23：23 不在字号表里，会走兜底倍率，
    // 换档时这一处会和其他文字脱节（font-check 现在会把特效字号也录进去）
    G.FX.pop(CENTER_X(), CENTER_Y(), '波次清空 +' + gain, '#7ef2c0', 24);
    game.whiteFlash = 0.22;
    A('waveClear');
    if (game.wave >= game.wavesTotal) { G.Game.win(); return; }
    game.state = 'prep';
    game.prepT = CFG.PREP_TIME;
    game.bannerMsg = '备战 · 第 ' + (game.wave + 1) + ' 波';
    game.bannerT = 2;
  }

  /* ------------------------------------------------------------------ */
  /*  主更新                                                               */
  /* ------------------------------------------------------------------ */
  G.Game.update = function (dt) {
    var g = game;
    g.time += dt;

    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 22);
    if (g.redFlash > 0) g.redFlash = Math.max(0, g.redFlash - dt * 1.6);
    if (g.whiteFlash > 0) g.whiteFlash = Math.max(0, g.whiteFlash - dt * 2.6);
    if (g.toastT > 0) g.toastT -= dt;
    if (g.bannerT > 0) g.bannerT -= dt;
    if (g.echoBuffT > 0) g.echoBuffT = Math.max(0, g.echoBuffT - dt);

    G.FX.update(dt);

    /* 整屏版式（菜单/设置/玩法/图鉴/结算）与「首次遭遇」弹窗里不跑战斗逻辑。
     * 弹窗走同一条早退，就是「暂停」的全部实现：prepT 不倒数、敌人不动、
     * 塔不开火，而 g.time 在上面已经加过了 —— 所以弹窗里的怪物形象照常在做动画。
     * 计时器也在上面衰减过，提示与横幅在这些页面照常会自己淡掉。 */
    if (g.state === 'menu' || g.state === 'set' || g.state === 'help' ||
      g.state === 'codex' || g.state === 'pop' ||
      g.state === 'over' || g.state === 'win') return;

    if (g.state === 'prep') {
      g.prepT -= dt;
      if (g.prepT <= 0) { g.prepT = 0; G.Game.startWave(false); }
    }

    if (g.state === 'wave' && g.waveData) {
      g.waveTime += dt;
      var ev = g.waveData.events;
      while (g.spawnIdx < ev.length && ev[g.spawnIdx].time <= g.waveTime) {
        if (g.enemies.length < 72) {
          var e = ev[g.spawnIdx];
          g.enemies.push(G.Enemies.create(e.type, e.hpMul, CFG.SPAWN_COLS[e.spawn], g.waveData.rewardMul));
          /* 首次遭遇的记号在这里落 —— 必须在刷怪处而不是 Enemies.create 里：
           * 回声倒带会用 create 重建敌人，写在 create 里会把「已经见过的怪」
           * 又当成新的，倒一次带回溯一次弹窗。 */
          G.Game.queueCodex(e.type);
        }
        g.spawnIdx++;
      }
    }

    G.Enemies.update(g, dt);
    G.Towers.update(g, dt);
    G.Towers.updateBullets(g, dt);
    G.Resonance.update(g, dt);

    // 敌人远离后清理已死亡引用
    if (g.sel && g.towers.indexOf(g.sel) < 0) g.sel = null;

    // 回声快照
    g.snapT -= dt;
    if (g.snapT <= 0) {
      g.snapT = CFG.ECHO.snapStep;
      g.snaps.push(takeSnapshot());
      var maxSnaps = Math.ceil(CFG.ECHO.window / CFG.ECHO.snapStep);
      while (g.snaps.length > maxSnaps) g.snaps.shift();
    }

    if (g.state === 'wave' && g.waveData) {
      if (g.spawnIdx >= g.waveData.events.length && g.enemies.length === 0) waveComplete();
    }

    /* 新怪入场 → 暂停 + 弹窗。刻意放在本帧所有战斗逻辑**之后**：
     * 这样「暂停」落在一个完整的帧边界上，而不是半帧里
     * （否则刚 spawn 的怪会停在出生线外不动，回来看见它「卡」在那）。 */
    if (g.codexQueue.length && !g.popKey &&
      (g.state === 'prep' || g.state === 'wave')) G.Game.openPop();
  };

  /* ------------------------------------------------------------------ */
  /*  输入                                                                 */
  /* ------------------------------------------------------------------ */
  var CELL = CFG.CELL;

  function inRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  G.Game.onTap = function (x, y) {
    var g = game;
    var LAY = G.LAY;

    // 任意一次点击都视为用户手势，用来解锁浏览器音频
    if (G.Audio) G.Audio.unlock();

    // 音效开关（任何界面都能点）
    // 快捷音效开关：设置 / 玩法 / 图鉴 / 弹窗都不响应
    // （那几页没画它，大字号下会与页面自己的按钮重叠；设置页里另有音效开关）
    if (G.Audio && g.state !== 'set' && g.state !== 'help' &&
      g.state !== 'codex' && g.state !== 'pop' && inRect(x, y, LAY.soundBtn)) {
      var m = G.Audio.toggleMute();
      G.Game.toast(m ? '音效已关闭' : '音效已开启');
      return;
    }

    if (g.state === 'menu') {
      if (inRect(x, y, G.UI.menuStart())) { A('ui'); G.Game.startRun(); return; }
      // 次级按钮遍历 UI.menuSubBtns()：与 drawMenu 读同一张表（新增按钮只需改那一处）
      var subs = G.UI.menuSubBtns();
      for (var si = 0; si < subs.length; si++) {
        if (!inRect(x, y, subs[si].rect)) continue;
        A('ui');
        if (subs[si].key === 'help') G.Game.openPage('help');
        else if (subs[si].key === 'codex') G.Game.openCodex();
        else if (subs[si].key === 'set') G.Game.openPage('set');
        return;
      }
      return;
    }
    // 设置页与玩法页：只处理自己的控件，绝不落到下面的战斗分支
    if (g.state === 'set' || g.state === 'help') {
      G.Game.onPageTap(x, y);
      return;
    }
    // 图鉴页与「首次遭遇」弹窗：同上，各自独立处理
    if (g.state === 'codex' || g.state === 'pop') {
      G.Game.onCodexTap(x, y);
      return;
    }
    if (g.state === 'over' || g.state === 'win') {
      if (inRect(x, y, G.UI.againBtn())) {
        A('ui');
        G.Game.reset();
        G.Game.startRun();
      }
      return;
    }

    // 1) 选中塔的面板
    if (g.sel) {
      var p = G.UI.towerPanel(g.sel);
      if (inRect(x, y, p.up)) { G.Game.upgradeTower(g.sel); return; }
      if (inRect(x, y, p.sell)) { G.Game.sellTower(g.sel); return; }
      if (inRect(x, y, { x: p.x, y: p.y, w: p.w, h: p.h })) return;
    }

    // 2) 底部卡片
    var cards = LAY.cards;
    var nTower = CFG.TOWER_ORDER.length;
    for (var i = 0; i < cards.length; i++) {
      if (!inRect(x, y, cards[i])) continue;
      if (i < nTower) {
        var key = CFG.TOWER_ORDER[i];
        g.selCard = (g.selCard === key) ? null : key;
        g.pulseMode = false;
        g.sel = null;
        A('ui');
      } else if (i === nTower) {
        g.pulseMode = !g.pulseMode;
        g.selCard = null;
        g.sel = null;
        if (g.pulseMode) G.Game.toast('点击战场释放共振脉冲');
        A('ui');
      } else {
        G.Game.castEcho();
      }
      return;
    }

    // 3) 顶部开波按钮
    if (g.state === 'prep' && inRect(x, y, LAY.waveBtn)) { G.Game.startWave(true); return; }

    // 4) 棋盘
    if (x >= LAY.boardX && x <= LAY.boardX + LAY.boardW &&
      y >= LAY.boardY && y <= LAY.boardY + LAY.boardH) {
      var col = Math.floor((x - LAY.boardX) / CELL);
      var row = Math.floor((y - LAY.boardY) / CELL);

      if (g.pulseMode) {
        G.Game.castPulse(CFG.BX + (col + 0.5) * CELL, LAY.boardY + (row + 0.5) * CELL);
        g.pulseMode = false;
        return;
      }
      var hit = null;
      for (var j = 0; j < g.towers.length; j++) {
        var t = g.towers[j];
        if (t.col === col && t.row === row) { hit = t; break; }
      }
      if (hit) { g.sel = hit; g.selCard = null; A('select'); return; }
      if (g.selCard) { G.Game.tryBuild(col, row); return; }
      g.sel = null;
      return;
    }

    g.sel = null;
  };

  /* ------------------------------------------------------------------ */
  /*  整屏版式：设置页 / 玩法页                                            */
  /* ------------------------------------------------------------------ */
  /** 打开设置或玩法页，记住来处，返回时回到原状态 */
  G.Game.openPage = function (name) {
    game.prevState = game.state;
    game.state = name;
    game.sel = null;
    game.selCard = null;
    game.pulseMode = false;
  };

  G.Game.closePage = function () {
    var back = game.prevState || 'menu';
    // 只有从这几个状态进来才回得去，其余的（比如中途被打断）一律回菜单
    if (back !== 'menu' && back !== 'over' && back !== 'win') back = 'menu';
    game.state = back;
    game.toastT = 0;
  };

  /**
   * 设置页与玩法页上的点击。
   * 设置项一律走 G.Settings.set —— 它负责「存储 + 立即生效 + 字号改变后重排」，
   * 不在这里直接改 CFG / Audio，免得出现「改了但没重排」这种最难查的错位。
   */
  G.Game.onPageTap = function (x, y) {
    var i;

    if (game.state === 'help') {
      if (inRect(x, y, G.UI.helpBack())) { A('ui'); G.Game.closePage(); }
      return;
    }

    // —— 返回 ——
    if (inRect(x, y, G.UI.setBack())) { A('ui'); G.Game.closePage(); return; }

    // —— 字体档位：小 / 中 / 大 ——
    var fb = G.UI.setFontBtns();
    for (i = 0; i < fb.length; i++) {
      if (!inRect(x, y, fb[i])) continue;
      if (CFG.FONT_LEVEL === i) { A('ui'); return; }
      // 切档位会重排整屏（neededH 变了），所以先记档位再提示
      G.Settings.set('fontLevel', i);
      G.Game.toast('字体大小：' + CFG.FONT_LEVELS[i].name);
      A('ui');
      return;
    }

    // —— 音效开关 ——
    if (inRect(x, y, G.UI.setToggle(1))) {
      A('ui');                                  // 开的时候先出声，关的时候最后一声
      var m = G.Audio ? G.Audio.toggleMute() : false;
      G.Game.toast(m ? '音效已关闭' : '音效已开启');
      return;
    }

    // —— 震动开关：打开时立刻震一下，用户才知道有没有生效 ——
    if (inRect(x, y, G.UI.setToggle(3))) {
      G.Settings.set('vibrate', !G.Settings.get('vibrate'));
      var on = G.Settings.get('vibrate');
      A('ui');
      R.buzz('medium');
      G.Game.toast(on ? '震动已开启' : '震动已关闭');
      return;
    }

    // —— 音量：− / ＋ 步进，轨道点哪算哪 ——
    if (inRect(x, y, G.UI.volMinus())) { G.Settings.set('volume', G.Settings.get('volume') - 0.1); A('ui'); return; }
    if (inRect(x, y, G.UI.volPlus())) { G.Settings.set('volume', G.Settings.get('volume') + 0.1); A('ui'); return; }
    var tr = G.UI.volTrack();
    if (inRect(x, y, tr)) {
      G.Settings.set('volume', (x - G.UI.volInner().x) / G.UI.volInner().w);
      A('ui');
      return;
    }
  };

  /* ------------------------------------------------------------------ */
  /*  图鉴：首页入口进来的整屏页                                          */
  /* ------------------------------------------------------------------ */
  G.Game.openCodex = function () {
    game.prevState = game.state;
    game.state = 'codex';
    game.codexSel = null;
    game.sel = null;
    game.selCard = null;
    game.pulseMode = false;
    game.toastT = 0;
  };

  G.Game.closeCodex = function () {
    // 图鉴只从菜单进，所以返回一律回菜单（不沿用 closePage 的白名单，
    // 那条白名单是为「结算页里能进设置」这类路径准备的）
    game.state = 'menu';
    game.codexSel = null;
    game.toastT = 0;
  };

  /**
   * 图鉴页与「首次遭遇」弹窗上的点击。
   * 几何一律取自 G.UI.codex* / G.UI.pop*，与渲染同源，不在这里重算坐标。
   */
  G.Game.onCodexTap = function (x, y) {
    var g = game;

    // —— 弹窗：整块只有一个「继续」 ——
    if (g.state === 'pop') {
      if (inRect(x, y, G.UI.popOk())) G.Game.closePop();
      return;
    }

    // —— 图鉴：先页头返回，再 Tab，再（详情里的）返回列表，最后才是格子 ——
    if (inRect(x, y, G.UI.codexBack())) { A('ui'); G.Game.closeCodex(); return; }

    var tabs = G.UI.codexTabs();
    for (var i = 0; i < tabs.length; i++) {
      if (!inRect(x, y, tabs[i])) continue;
      if (g.codexTab !== i) { g.codexTab = i; g.codexSel = null; A('ui'); }
      return;
    }

    if (g.codexSel) {
      if (inRect(x, y, G.UI.codexDetailBack())) { A('ui'); g.codexSel = null; }
      return;
    }

    var keys = (g.codexTab === 0) ? G.Codex.enemyKeys() : G.Codex.towerKeys();
    for (var k = 0; k < keys.length; k++) {
      if (!inRect(x, y, G.UI.codexCell(k))) continue;
      // 没遭遇过的怪不给点开：点进去也只有三个问号，属于无效操作
      if (g.codexTab === 0 && !G.Codex.isSeen(keys[k])) { A('deny'); return; }
      g.codexSel = keys[k];
      A('select');
      return;
    }
  };

  /* ------------------------------------------------------------------ */
  /*  首次遭遇：暂停 + 弹窗                                               */
  /* ------------------------------------------------------------------ */
  /**
   * 刷怪处调它。返回 true = 这是第一次遇到这只怪。
   * 只负责「记一笔 + 入队」，真正的弹窗在主循环末尾统一开 ——
   * 刷怪是在 while 循环里发生的，在那儿直接切状态会把一帧切成两半。
   */
  G.Game.queueCodex = function (key) {
    if (!G.Codex) return false;
    if (!G.Codex.markSeen(key)) return false;
    if (game.codexQueue.indexOf(key) < 0) game.codexQueue.push(key);
    return true;
  };

  /** 弹出队首的新怪。已暂停时不再进来（靠 popKey 兜底）。 */
  G.Game.openPop = function () {
    if (game.popKey) return;
    var key = game.codexQueue.shift();
    if (!key || !CFG.ENEMIES[key]) return;
    // 记住暂停在哪：只有第一次开弹窗时记（排队的第二只不能覆盖成 'pop'）
    if (game.state === 'prep' || game.state === 'wave') game.prevState = game.state;
    game.state = 'pop';
    game.popKey = key;
    game.sel = null;
    game.selCard = null;
    game.pulseMode = false;
    game.toastT = 0;
    game.bannerT = 0;
    A('waveStart');       // 复用低频轰鸣：新东西来了，不新增音色（音频自检按音色数断言）
    R.buzz('medium');
  };

  /** 关掉弹窗：队列里还有就接着弹下一个，否则回到进来时的战斗状态继续。 */
  G.Game.closePop = function () {
    A('ui');
    game.popKey = null;
    if (game.codexQueue.length) { G.Game.openPop(); return; }
    var back = game.prevState;
    if (back !== 'prep' && back !== 'wave') back = 'prep';
    game.state = back;
  };

  G.Game.beginGameLoop = function () {
    var last = 0;
    var step = function (ts) {
      if (!ts) ts = 0;
      if (!last) last = ts;
      var dt = (ts - last) / 1000;
      last = ts;
      if (dt > 0.06) dt = 0.06;
      if (dt < 0) dt = 0;

      // 顿帧：只在重击/漏怪/倒带时触发极短的一下，手感立刻变实
      // 放在这里而不是 update 里，是为了让无头模拟的固定步长完全不受影响
      if (game.hitStop > 0) {
        game.hitStop = Math.max(0, game.hitStop - dt);
        dt *= 0.22;
      }

      G.Game.update(dt);
      G.Render.draw(game);
      R.raf(step);
    };
    R.raf(step);
  };

  G.Game.boot = function () {
    R.init();
    G.Game.reset();
    G.UI.init();
    R.bindInput();
    R.onPointer({
      down: function (x, y) { G.Game.onTap(x, y); },
      move: function () { },
      up: function () { }
    });
    G.Game.beginGameLoop();
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
