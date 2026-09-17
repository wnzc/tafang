/**
 * grid.js —— 网格 + 流场寻路
 *
 * 这是本作与传统塔防最大的差异点之一：
 * 地图上不存在固定路径。防御塔会「占据格子成为墙体」，
 * 敌人用 BFS 流场实时计算绕行路线；玩家等于在不断改造迷宫。
 */
;(function (root) {
  'use strict';
  var G = root.ECHO_TD = root.ECHO_TD || {};
  var CFG = G.CFG;

  var COLS = CFG.COLS, ROWS = CFG.ROWS, N = COLS * ROWS;

  var Grid = G.Grid = {
    cols: COLS,
    rows: ROWS,
    blocked: new Uint8Array(N),   // 1 = 不可通行（塔占位）
    core: new Uint8Array(N),      // 1 = 核心格
    flow: new Int32Array(N),      // 到核心的距离场（-1 表示不可达）
    towerFlow: new Int32Array(N), // 到最近塔的距离场
    phaseFlow: new Int32Array(N), // 无视阻挡时到核心的距离场
    dirty: true
  };

  Grid.idx = function (c, r) { return r * COLS + c; };
  Grid.inBounds = function (c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; };
  Grid.isBlocked = function (c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
    return Grid.blocked[r * COLS + c] === 1;
  };

  Grid.worldToCell = function (x, y, out) {
    out = out || {};
    out.col = Math.floor((x - CFG.BX) / CFG.CELL);
    out.row = Math.floor((y - (G.LAY ? G.LAY.boardY : CFG.TOP_Y)) / CFG.CELL);
    return out;
  };

  Grid.cellCX = function (c) { return CFG.BX + (c + 0.5) * CFG.CELL; };
  Grid.cellCY = function (r) { return (G.LAY ? G.LAY.boardY : CFG.TOP_Y) + (r + 0.5) * CFG.CELL; };

  Grid.reset = function () {
    var i;
    for (i = 0; i < N; i++) { Grid.blocked[i] = 0; Grid.core[i] = 0; }
    for (i = 0; i < CFG.CORE_CELLS.length; i++) {
      var cc = CFG.CORE_CELLS[i];
      Grid.core[Grid.idx(cc[0], cc[1])] = 1;
    }
    Grid.dirty = true;
  };

  Grid.isCore = function (c, r) {
    if (!Grid.inBounds(c, r)) return false;
    return Grid.core[r * COLS + c] === 1;
  };

  /** 能否在此建塔 */
  Grid.canPlace = function (c, r) {
    if (!Grid.inBounds(c, r)) return false;
    if (Grid.isCore(c, r)) return false;
    if (Grid.blocked[r * COLS + c]) return false;
    return true;
  };

  /* ------------------------------------------------------------------ */
  /*  BFS 流场                                                            */
  /*  sources: [{c,r}] 起点集合                                          */
  /*  passBlocked: 是否允许穿越被阻挡的格子（相位体用）                     */
  /*  ignoreBlockedAtSource: 起点即使是塔格也要接受                        */
  /* ------------------------------------------------------------------ */
  Grid.build = function (sources, passBlocked) {
    var f = new Int32Array(N);
    var i;
    for (i = 0; i < N; i++) f[i] = -1;
    var q = new Int32Array(N);
    var head = 0, tail = 0;
    for (i = 0; i < sources.length; i++) {
      var s = sources[i];
      if (!Grid.inBounds(s.c, s.r)) continue;
      var si = s.r * COLS + s.c;
      if (f[si] !== -1) continue;
      f[si] = 0;
      q[tail++] = si;
    }
    while (head < tail) {
      var cur = q[head++];
      var cd = f[cur];
      var c = cur % COLS;
      var r = (cur - c) / COLS;
      // 四邻
      for (var k = 0; k < 4; k++) {
        var nc = c + (k === 0 ? 1 : k === 1 ? -1 : 0);
        var nr = r + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        var ni = nr * COLS + nc;
        if (f[ni] !== -1) continue;
        if (!passBlocked && Grid.blocked[ni] === 1) continue;
        f[ni] = cd + 1;
        q[tail++] = ni;
      }
    }
    return f;
  };

  /** 塔数组变化后重算全部流场 */
  Grid.recompute = function (towers) {
    var coreSrc = [], towerSrc = [];
    for (var i = 0; i < CFG.CORE_CELLS.length; i++) {
      coreSrc.push({ c: CFG.CORE_CELLS[i][0], r: CFG.CORE_CELLS[i][1] });
    }
    for (var j = 0; j < towers.length; j++) {
      towerSrc.push({ c: towers[j].col, r: towers[j].row });
    }
    // 重置阻挡
    var k;
    for (k = 0; k < N; k++) Grid.blocked[k] = 0;
    for (k = 0; k < towers.length; k++) Grid.blocked[towers[k].row * COLS + towers[k].col] = 1;

    Grid.flow = Grid.build(coreSrc, false);
    Grid.phaseFlow = Grid.build(coreSrc, true);
    Grid.towerFlow = towerSrc.length ? Grid.build(towerSrc, false) : null;
    Grid.dirty = false;
  };

  Grid.at = function (arr, c, r) {
    if (!arr) return -1;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return arr[r * COLS + c];
  };

})(typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof globalThis !== 'undefined' ? globalThis
    : typeof window !== 'undefined' ? window : this);
