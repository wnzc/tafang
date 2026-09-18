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
  CFG.START_ENERGY = 250;            // 起手能量（够 4 座低价塔，前期不至于只能干看）
  CFG.CORE_HP = 100;
  CFG.PREP_TIME = 12;                // 备战倒计时
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
      dmg: 7, range: 138, rate: 0.80,
      kind: 'gust', aoe: 96, push: 18
    },
    /* ——— 凝霜（冰）暂时下线：整块留档，恢复 = 解开本段与 TOWER_ORDER 的注释 ———
     * 下线原因：和水塔同为 kind:'wave'（范围减速波），定位重叠最高；
     * 卡片从 9 张收到 8 张后正好两行 4+4，卡宽 129 → 164，元素图标看得清。
     * 留档的东西：CFG.ELEM.cryo、RES.reactions 里的 5 条 cryo 反应、icons.js 的冰图标、
     * towers.js 的冻结概率分支、audio.js 的 shootFrost 派发 —— 解注即全部生效。
    cryo: {
      key: 'cryo', name: '凝霜', elem: 'cryo', cost: 85, hp: 260,
      dmg: 10, range: 164, rate: 0.85,
      kind: 'wave', aoe: 58, slow: 0.50, slowT: 2.0, freezeChance: 0.22, freezeT: 1.1
    },
    —————————————————————————————————————————————————————————————— */
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
  /* 上场塔的元素顺序（卡片按这个顺序铺两行）。
   * 凝霜（冰）已下线：把 'cryo' 解注回 anemo 与 electro 之间，同时解开上面 CFG.TOWERS
   * 里的 cryo 定义块，两处一起解即完全恢复（元素、反应表、图标、音效都还在）。 */
  CFG.TOWER_ORDER = ['pyro', 'hydro', 'dendro', 'anemo', /* 'cryo', */ 'electro', 'geo'];

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

  /* ---------------- 回声倒带 ---------------- */
  CFG.ECHO = {
    max: 100,
    perKill: 3,
    perWave: 22,
    window: 4.0,      // 回退秒数
    snapStep: 0.15,   // 快照间隔
    buffSpeed: 0.18,  // 回退后敌人适应加速
    buffTime: 5.0
  };

  /* ---------------- 主动技能：共振脉冲 ---------------- */
  CFG.PULSE = {
    cost: 40, radius: 122, dmg: 48, stun: 1.3
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
      key: 'drifter', name: '游荡体', hp: 62, speed: 58, r: 13,
      reward: 6, dmg: 1, armor: 0, color: '#6ee7ff'
    },
    sprinter: {
      key: 'sprinter', name: '疾行体', hp: 40, speed: 120, r: 11,
      reward: 7, dmg: 1, armor: 0, color: '#ffe066'
    },
    bulwark: {
      key: 'bulwark', name: '装甲体', hp: 210, speed: 38, r: 17,
      reward: 14, dmg: 3, armor: 4, color: '#9aa7c7'
    },
    sunder: {
      key: 'sunder', name: '破墙者', hp: 100, speed: 56, r: 15,
      reward: 13, dmg: 2, armor: 1, color: '#ff8a4c',
      towerDps: 13, towerRange: 74
    },
    phaser: {
      key: 'phaser', name: '相位体', hp: 105, speed: 70, r: 13,
      reward: 14, dmg: 2, armor: 1, color: '#c08bff',
      phaseCycle: 6.0, phaseDur: 2.2
    },
    /* Boss。三件事必须一起看：
     *   hp 750 —— 旧值 1600 配上当年的 hpMul，第 5 波那只是 4448 血；
     *     当时玩家手上只有四五座一级塔、合计不到 60 点秒伤，要打七十多秒，
     *     而它走完全程只要 25 秒 —— 结论就是「打不动」，不是难。
     *   armor 4 —— 原来 10：火塔 17 伤害只剩 7，等于把一半的塔废掉。
     *     降到 4 之后平砍有输出，但仍然只有重击塔划算。
     *   suppress 140 —— 靠近时把半径内的塔踢出共振网络（连带关掉它的反应）。
     *     这条是「别把塔紧贴它的路摆」的原因，也是它的血量能降这么多的前提。 */
    boss: {
      key: 'boss', name: '共鸣吞噬者', hp: 750, speed: 34, r: 27,
      reward: 150, dmg: 26, armor: 4, color: '#ff4d6d',
      boss: true, suppress: 140
    }
  };

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

    /* 右对齐那一列（波次 / 最高分 / 能量）怎么摆：
     *   方案 A（主流）：并排缩到胶囊左侧 —— 保住顶部这块宝贵的纵向空间
     *   方案 B（胶囊太靠左 / 平板）：横向挤不下，整列下移到胶囊下方
     * 门槛 450 是按当前字号的实测宽度定的：再窄，波次那行的左侧就会被
     * 左边的大标题顶到，两列会叠字。
     */
    var hudRight = 566;
    var rightColTop = top;
    var mode = '-';
    if (hasCap) {
      var narrowed = Math.round(capL - 14);
      if (narrowed >= 450) {
        hudRight = Math.min(566, narrowed);        // 方案 A
        mode = 'A';
      } else {
        hudRight = 566;                            // 方案 B
        rightColTop = Math.max(top, capB + 10);
        mode = 'B';
      }
    }

    // 音效开关固定挂在胶囊正下方右侧，那是一整块没人用的空档
    var soundY = hasCap ? capB + S(12) : top + S(18);

    var hud = {
      top: top,
      k: CFG.LAY_K,
      hasCapsule: hasCap,
      layout: mode,
      /* —— 左对齐一列：躲开状态栏即可 ——
       * 坐标按 FS 表换算后的「真实字高」排，行尾注释是中档下的上下沿。 */
      title: top + S(36),          // 45px 标题：顶 13 → 底 58
      sub: top + S(74),            // 21px：顶 64 → 底 85
      hpLabel: top + S(106),       // 22px：顶 95 → 底 117
      ecLabel: top + S(164),       // 22px：顶 153 → 底 175
      hpBar: { x: 40, y: top + S(122), w: 388, h: S(22) },
      ecBar: { x: 40, y: top + S(180), w: 388, h: S(22) },
      waveBtn: { x: 40, y: top + S(218), w: 640, h: S(64) },   // 底 top+282
      // —— 右对齐一列 ——
      waveTxt: rightColTop + S(36),
      bestTxt: rightColTop + S(74),
      energyLabel: rightColTop + S(106),
      energyVal: rightColTop + S(152),  // 47px：顶 129 → 底 176
      hudRight: hudRight,
      /* 音效开关左上角 x 必须 ≥ hudRight：右列文字右对齐到 hudRight，
         两者靠“横向分离”共存（开关挂在胶囊下方，y 上躲不开右列）。
         宽恒为 100：里面只有一个图标 + 一个汉字，横向不必跟字号走。 */
      soundBtn: { x: 580, y: soundY, w: 100, h: S(54) }
    };

    // 方案 B 下右列被推到胶囊下面了，开波按钮必须再往下让
    if (hasCap && rightColTop > top) {
      hud.waveBtn.y = Math.max(hud.waveBtn.y, rightColTop + S(186));
    }

    /* 建造栏高度不再是常数：它由「卡片几行 × 多高」决定（见下面的卡片段）。
     * 两行之后栏高 236，比原来的一行 164 高 72 —— 但卡宽从 72 翻到 129、
     * 图标从 12 涨到 15，卡片里的元素图标才第一次看得清。
     * 卡高 104 是量出来的：图标 S(26)±S(15) → 卡名 S(58) → 副标题 S(84)，
     * 三行字在三档字号下都不相压（S 与 F 两条曲线不同源，不能靠眼估）。 */
    var gap = S(8), rowGap = S(8), cardPadTop = S(10), cardH = S(104);
    var barH = cardPadTop * 2 + cardH * 2 + rowGap;
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

    /* 卡片：两行铺开（6 塔 + 脉冲 + 倒带 = 8 张）。
     * 冰塔下线后正好 4 + 4 两行，卡宽从 129 涨到 164（一行挤 9 张时只有 72，图标糊成点）。
     * 顺序照旧按 TOWER_ORDER 排，所以「塔在上、技能在下」是稳定的，
     * 不会因为以后加塔把脉冲/倒带挤到第二行以外。 */
    var n = CFG.TOWER_ORDER.length + 2;
    var perRow = Math.ceil(n / 2);
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
    var MENU_H = S(650), SET_H = S(730), HELP_H = S(1150), OVER_H = S(540);
    /* 图鉴页（codex）与「首次遭遇」弹窗（pop）也是整屏块。
     * 两者的块高刻意压在 HELP_H（1150）以内 —— neededH 取这几个块的最大值，
     * 谁超过 HELP_H 谁就会把短屏机型的整体缩放一起拉小，
     * 而图鉴是「看一眼就回去」的页面，不该动战斗版式的一个像素。
     * pop 从 700 涨到 760 也是同理：弹窗里要放一只「大头像」怪，
     * 纵向预算（定位行 → 一句话概括）只够 r≈42，撑不起形象；
     * 加高 60 全给形象，实测能到 r=56（小体型的怪接近 5 倍放大），
     * 760 仍远小于 1150，所以整体缩放和战斗版式一个像素都没动。 */
    var CODEX_H = S(1000), POP_H = S(760);
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
      ecBar: hud.ecBar,
      soundBtn: hud.soundBtn,
      hudRight: hud.hudRight
    };
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
