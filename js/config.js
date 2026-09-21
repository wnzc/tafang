/**
 * config.js —— 全部数值配置与布局
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG = {};

  /* ---------------- 棋盘 ---------------- */
  CFG.CELL = 64;
  CFG.COLS = 10;
  CFG.ROWS = 13;
  CFG.BX = 40;                       // 棋盘左上角 x
  CFG.TOP_Y = 268;                   // HUD 区高度
  CFG.BOARD_H = CFG.ROWS * CFG.CELL; // 832
  /* 底部建造栏的高度不在这里定：它由卡片的两行版式算出来（见 buildLayout），
   * 改卡片行数/高度时只需动那一处。 */
  CFG.BOARD_W = CFG.COLS * CFG.CELL;

  /** 核心占据的格子（终点） */
  CFG.CORE_CELLS = [[4, 12], [5, 12]];
  /** 敌人出生列（第 -1 行） */
  CFG.SPAWN_COLS = [0, 9];

  /* ---------------- 基础数值 ---------------- */
  CFG.START_ENERGY = 320;            // 起手能量（爽游：开局多铺一座 AOE 塔，割草更顺）
  CFG.CORE_HP = 100;
  CFG.PREP_TIME = 9;                 // 备战倒计时（爽游档收紧，连着打节奏更顺）
  CFG.PREP_BONUS = 3;                // 提前开波，每秒奖励能量
  CFG.TOTAL_WAVES = 20;
  CFG.SELL_RATIO = 0.7;
  CFG.EARLY_WAVE_BONUS = 25;
  CFG.MAX_LEVEL = 5;

  /* ---------------- 元素（七元素，本作自成一体的反应规则） ----------------
   * 火pyro / 水hydro / 冰cryo / 雷electro / 风anemo / 岩geo / 草dendro
   * color 是元素主色（保在夜色底上可读），soft 是高亮/描边用浅色。
   * 七个元素全部保留：cryo 当前没有上场塔（凝霜暂下线），但配色、图标、反应条目
   * 全部留档 —— 少一个元素就少 6 条反应，删掉再想加回来代价太大。
   */
  CFG.ELEM = {
    pyro:    { key: 'pyro',    name: '火', color: '#ef7938', soft: '#ffc08a' },
    hydro:   { key: 'hydro',   name: '水', color: '#4cc2f1', soft: '#a8e6ff' },
    cryo:    { key: 'cryo',    name: '冰', color: '#7ad3e6', soft: '#d0f4ff' },
    electro: { key: 'electro', name: '雷', color: '#a77ffa', soft: '#dcc8ff' },
    anemo:   { key: 'anemo',   name: '风', color: '#33ccb3', soft: '#8af2e0' },
    geo:     { key: 'geo',     name: '岩', color: '#fabb57', soft: '#ffe0a8' },
    dendro:  { key: 'dendro',  name: '草', color: '#a5ec25', soft: '#dcff96' }
  };

  /* ---------------- 防御塔（上场 6 座，攻击方式各有分工） ----------------
   * bolt   直射弹（火）           wave  范围减速波（水；冰同型，见下方留档块）
   * chain  连锁闪电（雷）         gust  龙卷推开（风）
   * spike  重击单体（岩）         spore 落孢毒域（草，持续伤害）
   */
  CFG.TOWERS = {
    pyro: {
      key: 'pyro', name: '炎爆', elem: 'pyro', cost: 60, hp: 260,
      dmg: 17, range: 152, rate: 1.15,
      kind: 'bolt', bspeed: 460, blife: 1.6
    },
    hydro: {
      key: 'hydro', name: '澄流', elem: 'hydro', cost: 65, hp: 260,
      dmg: 9, range: 168, rate: 0.95,
      kind: 'wave', aoe: 56, slow: 0.30, slowT: 1.4
    },
    dendro: {
      key: 'dendro', name: '青蔓', elem: 'dendro', cost: 75, hp: 250,
      dmg: 11, range: 150, rate: 0.62,
      kind: 'spore', aoe: 52, burnDps: 14, burnT: 3.2
    },
    anemo: {
      key: 'anemo', name: '流风', elem: 'anemo', cost: 80, hp: 240,
      /* 流风原来的索敌距离与风场都太大：隔着半张棋盘就能持续把怪推回去。
       * 两段范围同步减半，保留近身控场的身份但不再覆盖整条路线。 */
      dmg: 7, range: 69, rate: 0.80,
      kind: 'gust', aoe: 48, push: 18
    },
    /* ——— 凝霜（冰）：成长系统「回响档案」解锁后重新上架 ———
     * 曾因与水塔同为 kind:'wave'（范围减速波）、定位重叠而下线留档；
     * 现在做成 1300 回响点的解锁奖励回归 —— 它是三条解锁线里唯一
     * 「解锁后多加一座塔」的，也是最省的一条：元素配色、5 条 cryo 反应、
     * 图标、音效（shootFrost）、冻结概率分支全部留档至今，解注即生效。
     * 上架与否不在这里管 —— CFG.TOWER_ORDER 才是「当前上架表」，
     * 由 js/profile.js 按存档改写（见下方 TOWER_ORDER_ALL）。 */
    cryo: {
      key: 'cryo', name: '凝霜', elem: 'cryo', cost: 85, hp: 260,
      dmg: 10, range: 164, rate: 0.85,
      kind: 'wave', aoe: 58, slow: 0.50, slowT: 2.0, freezeChance: 0.22, freezeT: 1.1
    },
    electro: {
      key: 'electro', name: '掣雷', elem: 'electro', cost: 90, hp: 240,
      dmg: 24, range: 192, rate: 0.70,
      kind: 'chain', chain: 3, chainRange: 132
    },
    geo: {
      key: 'geo', name: '磐岩', elem: 'geo', cost: 100, hp: 340,
      dmg: 52, range: 148, rate: 0.42,
      kind: 'spike', stun: 0.45
    }
  };
  /* —— 塔的两层表：完整表 / 当前上架表 ——
   * TOWER_ORDER_ALL 是全部 7 座（含凝霜）的固定顺序，只当「可选集合」用。
   * TOWER_ORDER 是**当前上架**的那份：卡片、建造、图鉴、版式计算全部读它；
   * 默认 6 座（凝霜未解锁），js/profile.js 载入时按 echo_profile 改写。
   * 这样「凝霜要不要出现在建造栏」不必在渲染 / 输入 / 布局三处各判一次 ——
   * 所有代码照旧读 CFG.TOWER_ORDER，增删只有 profile 一处负责。
   * 解锁后要触发一次 runtime 重排（卡片数变了，建造栏高度/卡宽都得重算）。 */
  CFG.TOWER_ORDER_ALL = ['pyro', 'hydro', 'dendro', 'anemo', 'cryo', 'electro', 'geo'];
  CFG.TOWER_ORDER = ['pyro', 'hydro', 'dendro', 'anemo', 'electro', 'geo'];

  /** 等级成长 */
  CFG.LV = {
    dmg: 0.32,     // 每级 +32% 伤害
    range: 0.06,
    rate: 0.12,
    hp: 0.35
  };
  /** 升级花费 = 基础价 * UP_COST * 当前等级 */
  CFG.UP_COST = 0.85;

  /* ---------------- 共振 ---------------- */
  CFG.RES = {
    // 同元素成链：链长 n 的增益
    chainDmg: 0.16,
    chainRate: 0.08,
    chainCap: 7,
    // 异元素相邻触发反应（key 按字母序拼接）：
    //   蒸发(火+水) 融化(火+冰) 超载(火+雷) 感电(水+雷) 超导(冰+雷)
    //   冻结(水+冰) 扩散(风+X)  结晶(岩+X)  绽放(草+水) 激化(草+雷) 燃烧(草+火)
    // kind 决定触发表现（见 resonance.js trigger），cd 是反应节点的周期
    /* 所有反应伤害一律**无视护甲**（见 main.js 的 damageEnemy opts.pierce）：
     * 这是高护甲怪唯一的解法，也是「第 5 波那只 Boss 怎么打」的答案。
     * 所以反应的数值不需要跟塔的单发伤害比大小 —— 它的价值在穿透与范围。 */
    reactions: {
      'hydro|pyro': {        // 蒸发：白热汽爆，伤害翻倍感
        name: '蒸发', cd: 2.4, radius: 76, dmg: 46, push: 20,
        color: '#ffd08a', kind: 'burst'
      },
      'cryo|pyro': {         // 融化：全表最高单发伤害
        name: '融化', cd: 2.6, radius: 68, dmg: 58, push: 14,
        color: '#ffb37a', kind: 'burst'
      },
      'pyro|electro': {      // 超载：爆炸 + 电弧跳射
        name: '超载', cd: 2.8, radius: 118, dmg: 26, jumps: 4,
        color: '#ff7bd0', kind: 'overload'
      },
      'electro|hydro': {     // 感电：连锁闪电在怪群之间跳跃
        name: '感电', cd: 2.4, radius: 128, dmg: 16, jumps: 5,
        color: '#b7a3ff', kind: 'echain'
      },
      'cryo|electro': {      // 超导：减防易伤 + 冰霜范围
        name: '超导', cd: 2.4, radius: 92, dmg: 9, dur: 2.6, extra: 0.25,
        color: '#8de8ff', kind: 'super'
      },
      'cryo|hydro': {        // 冻结：范围定身
        name: '冻结', cd: 3.0, radius: 84, dmg: 8, dur: 1.2,
        color: '#a8ecff', kind: 'freeze'
      },
      /* —— 扩散：风把对方的元素扯出去，小伤害 + 击退 ——
       * push 的单位是「总共后退多少像素」，由 enemies.js 的击退速度场分帧走完
       * （不是瞬间位移，见 E.push 的注释）。
       * cd 从 2.0 拉到 3.2：风 + 减速同时压在怪身上时，2 秒一次击退会把怪
       * 顶在同一个位置上反复横跳（退一点、被减速慢慢挪回来、再退），
       * 看起来就是一卡一卡。周期拉长后节奏变成「推一段 → 慢慢走回来」。
       * push 46 → 34 同理：退得太远，减速期间根本走不回来，
       * 等于把怪永久钉在原地，反而看不出风在起作用。 */
      'anemo|pyro':  { name: '扩散', cd: 3.2, radius: 104, dmg: 14, push: 22, color: '#8af2e0', kind: 'swirl' },
      'anemo|hydro': { name: '扩散', cd: 3.2, radius: 104, dmg: 14, push: 22, color: '#8af2e0', kind: 'swirl' },
      'anemo|cryo':  { name: '扩散', cd: 3.2, radius: 104, dmg: 14, push: 22, color: '#8af2e0', kind: 'swirl' },
      'anemo|electro': { name: '扩散', cd: 3.2, radius: 104, dmg: 14, push: 22, color: '#8af2e0', kind: 'swirl' },
      'anemo|dendro': { name: '扩散', cd: 3.2, radius: 104, dmg: 14, push: 22, color: '#8af2e0', kind: 'swirl' },
      'anemo|geo':   { name: '湍流', cd: 3.4, radius: 96, dmg: 12, push: 26, color: '#a8ecd8', kind: 'swirl' },
      // —— 结晶：给邻塔上护盾，短时间内免疫啃咬 ——
      'geo|hydro':   { name: '结晶', cd: 4.0, radius: 110, dur: 5.0, color: '#ffe0a8', kind: 'crystal' },
      'geo|pyro':    { name: '结晶', cd: 4.0, radius: 110, dur: 5.0, color: '#ffe0a8', kind: 'crystal' },
      'geo|cryo':    { name: '结晶', cd: 4.0, radius: 110, dur: 5.0, color: '#ffe0a8', kind: 'crystal' },
      'geo|electro': { name: '结晶', cd: 4.0, radius: 110, dur: 5.0, color: '#ffe0a8', kind: 'crystal' },
      'geo|dendro':  { name: '结晶', cd: 4.0, radius: 110, dur: 5.0, color: '#ffe0a8', kind: 'crystal' },
      'dendro|hydro': {      // 绽放：草原核炸开，二段伤害
        name: '绽放', cd: 2.8, radius: 96, dmg: 40,
        color: '#b8f04c', kind: 'bloom'
      },
      'dendro|electro': {    // 激化：邻塔伤害临时提升
        name: '激化', cd: 3.4, radius: 118, dmg: 10, dur: 4.0, bonus: 0.30,
        color: '#d6ff7a', kind: 'quicken'
      },
      'dendro|pyro': {       // 燃烧：范围内敌人持续掉血
        name: '燃烧', cd: 2.6, radius: 82, dps: 26, dur: 2.6,
        color: '#ffb347', kind: 'burn'
      }
    }
  };

  /* ---------------- 成长系统：回响档案（局外） ----------------
   * 设计原则一句话：**只解锁内容，不买数值。**
   *
   * 为什么不给永久数值加成 —— 本作的难度是「阈值型」的，不是渐变的：
   * 血量成长曲线的斜率从 0.245 抬到 0.26，理想 AI 就会从「通关剩 11 血」
   * 直接变成「第 20 波核心归零」。也就是说任何超过约 3% 的永久输出提升
   * 都会把 20 波曲线打塌 —— 「永久 +10% 塔伤」这种常见做法在这里等于删掉难度。
   * 所以回响点只换「新东西」：突变池扩容 / 凝霜回归 / 深渊档。
   * （这也是 roguelike 与永久成长的经典解法：解锁广度，不买深度。）
   *
   * 结算公式（每局结束，**失败也给点** —— roguelike 最劝退的就是「打不过＝一无所获」）：
   *   回响点 = 波次 × 12 + ⌊击杀 ÷ 8⌋ − 漏怪 × 15 + (通关 ? 200 : 0)
   *   通关满 20 波约 665 点，打到第 10 波崩掉约 135 点。
   *
   * 门槛是**累计制**，不是消费制：点数只累计、到达门槛自动解锁，玩家不需要
   * 决定「花在哪」—— 省掉一整个商店 UI，也没有点错浪费的懊恼。
   * 三条线的门槛合计约 6~8 局全解锁，数值待真实手感校准。
   * 存档键 echo_profile，读写见 js/profile.js。 */
  CFG.ECHO_POINT = {
    perWave: 12,
    perKillDiv: 8,
    leakPenalty: 15,
    winBonus: 200
  };

  /** 解锁线。每条 { key, name, desc, color, tiers:[{at,label}] }，
   *  at 是累计回响点门槛（0 = 起始就有）、label 是展示文案。
   *  顺序即展示顺序，渲染与自检都遍历这一张表。 */
  CFG.UNLOCKS = [
    {
      key: 'muts', name: '地脉谱系', color: '#a77ffa',
      desc: '每波随机的地脉突变池扩容',
      /* counts 与 tiers 一一对应：第 i 档达成时突变池放几条。
       * 用显式映射而不是「基础 + 档位 × 2」那种公式 —— 以后想改成
       * 4 / 6 / 7 条这种不对称的节奏，只改这一行；标签也各写各的。 */
      counts: [4, 6, 8],
      tiers: [
        { at: 0, label: '4 条' },
        { at: 1000, label: '6 条' },
        { at: 3000, label: '8 条' }
      ]
    },
    {
      key: 'cryo', name: '凝霜回归', color: '#7ad3e6',
      desc: '冰塔「凝霜」重新上架建造栏',
      tiers: [{ at: 1300, label: '上架' }]
    },
    {
      key: 'deep', name: '深渊', color: '#ff4d6d',
      desc: '敌人血量 ×1.35，独立最高分',
      tiers: [{ at: 3800, label: '开启' }]
    }
  ];

  /** 地脉突变的**起始**条数。CFG.MUTATIONS 共 8 条，其余靠「地脉谱系」逐档解锁，
   *  开局只放前 4 条 —— 让前几局的随机性可控一点，解锁后再往「更混沌」放开。
   *  注意这里只截前 N 条，不是随机选：保证起始池是固定的一组、可预期。 */
  CFG.MUT_BASE = 4;

  /** 深渊档：解锁后可在档案页开启。血量在常规波次血线之上再乘一层，
   *  击杀收益略增作为补偿；最高分单独记在 echo_profile 的 deepBest 字段里，
   *  不与常规榜（echo_best）混。 */
  CFG.DEEP = {
    hpMul: 1.35,
    rewardMul: 1.15
  };

  /* ---------------- 表现层 ---------------- */
  CFG.VIS = {
    bulletTrail: 0.20,      // 子弹拖尾斑寿命
    trailRate: 0.022,       // 拖尾生成间隔（秒）
    towerCoolRing: true,    // 塔的冷却环
    linkFlow: 0.9,          // 共振链上的流光速度
    hitText: true,          // 命中飘伤害数字（仅高伤害）
    hitTextMin: 26,
    muzzleLen: 24,
    /* 元素反应名挂在怪身上能亮多久（秒）。反应节点 2~3 秒触发一次，
     * 标签比这短才好看出「这一下是新打上的」；太长会几只怪挂着同一串名字。 */
    reactTagT: 1.15
  };

  /* ---------------- 敌人 ----------------
   * 这里只管数值与配色；**形象不在这里** —— 每只怪的矢量形象与动画
   * 在 js/monsters.js（按 key 对应），所以加怪要动两个文件。
   * color 是这只怪的「主色」，形象的主色、光晕、血条都取自它。
   *
   * armor 是**平砍减伤**（伤害先减 armor，最低压到 1 点），所以它专门
   * 惩罚低伤高频的塔（水的减速波、风的龙卷）。两条出口：
   *   · 重击型（磐岩 52）本来就吃得下；
   *   · **元素反应与持续伤害无视护甲** —— 这是打高甲怪的正解。
   * armor 不能往上抬：抬到 10 就意味着 17 伤害的火塔只剩 7，
   * 第 5 波那只 Boss 会从「难打」直接变成「打不动」（实测过一轮）。
   */
  /* 形象「画出来」的实际外扩上限，单位是 r 的倍数（r = 身体半径）。
   * 数值不是估的：tools/layout-check.js 用记账 ctx 把每只怪在十二个时刻
   * 全画一遍算包围盒，取最大值。弹窗的纵向排布要靠它 —— 脑袋/耳朵/犄角
   * 会顶出身体半径之外（最高的游荡体到 1.44r），按 1.0r 排会把定位标签压住。
   * 改动形象若超出这个值，layout-check 会直接报「形象超出登记外扩」。 */
  CFG.MON_EXTENT = { up: 1.44, down: 1.31, side: 1.36 };

  CFG.ENEMIES = {
    drifter: {
      key: 'drifter', name: '游荡体', hp: 48, speed: 58, r: 13,
      reward: 6, dmg: 1, armor: 0, color: '#6ee7ff'
    },
    sprinter: {
      key: 'sprinter', name: '疾行体', hp: 32, speed: 120, r: 11,
      reward: 7, dmg: 1, armor: 0, color: '#ffe066'
    },
    bulwark: {
      key: 'bulwark', name: '装甲体', hp: 150, speed: 38, r: 17,
      reward: 14, dmg: 3, armor: 4, color: '#9aa7c7'
    },
    sunder: {
      key: 'sunder', name: '破墙者', hp: 78, speed: 56, r: 15,
      reward: 13, dmg: 2, armor: 1, color: '#ff8a4c',
      towerDps: 13, towerRange: 74
    },
    phaser: {
      key: 'phaser', name: '相位体', hp: 82, speed: 70, r: 13,
      reward: 14, dmg: 2, armor: 1, color: '#c08bff',
      phaseCycle: 6.0, phaseDur: 2.2
    },
    /* Boss。三件事必须一起看：
     *   hp 560 —— 旧值 1600 配当年 hpMul 时第 5 波那只高达 4448 血，
     *     当时玩家手上只有四五座一级塔、合计不到 60 点秒伤，要打七十多秒，
     *     而它走完全程只要 25 秒 —— 结论就是「打不动」，不是难。
     *     roguelike 化整体降血后，这里从 750 再降到 560，但仍是全场的硬骨头。
     *   armor 4 —— 原来 10：火塔 17 伤害只剩 7，等于把一半的塔废掉。
     *     降到 4 之后平砍有输出，但仍然只有重击塔划算。
     *   suppress 140 —— 靠近时把半径内的塔踢出共振网络（连带关掉它的反应）。
     *     这条是「别把塔紧贴它的路摆」的原因，也是它的血量能降这么多的前提。 */
    boss: {
      key: 'boss', name: '共鸣吞噬者', hp: 560, speed: 34, r: 27,
      reward: 150, dmg: 26, armor: 4, color: '#ff4d6d',
      boss: true, suppress: 140
    },

    /* —— 以下 5 只是 roguelike 化后新增的敌种，覆盖「群 / 相 / 肉 / 拆 / 奶」五种职责 ——
     * 加怪要动三个文件：数值在这里（CFG.ENEMIES）+ 矢量形象在 js/monsters.js（按 key 对应）
     * + 图鉴文案在 js/codex.js（ENEMY 表）。漏掉第三处图鉴会留空，layout-check 会报。 */
    swarmling: {                    // 群涌体：血量极低、体型最小，靠成群压过来
      key: 'swarmling', name: '群涌体', hp: 18, speed: 76, r: 8,
      reward: 2, dmg: 1, armor: 0, color: '#7cffb0'
    },
    wraith: {                       // 虚影体：相位虚化、脆但快，擦边而过
      key: 'wraith', name: '虚影体', hp: 50, speed: 104, r: 10,
      reward: 8, dmg: 1, armor: 0, color: '#9be7ff',
      phaseCycle: 4.0, phaseDur: 1.5
    },
    titan: {                        // 巨岩体：重甲肉盾，慢到能用反应磨
      /* armor 6 → 4。原来给到全表最高（连 Boss 都只有 4）是想突出「肉盾」，
       * 但那等于重演 Boss 当年用 armor 10 把「一半的塔废掉」的老错：塔伤一被
       * 削 6 点，平砍就掉了三四成，玩家只剩元素反应一条路。降到 4 之后它的
       * 身份仍然清楚 —— 血量第一（300）、速度最慢（26）、体积最大（r 22），
       * 但不再单独把塔的平砍废掉。实测（simulate 固定种子）这一处就是
       * 「第 19 波 138 只巨岩体一波打穿」的根因。 */
      key: 'titan', name: '巨岩体', hp: 300, speed: 26, r: 22,
      reward: 22, dmg: 6, armor: 4, color: '#c9b08a'
    },
    tinker: {                       // 机巧体：强化版拆迁，啃塔更狠
      key: 'tinker', name: '机巧体', hp: 80, speed: 60, r: 13,
      reward: 11, dmg: 2, armor: 1, color: '#ffc24c',
      towerDps: 24, towerRange: 84
    },
    mender: {                       // 织愈体：周期性治疗半径内友军，奶妈
      key: 'mender', name: '织愈体', hp: 90, speed: 48, r: 13,
      reward: 12, dmg: 1, armor: 0, color: '#ff9ad2',
      healRange: 104, healPerSec: 7
    }
  };

  /* ---------------- 地脉突变（roguelike 层） ----------------
   * 每局一个随机种子，每波从这张表里随机抽 1~2 条「地脉突变」套到该波敌人身上，
   * 让同一只怪在不同局 / 不同波里表现不同 —— 这是「类似 roguelike」的核心。
   * 每条突变是一组**乘子 / 加值**，字段可空（undefined）表示不影响该项：
   *   speedMul  移速倍率（>1 更快）
   *   armorAdd  护甲加值（叠加在 def.armor 上）
   *   hpMul     血量倍率（与波次自身 hpMul 乘算）
   *   dmgMul    漏怪伤害倍率（抵达核心的削减）
   *   spawnMul  刷怪密度倍率（>1 更密，roguelike 的「涌动」）
   *   regen     每秒回血（点/秒），给肉怪续命
   *   rewardMul 击杀奖励倍率（<1 收益下降）
   * 应用点在 js/waves.js（plan 选突变 + 合进 hpMul 与 spawn 密度）
   * 与 js/enemies.js（create 套 speed / armor / dmg / regen）。字段含义见两处注释。 */
  /* 地脉突变表。**数组顺序即解锁顺序** —— Profile.mutPool() 取的是前 N 条
   * （N 由「地脉谱系」那条线的档位决定：4 → 6 → 8），所以排在前面的必须是
   * 最温和的几条：新玩家起步只遇到它们，解锁后再把硬货放进来（增加变数
   * 而不是单纯变难，这是 roguelike 的正统做法）。
   * 早先按「数值类型」排，结果起始池里是疾风/铁甲/涌动/血怒 —— 四条里三条
   * 硬加难度（涌动更是怪量 ×1.5），与「前几局可控」的意图正好相反，
   * 实测还能让理想 AI 在第 19 波直接崩盘。现在按烈度重排：
   *   起始池 = 疾风（只加速）/ 回响（回血）/ 蚀影（只减收益，不动难度）/ 狂乱（中等）
   *   解锁池 = 铁甲（护甲 4）/ 血怒（血 + 攻）/ 涌动（怪量 1.5）/ 巨力（最厚最硬） */
  CFG.MUTATIONS = [
    { key: 'swift',    name: '疾风地脉', desc: '敌人移动加速', speedMul: 1.22 },
    { key: 'regrowth', name: '回响地脉', desc: '敌人持续回血', regen: 8 },
    { key: 'eclipse',  name: '蚀影地脉', desc: '击杀收益下降', rewardMul: 0.75 },
    { key: 'frenzy',   name: '狂乱地脉', desc: '速度与冲击齐升', speedMul: 1.14, dmgMul: 1.25 },
    { key: 'ironhide', name: '铁甲地脉', desc: '敌人护甲提升', armorAdd: 4, hpMul: 1.10 },
    { key: 'bloodfury',name: '血怒地脉', desc: '敌血量与冲击俱增', hpMul: 1.22, dmgMul: 1.30 },
    { key: 'swarm',    name: '涌动地脉', desc: '敌人成群涌来', spawnMul: 1.5 },
    { key: 'titanfall',name: '巨力地脉', desc: '敌人更厚更硬', hpMul: 1.35, armorAdd: 2 }
  ];

  /* ---------------- 配色 ----------------
   * 底色是**深海军蓝**，不是近黑。近黑（原来 #04060d）有三个问题：
   *   1) 塔身、怪物、血条全都糊在一起，暗色元素完全没有层次；
   *   2) 手机在户外看就是一团黑，什么都看不见；
   *   3) 长时间盯着高对比的纯黑底比深蓝更累眼。
   * 层次靠三档亮度拉开，顺序固定：
   *   bg0/bg1（整屏底） < panel（面板） < panel2/chip（卡片、数值格）
   * 再往上才是那几块「软白」（rgba(255,255,255,0.0x)）的描边与分隔。
   */
  CFG.C = {
    bg0: '#0f1b2f',
    bg1: '#182840',
    board: '#182840',                  // 棋盘底盘
    cellA: '#20324f',                  // 棋盘格（深浅交替，别太跳）
    cellB: '#25395a',
    panel: '#1e2e4b',
    panel2: '#27395c',
    page: 'rgba(16,27,47,0.985)',      // 整屏页的底（近乎不透明）
    panelFill: 'rgba(32,47,76,0.96)',  // 常规面板
    panelSoft: 'rgba(36,53,84,0.94)',  // 图鉴/弹窗里的次级面板
    chip: 'rgba(44,63,98,0.94)',       // 卡片与数值格
    barTrack: 'rgba(8,15,28,0.55)',    // 进度条槽：比底色更深才有「槽」感
    offFill: 'rgba(255,255,255,0.07)', // 「关 / 买不起」的浅底（别太淡，浅色底上会看不见）
    line: 'rgba(150,190,255,0.16)',
    line2: 'rgba(150,190,255,0.30)',
    text: '#eef4ff',
    dim: '#a8bbd9',
    good: '#4ade80',
    bad: '#ff5d6c'
  };

  /* ---------------- 字号（三档：小 / 中 / 大） ----------------
   * 所有文字绘制统一走 CFG.FS（render.js 的 fontOf、fx.js 的飘字）。
   * 调用点写的永远是「基础字号」，档位一换，全工程一起变，不会东一处西一处漏掉。
   *
   * 一档 = 两条同源曲线的同一次取值，缺一不可：
   *   FS_TABLES[lv]  决定「字多大」
   *   LAY_K          决定「行距 / 盒子 / 内边距多大」（经 CFG.S 用到所有布局尺寸）
   * 只有字变了而盒子没变 → 撞车；只有盒子变了而字没变 → 空得慌。
   *
   * 表刻意不是等比缩放：**大字压得多、小字托底压得少**。
   * 上一版整体 ×2 后主标题冲到 92px（屏幕 50px），顶掉半个 HUD；
   * 若改按 ×1.5 等比缩，最小那档注释字只剩 18px → iPhone 上 9.7px 又看不清。
   * 所以 46→66（-28%）、12→21（-12%），层级整体收一档。
   *
   * 加新字号记得三张表一起补：缺档会走 FONT_K 兜底，可能出现 16→27 / 17→26 这种倒挂。
   * 中档（index 1）恒为 1.00 —— 它是全工程坐标与历史验收的基准，改动等于全盘重排。
   */
  CFG.FONT_LEVELS = [
    { key: 'small', name: '小', k: 0.88 },
    { key: 'mid', name: '中', k: 1.00 },
    { key: 'large', name: '大', k: 1.16 }
  ];
  CFG.FONT_LEVEL = 1;                   // 当前档位（设置页可改，存 echo_fontLevel）
  CFG.LAY_K = 1;                        // 当前档的布局倍率
  CFG.FONT_K = 1.5;                     // 仅兜底：表里查不到时的倍率
  CFG.FS_TABLES = [
    {   /* 小 */
      12: 19, 13: 20, 14: 21, 15: 23, 16: 24, 17: 25, 18: 27, 19: 28,
      20: 29, 24: 34, 26: 37, 28: 39, 30: 42, 34: 45, 46: 58
    },
    {   /* 中（基准） */
      12: 21, 13: 22, 14: 24, 15: 26, 16: 27, 17: 29, 18: 30, 19: 31,
      20: 33, 24: 39, 26: 42, 28: 45, 30: 47, 34: 51, 46: 66
    },
    {   /* 大 */
      12: 24, 13: 25, 14: 27, 15: 29, 16: 31, 17: 33, 18: 35, 19: 36,
      20: 38, 24: 45, 26: 48, 28: 52, 30: 55, 34: 59, 46: 76
    }
  ];
  /** 当前档的字号表（自检与渲染都走这里） */
  CFG.FS_MAP = CFG.FS_TABLES[CFG.FONT_LEVEL];
  CFG.FS = function (n) {
    var t = CFG.FS_TABLES[CFG.FONT_LEVEL] || CFG.FS_TABLES[1];
    return t[n] || Math.round(n * CFG.FONT_K * CFG.LAY_K);
  };
  /** 布局尺寸统一入口：所有「行距、盒子高、内边距、图标半径」都过一遍。
   *  中档 k=1 是恒等映射，所以历史坐标逐像素不变。 */
  CFG.S = function (v) { return Math.round(v * CFG.LAY_K); };

  /** 切换到某一档字号（只改数值，重排由 runtime.fit() 负责） */
  CFG.setFontLevel = function (lv) {
    lv = Math.floor(lv);
    if (!(lv >= 0 && lv <= CFG.FONT_LEVELS.length - 1)) lv = 1;
    CFG.FONT_LEVEL = lv;
    CFG.LAY_K = CFG.FONT_LEVELS[lv].k;
    CFG.FS_MAP = CFG.FS_TABLES[lv];
    return lv;
  };

  /* ---------------- 用户设置（设置页）
   * 字体档位在 CFG 里，音效音量/静音在 audio.js 里，这里只留一个「震动」开关，
   * 三者的读写统一走 G.Settings（js/settings.js），别在别处直接改。 */
  CFG.SET = { fontLevel: 1, vibrate: true, volume: 1 };

  /* ---------------- 布局 ----------------
   * 由 runtime.js 把安全区换算成设计坐标后传进来：
   *   insetTop     状态栏高度（时间、信号所在那条，整宽都要让开）
   *   insetBottom  home 指示条高度
   *   capsule      { left, bottom } 右上角胶囊的左沿与下沿（浏览器下为 0）
   */
  CFG.buildLayout = function (designH, insetTop, insetBottom, capsule) {
    insetTop = insetTop || 0;
    insetBottom = insetBottom || 0;
    var capL = (capsule && capsule.left) || 0;
    var capB = (capsule && capsule.bottom) || 0;
    var hasCap = (capL > 0 && capB > 0);

    /* 布局尺寸全部过 CFG.S：它乘的是当前字号档的 LAY_K。
     * 中档 k=1 是恒等映射 —— 这正是历史坐标锁能逐像素不变的原因。 */
    var S = CFG.S;

    var top = insetTop;

    /* 微信下，战斗 HUD（左列 + 右列）+ 棋盘 + 建造栏这一整条链整体下移到
     * 胶囊下方，把右上角胶囊那一行完整让给系统 UI。标题仍落在内容区左上角
     * （胶囊下方左侧）。整屏版式（菜单 / 设置 / 玩法 / 图鉴）垂直居中即可，
     * 不避让胶囊，故仍用 top（= insetTop）。 */
    var gameTop = insetTop;
    if (hasCap) gameTop = capB + S(8);   // 胶囊底 + 余量：HUD 顶边整体下移到胶囊下方

    /* 右对齐那一列（波次 / 最高分 / 能量）整体顶格：
     * 右沿 = 内容区右沿（720 - S(40)），不再为右上角的胶囊让位。
     * 原先 HUD 与胶囊并排、右列被压到 566 并分 A/B 两套摆法（胶囊靠左时整列并排），
     * 现在整条 HUD 链已经下移到胶囊下方，横向没有遮挡，右列直接顶到右边即可。 */
    var hudRight = 720 - S(40);
    var rightColTop = gameTop;
    var mode = 'R';

    var hud = {
      top: gameTop,
      k: CFG.LAY_K,
      hasCapsule: hasCap,
      layout: mode,
      /* —— 左对齐一列：躲开状态栏即可 ——
       * 坐标按 FS 表换算后的「真实字高」排，行尾注释是中档下的上下沿。 */
      title: gameTop + S(36),          // 45px 标题：顶 13 → 底 58
      sub: gameTop + S(74),            // 21px：顶 64 → 底 85
      hpLabel: gameTop + S(106),       // 22px：顶 95 → 底 117
      hpBar: { x: 40, y: gameTop + S(122), w: 388, h: S(22) },
      /* 回声条随「回声倒带」一起下线（现行玩法只剩炮台），开波按钮直接顶上来
       * 占住这一行：左列少一行 S(58)，棋盘就多让出一截纵向空间。 */
      waveBtn: { x: 40, y: gameTop + S(172), w: 500, h: S(64) },   // 底 gameTop+236
      // —— 右对齐一列：右沿 = hudRight（顶格）——
      waveTxt: rightColTop + S(36),
      bestTxt: rightColTop + S(74),
      energyLabel: rightColTop + S(106),
      energyVal: rightColTop + S(152),  // 字号降到 20px（表内值）后约顶 144 → 底 166
      hudRight: hudRight,
      /* 设置键：从右上角「关闭声音」原位挪下来，挂在开波按钮右侧那格空档 ——
       * 横向与开波按钮分离（540 ← 40 间隙 → 580），纵向与它基本齐平。
       * 宽恒 100（里面只有一个图标 + 两个汉字，横向不必跟字号走），
       * 左沿 580 + 宽 100 = 680 = 内容区右沿，正好顶格。 */
      settingsBtn: { x: 580, y: gameTop + S(176), w: 100, h: S(54) }
    };

    /* 建造栏高度不再是常数：它由「卡片几行 × 多高」决定（见下面的卡片段）。
     * 脉冲 / 倒带下线后只剩 6 座炮台：两行 3 + 3，栏高仍是 236，
     * 但卡宽从 164 涨到 221，元素图标与卡内文字都更宽松。
     * 卡高 104 是量出来的：图标 S(26)±S(15) → 卡名 S(58) → 副标题 S(84)，
     * 三行字在三档字号下都不相压（S 与 F 两条曲线不同源，不能靠眼估）。 */
    var gap = S(8), rowGap = S(8), cardPadTop = S(10), cardH = S(104);
    var nCard = CFG.TOWER_ORDER.length;
    var perRow = Math.ceil(nCard / 2);
    var nRow = Math.ceil(nCard / perRow);
    var barH = cardPadTop * 2 + cardH * nRow + rowGap * (nRow - 1);
    var barY = designH - insetBottom - barH;

    // 棋盘起始 y：HUD 最后一行（开波按钮）下沿 + 呼吸位
    var contentTop = Math.max(CFG.TOP_Y, hud.waveBtn.y + hud.waveBtn.h + S(14));
    // 「打游戏」这条线最少要这么高
    var gameNeed = contentTop + CFG.BOARD_H + barH + insetBottom;
    /* 棋盘在「HUD 之下、建造栏之上」这段里的位置：
     * 先给棋盘**下方**留出浮动提示（Toast）落脚的位置，剩下的才上下均分。
     * 不留的话，屏幕高度紧张时棋盘会被均分到紧贴建造栏，
     * 浮动提示就没地方放，只能盖在最后一行核心格上。 */
    var RESERVE_BELOW = S(78);
    var boardY = contentTop +
      Math.max(0, (barY - contentTop - CFG.BOARD_H - RESERVE_BELOW) / 2);

    /* 卡片：只剩炮台（6 张），两行 3 + 3 铺开。
     * 卡宽从 164 涨到 221（一行硬挤 6 张时只有 102，图标糊成点）。
     * 顺序照 TOWER_ORDER 排，以后加塔按 ceil(n/2) 自动多行、栏高跟着长大。 */
    var n = nCard;
    var cw = Math.floor((696 - S(8) * 2 - (perRow - 1) * gap) / perRow);
    var cards = [];
    for (var i = 0; i < n; i++) {
      var row = Math.floor(i / perRow);
      var col = i - row * perRow;
      var cnt = Math.min(perRow, n - row * perRow);       // 这一行实际几张
      var sx = Math.round((720 - (cnt * cw + (cnt - 1) * gap)) / 2);
      cards.push({
        x: sx + col * (cw + gap),
        y: barY + cardPadTop + row * (cardH + rowGap),
        w: cw, h: cardH, idx: i, row: row
      });
    }

    /* 菜单 / 设置 / 玩法 / 结算这类整屏版式：整块按内容高度垂直居中，
     * 而不是钉死在 1280 基准上 —— 否则字号一变就会掉出屏幕底。
     * 块高必须跟 render.js 里该版式实际排到的最底部对齐，改版式时一起改。 */
    var MENU_H = S(650), SET_H = S(730), HELP_H = S(1150), OVER_H = S(620);
    /* 图鉴页（codex）与「首次遭遇」弹窗（pop）也是整屏块。
     * 两者的块高刻意压在 HELP_H（1150）以内 —— neededH 取这几个块的最大值，
     * 谁超过 HELP_H 谁就会把短屏机型的整体缩放一起拉小，
     * 而图鉴是「看一眼就回去」的页面，不该动战斗版式的一个像素。
     * pop 从 700 涨到 760 也是同理：弹窗里要放一只「大头像」怪，
     * 纵向预算（定位行 → 一句话概括）只够 r≈42，撑不起形象；
     * 加高 60 全给形象，实测能到 r=56（小体型的怪接近 5 倍放大），
     * 760 仍远小于 1150，所以整体缩放和战斗版式一个像素都没动。 */
    var CODEX_H = S(1000), POP_H = S(800);
    var pagePad = top + S(10);
    var menuTop = Math.max(pagePad, Math.round((designH - MENU_H) / 2));
    var setTop = Math.max(pagePad, Math.round((designH - SET_H) / 2));
    var helpTop = Math.max(pagePad, Math.round((designH - HELP_H) / 2));
    var codexTop = Math.max(pagePad, Math.round((designH - CODEX_H) / 2));
    var popTop = Math.max(pagePad, Math.round((designH - POP_H) / 2));
    /* 结算面板要躲开 HUD（结算时 HUD 仍然在画）：HUD 底 = top + S(282) */
    var overTop = Math.max(top + S(292), Math.round((designH - OVER_H) / 2));

    /* 整屏至少要这么高：除了棋盘的 gameNeed，四个整屏版式也得装得下。
     * 玩法页是三档里最高的，所以大字号下真正卡住缩放的往往是它 —— 这正是想要的：
     * 与其让规则文字掉出屏幕，不如整块缩一档。
     * 预留只算「顶部让开状态栏 + 底部让开 home 条」：整屏版式是垂直居中的，
     * 底部余量天然等于顶部余量，不必再翻倍预留（翻倍会把短屏机型的缩放白吃掉 5%+）。 */
    var pageNeed = Math.max(MENU_H, SET_H, HELP_H, OVER_H, CODEX_H, POP_H) +
      top + Math.max(insetBottom, S(10));
    var neededH = Math.max(gameNeed, pageNeed);

    return {
      designH: designH,
      insetTop: insetTop,
      insetBottom: insetBottom,
      capsuleLeft: capL,
      capsuleBottom: capB,
      hud: hud,
      boardX: CFG.BX,
      boardY: boardY,
      boardW: CFG.BOARD_W,
      boardH: CFG.BOARD_H,
      /** 棋盘可用顶边（HUD 之下） */
      contentTop: contentTop,
      /** 装下整个界面所需的最小设计高度 */
      neededH: neededH,
      /** 菜单 / 设置 / 玩法 / 结算版式的整块顶端 y（块高见各自 *_H） */
      menuTop: menuTop,
      menuH: MENU_H,
      setTop: setTop,
      setH: SET_H,
      helpTop: helpTop,
      helpH: HELP_H,
      codexTop: codexTop,
      codexH: CODEX_H,
      popTop: popTop,
      popH: POP_H,
      overTop: overTop,
      overH: OVER_H,
      barY: barY,
      barH: barH,
      cards: cards,
      /* 兼容旧字段名：渲染层与命中区都直接引用这几个对象 */
      waveBtn: hud.waveBtn,
      hpBar: hud.hpBar,
      settingsBtn: hud.settingsBtn,
      hudRight: hud.hudRight
    };
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
