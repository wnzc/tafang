/**
 * tools/export-game-data.js —— 从 js/config.js 导出移植用的纯数据快照
 *
 * 为什么要有这个脚本：docs/cocos-port/game-data.json 是给 Cocos 复刻者的
 * 机器可读配置，它必须与 js/config.js **始终一致**。config.js 是数值的唯一源头，
 * 所以每次改完数值都要跑一次本脚本，否则文档里是旧值、复刻出来就不一样了。
 *
 * 运行：node tools/export-game-data.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js/config.js'));
const CFG = globalThis.ECHO_TD.CFG;

const out = {
  meta: {
    designW: CFG.DESIGN_W,
    totalWaves: CFG.TOTAL_WAVES,
    coreHp: CFG.CORE_HP,
    startEnergy: CFG.START_ENERGY,
    prepTime: CFG.PREP_TIME,
    cell: CFG.CELL,
    boardW: CFG.BOARD_W,
    boardH: CFG.BOARD_H,
    gridCols: CFG.GRID_COLS,
    gridRows: CFG.GRID_ROWS,
    maxLevel: CFG.MAX_LEVEL,
    startSpots: CFG.SPAWN_COLS
  },
  elem: CFG.ELEM,
  towerOrder: CFG.TOWER_ORDER,        // 当前上架（默认 6 座：凝霜未解锁）
  towerOrderAll: CFG.TOWER_ORDER_ALL, // 全部 7 座
  towers: CFG.TOWERS,
  lv: CFG.LV,
  resonance: CFG.RES,
  mutations: CFG.MUTATIONS,
  vis: CFG.VIS,
  monExtent: CFG.MON_EXTENT,
  enemies: CFG.ENEMIES,
  /* —— 成长系统（回响档案）——
   * 复刻时这一层可以直接省掉（它是元系统，不影响单局玩法），
   * 但数值要留着，否则门槛/公式对不上。见 COCOS_SPEC.md 的 14.1 / 15 章。 */
  growth: {
    echoPoint: CFG.ECHO_POINT,
    unlocks: CFG.UNLOCKS,
    mutBase: CFG.MUT_BASE,
    deep: CFG.DEEP
  }
};

const dest = path.join(ROOT, 'docs/cocos-port/game-data.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');

console.log('已写出 ' + path.relative(ROOT, dest));
console.log('  敌种 ' + Object.keys(out.enemies).length + ' 种');
console.log('  突变 ' + out.mutations.length + ' 条（起始池 ' + out.growth.mutBase + ' 条）：' +
  out.mutations.map((m) => m.name).join(' / '));
console.log('  上架塔 ' + out.towerOrder.length + ' 座，全部 ' + out.towerOrderAll.length + ' 座：' +
  out.towerOrder.join(','));
console.log('  解锁线 ' + out.growth.unlocks.length + ' 条：' +
  out.growth.unlocks.map((l) => l.name + '(' + l.tiers[l.tiers.length - 1].at + ')').join('、'));
console.log('  （改完 js/config.js 记得重跑本脚本，否则文档与源码会脱节）');
