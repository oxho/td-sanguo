# V0.2 M2 自测

日期：2026-11-28。分支 `cursor/v02-m1-25d`，不合并。测的是 `npm run build` 之后的 `dist`，用 `npx serve dist` 打开。美术用的是定稿包（单张 `bg_M1.webp`，箭楼与乱兵图集，独立阴影贴图）。

## 改了什么

- 接入定稿美术。锚点、`pxPerCell`、步幅、开火点都读图集 JSON。乱兵按 `pxPerCell` 145 缩放，走路 12 帧，`anims.globalTimeScale` 跟倍速，单只怪的 `timeScale` 用步幅 0.524 换算后夹在 0.5–1.6。箭楼锚点 (0.5, 0.73645)，`sprite.y` 落在塔基中心。背景只有 `map/bg_M1.webp`，按 `placeAtCanvas [0,0]`、`scaleToDesign` 2/3 摆。阴影是独立贴图，不跟单位翻转，塔没有贴花。山贼仍是色块，描边用 `#B5E05A` 的发光滤镜。
- 飞行物、关卡标签、飘字、血条在地面单位之上。地图上不再另画塔基椭圆。塔的点选盒按帧高度，可见按钮仍至少 44 CSS 像素。第 15 行在底栏上方至少 8 CSS 像素。开启 mipmap。
- QA-001：火攻浮层改到左上，面板 `pointer-events: none`，按钮仍可点。第 13–15 行点得到。
- QA-002：`.hud .guide-tip.panel` 盖过 `.hud .panel` 的 `pointer-events: auto`。引导不挡 p2 / p3，跳过按钮仍可点。
- QA-003：只有首次 1-1（没完成也没跳过）才等第一座塔。建塔后倒数，跳过引导不提前倒数，重玩 1-1 直接倒数。
- QA-004：出征按钮去掉写死的 80px，用 `--tap` 90px。
- QA-005：倍速写在 `localStorage` 键 `td.settings.speed`。刷新保留。不进 MetaSave，不进导出串。1-1 第 1 波按钮仍禁用。
- QA-006：只替换 `src/data/levels.json` 里的 1-2、1-3、1-4。`hp_mul` 分别是 1.1、1.25、1.25，波数仍是 8、8、10。1-1 和 1-5 没动。`docs/td-prd-v0.2-25d.md` 用 V0.2.2 原文覆盖。
- `npm run build` 写 `dist/version.json`（当前是 `0.2.0-m3` 加 `git rev-parse --short HEAD`）。设置页关于栏读取它。

## 怎么跑

```bash
npm install
npm test
npm run build
npx serve dist
```

不要用 `file://` 打开 `index.html`。

## 结论

| 项 | 结论 |
|---|---|
| `npm test`（28 条，含三关 `hp_mul`、波数和运行时出怪） | 已验证 |
| `npm run build`，`dist/version.json` 含版本和短提交 | 已验证 |
| 五个视口画布对齐、每个塔基中心/上缘/下缘/塔顶打开对应环、可见按钮 ≥44 | 已验证（Playwright 1 条，57 秒） |
| 第 15 行底到波次栏顶：360×800 为 8.3px，390×844 为 9px，412×915 为 9.5px，1280×800 为 10.4px，768×1024 为 13.3px | 已验证 |
| QA-001 390 与 1280：第 13/14/15 行 `elementFromPoint` 都是 `#hit`，浮层 `pointer-events` 为 `none` | 已验证 |
| QA-002 390：p2、p3 点到 `#hit`，引导 `pointer-events` 为 `none`，点 p2 打开 `M1-p2` | 已验证 |
| QA-003 建塔后由「4 秒 · 提前 +8」走到「3 秒 · 提前 +6」；跳过引导后仍是「等第一座塔」；重玩没有引导，显示「4 秒 · 提前 +8」 | 已验证 |
| QA-004 出征按钮高：360×800 为 45px，390×844 为 48.75px | 已验证 |
| QA-005 刷新后按钮仍是 2×，键值是 `2`；账号存档和导出串都没有 speed | 已验证 |
| QA-006 1-2 第 1 波乱兵生命 44（40×1.1），第 3 波队列 8 只（乱兵 4、鹰 2）；1-3 第 6 波刀盾 5、乱兵 4；1-4 第 10 波 15 只（乱兵 5、轻骑 5）。1-1 仍是 `hp_mul` 1、6 波；1-5 仍是 1.15、10 波 | 已验证 |
| 乱兵读 `pxPerCell` 145，步幅参考速度约 1.048；箭楼锚点下落量小于 0.05px | 已验证（单测） |
| Firefox、真机、1-2 到 1-5 整关打完 | 未验证 |

## QA-006 运行时读数

单测 `V0.2.2 level pressure` 用 `createRun` 读关卡，再 `dispatch start`：

| 关卡 | hp_mul | 波数 | 运行时 |
|---|---|---|---|
| 1-2 | 1.1 | 8 | 第 1 波第一只乱兵 `maxHp` 44；第 3 波队列 8，其中乱兵 4、鹰 2 |
| 1-3 | 1.25 | 8 | 第 1 波乱兵 `maxHp` 50；第 6 波刀盾 5、乱兵 4 |
| 1-4 | 1.25 | 10 | 第 1 波乱兵 `maxHp` 50；第 10 波队列 15，乱兵 5、轻骑 5 |

## 截图

火攻瞄准时浮层在左上，第 14 行可点：

![QA-001](v02m2-qa001-aim-390.png)

引导还在时，p2 的环形菜单已经打开：

![QA-002](v02m2-qa002-guide-p2.png)

第一座箭楼建完后倒计时在走（3 秒 · 提前 +6）：

![QA-003](v02m2-qa003-after-tower.png)

360 宽下的乱兵和山贼描边：

![乱兵](v02m2-360-luanbing-closeup.png)

设置页关于栏读取 `dist/version.json`。`npm run build` 把版本和当时的短提交写进这个文件，设置页显示的就是这一份。

![版本](v02m2-qa005-version.png)

## 下次换美术时一起替换

图和 JSON 必须同一批：

- `public/assets/atlas/atlas_enemy_0.webp` 和 `.json`
- `public/assets/atlas/atlas_tower_0.webp` 和 `.json`
- `public/assets/atlas/atlas_fx_0.webp` 和 `.json`
- `public/assets/atlas/fx_shadow.webp` 和 `.json`
- `public/assets/map/bg_M1.webp` 和 `bg_M1.json`

不要再引用 `bg_M1_0` / `bg_M1_1`。

## V0.2 M3

- 城门改画 `assets/sprites/gate.png`。脚落在第 15 行城门点，宽 2.2 格，随 `s(y)` 缩放，深度用 `depthKey` 的建筑层。不接点击，点选仍走 `#hit`。390 下点 p15 打开 `M1-p15`。
- 火攻的「施放 / 取消」挪到波次栏里。360 / 390 / 1280 的 9×16 格中心 `elementFromPoint` 全部是 `#hit`。按钮高：360 为 45px，390 为 48.75px，1280 为 56.25px。
- 箭楼 `shot` 时从 `firePoint.fromAnchorPx`（25.1, −145.33）乘显示缩放发出一条箭，飞到当时的目标点后消失。对象池 12 支，深度在地面单位之上。没有物理。
- 1-4 的 A9 数值这轮没改。
- 第 15 行到波次栏：360×800 为 8.3px，390×844 为 9px，412×915 为 9.5px，1280×800 为 10.4px，768×1024 为 13.3px。Playwright 原用例通过。

![城门](v02m3-390-gate.png)

![瞄准](v02m3-390-aim.png)

![箭矢](v02m3-390-arrow.png)

## 已知问题

- 除乱兵和箭楼 Lv1 以外，单位和塔仍是色块。山贼描边是发光滤镜，不是烘焙描边。
- 试点图集还没有 die 动作。`rout` 映射到 `die` 已写在 JSON 里，播放时没有对应片段。
- 高屏仍是 720×1280 加黑边。没有 CI。
- 关卡时长区间按 V0.2.2 的 A8，本包没有重打整关计时。
