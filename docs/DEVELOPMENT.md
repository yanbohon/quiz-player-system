# 开发文档

## 页面流转

当前主流程很固定：

1. `/login`
2. `/waiting`
3. `/quiz?mode=<mode>`

首页 `/` 直接复用等待页实现。

## 目录分工

```text
src/
├── app/                     # Next.js 路由、页面壳子、Provider
├── components/              # 通用组件与 SVG 资源
├── config/                  # 环境变量解析、主题/消息通道配置
├── features/quiz/           # 赛制元数据、题型组件、hooks、工具函数
├── hooks/                   # 页面级共享 hooks
├── lib/                     # API、MQTT、题目归一化、Arco/Flexible 适配
├── store/                   # useAppStore / useQuizStore
├── test/                    # Vitest 测试工具
└── types/                   # 公共类型
```

## 运行时分层

### `useAppStore`

负责跨页面持久化状态：

- 当前登录用户
- MQTT 连接状态
- 已提交答案缓存
- 题海模式选择和分组锁定状态
- HP 扣血保护记录

### `useQuizStore`

负责赛事和赛段运行态：

- 当前赛事、赛段、题目列表
- 题目加载状态和错误
- 选手信息、分数记录、排行榜
- 题海剩余题量
- 等待页展示状态

### `useQuizRuntime`

按赛制抽象统一控制接口，屏蔽不同模式的差异：

- 题目推进
- 作答提交流程
- 抢答 / 判定 / 委托答题等控制能力
- 各赛制的计时、结果页和等待态

## 关键集成点

### MQTT

- 配置在 `src/config/control.ts`
- 客户端在 `src/lib/mqtt/client.ts`
- 页面和运行时通过 `useMqttSubscription` 与主持人消息联动

### Fusion

用于赛事、赛段、题表、成绩表和队伍信息：

- 配置在 `src/config/control.ts`
- 客户端在 `src/lib/fusionClient.ts`
- 主要由 `useQuizStore` 负责拉取与回写

### 题海接口

用于 `ocean-adventure`：

- 基础地址在 `src/config/api.ts`
- 抢题 / 提交在 `src/lib/fusionClient.ts`

## 测试结构

### 单测与组件测试

- 工具：Vitest + Testing Library
- 位置：`src/features/quiz/**/*.test.ts?(x)`、`src/test/`

### E2E

- 工具：Playwright
- 位置：`e2e/`
- 覆盖：登录、等待页、争分夺秒、题海、终极挑战等主链路

### 人工冒烟

- 脚本见 [QUIZ_MANUAL_SMOKE_CHECKLIST.md](./QUIZ_MANUAL_SMOKE_CHECKLIST.md)
- 适用于 MQTT、抢答、连线几何和画板视觉状态

## 文档维护约定

- 只有“当前仍然指导开发”的文档才保留在 `docs/` 根下。
- 迁移记录、部署结果、阶段性总结统一归档到 `docs/archive/`。
- 变更了赛制、消息格式、关键环境变量后，优先更新 [API.md](./API.md) 和 [README.md](../README.md)。
