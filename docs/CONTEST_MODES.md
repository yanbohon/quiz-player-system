# 当前赛制模式说明

本文按当前选手端代码实现整理所有已落地的赛制模式，供赛段配置、联调和主持人控制时参考。

判定依据主要来自：

- `src/features/quiz/modes.ts`
- `src/features/quiz/useQuizRuntime.ts`
- `src/features/quiz/useControlCommands.ts`
- `src/app/quiz/page.tsx`

## 1. 文档范围

当前选手端真正实现的答题模式共 11 个：

- `qa`
- `qa-20`
- `qa-30`
- `qa-50`
- `last-stand`
- `last-stand-group`
- `speed-run`
- `ocean-adventure`
- `ultimate-challenge`
- `buzzer-sprint`
- `ultimate-pk`

以下赛段不属于答题模式：

- `赛事海报`：不会进入选手端赛段列表，只用于等待页海报展示。
- `学校信息`：属于 `meta` 赛段，用于队伍资料加载，不映射到 `/quiz?mode=...`。

## 2. 赛段如何映射到模式

### 2.1 模式识别优先级

选手端启动赛段后，会按以下顺序决定 `mode`：

1. 优先读取赛段原始字段中的模式字段：
   - `模式`
   - `Mode`
   - `mode`
   - `模式ID`
   - `ModeId`
   - `modeId`
   - `答题模式`
   - `答题模式ID`
   - `答题模式Id`
2. 若未配置模式字段，再回退到赛段名称与显示名称。
3. 若仍无法识别：
   - `grab` 赛段默认视为 `ocean-adventure`
   - `standard` 赛段默认视为 `qa`

### 2.2 常见名称别名

当前代码已兼容的典型别名包括：

- `有问必答`、`火眼金睛` -> `qa`
- `有问必答(20)`、`火眼金睛（20）` -> `qa-20`
- `有问必答(30)`、`火眼金睛（30）` -> `qa-30`
- `有问必答(50)`、`火眼金睛（50）` -> `qa-50`
- `一站到底` -> `last-stand`
- `一站到底(初中组)`、`一站到底（高中组）` -> `last-stand-group`
- `争分夺秒`、`速答`、`冲刺` -> `speed-run`
- `题海遨游`、`题海` -> `ocean-adventure`
- `终极挑战`、`同分加题` -> `ultimate-challenge`
- `抢答冲刺`、`抢答冲刺赛`、`抢答冲刺环节` -> `buzzer-sprint`
- `终极PK`、`终极PK赛`、`终极PK环节` -> `ultimate-pk`

### 2.3 `*-start` 里的 `stageId` 来源

主持人发送 `<stageId>-start` 时，`stageId` 来自 Fusion 赛段记录的 `ID` 字段。

- 若 `ID` 缺失，前端会退回使用赛段顺序号。
- 因此 `1-start`、`2-start` 具体对应哪个环节，取决于当前赛事的 Fusion 配置，不是仓库里的固定常量。

统一启动格式如下：

- 主题：`cmd`
- payload：`<stageId>-start`
- 示例：若当前赛段 `ID=1`，则发送 `1-start`

### 2.4 按模式查看启动 MQTT 指令

| modeId | 常见赛段名称 | 启动主题 | 启动 payload 模板 | 启动后通常还需要的指令 |
| --- | --- | --- | --- | --- |
| `qa` | `有问必答` / `火眼金睛` | `cmd` | `<有问必答赛段ID>-start` | `cmd` 数字切题，例如 `3` |
| `qa-20` | `有问必答(20)` / `火眼金睛(20)` | `cmd` | `<有问必答(20)赛段ID>-start` | `cmd` 数字切题 |
| `qa-30` | `有问必答(30)` / `火眼金睛(30)` | `cmd` | `<有问必答(30)赛段ID>-start` | `cmd` 数字切题 |
| `qa-50` | `有问必答(50)` / `火眼金睛(50)` | `cmd` | `<有问必答(50)赛段ID>-start` | `cmd` 数字切题 |
| `last-stand` | `一站到底` | `cmd` | `<一站到底赛段ID>-start` | `cmd` 数字切题，必要时 `submit` / `answer` / `retract` |
| `last-stand-group` | `一站到底(初中组/中职组/高中组)` | `cmd` | `<一站到底分组赛段ID>-start` | `cmd` 数字切题，必要时 `submit` / `answer` / `retract` |
| `speed-run` | `争分夺秒` | `cmd` | `<争分夺秒赛段ID>-start` | 首次仍需 `cmd` 数字切题开闸 |
| `ocean-adventure` | `题海遨游` | `cmd` | `<题海遨游赛段ID>-start` | 进入赛段后通常还要发 `pool-start` 抢第一题 |
| `ultimate-challenge` | `终极挑战` / `同分加题` | `cmd` | `<终极挑战赛段ID>-start` | 后续还需数字切题，再发 `quiz/control` 的 `start_buzzing` |
| `buzzer-sprint` | `抢答冲刺` / `抢答冲刺赛` | `cmd` | `<抢答冲刺赛段ID>-start` | 后续还需数字切题，再发 `quiz/control` 的 `start_buzzing`；入场前先确认红/蓝队 |
| `ultimate-pk` | `终极PK` | `cmd` | `<终极PK赛段ID>-start` | 启动后再用 `stage-3` 解锁切换 |

## 3. 模式总览

| modeId | 名称 | 启动 MQTT 指令 | 通道 | 题目来源 | 主持人切题/起题方式 | 选手提交流程 | 关键特性 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `qa` | 有问必答 | `cmd: <赛段ID>-start` | MQTT | Fusion 标准题 | `cmd` 数字切题 | 选手先作答，主持人用 `submit` 收题 | 标准推题，无计时，无血量 |
| `qa-20` | 有问必答(20) | `cmd: <赛段ID>-start` | MQTT | Fusion 标准题 | `cmd` 数字切题 | 同 `qa` | 当前实现与 `qa` 仅 modeId / 名称不同 |
| `qa-30` | 有问必答(30) | `cmd: <赛段ID>-start` | MQTT | Fusion 标准题 | `cmd` 数字切题 | 同 `qa` | 当前实现与 `qa` 仅 modeId / 名称不同 |
| `qa-50` | 有问必答(50) | `cmd: <赛段ID>-start` | MQTT | Fusion 标准题 | `cmd` 数字切题 | 同 `qa` | 当前实现与 `qa` 仅 modeId / 名称不同 |
| `last-stand` | 一站到底 | `cmd: <赛段ID>-start` | MQTT | Fusion 标准题 | `cmd` 数字切题 | 选手先作答，主持人用 `submit` 收题 | 3 点血量，答错扣血，可 `retract` 回退 |
| `last-stand-group` | 一站到底（分组） | `cmd: <赛段ID>-start` | MQTT | Fusion 标准题 | `cmd` 数字切题 | 同 `last-stand` | 1 点血量，按组状态值同步存活/淘汰 |
| `speed-run` | 争分夺秒 | `cmd: <赛段ID>-start` | API | 赛段题库一次性加载 | 赛段启动后等待首次数字切题开闸 | 选手手动提交，自动进入下一题 | 全局计时 120 秒，本地顺序推进 |
| `ocean-adventure` | 题海遨游 | `cmd: <赛段ID>-start` | API | 题海接口逐题拉取 | `pool-start` 抢下一题 | 选手手动提交，自动继续抢下一题 | 2 点血量，全局计时 300 秒，支持个人/团队 |
| `ultimate-challenge` | 终极挑战 | `cmd: <赛段ID>-start` | Hybrid | Fusion 标准题 + MQTT 抢答控制 | `cmd` 数字切题 + `quiz/control` 开启抢答 | 选手先作答，主持人用 `submit` 收题 | 抢答、锁定、作答三段式 |
| `buzzer-sprint` | 抢答冲刺 | `cmd: <赛段ID>-start` | Hybrid | Fusion 标准题 + MQTT 抢答控制 | `cmd` 数字切题 + `quiz/control` 开启抢答 | 选手先作答，主持人用 `submit` 收题 | 全题型抢答，赛前确认红/蓝队，按队伍结算胜者 |
| `ultimate-pk` | 终极PK | `cmd: <赛段ID>-start` | MQTT | 无常规答题主链路 | `cmd` 的 `stage-*` 控制切换开关 | 选手发送 `switch-blue` / `switch-red` | 发言权切换面板，1 秒节流 |

## 4. 主持人控制矩阵

除公共命令 `refresh`、`home`、`rank`、`race-N`、`<stageId>-start` 外，各模式的常用控制如下：

| 模式 | `cmd` 数字切题 | `cmd submit` | `cmd answer` | `cmd retract` | `cmd pool-start` | `quiz/control start_buzzing` | `quiz/result` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `qa` / `qa-20` / `qa-30` / `qa-50` | 是 | 是 | 是 | 否 | 否 | 否 | 否 |
| `last-stand` | 是 | 是 | 是 | 是 | 否 | 否 | 否 |
| `last-stand-group` | 是 | 是 | 是 | 是 | 否 | 否 | 否 |
| `speed-run` | 是 | 否 | 否 | 否 | 否 | 否 | 否 |
| `ocean-adventure` | 否 | 否 | 否 | 否 | 是 | 否 | 否 |
| `ultimate-challenge` | 是 | 是 | 是 | 否 | 否 | 是 | 是 |
| `buzzer-sprint` | 是 | 是 | 是 | 否 | 否 | 是 | 是 |
| `ultimate-pk` | 否，改用 `stage-*` | 否 | 否 | 否 | 否 | 否 | 否 |

说明：

- `cmd` 数字切题同时兼容旧格式 `question 3`、`q3`，但当前建议统一直接发数字。
- `cmd answer` 不是“切到答案页”，而是把当前题切到答案揭晓态。
- `cmd retract` 仅一站到底类模式有效，用于回退上一题扣血。
- 数字切题会一并清掉 `ultimate-challenge` / `buzzer-sprint` 上一题的抢答锁定和揭晓状态。
- `ultimate-pk` 监听 `cmd` 的 `stage-1`、`stage-2`、`stage-3`、`stage-4`、`stage-5`，不走普通题号切题流。

## 5. 各模式详细说明

### 5.1 `qa` / `qa-20` / `qa-30` / `qa-50`

#### 启动 MQTT 指令

- 主题：`cmd`
- payload 模板：`<对应有问必答赛段ID>-start`
- 示例：若 `qa-30` 对应赛段 `ID=4`，则发送 `4-start`

#### 基本行为

- 题目来自当前赛段的 Fusion 题库表。
- 赛段启动后会先把整份题库加载到本地，但页面仍处于“等待主持人发出切题指令”状态。
- 主持人发送数字题号后，前端打开题目闸门并显示对应题目。
- 选手可在本地完成选择，但正式提交仍依赖主持人发送 `cmd submit`。

#### 提交流程

- 主持人发 `submit` 后，前端会提交当前选择，并锁定为“等待主持人”状态。
- 主持人发 `answer` 后，页面进入答案揭晓态。
- 主持人发送新的数字题号后，会清掉上一题的锁定与揭晓态。

#### 特性

- 题型：标准题型。
- 计时：无全局倒计时。
- 血量：无。
- 下一题：不自动推进，必须靠主持人数字切题。

#### 变体差异

`qa-20`、`qa-30`、`qa-50` 当前在前端运行时上与 `qa` 没有额外逻辑差异：

- 不额外启用倒计时
- 不额外限制题数
- 不额外改变提交或 MQTT 行为

当前差异仅体现在：

- `modeId`
- 模式名称
- 赛段路由参数 `/quiz?mode=...`

### 5.2 `last-stand`

#### 启动 MQTT 指令

- 主题：`cmd`
- payload 模板：`<一站到底赛段ID>-start`

#### 基本行为

- 整体流程与 `qa` 类似，同样由主持人数字切题与 `submit` 收题。
- 每名选手初始 3 点血量。
- 前端会在提交后根据题目正确答案立即判定对错，答错扣 1 点血。

#### 状态同步

- 扣血结果会同步写回分数表中的状态字段。
- 主持人发送 `retract` 时，前端会尝试将上一题扣除的血量恢复，并把状态表回写到回退后的值。

#### 结束条件

- 血量归零后进入淘汰态，不再允许继续作答。
- 下一题仍然由主持人数字切题控制。

### 5.3 `last-stand-group`

#### 启动 MQTT 指令

- 主题：`cmd`
- payload 模板：`<一站到底分组赛段ID>-start`

#### 基本行为

- 仍属于主持人控制的推题模式。
- 初始血量为 1。
- 答错即淘汰。

#### 分组状态规则

分组一站到底除了前端血量外，还会按赛段名写入分组状态标识：

- `一站到底（高中组）` -> `1`
- `一站到底（中职组）` -> `2`
- `一站到底（初中组）` -> `3`
- 淘汰后统一写为 `0`

因此该模式要求赛段名称能正确识别出组别，否则状态同步只能部分退化运行。

### 5.4 `speed-run`

#### 启动 MQTT 指令

- 主题：`cmd`
- payload 模板：`<争分夺秒赛段ID>-start`
- 注意：启动赛段后还需要主持人发送数字题号开闸，例如 `1`

#### 基本行为

- 赛段启动后会一次性从 Fusion 拉取整份题包。
- 题目加载成功后，页面显示“题目加载完成”，等待主持人发出数字切题命令。
- 首次数字切题后正式开闸，进入第 N 题。

#### 作答与推进

- 选手使用底部操作栏手动提交。
- 每次提交后立即进入下一题。
- 最后一题提交后直接进入结果页。

#### 计时

- 使用全局倒计时。
- 当前代码实际时长为 120 秒。
- 倒计时在题目闸门打开后启动，不在赛段刚进入时启动。

#### 结果页

结束条件有两种：

- 全部题目作答完成
- 倒计时耗尽

结果页会展示：

- 总题数
- 已答题数
- 正确数
- 错误数
- 未答题数
- 剩余时间

### 5.5 `ocean-adventure`

#### 启动 MQTT 指令

- 主题：`cmd`
- payload 模板：`<题海遨游赛段ID>-start`
- 注意：进入赛段后通常还要再发一次 `cmd` 的 `pool-start` 才会真正抢下第一题

#### 基本行为

- 不预加载整份题库。
- 题目通过题海接口逐题获取。
- 进入赛段后先停留在等待态，要求选手先选择：
  - `个人模式`
  - `团队模式`
- 若选择团队模式，还必须选择：
  - `红队`
  - `蓝队`

#### 起题方式

- 主持人发送 `cmd pool-start` 后才会抢下一题。
- 若未选模式，前端会提示“请先选择个人模式或团队模式”。
- 若已选团队模式但未选红/蓝队，会提示“请先选择红队或蓝队”。
- 第一次成功抢题后，模式/队伍选择会锁定。

#### 作答与推进

- 选手使用底部操作栏手动提交。
- 提交成功后，前端会自动请求下一题。
- 若本题答错且血量已归零，则不会继续请求下一题。

#### 计时与血量

- 全局倒计时 300 秒。
- 初始血量 2。
- 结束原因可能为：
  - 血量耗尽
  - 倒计时结束
  - 题库已空

#### 成绩展示

结束后会拉取题海成绩统计并展示：

- 总题数
- 正确数
- 错误数
- 得分
- 正确率
- 最近答题时间

### 5.6 `ultimate-challenge`

#### 启动 MQTT 指令

- 启动赛段主题：`cmd`
- 启动赛段 payload 模板：`<终极挑战赛段ID>-start`
- 进入赛段后常用补充指令：
  - `cmd` 数字切题，例如 `3`
  - `quiz/control` -> `start_buzzing`
  - `quiz/result` -> `{"winnerId":"<user.id>"}`

#### 基本行为

- 题目仍来自 Fusion 标准题库。
- 赛段节奏由主持人 MQTT 指令控制，包含“推题 -> 抢答 -> 锁定/作答 -> 收题”链路。

#### 题目与阶段

题目显示仍依赖 `cmd` 数字切题，进入新题后默认阶段为 `buzz`。

当前实现里的典型阶段有：

- `waiting`：等待主持人推送题目
- `buzz`：等待开启抢答
- `locked`：本题由其他队伍作答
- `answer`：本队获得作答权

#### 抢答链路

1. 主持人向 `quiz/control` 发送 `start_buzzing`
2. 页面在 `buzz` 阶段下开启抢答按钮
3. 选手点击“抢答”后，向 `quiz/buzz_in` 发送：
   - `{"player_id":"<user.id>"}`
4. 主持人端/中控向 `quiz/result` 广播获胜者：
   - `{"winnerId":"<user.id>"}`
5. 若获胜者是自己，页面进入 `answer`
6. 若获胜者是他队，页面进入 `locked`

#### 提交流程

- 选手在本队作答态先完成本地作答。
- 主持人发送 `cmd submit` 后，前端正式提交当前答案。
- 提交后阶段回到 `waiting`，等待下一步指令。
- 主持人发送 `cmd answer` 时，页面进入答案揭晓态。
- 主持人发送新的数字题号时，会清空上一题的抢答锁定和揭晓状态。

### 5.7 `buzzer-sprint`

#### 启动 MQTT 指令

- 启动赛段主题：`cmd`
- 启动赛段 payload 模板：`<抢答冲刺赛段ID>-start`
- 进入赛段前必须先确认当前设备代表：
  - `红队`
  - `蓝队`
- 进入赛段后常用补充指令：
  - `cmd` 数字切题，例如 `3`
  - `quiz/control` -> `start_buzzing`
  - `quiz/result` -> `{"winnerId":"red"}` / `{"winnerId":"blue"}`

#### 基本行为

- 题目仍来自 Fusion 标准题库。
- 赛段节奏与 `ultimate-challenge` 一致，仍是“推题 -> 抢答 -> 锁定/作答 -> 收题”链路。
- 最大差异是抢答身份和获胜判定不按个人 `user.id`，而按当前设备锁定的队伍执行。

#### 入场与队伍锁定

- 收到 `<stageId>-start` 且识别为 `buzzer-sprint` 后，前端会先弹窗要求选择 `红队` 或 `蓝队`。
- 若未确认队伍，页面不会进入该赛段，并提示“请先确认当前代表队伍”。
- 同一 `stageId` 下再次进入时，若当前设备已锁定队伍，则会复用原选择，不重复弹窗。
- 当主持人切换到其他赛段时，这个锁定选择会被清空。

#### 抢答链路

1. 主持人向 `quiz/control` 发送 `start_buzzing`
2. 页面在 `buzz` 阶段下开启抢答按钮
3. 选手点击“抢答”后，向 `quiz/buzz_in` 发送：
   - `{"player_id":"red"}`
   - 或 `{"player_id":"blue"}`
4. 主持人端/中控向 `quiz/result` 广播获胜队伍：
   - `{"winnerId":"red"}`
   - 或 `{"winnerId":"blue"}`
5. 若获胜队伍等于当前设备锁定的队伍，页面进入 `answer`
6. 若获胜队伍是另一队，页面进入 `locked`

#### 提交流程

- 选手在本队作答态先完成本地作答。
- 主持人发送 `cmd submit` 后，前端正式提交当前答案。
- 提交后阶段回到 `waiting`，等待下一步指令。
- 主持人发送 `cmd answer` 时，页面进入答案揭晓态。
- 主持人发送新的数字题号时，会清空上一题的抢答锁定和揭晓状态。

### 5.8 `ultimate-pk`

#### 启动 MQTT 指令

- 启动赛段主题：`cmd`
- 启动赛段 payload 模板：`<终极PK赛段ID>-start`
- 启动后常用补充指令：
  - `cmd` -> `stage-3`，解锁切换
  - `cmd` -> `stage-1` / `stage-2` / `stage-4` / `stage-5`，重新锁定

#### 基本行为

- 该模式不走常规答题链路，页面主体是“发言权切换面板”。
- 选手可选择当前切换目标：
  - `正方`
  - `反方`

#### 主持人控制

`ultimate-pk` 额外监听 `cmd` 主题中的以下命令：

- `stage-3`：允许切换
- `stage-1`：锁定切换
- `stage-2`：锁定切换
- `stage-4`：锁定切换
- `stage-5`：锁定切换

支持两种 payload 形式：

- 纯文本
- JSON，从 `command`、`type`、`action` 取命令字

#### 选手端上行消息

当页面处于可切换状态时，选手点击“切换发言”会向 `cmd` 发送：

- 选择 `正方` -> `switch-blue`
- 选择 `反方` -> `switch-red`

附加规则：

- 发布使用 `qos: 1`
- 客户端本地有 1 秒节流
- 切换重新被锁定时，会立即清除节流与发送中状态

## 6. 相关文档

- [MQTT_COMMANDS.md](./MQTT_COMMANDS.md)：MQTT 主题与消息格式
- [API.md](./API.md)：MQTT、Fusion、题海接口入口
- [QUIZ_MANUAL_SMOKE_CHECKLIST.md](./QUIZ_MANUAL_SMOKE_CHECKLIST.md)：按模式验证的人工冒烟脚本
