# 答题系统 - 选手端

基于 Vite + React 的移动端选手客户端，覆盖登录、等待页、答题页、主持人 MQTT 指令联动，以及 Fusion / 题海接口对接。

## 当前能力

- 固定台号登录，登录态和答题缓存持久化。
- 等待页展示赛事、队伍信息、排行榜和 MQTT 连接状态。
- 支持 `qa`、`qa-20`、`qa-30`、`qa-50`、`last-stand`、`last-stand-group`、`speed-run`、`ocean-adventure`、`ultimate-challenge`、`buzzer-sprint`、`ultimate-pk`。
- 支持标准题、题海题、图片题、词库填空、连线、点选、画板填空等交互。
- 内置 Vitest 单测和 Playwright E2E。

## 技术栈

- Vite
- React 19
- React Router
- TypeScript
- Zustand
- MQTT.js
- Arco Design Mobile
- Vitest
- Playwright

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 手动创建 `.env.local`

```env
VITE_FUSION_API_BASE=https://your-fusion.example.com/fusion
VITE_FUSION_API_TOKEN=your-token
VITE_FUSION_SPACE_ID=your-space-id
VITE_FUSION_EVENT_NODE_ID=your-event-node-id

VITE_TIHAI_API_BASE=https://your-quiz-pool.example.com/api

VITE_MQTT_ENABLED=true
VITE_MQTT_URL=wss://your-broker.example.com:8084/mqtt
VITE_MQTT_USERNAME=your-username
VITE_MQTT_PASSWORD=your-password
VITE_MQTT_TOPIC_COMMAND=cmd
VITE_MQTT_TOPIC_CONTROL=quiz/control
VITE_MQTT_TOPIC_RESULT=quiz/result
VITE_MQTT_TOPIC_BUZZ_IN=quiz/buzz_in
VITE_MQTT_TOPIC_STATE_PREFIX=state
```

`NEXT_PUBLIC_*` 旧变量名在迁移阶段仍会作为回退读取。

3. 启动开发环境

```bash
npm run dev
```

默认访问：

- `/login` 选手登录
- `/waiting` 等待页
- `/quiz?mode=speed-run` 指定赛制调试

更多启动说明见 [docs/QUICKSTART.md](./docs/QUICKSTART.md)。

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run preview
npm run type-check
npm test
npm run test:e2e
npm run test:e2e:broker
```

## 项目结构

```text
.
├── src/pages/              # SPA 路由页面
├── src/providers/          # 全局 Provider 与 E2E 桥接
├── src/app/                # 全局样式与保留的 CSS Modules
├── src/features/quiz/      # 赛制运行时、题型组件、答题逻辑
├── src/store/              # app-store / quiz-store
├── src/lib/                # API、MQTT、题目归一化、Arco 适配
├── e2e/                    # Playwright 用例
├── docs/                   # 当前有效文档
└── docs/archive/           # 历史实现、部署和迁移文档
```

## 文档导航

- [docs/README.md](./docs/README.md) 文档索引
- [docs/QUICKSTART.md](./docs/QUICKSTART.md) 本地启动与测试
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) 当前架构与开发约定
- [docs/API.md](./docs/API.md) 当前对接接口与消息通道
- [docs/CONTEST_MODES.md](./docs/CONTEST_MODES.md) 当前选手端已实现赛制模式总表与逐模式说明
- [docs/MQTT_COMMANDS.md](./docs/MQTT_COMMANDS.md) MQTT 主题、主持人指令和抢答消息格式
- [docs/FUSION_SCHEMA.md](./docs/FUSION_SCHEMA.md) Fusion 表结构与字段约定
- [docs/GROUP_PK_API.md](./docs/GROUP_PK_API.md) 分组 PK 对接说明
- [docs/QUIZ_REGRESSION_TEST_PLAN.md](./docs/QUIZ_REGRESSION_TEST_PLAN.md) 回归测试计划
- [docs/QUIZ_MANUAL_SMOKE_CHECKLIST.md](./docs/QUIZ_MANUAL_SMOKE_CHECKLIST.md) 人工冒烟清单
- [docs/MQTT_TROUBLESHOOTING.md](./docs/MQTT_TROUBLESHOOTING.md) MQTT 故障排查
- [docs/REACT19_MIGRATION.md](./docs/REACT19_MIGRATION.md) React 19 与 Arco 适配说明
- [docs/FLEXIBLE.md](./docs/FLEXIBLE.md) 移动端 rem 适配说明
- [docs/archive/README.md](./docs/archive/README.md) 归档文档说明
