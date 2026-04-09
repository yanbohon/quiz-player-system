# Quiz 回归测试计划

## 目标

- 覆盖 `src/app/quiz/page.tsx` 重构后的高风险回归面，优先保证“能答题、能提交、能显示正确赛制状态”。
- 将回归测试拆成三层：
  - 纯逻辑单测：适合 `Vitest`
  - Hook / 组件集成测试：基于 `jsdom + @testing-library/react + @testing-library/user-event`
  - 人工冒烟：用于 MQTT、画板、布局几何、复杂实时流程

## 当前测试基础设施现状

- 当前项目脚本只有 `npm test` -> `vitest run`，见 `package.json`
- 当前已具备：
  - `vitest.config.ts`
  - `src/test/setup.ts`
  - `src/test/render.tsx`
  - `jsdom`
  - `@testing-library/react`
  - `@testing-library/user-event`
  - `@testing-library/jest-dom`
- 现有自动化测试基本只有 [hpPenalty.test.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hpPenalty.test.ts)
- 当前仍没有：
  - 浏览器层 E2E 工具

## 建议补齐的最小测试基础设施

- 第 1 阶段
  - 保持 `Vitest`
  - 直接开始补 L1 / L2 回归用例
- 第 2 阶段
  - 若需要自动化 MQTT/整页流程，再引入 `Playwright`
  - 在此之前，复杂实时链路先保留人工冒烟

## 测试分层原则

- L1 纯逻辑单测
  - 目标：校验序列化、解析、去重、回退、状态字段决策
  - 优先文件：
    - [useQuizPersistenceQueue.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizPersistenceQueue.ts)
    - [answering.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/utils/answering.ts)
    - [questionImages.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/utils/questionImages.ts)
    - [status.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/status.ts)
    - [modes.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/modes.ts)
- L2 Hook / 组件集成测试
  - 目标：校验“用户操作 -> 状态变化 -> UI/副作用调用”
  - 优先文件：
    - [useQuizSubmission.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizSubmission.ts)
    - [QuestionRenderer.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/QuestionRenderer.tsx)
    - [StandardQuestionOptions.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/StandardQuestionOptions.tsx)
    - [OceanQuestionOptions.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/OceanQuestionOptions.tsx)
    - [QuizResultPanels.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/QuizResultPanels.tsx)
    - [QuizProgressCard.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/QuizProgressCard.tsx)
- L3 人工冒烟
  - 目标：校验 MQTT、抢答、画板、几何连线、主持人指令联动
  - 重点文件：
    - [page.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/app/quiz/page.tsx)
    - [client.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/mqtt/client.ts)
    - [hooks.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/mqtt/hooks.ts)
  - 正式执行脚本：
    - [QUIZ_MANUAL_SMOKE_CHECKLIST.md](/Users/yanbo./Downloads/答题系统/[重构]选手端/docs/QUIZ_MANUAL_SMOKE_CHECKLIST.md)

## 一、提交流程 / 同步队列 / 实时指令

### P0 回归点

- `useQuizSubmission.submit` 在不同题型下的“空值拦截、序列化、提交流程”不能回归
  - 文件：[useQuizSubmission.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizSubmission.ts)
  - 关键函数：`submit`
  - 建议层级：L2
- `matching` / `wordbank` / `point-select` / `fill` 的提交值与同步值不能错位
  - 文件：[useQuizSubmission.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizSubmission.ts), [answering.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/utils/answering.ts)
  - 关键函数：`orderMatchingPairs`、`matchingPairsToSheetAnswer`、`parseWordbankSelectionInput`、`canonicalizeWordbankValue`
  - 建议层级：L1 + L2
- 手动提交节流、重复提交保护、串行队列不能失效
  - 文件：[useQuizSubmission.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizSubmission.ts)
  - 关键点：`SUBMIT_THROTTLE_INTERVAL_MS`、`submissionQueueTailRef`、`activeSubmissionIdRef`
  - 建议层级：L2，需 `fake timers`
- 持久化队列恢复、重试、退避、失败转移不能回归
  - 文件：[useQuizPersistenceQueue.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizPersistenceQueue.ts)
  - 关键函数：`readPersistedPersistenceState`、`sanitizePersistenceJob`、`computeRetryDelayMs`、`retryFailures`
  - 建议层级：L1 + L2
- 指令提交态与普通提交态的 UI 反馈不能串线
  - 文件：[useQuizSubmission.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizSubmission.ts), [QuizFeedbackPanels.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/QuizFeedbackPanels.tsx)
  - 关键点：`onCommandSubmissionStateChange`、`CommandSubmissionOverlay`
  - 建议层级：L2

### 建议测试用例

- 单选题：未选择时手动提交应提示，已选择时调用 `controls.submitAnswer`
- 连线题：未完成全部连线时阻止提交；提交前按左侧顺序重排 pair
- 词库填空：字符串输入、数组输入、空格/逗号分隔输入都能被规范化
- 填空画板：无 `fillPreview` 时禁止提交；有预览时用占位 URL/实际 URL 提交
- 题海题：提交成功后调用 `controls.requestNextQuestion`；若答错且 `hpAfterAnswer <= 0` 不自动下一题
- 指令提交：`source: "command"` 时锁定界面并显示提交遮罩，不出现普通 Toast
- 队列恢复：`localStorage` 里有 `pending/failed/active` 时能被清洗恢复，坏数据被丢弃
- 队列退避：第 1/2/3 次失败的 `nextRetryAt` 递增，达到阈值后进入 `failed`
- 手动重试：`retryFailures()` 会把 failed 任务重新排回 pending
- MQTT publish 前置条件：未连接时不应发消息；抢答按钮在不同连接态下提示不同文案

### 关键模拟物

- `controls.submitAnswer`
- `controls.requestNextQuestion`
- `enqueueJob`
- `localStorage`
- `Date.now` / fake timers
- `crypto.randomUUID`
- `Toast` / `Notify`
- `mqttService.connect` / `publish` / `subscribe` / `isConnected`

## 二、题型交互 / 渲染

### P0 回归点

- `QuestionRenderer` 的题头、标签、答案展示、已选摘要在重构后不能错位
  - 文件：[QuestionRenderer.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/QuestionRenderer.tsx)
  - 建议层级：L2
- `StandardQuestionOptions` 的禁用态、答题揭晓态、选项状态色不能回归
  - 文件：[StandardQuestionOptions.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/StandardQuestionOptions.tsx)
  - 建议层级：L2
- `OceanQuestionOptions` 的单选/多选模式切换不能回归
  - 文件：[OceanQuestionOptions.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/OceanQuestionOptions.tsx)
  - 关键函数：`resolveOceanSelectionMode`、`sortOceanSelectionIds`
  - 建议层级：L1 + L2
- 图片题 URL 解析、非法图数据过滤、CDN 归一化不能回归
  - 文件：[questionImages.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/utils/questionImages.ts)
  - 关键函数：`parseQuestionImageList`、`normalizeQuestionImageUrl`、`resolveQuestionImageEntries`
  - 建议层级：L1
- 连线题的已占用/可重分配态、点选题清空、词库填空空位激活态不能回归
  - 文件：[QuestionRenderer.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/QuestionRenderer.tsx), [StandardQuestionOptions.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/StandardQuestionOptions.tsx)
  - 建议层级：L2 + L3

### 建议测试用例

- 单选 / 判断：点击同一项后选中状态正确，揭晓答案时 `correct/wrong` 状态准确
- 多选 / 不定项：多次点击切换选中集合，摘要标签按字母显示
- 词库填空：点击空位后点击词库项填入；再次点击已填空位会清空
- 点选题：点击多个词语后显示 token；点击“清空”恢复空态
- 连线题：左列激活、右列绑定、重分配、清空按钮都按预期工作
- 画板题：无预览时显示“打开画板”，有预览时显示预览图和提交成功态
- 题海题：单选模式下点击同一项再次取消，多选模式下按 `sortOceanSelectionIds` 排序
- 图片题：`img` 字段 JSON 非法时安全降级为空；相对路径会被补全为 CDN URL

### 边界数据

- `wordbank` 标题没有 `{{blank}}`
- `matching.right` 缺失，回退到 `question.options`
- `correctAnswer` 为字符串、数组、空值
- `selected` 可能是 `string`、`string[]`、`null`
- 图片字段可能是空字符串、非法 JSON、`data:image/...`、`http://`、相对路径

### 需要人工冒烟确认的交互

- 连线几何线段位置
- 画板预览与上传后的视觉状态
- 移动端触摸点击热区

## 三、赛制状态 / 结果页 / 判定流程

### P0 回归点

- `page.tsx` 中 `renderQuestionContent` 的赛制分支不能串线
  - 文件：[page.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/app/quiz/page.tsx)
  - 关键分支：`speed-run`、`ocean-adventure`、`ultimate-challenge`、`buzzer-sprint`、淘汰态、空题态
  - 建议层级：L2
- `SpeedRunResultPanel` / `OceanResultPanel` 的结果标题、分数、状态文案不能回归
  - 文件：[QuizResultPanels.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/QuizResultPanels.tsx)
  - 建议层级：L2
- `QuizProgressCard` 的题号、倒计时、血量、选手标签不能错位
  - 文件：[QuizProgressCard.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/QuizProgressCard.tsx)
  - 建议层级：L2
- 主持人判定区只应在满足条件时显示，且按钮禁用态正确
  - 文件：[page.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/app/quiz/page.tsx)
  - 关键函数：`handleApplyJudgement`
  - 建议层级：L2
- 终极挑战 / 抢答冲刺的等待 / 抢答 / 锁定 / 作答阶段不能串线
  - 文件：[page.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/app/quiz/page.tsx)
  - 关键函数：`handleTriggerBuzzer`
  - 建议层级：L2 + L3

### 建议测试用例

- `speed-run` 完成后显示结果页；超时与完成两种标题和提示不同
- `ocean-adventure` 结束后：
  - `hp` 耗尽
  - 倒计时结束
  - 题库耗尽
  三种结果标题分别正确
- `oceanStatsStatus === "error"` 时显示错误文案和“重新获取成绩”
- `oceanStatsStatus === "loading"` 时显示加载文案
- `isEliminated` 时页面优先显示 `EliminationStatePanel`
- `ultimateStage === "buzz"` 时显示抢答按钮；未连接 MQTT 或未开放抢答时提示正确，且 `buzzer-sprint` 额外显示当前队伍身份
- `ultimateStage === "locked"` 时显示“未抢到答题权”
- `ultimateStage !== "answer"` 且 `isCommandSubmissionLocked` 时显示 `CommandSubmissionResult`
- `waitingForStageStart` + `questionGateOpened` 的不同组合在 `speed-run` / `ocean-adventure` 下展示不同等待页
- `last-stand-group` 的状态字段映射正确
  - 文件：[status.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/status.ts)
  - 关键函数：`resolveStatusFieldKey`、`resolveLastStandGroupStatusIndicator`

### 关键模拟物

- Zustand store 快照
- `scoreRecord.fields`
- `oceanStats`
- `state.timeRemaining`
- `controlMessage` / MQTT 消息
- `triggerBuzzerControl` / `applyHostJudgementControl`

## 优先自动化的 15 个用例

### P0

1. `useQuizSubmission.submit` 在单选题下阻止空提交并在有值时调用 `controls.submitAnswer`
2. `useQuizSubmission.submit` 在连线题下按左侧顺序重排 pair 并生成同步任务
3. `useQuizSubmission.submit` 在题海模式下答错且 `hpAfterAnswer <= 0` 时不再 `requestNextQuestion`
4. `useQuizPersistenceQueue.readPersistedPersistenceState` 能恢复有效队列并过滤坏数据
5. `useQuizPersistenceQueue.retryFailures` 能把失败项重新投入处理
6. `QuestionRenderer + StandardQuestionOptions` 的词库填空流程可完成“选空位 -> 填值 -> 清空”
7. `QuestionRenderer + StandardQuestionOptions` 的点选题流程可完成“点击词语 -> 显示 token -> 清空”
8. `OceanQuestionOptions` 在单选/多选两种模式下的切换逻辑正确
9. `QuizResultPanels.SpeedRunResultPanel` 在“完成/超时”两种结局下展示正确文案
10. `QuizResultPanels.OceanResultPanel` 在“hp/timer/empty/error/loading”下展示正确结果

### P1

11. `QuestionRenderer` 在 `isAnswerRevealActive` 时显示答案标签和选项状态
12. `QuizProgressCard` 显示题号、倒计时、血量和用户标签
13. `status.ts` 中分组一站到底状态映射覆盖括号与全角括号
14. `questionImages.ts` 对图片字段的解析与 CDN URL 归一化正确
15. `page.tsx` 在 `ultimateStage` 不同阶段下渲染正确的抢答/等待/锁定界面

## 人工冒烟清单

### `speed-run`

- 打开赛段后等待页显示正常
- 本地题包题号、进度、倒计时同步正确
- 提交后自动进入下一题
- 全部完成与时间耗尽两条结果路径都验证一次

### `ocean-adventure`

- 个人模式 / 团队模式 / 红蓝队选择都验证一次
- 抢题成功后显示题目，提交后自动抢下一题
- 答错扣血、血量归零、题库耗尽、时间耗尽三条结束路径都验证一次
- 成绩同步失败时点击“重新获取成绩”

### `last-stand` / `last-stand-group`

- 答错扣血与淘汰态切换正确
- 分组赛段状态字段写入正确
- 淘汰后无法继续答题

### `ultimate-challenge`

- 等待题目
- 抢答开启
- 抢答失败锁定
- 获得答题权进入答题
- 非答题阶段的提交结果遮罩

### 题型专项

- 单选 / 多选 / 判断
- 词库填空
- 连线
- 点选
- 画板填空
- 图片题

## 执行顺序

1. 先补 L1 纯逻辑单测
   - `answering.ts`
   - `questionImages.ts`
   - `status.ts`
   - `useQuizPersistenceQueue.ts` 中导出的纯函数
2. 再补 L2 Hook / 组件集成
   - `useQuizSubmission.ts`
   - `QuestionRenderer.tsx`
   - `StandardQuestionOptions.tsx`
   - `OceanQuestionOptions.tsx`
   - `QuizResultPanels.tsx`
   - `QuizProgressCard.tsx`
3. 最后补 L3
   - 手工 MQTT / 画板 / 抢答回归
   - 视需要再上 `Playwright`

## 完成标准

- P0 自动化用例全部落地并稳定通过
- 每次重构 `quiz` 相关模块时至少运行：
  - `npm run type-check`
  - `npm test`
- 发版前按本文档执行一次人工冒烟
