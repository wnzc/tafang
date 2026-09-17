/**
 * 微信小游戏入口
 * 《回声防线 · ECHO LINE》 —— 共振塔防
 */
require('./js/runtime.js');
require('./js/util.js');
require('./js/audio.js');
require('./js/config.js');
require('./js/settings.js');
require('./js/grid.js');
require('./js/fx.js');
require('./js/enemies.js');
require('./js/towers.js');
require('./js/resonance.js');
require('./js/waves.js');
require('./js/ui.js');
require('./js/render.js');
require('./js/main.js');

var G = (typeof ECHO_TD !== 'undefined') ? ECHO_TD
  : (typeof GameGlobal !== 'undefined' ? GameGlobal.ECHO_TD : null);

if (G) {
  G.Game.boot();
} else {
  console.error('[回声防线] 模块加载失败');
}
