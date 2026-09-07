# Cloud Studio 双端口运行

本项目的 Cloud Studio 启动拓扑由一个编排进程统一管理：

| 服务 | 监听地址 | Cloud Studio 用途 |
|---|---|---|
| 会员 Vite | `0.0.0.0:3000` | 主预览端口，可公开分享 |
| 超管 Vite | `0.0.0.0:3001` | 独立预览端口，建议设为「仅自己可见」 |
| 内部控制面 | `127.0.0.1:8788` | 仅供两个 Vite 服务代理 `/control` |

Node.js 需为 20 或更高版本。

## 一键启动

`.vscode/preview.yml` 包含两个应用条目。会员端条目执行：

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm cloudstudio
```

`cloudstudio` 只启动一个 `scripts/cloudstudio-run.mjs` 编排进程。该进程会将 `server/control-plane/index.mjs` 作为关键子进程启动，等待其健康后再启动会员 Vite 和超管 Vite。编排进程转发 `SIGINT` / `SIGTERM` / `SIGHUP`，并在任一关键子进程异常退出时关闭整组服务。

超管端条目不再执行第二次 `npm install`，而是等待：

```text
http://127.0.0.1:3001/control/health
```

这样可避免两个 Cloud Studio `apps` 并发修改 `node_modules`。

## 预览与权限

- `3000` 是唯一设置 `mainPort: true` 的端口。
- Cloud Studio 的端口链接默认为公开；`3001` 不自动打开预览。启动后请在 Cloud Studio 「端口」面板将它手动设为「仅自己可见」。`preview.yml` 没有可验证的私有端口配置字段，不应假定它会自动私有化。
- 两个 Vite 服务均把同源 `/control/*` 改写为控制面的 `/api/control/v1/*`，并代理到 `127.0.0.1:8788`。
- 内部控制面健康检查：`GET /api/control/v1/health`；两个前端的同源健康检查：`GET /control/health`。

Cloud Studio 预览域名格式：

```text
https://${X_IDE_SPACE_KEY}--3000.${X_IDE_SPACE_REGION}.${X_IDE_SPACE_HOST}
https://${X_IDE_SPACE_KEY}--3001.${X_IDE_SPACE_REGION}.${X_IDE_SPACE_HOST}
```

## 本地命令

```bash
npm run dev:member   # 0.0.0.0:3000
npm run dev:admin    # 0.0.0.0:3001
npm run dev:all      # 控制面 + 两个 Vite 服务
npm run build        # 保留的会员端生产构建
npm run build:all    # 会员端 + 超管端构建
npm test             # 保留的 Vitest 命令
npm run test:control # 控制面 Node 集成测试
npm run test:all     # 浏览器侧测试 + 控制面测试
```

## 环境变量与数据

- 编排器固定把控制面绑定到 `127.0.0.1:8788`；不要把该端口直接公开。
- 正式使用提供商密钥或合作方密钥前，需要在工作空间环境变量中配置 `CONTROL_PLANE_MASTER_KEY`。不要把密钥写进源码、上传包，或任何 `VITE_*` 变量（`VITE_*` 会进入浏览器产物）。
- `CONTROL_PLANE_DATA_FILE` 可覆盖控制面数据文件位置；未设置时使用 `server/control-plane/data/control-plane.json`。该 JSON 是单工作空间文件存储，不等同于数据库、备份或多实例共享存储。
- Cloud Studio 停止工作空间后，两个预览网址也会停止服务。工作空间休眠或关闭后通常保留存储，删除工作空间会释放存储；免费高性能工作空间还可能按平台闲置回收策略被释放，因此重要数据仍需另行备份。

## 超管入口约束

`vite.admin.config.ts` 的生产入口是：

- `admin.html`
- `src/admin/main.tsx`

若任一入口缺失，编排进程会输出明确警告；`3001/control/health` 仍可探活，但超管页面返回 `503`，且不会回退到会员端 `index.html`。`npm run build:all` 还要求超管入口的完整依赖图均已落盘并可通过 TypeScript/Vite 构建。

## 上传包

```bash
npm run cloudstudio:package
```

产物为 `release/ai-video-app-cloudstudio.zip`。上传包排除 `node_modules`、`dist`、Git 历史、本地缓存、测试覆盖率和日志。Cloud Studio 预览依赖工作空间持续运行，不等同于带 SLA 的永久生产托管。

重新打包已经运行过的工作空间前，确认 `server/control-plane/data/` 未进入上传包；该目录可能包含账号、审计记录和加密后的凭据，不应随源码分发。

官方参考：[配置运行文件](https://cloud.tencent.com/document/product/1039/131807)、[URL 访问异常排查](https://cloud.tencent.com/document/faq/1039/131933)、[端口与 Web 预览插件](https://cloud.tencent.com/document/product/1039/131813)。
