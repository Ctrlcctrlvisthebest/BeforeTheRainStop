# itch.io 发布包

账号：`ctrlcctrlvisthebest`。用户创建页面中当前填写的名称是 `BeforeTheRainDrop`，路径是 `beforetheraindrop`；打包不改游戏里的中英文名。

项目草稿已保存：`https://itch.io/game/edit/5013952`。尚未公开，ZIP 与封面上传等待 Chrome 扩展启用文件 URL 访问权限。

## 上传文件

`releases/before-the-rain-itch-2.13.0.zip`，约 3.37 MiB。根目录含 `index.html`，共 14 个文件。完整保留 40 关、原 UI 和三维场景、1 / 2 / 3 / 6 人模式、两首 BGM、手机操作及中英文。不包含地图编辑器，不采用小红书的单人或无音乐限制。

```sh
npm run build:itch
```

独立 `dist-itch` 目录及 `.env.itch`，资源路径使用已有的相对路径；使用原共享样式与渲染器，没有视觉样式变更。音频文件与原件逐字节比对通过。

## itch.io 页面设置

- Classification：Games
- Kind of project：HTML
- 上传 ZIP 后勾选 This file will be played in the browser
- Embed options：Click to launch in fullscreen
- 勾选 Mobile friendly，Orientation 保持 Default
- 不启用 SharedArrayBuffer
- Release status 保持 In development
- 现有价格为 $0 or donate，没有设置付费门槛
- 封面可使用 `public/menu-scene.webp`，来自现有游戏画面

页面介绍和操作说明已准备为中英文。生成式 AI 标注按实际使用填写 Code、Text & Dialog、Sounds。

## 联机来源配置

itch.io 官方 CDN 为 `https://html-classic.itch.zone` 和 `https://html.itch.zone`，已将这两个精确来源加到 `wrangler.github.jsonc`，没有使用通配符。原 GitHub / Toy 来源保留。

**当前状态：配置已完成并通过测试及部署预检，生产部署尚未完成。自动审批要求用户明确批准生产来源白名单变更。** 上传包仍包含联机功能，但在配置部署前 itch.io 中的联网请求会被服务端拒绝。

## 检查

- `npm run build:itch`、普通版构建、TypeScript、40 关地图规则通过。
- Worker / 客户端边界相关 14 项测试通过，包括新增的真实 Worker 来源检查：itch 来源接受，仿冒域名拒绝。
- Wrangler types 与 deploy dry-run 通过。标准 Three.js chunk 体积提示仍在。
- Chrome 实际构建预览：第 20 关正常进入，音乐播放，控制台无错误；已准备实际画面截图。
- ZIP 文件数量、路径长度、单文件/解压总大小、资源相对路径与两首原音乐比对通过。

## 官方说明

- HTML 游戏上传：https://itch.io/docs/creators/html5
- 官方 CDN 域名：https://itch.io/t/3099694/notice-for-html-game-devs-upcoming-change-to-cdn-domain
