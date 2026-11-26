# Third-party notices

《三国·烽火城关》V0.1 使用了下面这些第三方材料。游戏本身的题材、角色、数值和地图按本仓库的需求文档实现，不沿用参考项目的封神名称或美术。

## tower-defense-skill

战斗循环里的固定步长、清波军资 `30 × 1.12^波数`、城门升级公式、种子随机数，以及抽卡保底和祝福/契约的状态机形状，改写自：

tower-defense-skill  
Copyright (c) 2026 阿軒 (mars-tw)

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

游戏「设置 → 关于」里也保留了这一行版权说明。

## Fonts

正文：Noto Serif SC  
来源：https://github.com/notofonts/noto-cjk/tree/main/Serif （Simplified Chinese Regular）  
许可证：SIL Open Font License 1.1，全文见 `public/assets/fonts/OFL-NotoSerifSC.txt`

标题：Ma Shan Zheng  
来源：https://github.com/google/fonts/tree/main/ofl/mashanzheng  
许可证：SIL Open Font License 1.1，全文见 `public/assets/fonts/OFL-MaShanZheng.txt`

仓库里放的是按本版本界面用字裁过的 OFL 子集（`NotoSerifSC-subset.otf`、`MaShanZheng-subset.ttf`），不是整套 CJK 字体。游戏名里的间隔号「·」用 Noto Serif SC 绘制，因为马善政楷书没有这个字形。

## Phaser

Phaser 4.2.1，Copyright Phaser Studio Inc.  
许可证：MIT。由 npm 依赖引入，不把框架源码再复制进本仓库。

## 本项目画面

`public/assets` 里的地图、塔、敌人和界面底材来自本项目随设计稿提供的画面，供这版网页客户端使用。没有放入内部参考照片。
