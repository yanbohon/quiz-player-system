# 分组PK模式 API 文档

> 版本：v1.0 | 更新日期：2026-04-06 | 适用项目：quiz_pool（2026 陕西决赛）

---

## 概述

### 分组模式说明

本系统支持 **个人模式** 和 **团队（分组）PK模式** 两种玩法：

- **个人模式**：选手抢题/答题时 **不传** `groupId`，成绩只计入个人排行榜。
- **团队模式**：选手抢题/答题时 **传入** `groupId`（如 `"teamA"`），系统自动将选手归入对应分组，分数同时计入个人排行榜和分组排行榜。

分组无需提前创建——首次传入 `groupId` 时系统自动建组。

### 基本流程

```
管理员初始化题库 → 选手抢题（带groupId加入分组）→ 选手提交答案 → 查看排行榜
```

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  初始化题库   │────▶│   选手抢题   │────▶│  提交答案    │────▶│  查看排行    │
│ (管理员操作)  │     │ (带groupId)  │     │ (自动计分)   │     │ (个人/分组)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## 通用说明

### Base URL

```
http://<服务器地址>:3000
```

本地开发默认端口 `3000`，可通过环境变量 `PORT` 修改。

### 请求格式

- Content-Type: `application/json`
- 字符编码: `UTF-8`

### 响应格式

所有接口统一返回 JSON，包含 `success` 字段：

```json
// 成功
{ "success": true, ... }

// 失败
{ "success": false, "message": "错误描述", "error": "ERROR_CODE" }
```

### 鉴权说明

| 类型 | 说明 |
|------|------|
| **选手端 API** | 无需鉴权，直接调用 |
| **管理端 API** | 需在请求头中传入 `x-admin-key`，且请求体需包含 `"confirm": "YES"` |

管理端鉴权 Header 示例：

```
x-admin-key: <ADMIN_API_KEY>
```

鉴权失败响应（HTTP 403）：

```json
{
  "success": false,
  "message": "管理员认证失败"
}
```

---

## 选手端 API（无需鉴权）

### 1. 抢题（只返回题号）

从题库池中随机抢一道题，返回题目ID。

```
POST /api/grab
```

#### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 选手唯一标识 |
| `groupId` | string | ❌ | 分组ID；不传则为个人模式，传入则自动加入该分组 |

#### 响应体（成功）

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `questionId` | string | 抢到的题目ID |
| `remainingCount` | number | 题库剩余题目数 |
| `message` | string | `"抢题成功"` |

#### 示例：个人模式

**请求**

```json
POST /api/grab
Content-Type: application/json

{
  "userId": "player_solo"
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "questionId": "q005",
  "remainingCount": 4,
  "message": "抢题成功"
}
```

#### 示例：团队模式

**请求**

```json
POST /api/grab
Content-Type: application/json

{
  "userId": "player_A1",
  "groupId": "teamA"
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "questionId": "q004",
  "remainingCount": 2,
  "message": "抢题成功"
}
```

#### 错误情况

| 情况 | HTTP状态码 | 响应 |
|------|-----------|------|
| 缺少 userId | 400 | `{"success": false, "message": "请提供用户ID"}` |
| 题库已空 | 200 | `{"success": false, "message": "题库已空"}` |

---

### 2. 抢题带详情（返回完整题目）

从题库池中随机抢一道题，返回完整题目内容（推荐选手端使用此接口）。

```
POST /api/grab-with-details
```

#### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 选手唯一标识 |
| `groupId` | string | ❌ | 分组ID；不传则为个人模式 |

#### 响应体（成功）

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `questionId` | string | 题目ID |
| `question` | object | 完整题目对象（见下表） |
| `remainingCount` | number | 题库剩余题目数 |
| `message` | string | `"抢题成功"` |

**`question` 对象结构**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 题目ID |
| `title` | string | 题目标题 |
| `options` | string[] | 选项列表 |
| `answer` | string \| string[] | 正确答案（**注意：抢题时也会返回，前端可选择隐藏**） |
| `explanation` | string | 答案解析 |
| `difficulty` | string | 难度（easy/medium/hard） |
| `category` | string | 分类 |

#### 示例：个人模式

**请求**

```json
POST /api/grab-with-details
Content-Type: application/json

{
  "userId": "player_solo"
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "questionId": "q001",
  "question": {
    "id": "q001",
    "title": "中国的首都是哪座城市？",
    "options": [
      "A. 上海",
      "B. 北京",
      "C. 广州",
      "D. 深圳"
    ],
    "answer": "B",
    "explanation": "北京是中华人民共和国的首都",
    "difficulty": "easy",
    "category": "地理"
  },
  "remainingCount": 3,
  "message": "抢题成功"
}
```

#### 示例：团队模式（多选题）

**请求**

```json
POST /api/grab-with-details
Content-Type: application/json

{
  "userId": "player_A2",
  "groupId": "teamA"
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "questionId": "q002",
  "question": {
    "id": "q002",
    "title": "以下哪些是直辖市？",
    "options": [
      "A. 北京",
      "B. 天津",
      "C. 南京",
      "D. 重庆"
    ],
    "answer": ["A", "B", "D"],
    "explanation": "中国四个直辖市：北京、天津、上海、重庆",
    "difficulty": "medium",
    "category": "地理"
  },
  "remainingCount": 1,
  "message": "抢题成功"
}
```

#### 错误情况

| 情况 | HTTP状态码 | 响应 |
|------|-----------|------|
| 缺少 userId | 400 | `{"success": false, "message": "请提供用户ID"}` |
| 题库已空 | 200 | `{"success": false, "message": "题库已空"}` |

---

### 3. 提交答案

选手提交抢到题目的答案。系统自动判分、更新排行榜和分组统计。

```
POST /api/submit-answer
```

#### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | string | ✅ | 选手唯一标识 |
| `questionId` | string | ✅ | 题目ID |
| `answer` | string | ✅ | 用户答案（格式见下方说明） |
| `groupId` | string | ❌ | 分组ID；如果抢题时已传过，此处可不传（系统自动关联） |

**答案格式说明**

| 题型 | 格式 | 示例 |
|------|------|------|
| 单选题 | 单个选项字母 | `"B"` |
| 多选题 | 逗号分隔的选项字母 | `"A,B,D"` |
| 判断题 | `"A"` 表示正确，`"B"` 表示错误 | `"A"` |

#### 响应体（成功）

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `result` | string | `"correct"` 或 `"wrong"` |
| `correctAnswer` | string \| string[] | 正确答案 |
| `score` | object | 得分信息 |
| `score.total` | number | 当前总分 |
| `score.increment` | number | 本题得分（答对 10 分，答错 0 分） |
| `stats` | object | 用户答题统计 |
| `stats.total` | number | 总答题数 |
| `stats.correct` | number | 答对题数 |
| `stats.wrong` | number | 答错题数 |
| `stats.accuracy` | number | 正确率（0~1） |

#### 示例：答对（单选题）

**请求**

```json
POST /api/submit-answer
Content-Type: application/json

{
  "userId": "player_A1",
  "questionId": "q004",
  "answer": "B",
  "groupId": "teamA"
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "result": "correct",
  "correctAnswer": "B",
  "score": {
    "total": 10,
    "increment": 10
  },
  "stats": {
    "total": 1,
    "correct": 1,
    "wrong": 0,
    "accuracy": 1
  }
}
```

#### 示例：答错

**请求**

```json
POST /api/submit-answer
Content-Type: application/json

{
  "userId": "player_B1",
  "questionId": "q003",
  "answer": "A",
  "groupId": "teamB"
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "result": "wrong",
  "correctAnswer": "B",
  "score": {
    "total": 0,
    "increment": 0
  },
  "stats": {
    "total": 1,
    "correct": 0,
    "wrong": 1,
    "accuracy": 0
  }
}
```

#### 示例：多选题答对

**请求**

```json
POST /api/submit-answer
Content-Type: application/json

{
  "userId": "player_A2",
  "questionId": "q002",
  "answer": "A,B,D",
  "groupId": "teamA"
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "result": "correct",
  "correctAnswer": ["A", "B", "D"],
  "score": {
    "total": 10,
    "increment": 10
  },
  "stats": {
    "total": 1,
    "correct": 1,
    "wrong": 0,
    "accuracy": 1
  }
}
```

#### 错误情况

| 情况 | HTTP状态码 | error 码 | 响应 |
|------|-----------|----------|------|
| 缺少必填字段 | 400 | — | `{"success": false, "message": "请提供用户ID、题目ID和答案"}` |
| 题目未分配给该用户 | 400 | `NOT_ASSIGNED` | `{"success": false, "error": "NOT_ASSIGNED", "message": "题目未分配给该用户"}` |
| 已回答过该题 | 400 | `ALREADY_ANSWERED` | `{"success": false, "error": "ALREADY_ANSWERED", "message": "已经回答过该题目"}` |
| 题目不存在 | 400 | `QUESTION_NOT_FOUND` | `{"success": false, "error": "QUESTION_NOT_FOUND", "message": "题目不存在"}` |
| 题目数据异常 | 400 | `INVALID_QUESTION_DATA` | `{"success": false, "error": "INVALID_QUESTION_DATA", "message": "题目数据格式错误"}` |

---

### 4. 个人排行榜（支持按组过滤）

获取个人排行榜，可通过 `groupId` 查看某组内排名。

```
GET /api/leaderboard
```

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `limit` | number | ❌ | 10 | 每页数量（1~100） |
| `offset` | number | ❌ | 0 | 偏移量 |
| `groupId` | string | ❌ | — | 按分组过滤；不传则返回全局排行 |

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `leaderboard` | array | 排行列表 |
| `leaderboard[].rank` | number | 名次 |
| `leaderboard[].userId` | string | 选手ID |
| `leaderboard[].score` | number | 总分 |
| `leaderboard[].stats` | object | 答题统计 |
| `total` | number | 总人数 |
| `groupId` | string | 分组ID（按组过滤时返回） |
| `page` | object | 分页信息 `{limit, offset}` |

#### 示例：全局排行榜

**请求**

```
GET /api/leaderboard?limit=10&offset=0
```

**响应** `200 OK`

```json
{
  "success": true,
  "leaderboard": [
    {
      "rank": 1,
      "userId": "player_solo",
      "score": 10,
      "stats": {
        "total": 1,
        "correct": 1,
        "wrong": 0,
        "accuracy": 1
      }
    },
    {
      "rank": 2,
      "userId": "player_A2",
      "score": 10,
      "stats": {
        "total": 1,
        "correct": 1,
        "wrong": 0,
        "accuracy": 1
      }
    },
    {
      "rank": 3,
      "userId": "player_A1",
      "score": 10,
      "stats": {
        "total": 1,
        "correct": 1,
        "wrong": 0,
        "accuracy": 1
      }
    },
    {
      "rank": 4,
      "userId": "player_B1",
      "score": 0,
      "stats": {
        "total": 1,
        "correct": 0,
        "wrong": 1,
        "accuracy": 0
      }
    }
  ],
  "total": 4,
  "page": {
    "limit": 10,
    "offset": 0
  }
}
```

#### 示例：按分组过滤

**请求**

```
GET /api/leaderboard?limit=10&offset=0&groupId=teamA
```

**响应** `200 OK`

```json
{
  "success": true,
  "leaderboard": [
    {
      "rank": 1,
      "userId": "player_A1",
      "score": 10,
      "stats": {
        "total": 1,
        "correct": 1,
        "wrong": 0,
        "accuracy": 1
      }
    },
    {
      "rank": 2,
      "userId": "player_A2",
      "score": 10,
      "stats": {
        "total": 1,
        "correct": 1,
        "wrong": 0,
        "accuracy": 1
      }
    }
  ],
  "total": 2,
  "groupId": "teamA",
  "page": {
    "limit": 10,
    "offset": 0
  }
}
```

#### 错误情况

| 情况 | HTTP状态码 | 响应 |
|------|-----------|------|
| limit 超范围 | 400 | `{"success": false, "message": "limit参数必须在1-100之间"}` |
| offset 为负数 | 400 | `{"success": false, "message": "offset参数必须大于等于0"}` |

---

### 5. 分组排行榜

按分组总分排名，查看各分组 PK 情况。

```
GET /api/leaderboard/groups
```

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `leaderboard` | array | 分组排行列表 |
| `leaderboard[].rank` | number | 名次 |
| `leaderboard[].groupId` | string | 分组ID |
| `leaderboard[].totalScore` | number | 分组总分 |
| `leaderboard[].memberCount` | number | 成员数 |
| `leaderboard[].stats` | object | 分组答题统计 |
| `leaderboard[].stats.total` | number | 总答题数 |
| `leaderboard[].stats.correct` | number | 答对数 |
| `leaderboard[].stats.wrong` | number | 答错数 |
| `leaderboard[].stats.accuracy` | number | 正确率（0~1） |
| `total` | number | 分组总数 |

> **注意**：只有成员提交过答案且答对的分组才会出现在排行榜中（分组分数 > 0）。

#### 示例

**请求**

```
GET /api/leaderboard/groups
```

**响应** `200 OK`

```json
{
  "success": true,
  "leaderboard": [
    {
      "rank": 1,
      "groupId": "teamA",
      "totalScore": 20,
      "memberCount": 2,
      "stats": {
        "total": 2,
        "correct": 2,
        "wrong": 0,
        "accuracy": 1
      }
    }
  ],
  "total": 1
}
```

---

### 6. 用户答题记录

查看指定选手的答题历史和统计。

```
GET /api/user/:userId/answers
```

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `userId` | string | 选手ID |

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `userId` | string | 选手ID |
| `answers` | array | 答题记录列表（按时间倒序） |
| `answers[].questionId` | string | 题目ID |
| `answers[].userAnswer` | string | 用户提交的答案 |
| `answers[].result` | string | `"correct"` 或 `"wrong"` |
| `answers[].timestamp` | number | 提交时间戳（毫秒） |
| `stats` | object | 个人统计 |
| `stats.total` | number | 总答题数 |
| `stats.correct` | number | 答对数 |
| `stats.wrong` | number | 答错数 |
| `stats.score` | number | 总分 |
| `stats.accuracy` | number | 正确率（0~1） |
| `stats.lastAnswerTime` | number \| null | 最后答题时间戳 |

#### 示例

**请求**

```
GET /api/user/player_A1/answers
```

**响应** `200 OK`

```json
{
  "success": true,
  "userId": "player_A1",
  "answers": [
    {
      "questionId": "q004",
      "userAnswer": "B",
      "result": "correct",
      "timestamp": 1775470614410
    }
  ],
  "stats": {
    "total": 1,
    "correct": 1,
    "wrong": 0,
    "score": 10,
    "accuracy": 1,
    "lastAnswerTime": 1775470614410
  }
}
```

---

### 7. 用户排名

查看指定选手在全局排行榜中的排名。

```
GET /api/user/:userId/rank
```

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `userId` | string | 选手ID |

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `userId` | string | 选手ID |
| `score` | number | 总分 |
| `rank` | number | 排名（从1开始） |
| `totalUsers` | number | 参与答题的总人数 |
| `percentile` | number | 超越百分比（0~100） |

#### 示例

**请求**

```
GET /api/user/player_A1/rank
```

**响应** `200 OK`

```json
{
  "success": true,
  "userId": "player_A1",
  "score": 10,
  "rank": 3,
  "totalUsers": 4,
  "percentile": 50
}
```

#### 错误情况

| 情况 | HTTP状态码 | 响应 |
|------|-----------|------|
| 用户未参与答题 | 404 | `{"success": false, "error": "USER_NOT_FOUND", "message": "用户未参与答题"}` |

---

### 8. 题库状态

查看当前题库的剩余/已分配题目数量。

```
GET /api/status
```

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `remainingCount` | number | 题库剩余可抢题目数 |
| `assignedCount` | number | 已被抢走的题目数 |
| `totalCount` | number | 题目总数（remaining + assigned） |

#### 示例

**请求**

```
GET /api/status
```

**响应** `200 OK`

```json
{
  "success": true,
  "remainingCount": 0,
  "assignedCount": 5,
  "totalCount": 5
}
```

---

### 9. 分组列表

列出当前所有分组及其基本信息。

```
GET /api/groups
```

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `groups` | array | 分组列表（按总分倒序） |
| `groups[].groupId` | string | 分组ID |
| `groups[].memberCount` | number | 成员数 |
| `groups[].totalScore` | number | 分组总分 |
| `total` | number | 分组总数 |

#### 示例

**请求**

```
GET /api/groups
```

**响应** `200 OK`

```json
{
  "success": true,
  "groups": [
    {
      "groupId": "teamA",
      "memberCount": 2,
      "totalScore": 20
    },
    {
      "groupId": "teamB",
      "memberCount": 1,
      "totalScore": 0
    }
  ],
  "total": 2
}
```

---

### 10. 分组详情

查看指定分组的成员列表和答题统计。

```
GET /api/groups/:groupId
```

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `groupId` | string | 分组ID |

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `groupId` | string | 分组ID |
| `totalScore` | number | 分组总分 |
| `memberCount` | number | 成员数 |
| `members` | string[] | 成员ID列表 |
| `stats` | object | 分组答题统计 |
| `stats.total` | number | 总答题数 |
| `stats.correct` | number | 答对数 |
| `stats.wrong` | number | 答错数 |
| `stats.accuracy` | number | 正确率 |

#### 示例

**请求**

```
GET /api/groups/teamA
```

**响应** `200 OK`

```json
{
  "success": true,
  "groupId": "teamA",
  "totalScore": 20,
  "memberCount": 2,
  "members": [
    "player_A1",
    "player_A2"
  ],
  "stats": {
    "total": 2,
    "correct": 2,
    "wrong": 0,
    "accuracy": 1
  }
}
```

#### 错误情况

| 情况 | HTTP状态码 | 响应 |
|------|-----------|------|
| 分组不存在 | 404 | `{"success": false, "error": "GROUP_NOT_FOUND", "message": "分组不存在或无成员"}` |

---

### 11. 分组成员

查看指定分组内每个成员的得分和答题统计。

```
GET /api/groups/:groupId/members
```

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `groupId` | string | 分组ID |

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `groupId` | string | 分组ID |
| `members` | array | 成员详情列表（按分数倒序） |
| `members[].userId` | string | 选手ID |
| `members[].score` | number | 个人总分 |
| `members[].stats` | object | 个人答题统计 |
| `total` | number | 成员总数 |

#### 示例

**请求**

```
GET /api/groups/teamA/members
```

**响应** `200 OK`

```json
{
  "success": true,
  "groupId": "teamA",
  "members": [
    {
      "userId": "player_A1",
      "score": 10,
      "stats": {
        "total": 1,
        "correct": 1,
        "wrong": 0,
        "accuracy": 1
      }
    },
    {
      "userId": "player_A2",
      "score": 10,
      "stats": {
        "total": 1,
        "correct": 1,
        "wrong": 0,
        "accuracy": 1
      }
    }
  ],
  "total": 2
}
```

#### 错误情况

| 情况 | HTTP状态码 | 响应 |
|------|-----------|------|
| 分组不存在 | 404 | `{"success": false, "error": "GROUP_NOT_FOUND", "message": "分组不存在或无成员"}` |

---

### 12. 全局统计

获取系统全局统计信息。

```
GET /api/stats/global
```

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `stats.totalUsers` | number | 参与答题的总人数 |
| `stats.totalQuestions` | number | 题库中的题目总数（remaining + assigned） |
| `stats.remainingQuestions` | number | 剩余可抢题目数 |
| `stats.assignedQuestions` | number | 已分配题目数 |
| `stats.totalQuestionsInDB` | number | 题目详情库中的题目总数 |

#### 示例

**请求**

```
GET /api/stats/global
```

**响应** `200 OK`

```json
{
  "success": true,
  "stats": {
    "totalUsers": 4,
    "totalQuestions": 5,
    "remainingQuestions": 0,
    "assignedQuestions": 5,
    "totalQuestionsInDB": 5
  }
}
```

---

### 13. 题目统计

查看指定题目的答题统计（答对率、难度等）。

```
GET /api/question/:questionId/stats
```

#### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `questionId` | string | 题目ID |

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `questionId` | string | 题目ID |
| `stats.total` | number | 总答题人次 |
| `stats.correct` | number | 答对人次 |
| `stats.wrong` | number | 答错人次 |
| `stats.correctRate` | number | 正确率（0~1） |
| `stats.difficulty` | string | 计算难度（`easy` ≥80%, `medium` ≥50%, `hard` <50%） |

#### 示例

**请求**

```
GET /api/question/q004/stats
```

**响应** `200 OK`

```json
{
  "success": true,
  "questionId": "q004",
  "stats": {
    "total": 1,
    "correct": 1,
    "wrong": 0,
    "correctRate": 1,
    "difficulty": "easy"
  }
}
```

#### 错误情况

| 情况 | HTTP状态码 | 响应 |
|------|-----------|------|
| 暂无统计数据 | 404 | `{"success": false, "error": "NO_STATS", "message": "暂无统计数据"}` |

---

### 14. WebSocket 实时更新

通过 WebSocket 接收实时事件推送。

```
WS ws://<服务器地址>:3000/ws
```

#### 连接

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到更新:', data);
};
```

#### 消息格式

**抢题事件**

```json
{
  "action": "grab",
  "questionId": "q004",
  "userId": "player_A1",
  "groupId": "teamA",
  "remainingCount": 2,
  "timestamp": 1775470600000
}
```

> 个人模式时 `groupId` 为 `null`。

**答题事件**

```json
{
  "action": "answer_submitted",
  "userId": "player_A1",
  "questionId": "q004",
  "result": "correct",
  "score": 10,
  "timestamp": 1775470614410
}
```

---

## 管理端 API（需要鉴权）

> 以下所有接口均需要 `x-admin-key` 请求头，破坏性操作还需要 `"confirm": "YES"`。

### 鉴权要求

```
Header: x-admin-key: <ADMIN_API_KEY>
Body:   { "confirm": "YES", ... }
```

### API 列表

| 方法 | 路径 | 说明 | confirm |
|------|------|------|---------|
| `POST` | `/api/init` | 初始化题库（仅题号） | ✅ |
| `POST` | `/api/init-with-details` | 初始化题库（含完整题目详情） | ✅ |
| `POST` | `/api/presets/upload` | 上传题包 | ❌ |
| `POST` | `/api/presets/:name/load` | 加载题包到题库 | ✅ |
| `DELETE` | `/api/presets/:name` | 删除题包 | ✅ |
| `DELETE` | `/api/reset-pool` | 重置题库池（已分配题目放回） | ✅ |
| `DELETE` | `/api/reset-stats` | 清空答题统计和分组数据 | ✅ |
| `DELETE` | `/api/reset` | 清空所有数据（题库 + 统计 + 分组） | ✅ |
| `GET` | `/api/presets` | 列出所有题包 | — |
| `GET` | `/api/assigned` | 查看已分配题目 | — |

### 示例：初始化题库

**请求**

```json
POST /api/init-with-details
Content-Type: application/json
x-admin-key: change-me-in-production

{
  "confirm": "YES",
  "questions": [
    {
      "id": "q001",
      "title": "中国的首都是哪座城市？",
      "options": ["A. 上海", "B. 北京", "C. 广州", "D. 深圳"],
      "answer": "B",
      "explanation": "北京是中华人民共和国的首都",
      "difficulty": "easy",
      "category": "地理"
    }
  ]
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "totalQuestions": 1,
  "message": "题库初始化成功（含1道题目详情）"
}
```

### 示例：重置所有数据

**请求**

```json
DELETE /api/reset
Content-Type: application/json
x-admin-key: change-me-in-production

{
  "confirm": "YES"
}
```

**响应** `200 OK`

```json
{
  "success": true,
  "message": "所有数据已清空"
}
```

---

## 选手端接入指南

### 典型流程（伪代码）

```javascript
// ============ 1. 选手加入比赛 ============
const userId = 'player_001';  // 选手唯一ID（如微信openid）
const groupId = 'teamA';      // 团队模式传入；个人模式不传

// ============ 2. 抢题 ============
const grabRes = await fetch('/api/grab-with-details', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, groupId })
});
const grabData = await grabRes.json();

if (!grabData.success) {
  // 题库已空，比赛结束
  console.log(grabData.message);
  return;
}

// 显示题目（注意隐藏 answer 字段）
const question = grabData.question;
showQuestion({
  title: question.title,
  options: question.options,
  questionId: grabData.questionId
});

// ============ 3. 提交答案 ============
const userAnswer = getUserSelection(); // 用户选择的答案

const submitRes = await fetch('/api/submit-answer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId,
    questionId: grabData.questionId,
    answer: userAnswer,
    groupId  // 可选，系统会自动关联已有分组
  })
});
const submitData = await submitRes.json();

if (submitData.success) {
  showResult({
    isCorrect: submitData.result === 'correct',
    correctAnswer: submitData.correctAnswer,
    score: submitData.score.total,
    increment: submitData.score.increment
  });
}

// ============ 4. 查看排行榜 ============
// 全局排行
const globalRank = await fetch('/api/leaderboard?limit=10').then(r => r.json());

// 组内排行
const groupRank = await fetch(`/api/leaderboard?limit=10&groupId=${groupId}`).then(r => r.json());

// 分组PK排行
const groupPK = await fetch('/api/leaderboard/groups').then(r => r.json());

// 个人排名
const myRank = await fetch(`/api/user/${userId}/rank`).then(r => r.json());
```

### 微信小程序示例

```javascript
// 小程序中使用 wx.request
wx.request({
  url: 'https://your-server.com/api/grab-with-details',
  method: 'POST',
  header: { 'Content-Type': 'application/json' },
  data: {
    userId: app.globalData.openid,
    groupId: 'teamA'
  },
  success(res) {
    if (res.data.success) {
      // 渲染题目
    }
  }
});

// 小程序 WebSocket
wx.connectSocket({ url: 'wss://your-server.com/ws' });
wx.onSocketMessage(function(res) {
  const data = JSON.parse(res.data);
  if (data.action === 'answer_submitted') {
    // 更新实时排行
  }
});
```

### 个人模式 vs 团队模式

| 特性 | 个人模式 | 团队模式 |
|------|---------|---------|
| 抢题请求 | `{ userId }` | `{ userId, groupId }` |
| 答题请求 | `{ userId, questionId, answer }` | `{ userId, questionId, answer, groupId }` |
| 个人排行 | ✅ `/api/leaderboard` | ✅ `/api/leaderboard` |
| 组内排行 | ❌ | ✅ `/api/leaderboard?groupId=xxx` |
| 分组PK | ❌ | ✅ `/api/leaderboard/groups` |
| 分组信息 | ❌ | ✅ `/api/groups`, `/api/groups/:id` |
| 自动建组 | — | 首次传入 groupId 时自动创建 |
| 分数汇总 | 仅个人 | 个人 + 分组双重汇总 |

### 注意事项

1. **答案格式**
   - 单选题：提交单个字母，如 `"B"`
   - 多选题：用英文逗号分隔，如 `"A,B,D"`（顺序不影响判定）
   - 判断题：`"A"` 表示正确，`"B"` 表示错误

2. **每题只能答一次**
   - 重复提交会返回 `ALREADY_ANSWERED` 错误

3. **题目必须先抢后答**
   - 只能提交分配给自己的题目，否则返回 `NOT_ASSIGNED` 错误

4. **groupId 的自动关联**
   - 抢题时传入 `groupId` 后，后续提交答案时可以不传 `groupId`，系统会自动使用之前的分组
   - 但建议每次都传，确保一致性

5. **抢题接口返回答案字段**
   - `/api/grab-with-details` 返回的 `question` 对象中包含 `answer` 字段
   - **前端务必不要直接展示此字段**，仅在提交答案后再展示正确答案

6. **分数规则**
   - 默认每题 10 分（可通过服务端环境变量 `SCORE_PER_QUESTION` 配置）
   - 答对得分，答错不扣分（得 0 分）

7. **分组排行榜的区别**
   - `GET /api/leaderboard?groupId=xxx` — 查看某组内的 **个人** 排名
   - `GET /api/leaderboard/groups` — 查看 **各组之间** 的 PK 排名
   - `GET /api/groups/:groupId/members` — 查看组内成员详细得分

8. **WebSocket 连接**
   - 推荐用于实时刷新排行榜、显示其他选手抢题/答题动态
   - 支持的事件：`grab`（有人抢题）、`answer_submitted`（有人答题）
