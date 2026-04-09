# MQTT 指令与消息格式

本文档整理当前选手端实际支持的 MQTT 主题、指令和值格式。

适用主题：

- `cmd`
- `quiz/control`
- `quiz/result`
- `quiz/buzz_in`
- `state/<clientId>`

## 总览

| 主题 | 方向 | 用途 |
| --- | --- | --- |
| `cmd` | 主持人端 -> 选手端 | 页面跳转、切赛事、切赛段、切题、提交控制 |
| `quiz/control` | 主持人端 -> 选手端 | `ultimate-challenge` / `buzzer-sprint` 抢答开启 |
| `quiz/result` | 主持人端 -> 选手端 | `ultimate-challenge` / `buzzer-sprint` 抢答结果广播 |
| `quiz/buzz_in` | 选手端 -> 主持人端/中控 | `ultimate-challenge` / `buzzer-sprint` 抢答上报 |
| `state/<clientId>` | 选手端 -> Broker | 在线状态心跳 |

## 1. `cmd`

### 1.1 公共命令

这些命令由全局控制逻辑直接处理。

| payload | 说明 |
| --- | --- |
| `refresh` | 重置选手端并跳回 `/waiting` |
| `home` | 返回等待页 |
| `rank` | 打开排行榜视图 |
| `race-2` | 切换到第 2 个赛事 |
| `1-start` | 启动 `ID=1` 的赛段 |
| `3` | 切到第 3 题 |
| `pool-start` | 在题海遨游等待态触发抢下一题 |

说明：

- `race-N` 中的 `N` 从 `1` 开始计数。
- 实际应用场景中，切题统一直接发送题号数字，例如 `3`。
- `pool-start` 只在 `ocean-adventure` 且等待开始时生效。
- 代码目前仍兼容 `question 3`、`q3` 这类旧格式，但不建议继续使用。

### 1.2 提交控制命令

这些命令只在 `qa`、`last-stand`、`last-stand-group`、`ultimate-challenge`、`buzzer-sprint` 等需要主持人控制提交节奏的模式下处理。

| payload | 说明 |
| --- | --- |
| `submit` | 触发当前题提交 |
| `answer` | 打开答案揭晓态 |
| `retract` | 回退上一题扣血状态 |
| 数字，例如 `3` | 作为切题命令，同时重置部分作答 UI 状态 |

说明：

- `submit` 对画板填空题会先上传附件，再完成提交。
- `retract` 只对一站到底类模式有效。
- 数字命令除了切题，还会清掉终极挑战 / 抢答冲刺当前题的抢答锁定态。

### 1.3 终极 PK 命令

`ultimate-pk` 模式额外监听 `cmd` 主题。

支持两种 payload 形式：

1. 纯文本
2. JSON，且从 `command`、`type`、`action` 里取命令字

例如：

```json
{"command":"stage-3"}
```

或：

```text
stage-3
```

支持命令：

| payload | 说明 |
| --- | --- |
| `stage-3` | 解锁正反方切换 |
| `stage-1` | 锁定切换 |
| `stage-2` | 锁定切换 |
| `stage-4` | 锁定切换 |
| `stage-5` | 锁定切换 |

客户端在终极 PK 页面上点击切换按钮后，会主动向 `cmd` 发送：

- `switch-blue`
- `switch-red`

这两个是选手端发出的消息，不是当前前端自己消费的命令。

## 2. `quiz/control`

仅 `ultimate-challenge` 和 `buzzer-sprint` 模式消费。

支持两种 payload 形式：

1. 纯文本 `start_buzzing`
2. JSON，且从 `action`、`type`、`command` 里取命令字

示例：

```text
start_buzzing
```

```json
{"action":"start_buzzing"}
```

作用：

- 开启当前题抢答
- 让抢答按钮变为可点击
- 清空上一轮锁定的胜者

注意：

- 只有当前页面处于 `ultimate-challenge` 或 `buzzer-sprint` 的 `buzz` 阶段时，这条消息才会生效。

## 3. `quiz/result`

仅 `ultimate-challenge` 和 `buzzer-sprint` 模式消费。

要求 payload 为 JSON，对象中支持以下任一字段：

- `winnerId`
- `winner_id`
- `winnerID`

示例：

```json
{"winnerId":"1001"}
```

在 `buzzer-sprint` 下，广播值应改为队伍标识：

```json
{"winnerId":"red"}
```

行为：

- 如果 `winnerId` 等于当前设备的抢答身份，页面进入作答态，并提示“抢答成功，开始作答”
- `ultimate-challenge` 下的抢答身份是当前选手 `user.id`
- `buzzer-sprint` 下的抢答身份是当前设备锁定的 `red` / `blue`
- 如果 `winnerId` 是其他选手或另一队，页面进入锁定态，并提示“本题由其他队伍抢答成功”

注意：

- 当前前端不会消费纯文本 winner payload，必须是 JSON。

## 4. `quiz/buzz_in`

这是选手端主动发送的主题，用于终极挑战 / 抢答冲刺抢答上报。

发送 payload：

```json
{"player_id":"1001"}
```

在 `buzzer-sprint` 下，`player_id` 不是个人 `user.id`，而是当前设备锁定的队伍标识：

```json
{"player_id":"red"}
```

或：

```json
{"player_id":"blue"}
```

触发时机：

- 用户点击“抢答”按钮
- 当前已收到 `start_buzzing`
- MQTT 已连接
- 当前模式对应的抢答身份已确定：
  - `ultimate-challenge` 需要当前用户存在 `user.id`
  - `buzzer-sprint` 需要当前设备已锁定 `red` 或 `blue`

QoS：

- 发布时使用 `qos: 1`

## 5. `state/<clientId>`

这是选手端在线状态主题。

### 主题格式

```text
state/<clientId>
```

### payload

| payload | 说明 |
| --- | --- |
| `online` | 在线 |
| `offline` | 离线 |

说明：

- 该主题使用 retain。
- 连接成功后会立即发送 `online`。
- 心跳间隔约为 keepalive 的一半。
- 断开或页面卸载时会发送 `offline`。

## 6. 推荐发送示例

### 切赛事

主题：`cmd`

```text
race-2
```

### 启动赛段

主题：`cmd`

```text
1-start
```

### 切题

主题：`cmd`

```text
3
```

### 题海开始取题

主题：`cmd`

```text
pool-start
```

### 开启抢答

主题：`quiz/control`

```json
{"action":"start_buzzing"}
```

### 广播抢答结果

主题：`quiz/result`

```json
{"winnerId":"1001"}
```

`buzzer-sprint` 联调时可改为：

```json
{"winnerId":"red"}
```

## 7. 注意事项

- `cmd` 主题大部分命令按纯文本解析，不要默认都发 JSON。
- 切题命令的主路径是直接发送题号数字，不要再把 `question 3` 当成标准格式。
- `quiz/control` 对 `start_buzzing` 同时兼容纯文本和 JSON。
- `quiz/result` 目前只兼容 JSON。
- `quiz/buzz_in` 是客户端上报主题，主持人端不应反向拿它做控制指令。
- `buzzer-sprint` 的 `winnerId` / `player_id` 应使用 `red` 或 `blue`，不要混用选手 `user.id`。
- 如果你要新增命令，优先同时更新本文件、[API.md](./API.md) 和 [QUIZ_MANUAL_SMOKE_CHECKLIST.md](./QUIZ_MANUAL_SMOKE_CHECKLIST.md)。
