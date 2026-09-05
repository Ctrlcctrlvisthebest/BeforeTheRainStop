# 雨停之前 · Before the Rain Stops

千纸鹤主题的 2.5D 合作横版动作游戏。支持 **1、2、3、6 人**，每人控制一只纸鹤。

**[直接开玩](https://ctrlcctrlvisthebest.github.io/BeforeTheRainStop/)** · [备用入口](https://before-the-rain-rooms.zoeli2010xl.workers.dev)

## 怎么玩

| 操作         | 效果                              |
| ------------ | --------------------------------- |
| ← → / A D    | 沿当前视角左右移动                |
| 空格 / ↑ / W | 跳跃；下落时按住滑翔              |
| Q / E        | 旋转世界 90°，切换 X / Z 行走方向 |
| Shift        | 地面上按住，折成桥供同伴通过      |
| R            | 回到个人最近的存档旗              |

可以跳到同伴头上。找齐钥匙后，全员抵达金色灯门才通关；星星是可选挑战。多人机关要同时占住两块圆垫，单人只需一块。机关开启后保持开启。

四个关卡分别引入转面绕墙、台阶与合作机关、风柱与移动平台、周期雨刃。所有关卡可在大厅选择。手机提供触屏按键，横屏更适合操作。

## 联机

选择 2 / 3 / 6 人并创建房间，把邀请链接或 8 位房间码发给朋友。人数齐且所有人连接后，由房主开始。所有人独立操作，任何玩家按 Q 都会转动全队视角，转面前需要配合。

房间自创建起保留 24 小时。刷新原标签页可以恢复座位；另一个独立标签页可以加入为其他玩家。掉线时关卡暂停，重连后继续。重开和下一关需要全员同意。没有公开匹配、聊天或机器人补位。

单人使用本地物理模拟；多人通过 WebSocket 发送操作，由服务器每秒运行 60 次物理更新、每秒发送约 15 次权威快照。客户端做最多 100 毫秒预测及画面平滑。仅服务器决定收藏、机关与通关结果。不是同屏轮流操作。

## 本地开发

需要 Node.js 24：

```sh
npm ci
npm run types
npm run build
```

分别打开两个终端：

```sh
npm run dev:server
```

```sh
npm run dev
```

默认页面 `http://127.0.0.1:5173`，Vite 将 `/api` 和 WebSocket 转发至本地 `8788` 端口。单人不需要房间服务。

## 发布

GitHub Pages 托管前端，Cloudflare Workers + Durable Objects 托管联机房间。

- GitHub 仓库 Pages 来源为 **GitHub Actions**，推送 main 后自动测试、构建并发布。
- 默认房间服务写在 `.env.production` 和发布工作流的公开配置中。可使用仓库变量 `VITE_ROOM_SERVER_URL` 覆盖。
- `wrangler.jsonc` 的 `ALLOWED_ORIGINS` 已包含 `https://ctrlcctrlvisthebest.github.io`。如换域名，增加其 origin 后重新部署后端。
- 资源路径使用 `./`，适用于 GitHub Pages 仓库子路径。

重新发布房间服务及备用入口：

```sh
npm run build
npm run deploy:server
```

部署凭证由本机 Wrangler 管理，不放入网页或仓库。浏览器的房间座位凭证只保存在自己的 sessionStorage，通过 WebSocket 首次认证消息或 HTTPS Authorization 头发送，不放入邀请链接。

Cloudflare 用量取决于账号方案和游戏时长。房间在无连接和过关时停止模拟，有创建频率限制，并在 24 小时后清理。

## 测试

```sh
npm test
npm run build
npm run test:integration
```

集成测试需要运行本地房间服务；也可指定已部署服务：

```sh
TEST_SERVER=https://before-the-rain-rooms.zoeli2010xl.workers.dev npm run test:integration
```

18 项单元测试覆盖四关的真实操作通关路线（无传送）、跳跃滑翔、两轴碰撞、叠站和折桥、个人存档、各人数机关与全员过关、移动平台、输入校验与房间权限。另有 3 项真实 WebSocket 集成测试覆盖 2 / 3 / 6 人同步、座位隔离、视角共享、掉线暂停和重连。

## 结构

- `src/game.ts`：确定性 60 Hz 物理与四个手工关卡。
- `src/scene.ts`：Three.js 纸鹤、平台、光照、相机旋转与动画。
- `src/main.tsx`、`src/style.css`：大厅、操作、HUD、触屏按键、结算。
- `src/api.ts`：房间请求、WebSocket 与自动重连。
- `src/room.ts`：人数、权限、加入与投票。
- `server/worker.ts`：房间路由、权威模拟、SQLite 存档与过期回收。
- `tests/journey.ts`：使用正常输入完成四关的自动化路线。
- `.github/workflows/pages.yml`：Pages 自动发布。

几何纸鹤、平台和音效由代码生成；没有复用 SpriteQuest 或 PICO PARK 的关卡、美术或音频。字体为 Google Fonts Noto 系列，有系统字体回退。
