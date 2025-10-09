# API 文档

## API 基础信息

- 基础 URL: `NEXT_PUBLIC_API_BASE_URL` 环境变量配置（未设置时回退到 `NEXT_PUBLIC_API_URL` 或 `/api`）
- 内容类型: `application/json`
- 认证方式: Bearer Token（待实现）

## 通用响应格式

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    // 具体数据
  }
}
```

### 错误响应

```json
{
  "code": 400,
  "message": "错误描述",
  "data": null
}
```

## API 端点

### 1. 认证相关

#### 登录

```http
POST /auth/login
```

请求体：
```json
{
  "username": "string",
  "password": "string"
}
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "string",
    "user": {
      "id": "string",
      "name": "string",
      "team": "string"
    }
  }
}
```

#### 登出

```http
POST /auth/logout
```

### 2. 题目相关

#### 获取题目列表

```http
GET /questions
```

查询参数：
- `page`: 页码（默认 1）
- `pageSize`: 每页数量（默认 10）
- `contestId`: 比赛 ID（可选）

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "string",
        "type": "single",
        "title": "string",
        "content": "string",
        "options": [
          {
            "id": "string",
            "label": "A",
            "value": "string"
          }
        ],
        "score": 10,
        "timeLimit": 60
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 10
  }
}
```

#### 获取题目详情

```http
GET /questions/:id
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "string",
    "type": "single",
    "title": "string",
    "content": "string",
    "options": [...],
    "score": 10,
    "timeLimit": 60
  }
}
```

### 3. 答案相关

#### 提交答案

```http
POST /answers
```

请求体：
```json
{
  "questionId": "string",
  "answer": "string" // 或 string[] 对于多选题
}
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "submissionId": "string",
    "score": 10,
    "isCorrect": true
  }
}
```

#### 获取用户答题记录

```http
GET /user/answers
```

查询参数：
- `contestId`: 比赛 ID（可选）

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "answers": [
      {
        "questionId": "string",
        "answer": "string",
        "score": 10,
        "submittedAt": "2025-10-07T12:00:00Z"
      }
    ]
  }
}
```

### 4. 用户相关

#### 获取用户信息

```http
GET /user/profile
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "string",
    "name": "string",
    "team": "string",
    "avatar": "string"
  }
}
```

### 5. 比赛相关

#### 获取比赛列表

```http
GET /contests
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "string",
        "name": "string",
        "description": "string",
        "startTime": "2025-10-07T10:00:00Z",
        "endTime": "2025-10-07T12:00:00Z",
        "status": "active"
      }
    ]
  }
}
```

#### 获取比赛详情

```http
GET /contests/:id
```

## API 基础配置

| 环境变量 | 默认值 | 说明 |
|----------|---------|------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api` | 通用 REST 接口基础地址 |
| `NEXT_PUBLIC_TIHAI_API_BASE` | `https://znbiakwnyaoe.sealosbja.site/api` | 题海抢题端点基础地址 |

## MQTT 主题

所有主题可通过 `.env.local` 配置，默认值如下：

| 环境变量 | 默认值 | 说明 |
|----------|---------|------|
| `NEXT_PUBLIC_MQTT_TOPIC_COMMAND` | `cmd` | 主持人指令广播，例如 `race-3`、`5-start`、`start`、`q-5` |
| `NEXT_PUBLIC_MQTT_TOPIC_CONTROL` | `quiz/control` | 终极挑战抢答控制消息 |
| `NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX` | `state` | 选手在线状态前缀（最终主题为 `<prefix>/<clientId>`） |

### 主持人指令 (`NEXT_PUBLIC_MQTT_TOPIC_COMMAND`)

- 文本协议，常见命令：
  - `race-<n>`：切换到第 `n` 个赛事（1-based）
  - `<stageId>-start`：激活指定环节
  - `start`：在题海遨游等环节触发取题
  - `q-<n>`：切换到第 `n` 道题目（1-based）

### 终极挑战控制 (`NEXT_PUBLIC_MQTT_TOPIC_CONTROL`)

- `%start_buzzing%`：允许选手端触发抢答
- 其他指令可按需扩展

### 在线状态 (`<NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX>/<clientId>`)

- 连接成功后发布 `online`（retain）
- 浏览器关闭或退出前发布 `offline`（retain）

## 错误码

| 错误码 | 说明 |
|-------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |
| 1001 | 用户名或密码错误 |
| 1002 | Token 已过期 |
| 2001 | 题目不存在 |
| 2002 | 答案格式错误 |
| 3001 | 比赛未开始 |
| 3002 | 比赛已结束 |

## 使用示例

### 使用 React Query

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

// 查询
function useQuestions() {
  return useQuery({
    queryKey: ['questions'],
    queryFn: () => api.get('/questions'),
  });
}

// 变更
function useSubmitAnswer() {
  return useMutation({
    mutationFn: (data) => api.post('/answers', data),
  });
}
```

## 注意事项

1. 所有时间使用 ISO 8601 格式
2. 分页从 1 开始
3. 需要在请求头中携带认证 Token（待实现）
4. MQTT 消息使用 JSON 格式
