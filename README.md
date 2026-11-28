# 三国·烽火城关

V0.2 第一步（斜俯占位 + 节奏）。只包含第一章 1-1 到 1-5，存档在浏览器本地。没有账号、服务器、广告或支付。关于页写的是 V0.2。导出存档 `version` 是 2，`dataHash` 是 `sanguo-v0.2-2026-11-28`。旧的 V0.1 存档可以导入，进度还在，没打完的那一局会丢掉。

## 开发

```bash
npm install
npm run dev
```

浏览器打开终端里给出的本地地址（默认 `http://127.0.0.1:5173`）。

## 预览构建结果

```bash
npm run build
npx serve dist
```

用本地静态服务器打开 `dist`，不要用 `file://` 直接打开 `index.html`。浏览器会拦截这种打开方式下的模块加载。

构建产物是静态文件。本仓库不托管、不部署。

## 怎么玩

主界面「出征」进入第一章。1-1 会引导：建箭楼、开波、升级、放火攻，可以跳过。新档赠送黄忠和马超，第一次单抽免费。这两条是临时默认，不是已定验收项。

## 自测

见 [docs/self-test.md](docs/self-test.md)。

## 字体

正文是 Noto Serif SC，标题是 Ma Shan Zheng，都按 SIL OFL 1.1 从官方仓库裁了本版用字。许可证在 `public/assets/fonts/`。说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
