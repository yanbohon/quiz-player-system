# 接口与消息通道

本文档只描述当前代码实际使用的接入面，不再保留初始化阶段的示例认证接口。

## 总览

| 类型 | 作用 | 主要文件 |
| --- | --- | --- |
| MQTT | 主持人指令、抢答控制、结果广播、在线状态 | `src/config/control.ts`, `src/lib/mqtt/client.ts` |
| Fusion API | 赛事、赛段、题表、分数表、队伍资料 | `src/config/control.ts`, `src/lib/fusionClient.ts` |
| 题海 API | `ocean-adventure` 抢题与提交 | `src/config/api.ts`, `src/lib/fusionClient.ts` |
| 通用 REST helper | 保留给额外接口接入，不是当前主链路 | `src/lib/api/` |

## MQTT

### 环境变量

代码优先读取 `VITE_*`，仍兼容同名 `NEXT_PUBLIC_*` 旧变量作为回退。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_MQTT_ENABLED` | `true` | 设为 `false` 可完全禁用 MQTT |
| `VITE_MQTT_URL` | 无 | Broker WebSocket 地址，必须按环境配置 |
| `VITE_MQTT_USERNAME` | 无 | MQTT 用户名，按 Broker 要求配置 |
| `VITE_MQTT_PASSWORD` | 无 | MQTT 密码，按 Broker 要求配置 |
| `VITE_MQTT_TOPIC_COMMAND` | `cmd` | 主持人文本指令 |
| `VITE_MQTT_TOPIC_CONTROL` | `quiz/control` | 抢答控制主题 |
| `VITE_MQTT_TOPIC_RESULT` | `quiz/result` | 抢答结果主题 |
| `VITE_MQTT_TOPIC_BUZZ_IN` | `quiz/buzz_in` | 选手抢答上报主题 |
| `VITE_MQTT_TOPIC_STATE_PREFIX` | `state` | 在线状态主题前缀 |

### 当前用法

- 等待页和答题页根据 MQTT 连接状态展示提示。
- 主持人通过 `cmd` 发起刷新、回首页、切赛事、切题、开赛段等命令。
- `ultimate-challenge` 和 `buzzer-sprint` 通过 `quiz/control`、`quiz/result`、`quiz/buzz_in` 完成抢答流程。
- 在线状态使用 `state/<clientId>` 形式派生。

具体命令和值格式见 [MQTT_COMMANDS.md](./MQTT_COMMANDS.md)。

## Fusion API

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `VITE_FUSION_API_BASE` | Fusion 基础地址，必须按环境配置 |
| `VITE_FUSION_API_TOKEN` | Bearer Token，必须按环境配置 |
| `VITE_FUSION_SPACE_ID` | 空间 ID，必须按环境配置 |
| `VITE_FUSION_EVENT_NODE_ID` | 赛事节点 ID，必须按环境配置 |

### 当前请求

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/v1/spaces/{spaceId}/nodes/{eventNodeId}` | 拉取赛事列表 |
| `GET` | `/v1/datasheets/{datasheetId}/records` | 拉取赛段、题表、队伍、分数记录 |
| `PATCH` | `/v1/datasheets/{datasheetId}/records` | 回写答案、判定结果、分数字段 |

### 使用位置

- `useQuizStore.loadEvents`
- `useQuizStore.selectEventByOrdinal`
- `useQuizStore.activateStageById`
- `useQuizStore.refreshTeamProfile`
- `useQuizStore.refreshScoreRecord`
- `useQuizStore.submitAnswerChoice`
- `useQuizStore.submitJudgeResult`
- `useQuizStore.updateScoreStatus`

具体字段约定见 [FUSION_SCHEMA.md](./FUSION_SCHEMA.md)。

## 题海 API

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_TIHAI_API_BASE` | 无 | 题海接口基础地址，必须按环境配置 |

### 当前请求

#### `POST /grab-with-details`

用途：题海模式抢下一题。

请求体：

```json
{
  "userId": "1001",
  "groupId": "teamA"
}
```

说明：

- `groupId` 可选。
- 不传时走个人模式，传入时走分组 PK 计分。

#### `POST /submit-answer`

用途：提交题海答案。

请求体：

```json
{
  "userId": "1001",
  "questionId": "q-001",
  "answer": ["A"],
  "groupId": "teamA"
}
```

说明：

- `answer` 支持字符串或字符串数组。
- 前端会串行化提交、控制最小提交间隔，并在网络异常时重试。

## 通用 REST helper

`src/lib/api/` 仍然保留 `apiFetch` 和题目归一化工具，但它不是当前赛事运行主路径。

当前只有以下情况建议继续使用：

- 新增非 Fusion 的普通 REST 接口
- 需要通过统一 helper 读取题目 JSON 并归一化

## 错误与超时策略

- MQTT 连接失败不会阻止页面打开，只会禁用实时联动。
- Fusion 请求默认 5 秒超时，可按调用方配置重试。
- 题海提交带串行队列和重试逻辑，避免重复提交与连点风暴。
