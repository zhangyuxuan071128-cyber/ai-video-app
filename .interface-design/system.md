# 星核影枢 Interface System

## Direction

面向短视频创作者、代理与平台管理员的暗色生产控制台。视觉世界来自魔法文明控制终端，但产品信息必须始终清晰、精确、可长时间使用。

- 登录页：仪式感强的身份认证门户，`variance 7 / motion 6 / density 3`。
- 产品页：高效的黑曜石工作台，`variance 5 / motion 4 / density 7`。
- 产品签名：`生成星轨`。登录时是认证门户，创作时是步骤编排，任务页是进度引擎，仪表盘是生产状态轨道。
- 拒绝普通紫色 SaaS 卡片墙、彩虹赛博霓虹、每个表面都模糊、无业务含义的旋转装饰。

## Domain language

创作中枢、任务星轨、素材矩阵、模型平台、能量钱包、生成阶段、额度预留、生产队列、连接适配器、审计轨迹。

## Color and surfaces

- Canvas: `#03040a`
- Shell: `rgba(5, 6, 17, .94)`
- Surface 1/2/3: `rgba(10, 11, 25, .78)` / `rgba(15, 17, 34, .88)` / `rgba(20, 22, 43, .96)`
- Brand: `#8d72ff`; brand bright `#ada1ff`
- Focus / ice light: `#83c7ff`
- Success `#70d8ba`; warning `#efc677`; danger `#ef8ca9`
- Text hierarchy: `#f3f1ff` / `#dfdcf7` / `#a8a4c3` / `#7f7b99`
- Login panel and modal may use backdrop blur. Ordinary product panels use quiet surface shifts and low-opacity borders.
- Borders are `rgba(190, 183, 255, .065-.20)` and should disappear when not being inspected.

## Depth and shape

- Dark mode depth uses surface shifts plus a subtle line. Shadows are reserved for floating surfaces.
- Inputs are darker than their parent surface.
- Radius scale: controls 8px, panels 12px, dialogs 16px. Decorative cut corners are implemented with pseudo-elements or clip-path without reducing hit areas.
- No large generic glass cards and no heavy glow on data-dense screens.

## Typography

- Sans: `Avenir Next`, `SF Pro Display`, `PingFang SC`, `Microsoft YaHei`, sans-serif.
- Mono: `SFMono-Regular`, `Cascadia Code`, `Roboto Mono`, monospace.
- Scale: 10, 11, 12, 14, 16, 18, 22, 28px.
- Dynamic numbers and timecodes use tabular numerals.
- Chinese product information never uses decorative rune type. Runes are graphics only.

## Spacing and layout

- Base unit: 4px.
- App shell: sidebar 248px, collapsed 72px; top bar 64px; content padding 24-32px; max width 1680px.
- Login panel: `clamp(390px, 42vmin, 460px)` with 52px inputs and 58-64px primary action.
- Every interactive hit area is at least 44px.
- Multi-column product views explicitly collapse below 860px.

## Reusable components

- Primary button: 40px minimum height, 8px radius, 14px/600, one amethyst accent, active scale 0.98.
- HUD panel: surface-1 or surface-2, 12px radius, quiet border, 16-24px padding.
- Status badge: status color is secondary to a readable text label.
- Input: 44px minimum height, dark inset surface, visible label, ice focus outline, inline error.
- App navigation: current item uses a small core marker and narrow energy track, not a filled purple pill.
- Progress ring: must represent a real task, quota, or workflow value. Decorative rings are not allowed in product pages.
- Empty state: dormant core motif, a concise explanation, and one useful action.
- Confirmation dialog: required for freeze, terminate, permanent purge, withdrawal decision, and high-risk global settings.

## Motion

- UI timings: 130ms fast, 190ms control, 260ms surface.
- Login portal uses long independent 52-108 second ring rotations and a 4.2 second core pulse.
- Product navigation and frequent actions never exceed 280ms.
- Only transform and opacity are animated. Pointer parallax uses GSAP quickTo and refs, never React state.
- Reduced motion stops sustained rotation, particles and parallax while preserving focus, hover, color and short opacity feedback.

## States and integrity

- Every action has default, hover, active, focus-visible and disabled states.
- Every data surface has loading, empty, error and success handling.
- All provider, SMS, payment, withdrawal and AI generation claims show their real adapter/configuration state.
- API keys are never displayed or persisted in plain text; only last four characters and connection identifiers are retained locally.
- Task credits follow reserve, settle, release. Failed, cancelled and terminated work cannot consume completed-work credits.

## Surface contract · CreateStudio

- Seed: `orbit-six-stage-v1`.
- Thesis: a compact director's workbench that turns a vague brief into a traceable production task without implying that an external model has started.
- Own-world: the six-stage director chain, four-step configuration rail, quota path and local-draft signal all use the established orbital control-plane language.
- Story: first explain the six-stage production model, then choose generation mode, provide material, confirm output and credits, and only then submit to the local queue.
- First viewport: page purpose, current step and the complete six-stage map must remain legible together at 1280px; no decorative copy may compete with the first decision.
- Form: dense dark workbench, one amethyst action accent, cool status light, quiet borders and cut-corner controls; no generic glass-card wall or unsupported provider-success state.
- Finish: keyboard focus and semantic labels remain intact, coarse-pointer actions reach 44px, muted text meets 4.5:1 against the canvas, reduced-motion is respected, and all demo-only behavior is named in the interface.
- Quality bar: preserve the established member/admin visual world, avoid new gradients or typography systems, and ship only after desktop/mobile screenshots, overflow checks, tests and production builds pass.
