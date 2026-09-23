# 回声防线 ECHO LINE —— 项目长期笔记

## 项目性质
微信小游戏·共振塔防。纯 Canvas 2D，零外部资源（音效用 WebAudio 实时合成，怪与塔是矢量路径现画），**全 ES5**（禁用 let/const/箭头函数/模板字符串，`setting.es6=false`）。一套代码双端跑：微信小游戏（`game.js` 入口）+ 浏览器（`index.html`）。模块挂全局 `ECHO_TD` 命名空间互相引用，无打包器。

## 代码规模与结构
18 个 `js/` 模块共约 7900 行。最大三块：`render.js`(1672 绘制)、`monsters.js`(750 十一种怪矢量形象+逐部件动画)、`main.js`(960 状态机/建造/输入)。全局状态对象 `G.Game`，9 状态：`menu/set/help/codex/pop/prep/wave/over/win`。`prevState` 记暂停来源。**`js/profile.js`(236) 是存档/解锁中枢**，在 config 之后、main 之前加载，载入时按存档改写 `CFG.TOWER_ORDER`（见下「成长系统」）。

## 核心玩法（3 个差异化机制，2026-09-19 改）
1. 动态迷宫：塔占格变墙，敌人按 BFS 流场实时绕路；完全封死则敌人转「拆塔模式」
2. 元素共振：七元素，同元素相邻成链加伤（封顶 7），异元素相邻触发反应节点（20 对，除草+冰）；**默认上架 6 塔**（火/水/草/风/雷/岩），冰塔「凝霜」由成长系统解锁后变 7 塔
3. 地脉突变（Roguelike）：每局随机种子 + 每波随机抽 1~2 条突变（`CFG.MUTATIONS` 8 条、七类乘子），双抽时倍率温和化 ×0.65（防「两条血线相乘」的断崖）；**起始池只放前 4 条**（`CFG.MUT_BASE`），靠「地脉谱系」慢慢放开到 6、8 条
3. 地脉突变（Roguelike）：每局随机种子 + 每波随机抽 1~2 条突变（`CFG.MUTATIONS` 8 条、七类乘子），双抽时倍率温和化 ×0.65（防「两条血线相乘」的断崖）
- **已下线**：「回声倒带」与「共振脉冲」已整条删除（风系击退 + 脉冲 + 倒带叠加让难度形同虚设）。现行只剩「炮台 + 建造/升级/回收」一条操作线；风塔击退按质量衰减（`E.push` 的 `mass = 1+(r-10)*0.09+armor*0.18`，重甲/巨体退距 ≈1/3）
- 22 合成音效 + 16 类特效；11 种敌人（原 6 + 群涌/虚影/巨岩/机巧/织愈）

## 成长系统「回响档案」（2026-09-19 新增）
**设计红线：只解锁广度、不买数值深度。** 平衡是阈值型（hpMul 0.245 理想 AI 通关 / 0.26 直接崩），任何 >3% 的永久输出加成都会毁掉 20 波。所以四条线里**没有一条加塔的伤害/血量**。

- 核心：`js/profile.js`（`ECHO_TD.Profile`）。存档键 `echo_profile`（`R.store` 只有 get/set，**无 remove**，重置靠覆盖写空对象 `P.wipe()`）。字段 `{pts,runs,kills,wins,best,deepBest,deep}`，`normalize()` 对损坏/旧档兜底（补缺字段、数值 clamp 成有限非负）。
- 回响点公式（`CFG.ECHO_POINT` + `P.gainOf`）：`波次×12 + ⌊击杀/8⌋ − 漏怪×15 + (通关?200:0)`，clamp ≥0。通关约 665 点、10 波崩约 135 点（**失败也给点**，作为 roguelike 的挫败缓冲）。
- 三条解锁线（`CFG.UNLOCKS`，累计门槛、不消耗）：
  - 地脉谱系 `muts`：`counts:[4,6,8]` 对应 `tiers:[0/1000/3000]`（显式映射，不是公式）
  - 凝霜回归 `cryo`：1300 → 建造栏 6 张卡变 7 张（**唯一动版式的线**）
  - 深渊 `deep`：3800 → 敌人血 ×1.35 / 收益 ×1.15（`CFG.DEEP`），最高分单独记 `deepBest`，不混常规榜
- 档案页走**图鉴第 3 页签**（`UI.CODEX_TABS` 3 项），复用 `CODEX_H=1000`，**不动 `pageNeed`→`designH`→全局 S() 换算链**（新开页必须 < HELP_H 1150 否则全部坐标锁废）。菜单入口是 `UI.menuSubBtns()` 表驱动第 4 项。
- 关键函数：`P.mutPool()` 返回 `CFG.MUTATIONS.slice(0,N)`（截前 N 条不是随机选，保证起始池可预期）；`P.applyToConfig()` 按存档改写 `CFG.TOWER_ORDER`；`R.fit()` 在 `startRun` 里无条件重跑以适配解锁后的塔数。
- **`TOWER_ORDER_ALL`(固定 7 座) vs `TOWER_ORDER`(当前上架)**：所有代码照旧读 `TOWER_ORDER`，增删**只有 profile.js 一处负责**。

## 改数值/逻辑去哪
- 几乎所有数值：`js/config.js`（`CFG.TOWERS`/`ELEM`/`RES.reactions`/`ENEMIES`/`LV`/`VIS`/`buildLayout`）
- 成长/解锁数值：同文件 `CFG.ECHO_POINT`(回响点公式权重)、`CFG.UNLOCKS`(三条线与门槛)、`CFG.MUT_BASE`(起始突变条数)、`CFG.DEEP`(深渊倍率)；逻辑在 `js/profile.js`
- 加一只怪要动 3 处：`config.ENEMIES` 数值 + `monsters.js` 形象 + `codex.js` 档案文案（漏第三处图鉴留空，layout-check 会报）
- 音效：`js/audio.js` 的 `LIB`(音色)/`GATES`(节流)；整体响度只动 `MASTER_VOL`/`MAKEUP_VOL`
- 难度主旋钮：`js/waves.js` 的 `hpMul`（当前 `1 + 0.245(n-1) + 0.0099(n-1)²`，n=20 ≈ 9.0 倍；再往上调到 0.26/0.011 就连理想 AI 都会第 20 波被打破）
- 怪数量：同文件 `base = 16 + Math.floor(n*2.8)` × `mut.spawnMul` + swarm 批次 `swGroups = 3+n/3`、每组 5~9 只；重甲主类另乘 `HEAVY_K`（titan 0.42 / bulwark 0.70）压数量，**总怪数不变**（缺口给副类）
- 地脉突变：`config.js CFG.MUTATIONS`（8 条，**顺序按烈度递增排**、前 4 条最温和）+ `waves.js` 的抽取与双抽温和化
- 风塔击退：`enemies.js E.push` 的 `mass` 公式（重甲推不动）
- 元素图标：`js/icons.js` 的 `SRC` 补 `{vb,d}`（SVG path，第三方 genshin-icons，商用需替换）

## 验证命令（改完必跑）
- 逻辑/平衡：`node tools/simulate.js 400000`（常规）`--rich`（无限经济）`--rich --seal`（封死验证拆塔）`--deep`（深渊档）；**第 3 个参数是固定种子**（`node tools/simulate.js 80000 42`），扫通关率用它（不给则随机）
- 版式（9 机型×3 字号 + 70 结构断言，共 3323 项）：`node tools/layout-check.js`
- 字号：`node tools/font-check.js`
- 启动链路（boot/raf/输入/主循环/四个次级按钮）：无头 Chrome `--dump-dom` 跑 `tools/boot-selftest.html`，抓 `{"steps"`；**沙箱里要加 `CI=1`**（否则拿不到 `--no-sandbox`，Chrome 起不来会无输出挂死）
- 音效：无头 Chrome `--dump-dom` 跑 `tools/audio-selftest.html`，抓 `{"ok"`（22 音色 / 节流 / 音量静音全测）
- 截图：`node tools/_capture.js`（`tools/shot.html?scene=game|menu|codex|pop|help|set|over`）、`tools/preview.html#fx/#wx-*`
- **新增模块要同步 8 处加载列表**：`index.html`、`game.js`、`tools/shot.html`、`tools/preview.html`、`tools/boot-selftest.html`、`tools/simulate.js`、`tools/font-check.js`、`tools/layout-check.js` 的 `FILES`。漏一个就崩（profile.js 曾漏 3 个 HTML）

## 已知坑- ES5 约束是硬红线，改代码别用新语法
- **冰塔不再靠解注释恢复**（旧办法已作废）：`CFG.TOWERS.cryo` 现为常驻定义，是否上架由 `profile.js` 按存档改 `CFG.TOWER_ORDER`。`TOWER_ORDER_ALL` 是 7 座全集，`TOWER_ORDER` 是当前上架
- 棋盘 832px 固定，缩格子会动平衡
- 七元素图标是第三方资产，怪物形象为原创矢量
- 图鉴解锁记录只增不删（`echo_seen`）；成长档案同理由只增不删（`echo_profile`），重置才覆盖写空
- 战斗 HUD 在微信下整体下移到胶囊底（`config.buildLayout` 的 `gameTop = capB + S(8)`，只作用于 HUD+棋盘+建造栏链，整屏版式仍用 insetTop）；版式自检的「安全区缩放损失」护栏因此从 5% 放宽到 12%（layout-check 第 10 条，主动避让胶囊额外吃 ~66 设计坐标）
- **字号必须取字号表里有的值**（`12/13/14/15/16/17/18/19/20/24/26/28/30/34/46`）：表外的数（22、40 等）会走 `FONT_K` 兜底被放大 1.5 倍 —— 实测能量写 22 实际渲染成 60px（比原来的 30 号还大）、图鉴「?」写 40 变成 60px。`font-check.js` 的「用到的字号都在表里（没有走兜底）」就是防这个
- HUD 现行几何（`CFG.buildLayout`，坐标锁在 layout-check 第 11 条）：右列顶格 `hudRight = 720-S(40) = 680`；开波按钮 `{x:40, y:gameTop+S(172), w:500, h:S(64)}`；设置键 `{x:580, y:gameTop+S(176), w:100, h:S(54)}`；能量 20 号。**底部卡片默认 6 座塔、解锁凝霜后 7 座**：`nCard = TOWER_ORDER.length`、`perRow = ceil(n/2)`、`nRow` 动态算 barH（6 座=两行 3+3 卡宽 221；7 座=两行 4+3）
- 自检脚本里凡是调用 `G.Game.castPulse/castEcho` 的都要清掉（simulate / font-check / boot-selftest 都踩过）；boot-selftest 第 6 步走「建造 + 升级 + 回收」路径
- **结算页显示解锁通知要改写副标题，不能新加信息行**：新增行在「S 曲线定位 + F 曲线行高」两种来源下大号字必然与相邻行叠（实测差 1px 就被 layout-check 抓到）
- **`Profile.applyToConfig` 的 `changed` 要跟旧表逐元素比对**：早期写成「只要过滤了 cryo 就 changed=true」，导致未解锁时每次刷新都误报 changed

## 移植文档（已交付）
`docs/cocos-port/COCOS_SPEC.md` —— Cocos Creator 复刻规格（**1749 行**，17 章 + 2 附录），任何人/AI 按它可复刻同款游戏；配套 `docs/cocos-port/game-data.json`（由 `js/config.js` 导出的全部纯数据，可直接导入引擎）。**改数值仍以 `js/config.js` 为唯一源头**，改完需重新导出 JSON 并同步文档。
导出：**已入库为 `tools/export-game-data.js`**，直接 `node tools/export-game-data.js` 即可重导（不再用一次性 `node -e`）。导出键：`meta/elem/towerOrder/towerOrderAll/towers/lv/resonance/mutations/vis/monExtent/enemies/growth` —— `echo` 与 `pulse` 两节已删、新增 `mutations` 与 `growth`。
2026-09-19 同步内容（两批）：① 1.3 核心机制改三套 + 「主动技/倒带已下线」说明、第 11 章标作废、12.3 HUD 表与 12.4 卡片公式重写、风塔质量衰减说明；② 加第 14.1 节「回响档案（局外成长）」+ 第 16.6 节验收清单 + 第 15 章映射表加 `profile.js`；§1.1 由三套机制改四套、§7 冰塔改为「解锁上架」、§10.3 突变池与 §10.5 深渊档、§13 结算页一行。
