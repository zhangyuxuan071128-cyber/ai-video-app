# ai-video-app · 星核影枢

面向短视频创作者、代理与平台运营者的 AI 视频聚合平台。当前仓库交付的是可运行的 Web MVP：会员创作端、独立超级管理端，以及两端共用的服务端控制面。

> 最高有效需求基线采用「V7.1 核心规范 + V5 非冲突必加项 + 上线行动 V6 的角色与运营门禁」。V4.1、V4.2、千问 V6、V1.5 与补遗用于专项补丁和查漏，不以较低版本号覆盖 V7.1 的安全与业务规则。详细裁决见 [`docs/VERSION_BASELINE.md`](docs/VERSION_BASELINE.md)。

## 当前交付状态

| 区域 | 状态 | 说明 |
|---|---|---|
| 会员端 | 可运行 | 创作、30 秒本地草稿、规则式提示优化、任务、素材、模型连接、钱包、邀请佣金、通知、教程反馈和账户设置 |
| 超级管理端 | 可运行 | 独立入口与会话；用户、卡码、套餐、供应商、合伙人密钥、内容、风控和审计 |
| 共享控制面 | 可运行 | HttpOnly 会话、RBAC、密码哈希、限流、卡码哈希、幂等额度账本、加密 Vault 和审计链 |
| 创作执行 | 本地演示 | 创建、排队、取消、重试与额度预留可验收；不会向真实模型发送素材 |
| 外部服务 | 待接入 | AI 供应商、短信、支付、提现、对象存储、队列 Worker、FFmpeg 与平台直发 |
| 后续产品层 | 已建路线图 | 高级节点画布、模型 PK、作品版本、批量导入、H5 分销端与原生应用 |

完整的「已实现 / 本地演示 / 待接入 / 后续」矩阵见 [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md)。仓库不包含用户提供的原始 DOCX，避免把私有业务资料直接发布到 GitHub。

## 本地启动

需要 Node.js 20 或更高版本。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:all
```

| 服务 | 地址 | 边界 |
|---|---|---|
| 会员端 | `http://localhost:3000` | 创作者与代理入口 |
| 超级管理端 | `http://localhost:3001` | 仅超级管理员使用 |
| 内部控制面 | `http://127.0.0.1:8788` | 只供两端通过 `/control` 代理访问，不应公开 |

## 本地验收账号

| 角色 | 账号 | 初始密码 |
|---|---|---|
| 创作者 | `creator` | `123456` |
| 代理 | `agent` | `123456` |
| 超级管理员 | `admin` | `123456`（首次登录强制修改） |

这些账号和固定演示数据只用于本地验收，不可直接暴露在公网生产环境。控制面在线时，邀请码与充值码必须由管理端生成并在服务端原子核销。

## 数据与外部服务边界

当前控制面使用服务端原子 JSON Store，适合单工作空间联调，不等同于具备迁移、备份、容灾和多实例一致性的商业数据库。下列能力没有被伪造成在线成功：

- DeepSeek、智谱 GLM、通义千问、即梦、火山方舟、百度曦灵及其他候选模型适配器；
- 短信验证码、真实充值、支付、佣金结算与提现；
- 视频解析、声音克隆、数字人、内容审核、FFmpeg Worker、ZIP 大文件打包；
- 对象存储、持久任务队列、SSE/WebSocket、监控、备份和容灾；
- 抖音、快手、视频号等平台的 OAuth 授权与直发。

密钥写入需要 `CONTROL_PLANE_MASTER_KEY`；服务端只回显状态和末四位。复制 `.env.example` 后通过部署平台的加密环境变量注入真实值，禁止把凭据写入源码或 `VITE_*` 变量。生产构建默认关闭 source map。

## 质量验证

```bash
pnpm typecheck
pnpm test:all
pnpm build:all

# 一次执行全部门禁
pnpm verify
```

GitHub Actions 会在 `main` 推送和 Pull Request 上执行锁定依赖安装、类型检查、前端与控制面测试，以及会员端/管理端双构建。

## 部署与设计

- Cloud Studio 双端口说明：[`CLOUDSTUDIO_DEPLOY.md`](CLOUDSTUDIO_DEPLOY.md)
- 控制面接口与安全边界：[`server/control-plane/README.md`](server/control-plane/README.md)
- 视觉与交互系统：[`.interface-design/system.md`](.interface-design/system.md)
- 安全披露与上线提醒：[`SECURITY.md`](SECURITY.md)

正式商用前仍需完成生产数据库、持久卷、队列/Worker、真实供应商适配器、回调验签、对象存储、支付对账、监控告警、备份恢复，以及全链路安全测试。
