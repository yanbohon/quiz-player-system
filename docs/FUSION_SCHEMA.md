# Fusion 字段格式

本文档基于当前前端代码实际读取和回写行为整理，不是 Fusion 官方 schema，而是“选手端已观察到的业务契约”。

适用范围：

- 赛事节点
- 赛段配置表
- 题库表
- 通用表 / 队伍信息表
- 分数表
- 排行榜表
- 附件上传

## 1. 通用响应壳

当前前端假设 Fusion 返回：

```json
{
  "code": 0,
  "success": true,
  "message": "ok",
  "data": {}
}
```

`datasheet records` 的 `data` 部分至少需要：

```json
{
  "records": [
    {
      "recordId": "recxxxx",
      "fields": {}
    }
  ]
}
```

对应实现见 [fusionClient.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/fusionClient.ts#L7) 和 [fusionClient.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/fusionClient.ts#L429)。

## 2. 赛事节点

前端通过 `GET /v1/spaces/{spaceId}/nodes/{eventNodeId}` 读取赛事列表。

推荐字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 赛事 datasheet / node 标识 |
| `name` | string | 赛事名称 |
| `type` | string | 节点类型 |

当前前端实际只依赖 `children[].id`、`children[].name`、`children[].type`，见 [fusionClient.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/fusionClient.ts#L429)。

## 3. 赛段配置表

每个赛事下会把 datasheet records 解释为赛段配置。

### 推荐规范字段

| 字段 | 是否必需 | 说明 |
| --- | --- | --- |
| `ID` | 建议 | 赛段编号，例如 `0`、`1`、`2` |
| `环节名称` | 必需 | 赛段识别主字段 |
| `显示名称` | 可选 | UI 展示名，缺省回退到 `环节名称` |
| `题库表ID` | 标准题赛段必需 | 指向题库表 |
| `分数表ID` | 需要判题/扣血时必需 | 指向分数表 |
| `通用表ID` | 队伍资料/排行赛段必需 | 指向通用表 |

解析逻辑见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L279)。

### 特殊记录

如果某条记录满足：

- `环节名称 = 赛事海报`
- `URL` 为海报地址

前端会把它识别成等待页海报，而不是普通赛段，见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L803)。

### 赛制识别

前端优先从赛段原始字段里找模式字段，再回退到 `环节名称` / `显示名称` 推断赛制。

兼容字段名：

- `模式`
- `Mode`
- `mode`
- `模式ID`
- `ModeId`
- `modeId`
- `答题模式`
- `答题模式ID`
- `答题模式Id`

对应逻辑见 [useControlCommands.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/useControlCommands.ts#L28)。

## 4. 题库表

### 最小可用字段

| 字段 | 是否必需 | 说明 |
| --- | --- | --- |
| `ID` | 建议 | 题目 ID，缺省时回退到 `recordId` |
| `type` | 建议 | 题型 |
| `stem` | 必需 | 题干 |
| `options` | 选择题建议 | 多行字符串选项 |
| `answer` | 建议 | 正确答案 |

基础归一化见 [normalizeQuestion.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/normalizeQuestion.ts#L42)。

### 题型值

前端支持的主要题型别名见 [useQuizRuntime.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/useQuizRuntime.ts#L63)：

| 归一类型 | 兼容值示例 |
| --- | --- |
| `single` | `single`、`single-choice`、`单选`、`单选题` |
| `multiple` | `multiple`、`multiple-choice`、`多选`、`多选题` |
| `indeterminate` | `indeterminate`、`不定项选择` |
| `boolean` | `boolean`、`true-false`、`判断`、`判断题` |
| `fill` | `fill`、`fill-in`、`text`、`填空`、`填空题` |
| `wordbank` | `wordbank`、`word-bank-fill`、`选词填空` |
| `point-select` | `point-select`、`tap-select`、`点选`、`组选题/组词题` |
| `matching` | `matching`、`match`、`连线题`、`配对题` |

### `options` 格式

推荐使用多行文本：

```text
A. 选项一
B. 选项二
C. 选项三
```

前端会按首字母提取选项值，见 [normalizeQuestion.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/normalizeQuestion.ts#L73)。

### `answer` 格式

兼容格式：

- 单选：`A`
- 多选：`AC`
- 多选字符串数组：`["A","C"]`
- JSON 字符串数组：`["A","C"]`
- 逗号分隔：`A,C`

解析逻辑见 [normalizeQuestion.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/normalizeQuestion.ts#L147)。

### 连线题扩展字段

推荐字段：

| 字段 | 说明 |
| --- | --- |
| `stem` | 题干。每个左侧项建议独占一行，并以数字开头，如 `1. 苹果` |
| `options` | 右侧选项，多行文本 |
| `answer` | 正确连线关系 |
| `左列匹配上限` | 每个左项最多可连几个右项 |

`answer` 兼容格式非常宽松，前端可识别：

- 字符串：`1:A 2:B`
- JSON 数组：`["1:A","2:B"]`
- 扁平数组：`["1","A","2","B"]`
- 二元数组：`[["1","A"],["2","B"]]`
- 对象数组：`[{ "left":"1", "right":"A" }]`
- 映射对象：`{ "1": "A", "2": "B" }`

见 [useQuizRuntime.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/useQuizRuntime.ts#L414)。

匹配上限兼容字段：

- `matchingMax`
- `maxMatchesPerLeft`
- `maxMatches`
- `maxMatch`
- `左列匹配上限`

见 [useQuizRuntime.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/useQuizRuntime.ts#L507)。

### 点选题 / 选字组词扩展字段

除了标准 `options` 外，前端还会尝试从这些字段提取词元：

- `choices`
- `选项`
- `词库`
- `words`
- 任意 `option*` 字段

对象项里还会继续读取：

- `value`
- `text`
- `label`
- `content`
- `option`
- `word`
- `词语`
- `选项`

见 [useQuizRuntime.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/useQuizRuntime.ts#L189)。

### 音频字段

兼容字段：

- `audio`: 附件数组，读取首个 `url`
- `url`: 直接音频地址

见 [normalizeQuestion.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/normalizeQuestion.ts#L48)。

### 题号字段

分数表回写会尝试用下列字段决定“写到哪一题列”：

- `number`
- `Number`
- `题号`
- `序号`
- `题目编号`

如果都没有，就回退到当前题在题包中的索引，见 [useQuizSubmission.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizSubmission.ts#L105)。

### 题库表回写

在主持人驱动或 `speed-run` 模式下，前端会把选手答案回写到题库表当前题记录：

```json
{
  "records": [
    {
      "recordId": "recQuestion",
      "fields": {
        "1001": "A"
      }
    }
  ]
}
```

其中字段名默认直接使用选手 `userId`，见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L1040) 和 [useQuizSubmission.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizSubmission.ts#L377)。

## 5. 通用表 / 队伍信息表

前端用通用表做两件事：

- 根据选手 ID 匹配自己的队伍资料
- 在等待页展示队伍名、校徽等信息

### 选手标识字段

匹配时兼容以下任一字段：

- `用户ID`
- `用户 ID`
- `参赛账号`
- `账号`
- `台号`
- `台号ID`
- `stationId`
- `station`
- `ID`
- `id`
- `编号`
- `school`
- `学校`
- `city-id`
- `cityId`
- `选手ID`
- `选手编号`

见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L303)。

### 队伍显示名字段

推荐使用：

- `参赛队伍`

当前兼容：

- `参赛队伍`
- `队伍名称`
- `名称`
- `name`
- `学校名`
- `schoolName`
- `school`
- `学校`
- `city`

见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L387)。

### 校徽字段

推荐使用：

- `校徽`

兼容值格式：

- 直接 URL 字符串
- 附件对象
- 附件对象数组
- JSON 字符串化后的附件对象 / 数组

对象内会尝试读取：

- `url`
- `downloadUrl`
- `previewUrl`
- `thumbnailUrl`
- `permalink`
- `token`

见 [waiting/page.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/app/waiting/page.tsx#L87)。

## 6. 分数表

分数表会先按“选手标识字段”匹配当前选手记录，匹配逻辑与通用表相同，见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L1026)。

### 推荐字段

| 字段 | 是否必需 | 说明 |
| --- | --- | --- |
| 选手标识字段 | 必需 | 用于定位当前选手记录 |
| 各题号列 | 建议 | 如 `1`、`2`、`3` |
| `time` | 可选 | 争分夺秒剩余秒数 |
| `light` | 可选 | 判题灯，`1` 正确，`0` 错误 |
| 状态字段 | 一站到底建议 | 记录剩余血量或分组状态 |

### 各题号列写法

当前前端会写入：

- 正常题：`"1"` 或 `"0"`，表示对错
- 画板填空：固定写 `"填空"`

见 [useQuizSubmission.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/hooks/useQuizSubmission.ts#L363)。

### 状态字段

一站到底模式会优先寻找以下字段之一：

- `状态`
- `血量`
- `生命值`
- `status`
- `Status`

见 [status.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/status.ts#L1)。

普通一站到底写入剩余血量数字字符串。分组一站到底写入：

- `"0"` 表示淘汰
- `"1"` / `"2"` / `"3"` 表示组别仍存活

具体取值由赛段名推断，见 [status.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/status.ts#L3)。

### 分数表回写 payload

```json
{
  "records": [
    {
      "recordId": "recScore",
      "fields": {
        "3": "1",
        "time": "27",
        "light": "1",
        "状态": "2"
      }
    }
  ]
}
```

见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L1061)。

## 7. 排行榜表

等待页排行榜依赖一个名字严格等于 `总分排名` 的赛段，并读取它的 `通用表ID`，见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L1148)。

排行榜记录推荐字段：

| 字段 | 是否必需 | 说明 |
| --- | --- | --- |
| `学校名` | 建议 | 学校展示名 |
| `总分` | 建议 | 排名分数 |
| `参赛编号` | 可选 | 记录标识 |

当前兼容字段：

- 名称：`学校名`、`学校名称`、`学校`
- 分数：`score`、`Score`、`总分`、`totalScore`

见 [quizStore.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/store/quizStore.ts#L446)。

## 8. 附件上传

画板填空会调用：

- `POST /v1/datasheets/{datasheetId}/attachments`

上传成功后前端会从响应里提取 `token` 或 `url` 作为答案 token，见 [fusionClient.ts](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/lib/fusionClient.ts#L588)。

兼容返回位置：

- `data.token`
- `data.url`
- `token`
- `url`

画板上传调用见 [FillDrawingBoard.tsx](/Users/yanbo./Downloads/答题系统/[重构]选手端/src/features/quiz/components/FillDrawingBoard.tsx#L241)。

## 9. 最小落地建议

如果你现在要新建一套最稳妥的 Fusion 表，建议优先统一成下面这套字段名。

赛段配置表：

- `ID`
- `环节名称`
- `显示名称`
- `题库表ID`
- `分数表ID`
- `通用表ID`
- `模式`

题库表：

- `ID`
- `题号`
- `type`
- `stem`
- `options`
- `answer`
- `audio`

通用表：

- `用户ID`
- `参赛队伍`
- `学校名`
- `校徽`

分数表：

- `用户ID`
- `状态`
- `time`
- `light`
- `1`、`2`、`3`... 题号列

排行榜表：

- `参赛编号`
- `学校名`
- `总分`

这样能最大程度减少前端回退逻辑和隐式兼容分支。
