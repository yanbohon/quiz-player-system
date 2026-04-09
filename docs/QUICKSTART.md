# 快速开始

## 环境要求

- Node.js `>= 18.18`
- npm `>= 9`

## 1. 安装依赖

```bash
npm install
```

## 2. 创建 `.env.local`

项目当前没有维护 `.env.example`，请按下面模板手动创建：

```env
NEXT_PUBLIC_FUSION_API_BASE=https://your-fusion.example.com/fusion
NEXT_PUBLIC_FUSION_API_TOKEN=your-token
NEXT_PUBLIC_FUSION_SPACE_ID=your-space-id
NEXT_PUBLIC_FUSION_EVENT_NODE_ID=your-event-node-id

NEXT_PUBLIC_TIHAI_API_BASE=https://your-quiz-pool.example.com/api

NEXT_PUBLIC_MQTT_ENABLED=true
NEXT_PUBLIC_MQTT_URL=wss://your-broker.example.com:8084/mqtt
NEXT_PUBLIC_MQTT_USERNAME=your-username
NEXT_PUBLIC_MQTT_PASSWORD=your-password
NEXT_PUBLIC_MQTT_TOPIC_COMMAND=cmd
NEXT_PUBLIC_MQTT_TOPIC_CONTROL=quiz/control
NEXT_PUBLIC_MQTT_TOPIC_RESULT=quiz/result
NEXT_PUBLIC_MQTT_TOPIC_BUZZ_IN=quiz/buzz_in
NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX=state
```

补充说明：

- 只做页面开发时，可以将 `NEXT_PUBLIC_MQTT_ENABLED=false`。
- `NEXT_PUBLIC_API_BASE_URL` 不是当前主链路必需项，仅保留给通用 REST helper。

## 3. 启动本地开发

```bash
npm run dev
```

默认地址：

- [http://localhost:3000/login](http://localhost:3000/login)
- [http://localhost:3000/waiting](http://localhost:3000/waiting)

## 4. 基础检查

```bash
npm run lint
npm run type-check
npm test
```

## 5. 浏览器级验证

```bash
npm run test:e2e
```

说明：

- Playwright 会在本地自动启动应用，并注入一组专用 E2E 环境变量。
- 常规 E2E 默认禁用 MQTT，Broker 相关链路使用 `npm run test:e2e:broker` 单独覆盖。

## 常用调试入口

- `/login`：台号选择登录页
- `/waiting`：等待页、排行榜、赛事信息
- `/quiz?mode=qa`：有问必答
- `/quiz?mode=speed-run`：争分夺秒
- `/quiz?mode=ocean-adventure`：题海遨游
- `/quiz?mode=buzzer-sprint`：抢答冲刺

## 推荐阅读顺序

1. [API.md](./API.md)
2. [DEVELOPMENT.md](./DEVELOPMENT.md)
3. [QUIZ_REGRESSION_TEST_PLAN.md](./QUIZ_REGRESSION_TEST_PLAN.md)
