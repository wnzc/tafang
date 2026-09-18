/**
 * codex.js —— 图鉴：档案文案 / 解锁记录 / 元素反应查询
 *
 * 为什么单独一个模块：
 *   图鉴要「文案 + 数值」两样东西。**数值一律现读 CFG**（ENEMIES / TOWERS /
 *   RES.reactions），所以改了平衡数值，图鉴里显示的就是新值，不会出现
 *   「图鉴写 46、实际打 58」这种最容易骗过自己的脱节。
 *   只有「定位、特性」这类描述文字写在本文件的表里。
 *
 * 解锁记录（哪个怪已经出现过）：
 *   存储键 echo_seen，存已遭遇过的怪物 key 数组。
 *   第一次遭遇 → markSeen 返回 true → 战斗暂停 + 弹窗（见 main.js 的 queueCodex）。
 *   读回来按 CFG.ENEMIES 过滤一遍：改过名字或删过怪的旧存档会留下幽灵条目，
 *   不过滤的话图鉴会多出一格「???」永远解不开。
 *
 * 与 monsters.js / icons.js 的分工：
 *   形象在 monsters.js（矢量画），元素图标在 icons.js（原神官方路径），
 *   本模块只管「这些条目各自的文字与数值怎么组织」，一行绘制代码也没有 ——
 *   所以 tools/layout-check.js 能在 Node 里直接把文案量一遍宽度。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG;
  if (!CFG) return;                    // config.js 没加载时静默跳过（顺序错了另有自检兜底）

  var C = G.Codex = {};
  var SKEY = 'echo_seen';

  /* ------------------------------------------------------------------ */
  /*  1) 解锁记录                                                        */
  /* ------------------------------------------------------------------ */
  var seen = {};
  var loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    try {
      var arr = G.Runtime && G.Runtime.store ? G.Runtime.store.get(SKEY, []) : [];
      if (Object.prototype.toString.call(arr) !== '[object Array]') arr = [];
      for (var i = 0; i < arr.length; i++) {
        if (CFG.ENEMIES[arr[i]]) seen[arr[i]] = true;
      }
    } catch (e) { /* 存储不可用：当全新档处理 */ }
  }

  function persist() {
    var arr = [], k;
    for (k in seen) if (seen.hasOwnProperty(k)) arr.push(k);
    try { if (G.Runtime && G.Runtime.store) G.Runtime.store.set(SKEY, arr); } catch (e) { /* ignore */ }
  }

  C.isSeen = function (key) { load(); return !!seen[key]; };

  /** 标记为已遭遇。返回 true = 这次是新解锁（调用方据此决定是否暂停 + 弹窗）。 */
  C.markSeen = function (key) {
    load();
    if (!key || !CFG.ENEMIES[key] || seen[key]) return false;
    seen[key] = true;
    persist();
    return true;
  };

  /**
   * 一次性解锁全部（自检用：让模拟器跑「老玩家」路径，不被弹窗打断）。
   * **刻意不写存储** —— 它只是给本次会话铺路，不该动用户的真实记录。
   */
  C.markAllSeen = function () {
    load();
    for (var k in CFG.ENEMIES) if (CFG.ENEMIES.hasOwnProperty(k)) seen[k] = true;
  };

  /** 清空记录（自检用：验「全新档」路径） */
  C.reset = function () {
    seen = {}; loaded = true; persist();
  };

  C.seenCount = function () {
    load();
    var n = 0, k;
    for (k in seen) if (seen.hasOwnProperty(k)) n++;
    return n;
  };

  /* ------------------------------------------------------------------ */
  /*  2) 档案文案                                                        */
  /*  role 是定位标签（格子与详情页都显示），tag 一句话概括，             */
  /*  lines 是详情页的「特性」——每行控制在 20 个汉字以内，               */
  /*  超了 layout-check 的「图鉴文字不越右边框」会直接报出来。            */
  /* ------------------------------------------------------------------ */
  var ENEMY = {
    drifter: {
      role: '基础单位',
      tag: '成群涌来，用数量拖住火力',
      lines: [
        '血少速慢，单只不足为惧，胜在数量',
        '靠它拉长战线，逼你把塔摆在关键岔口'
      ]
    },
    sprinter: {
      role: '快速突进',
      tag: '跑得最快，血最薄',
      lines: [
        '沿最短路径直插核心，最容易漏在后面',
        '减速波与定身对它收益最大'
      ]
    },
    bulwark: {
      role: '重装',
      tag: '高护甲高血量，无视小伤害',
      lines: [
        '护甲 6：低于这个数的伤害会被压到 1 点',
        '重击型（磐岩）比连射型（掣雷）划算得多'
      ]
    },
    sunder: {
      role: '拆塔',
      tag: '不打核心，专杀你的迷宫',
      lines: [
        '靠近塔就停下啃咬，塔有血量、会被啃掉',
        '结晶护盾期间啃不动 —— 岩 + 任意元素反应'
      ]
    },
    phaser: {
      role: '穿墙',
      tag: '周期进入相位，无视塔墙直穿',
      lines: [
        '相位期间忽略塔的阻挡，绕路策略对它失效',
        '相位结束才回到常规寻路，抓住间歇打'
      ]
    },
    boss: {
      role: '首领',
      tag: '第 5 / 10 / 15 / 20 波出现',
      lines: [
        '靠近时压制半径内的塔，让它们脱离共振网络',
        '血量极高，只有堆满元素反应才打得动'
      ]
    }
  };

  var TOWER = {
    pyro: {
      role: '单体直射',
      lines: [
        '高速弹道锁定最靠前的敌人',
        '单体最稳，配上蒸发 / 超载就能打爆发'
      ]
    },
    hydro: {
      role: '范围减速',
      lines: [
        '命中点炸开减速域，敌人移速 −40%',
        '自身伤害不高，价值在给全队创造输出窗口'
      ]
    },
    dendro: {
      role: '持续伤害',
      lines: [
        '落孢成毒域，附加灼烧持续掉血',
        '无视护甲，专治高护甲的装甲体'
      ]
    },
    anemo: {
      role: '推开',
      lines: [
        '龙卷把敌人沿行进反方向推回去',
        '纯粹的「用时间换伤害」，怪越密越有效'
      ]
    },
    /* 凝霜（冰）已下线，档案留档：解注 CFG.TOWERS.cryo 与 TOWER_ORDER 后，
     * 它出现在卡片栏的同时也会出现在图鉴里（列表遍历 TOWER_ORDER，不是这张表）。 */
    cryo: {
      role: '减速冻结',
      lines: [
        '减速更强的范围波，并有概率冻结定身',
        '和水塔同型，定位重叠 —— 当前下线留档'
      ]
    },
    electro: {
      role: '连锁闪电',
      lines: [
        '一次开火在 3 个目标之间跳',
        '怪越密越强，打成群游荡体最优'
      ]
    },
    geo: {
      role: '重击定身',
      lines: [
        '单发最高伤害，附带短定身',
        '出手慢，要配减速或定身才打得满'
      ]
    }
  };

  /* ------------------------------------------------------------------ */
  /*  3) 元素反应查询                                                    */
  /* ------------------------------------------------------------------ */
  /* 反应的显示顺序。同名的（扩散 / 结晶 / 湍流）内部再按元素表顺序排，
   * 所以同一个元素每次进图鉴看到的顺序都一样。 */
  var REACT_ORDER = ['蒸发', '融化', '超载', '感电', '超导', '冻结',
    '扩散', '湍流', '结晶', '绽放', '激化', '燃烧'];

  /** 把反应参数翻成一句人话。数值全部现取，改平衡即改文案。 */
  function effectText(d) {
    var k = d.kind;
    if (k === 'burst') return d.radius + ' 范围 ' + d.dmg + ' 伤害' + (d.push ? ' + 击退' : '');
    if (k === 'overload') return d.radius + ' 范围 ' + d.dmg + ' · 电弧跳 ' + d.jumps + ' 次';
    if (k === 'echain') return d.radius + ' 内闪电链 · ' + d.jumps + ' 跳每次 ' + d.dmg;
    if (k === 'super') return d.radius + ' 范围 ' + d.dmg + ' · 易伤 +' +
      Math.round(d.extra * 100) + '% ' + d.dur + 's';
    if (k === 'freeze') return d.radius + ' 范围定身 ' + d.dur + 's';
    if (k === 'swirl') return d.radius + ' 范围 ' + d.dmg + ' 伤害 · 击退 ' + d.push;
    if (k === 'crystal') return '邻塔 ' + d.dur + 's 结晶盾 · 免疫啃咬';
    if (k === 'bloom') return d.radius + ' 范围 ' + d.dmg + ' 二段伤害';
    if (k === 'quicken') return '邻塔伤害 +' + Math.round(d.bonus * 100) + '% 持续 ' + d.dur + 's';
    if (k === 'burn') return d.radius + ' 范围每秒 ' + d.dps + '，持续 ' + d.dur + 's';
    return '';
  }
  C.effectText = effectText;

  function elemRank(e) {
    var i = 0, k;
    for (k in CFG.ELEM) {
      if (CFG.ELEM.hasOwnProperty(k)) {
        if (k === e) return i;
        i++;
      }
    }
    return 99;
  }

  /**
   * 某元素参与的全部反应。返回：
   *   { key, name, effect, color, otherElem, otherName, otherTower, otherTowerName, active }
   * active = 对手元素当前有上场塔（即这条反应真的打得出来）。
   * 冰塔下线期间，「融化 / 超导 / 冻结」三条会显示为未触发 —— 这是实情，不该藏。
   */
  C.reactionsOf = function (elem) {
    var out = [];
    var all = CFG.RES && CFG.RES.reactions;
    if (!all || !CFG.ELEM[elem]) return out;
    for (var key in all) {
      if (!all.hasOwnProperty(key)) continue;
      var parts = key.split('|');
      if (parts.length !== 2) continue;
      var other = parts[0] === elem ? parts[1] : (parts[1] === elem ? parts[0] : null);
      if (!other) continue;
      var def = all[key];
      var otherElem = CFG.ELEM[other];
      var tk = null, k2;
      for (k2 = 0; k2 < CFG.TOWER_ORDER.length; k2++) {
        if (CFG.TOWERS[CFG.TOWER_ORDER[k2]].elem === other) { tk = CFG.TOWER_ORDER[k2]; break; }
      }
      out.push({
        key: key,
        name: def.name,
        effect: effectText(def),
        color: def.color,
        otherElem: other,
        otherName: otherElem ? otherElem.name : other,
        otherTower: tk,
        otherTowerName: tk ? CFG.TOWERS[tk].name : '',
        active: !!tk
      });
    }
    out.sort(function (a, b) {
      var ia = REACT_ORDER.indexOf(a.name), ib = REACT_ORDER.indexOf(b.name);
      if (ia < 0) ia = REACT_ORDER.length;
      if (ib < 0) ib = REACT_ORDER.length;
      if (ia !== ib) return ia - ib;
      return elemRank(a.otherElem) - elemRank(b.otherElem);
    });
    return out;
  };

  /* ------------------------------------------------------------------ */
  /*  4) 条目                                                            */
  /* ------------------------------------------------------------------ */
  /** 图鉴里的怪物条目，顺序跟 CFG.ENEMIES 的声明顺序一致 */
  C.enemyKeys = function () {
    var out = [], k;
    for (k in CFG.ENEMIES) if (CFG.ENEMIES.hasOwnProperty(k)) out.push(k);
    return out;
  };

  /** 图鉴里的炮台条目：只列上场塔（冰塔留档期间不出现，解注即回来） */
  C.towerKeys = function () { return CFG.TOWER_ORDER.slice(); };

  C.enemy = function (key) {
    var d = CFG.ENEMIES[key];
    if (!d) return null;
    var info = ENEMY[key] || { role: '', tag: '', lines: [] };
    return {
      key: key, def: d, name: d.name, color: d.color, role: info.role,
      tag: info.tag, lines: info.lines,
      hp: d.hp, speed: d.speed, armor: d.armor, reward: d.reward, dmg: d.dmg,
      boss: !!d.boss
    };
  };

  /* 攻击方式标签：与 CFG.TOWERS.kind 一一对应。写在一张表里，
   * 而不是散在渲染分支里 —— 加一种攻击方式时要改的地方越少越好。 */
  var KIND_NAME = {
    bolt: '直射弹', wave: '减速波', chain: '连锁闪电',
    gust: '龙卷推开', spike: '重击定身', spore: '落孢毒域'
  };
  C.KIND_NAME = KIND_NAME;

  C.tower = function (key) {
    var d = CFG.TOWERS[key];
    if (!d) return null;
    var info = TOWER[key] || { role: '', lines: [] };
    var el = CFG.ELEM[d.elem];
    return {
      key: key, def: d, name: d.name, elem: d.elem, role: info.role,
      lines: info.lines, cost: d.cost, hp: d.hp, dmg: d.dmg,
      range: d.range, rate: d.rate, color: el ? el.color : '#9fd8ff',
      soft: el ? el.soft : '#cdefff',
      elemName: el ? el.name : '',
      kind: KIND_NAME[d.kind] || d.kind
    };
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
