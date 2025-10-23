# API 使用说明

本项目使用了多个 API 服务，本文档说明各 API 的用途和配置方法。

---

## 📊 API 架构概览

本项目使用**三个不同的 API 服务**，各有不同的用途：

```
┌─────────────────────────────────────────────────────────┐
│                    选手端应用                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │   Fusion API     │  │   Tihai API      │            │
│  │  (飞书多维表格)   │  │   (题海抢题)      │            │
│  │   ⭐⭐⭐⭐⭐      │  │    ⭐⭐⭐        │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                          │
│  ┌──────────────────┐                                   │
│  │   Base API       │                                   │
│  │  (预留/备用)      │                                   │
│  │    ⭐           │                                   │
│  └──────────────────┘                                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 1️⃣ Fusion API（主要）

### 基本信息
- **环境变量**: `NEXT_PUBLIC_FUSION_API_BASE`
- **默认值**: `https://api.ohvfx.com/fusion`
- **重要性**: ⭐⭐⭐⭐⭐（核心功能）
- **状态**: ✅ 实际使用中

### 用途
这是项目的**主要数据管理 API**，基于飞书多维表格：

1. **赛事管理**
   - 获取赛事列表
   - 获取赛事配置

2. **题目管理**
   - 加载题目数据
   - 获取题目详情

3. **选手管理**
   - 加载选手信息
   - 更新选手状态

4. **答题记录**
   - 提交答案
   - 更新分数记录

### 配置参数
```bash
# API 基础地址
NEXT_PUBLIC_FUSION_API_BASE=https://api.ohvfx.com/fusion

# API 访问令牌
NEXT_PUBLIC_FUSION_API_TOKEN=uskOS7wIpVOyV6glpE7eOY6

# 空间 ID
NEXT_PUBLIC_FUSION_SPACE_ID=spch5h60Pobkk

# 事件节点 ID
NEXT_PUBLIC_FUSION_EVENT_NODE_ID=foduzcRW7MGLv
```

### 代码位置
- **配置**: `src/config/control.ts`
- **客户端**: `src/lib/fusionClient.ts`
- **使用**: `src/store/quizStore.ts`

---

## 2️⃣ Tihai API（题海抢题）

### 基本信息
- **环境变量**: `NEXT_PUBLIC_TIHAI_API_BASE`
- **默认值**: `https://fn.ohvfx.com/quiz-pool/api`
- **重要性**: ⭐⭐⭐（专用功能）
- **状态**: ✅ 实际使用中

### 用途
用于**"题海遨游"环节**的抢题功能：

1. **抢题**
   - `POST /grab-with-details` - 抢取下一道题目
   - 返回题目内容和剩余题目数

2. **提交答案**
   - `POST /submit-answer` - 提交抢题答案
   - 返回判题结果、分数、统计信息

### 配置
```bash
# 题海抢题 API 地址
NEXT_PUBLIC_TIHAI_API_BASE=https://fn.ohvfx.com/quiz-pool/api
```

### 代码位置
- **配置**: `src/config/api.ts`
- **调用**: `src/lib/fusionClient.ts`
  - `fetchGrabbedQuestion()` - 抢题
  - `submitGrabbedAnswer()` - 提交答案

---

## 3️⃣ Base API（预留）

### 基本信息
- **环境变量**: `NEXT_PUBLIC_API_BASE_URL` ⚠️ **已移除**
- **内置默认值**: `https://api.ohvfx.com/api`
- **重要性**: ⭐（备用/预留）
- **状态**: ⚠️ 代码中有功能但很少使用

### 用途
这是一个**预留的 REST API 配置**：

1. **可能用途**（代码中定义但未实际使用）:
   - 用户认证 (`/auth/login`, `/auth/logout`)
   - 题目查询 (`/questions`)
   - 答案提交 (`/answers`)
   - 用户信息 (`/user/profile`)

2. **当前状态**:
   - 代码中有相关函数定义（`src/lib/api/queries.ts`）
   - 但这些函数**没有被项目实际调用**
   - 主要功能已由 Fusion API 和 Tihai API 实现

### 配置方式
```bash
# ⚠️ 此环境变量已从云托管配置中移除
# 代码会使用内置默认值: https://api.ohvfx.com/api
# 如需覆盖，可以添加此环境变量

# NEXT_PUBLIC_API_BASE_URL=https://your-custom-api.com/api
```

### 代码位置
- **配置**: `src/config/api.ts`
- **客户端**: `src/lib/api/client.ts`
- **示例**: `src/lib/api/queries.ts`（未被调用）

---

## 🎯 使用建议

### ✅ 必须配置的环境变量

这些是**实际使用**的环境变量，必须正确配置：

```bash
# Fusion API（核心）
NEXT_PUBLIC_FUSION_API_BASE=https://api.ohvfx.com/fusion
NEXT_PUBLIC_FUSION_API_TOKEN=uskOS7wIpVOyV6glpE7eOY6
NEXT_PUBLIC_FUSION_SPACE_ID=spch5h60Pobkk
NEXT_PUBLIC_FUSION_EVENT_NODE_ID=foduzcRW7MGLv

# Tihai API（题海抢题）
NEXT_PUBLIC_TIHAI_API_BASE=https://fn.ohvfx.com/quiz-pool/api
```

### ⚠️ 可选的环境变量

这些环境变量有内置默认值，通常不需要配置：

```bash
# Base API（如需自定义才配置）
# NEXT_PUBLIC_API_BASE_URL=https://your-custom-api.com/api
```

---

## 🔍 故障排查

### Fusion API 连接失败

**症状**: 无法加载赛事、题目或选手信息

**检查**:
1. 验证 API 地址: `https://api.ohvfx.com/fusion`
2. 验证 Token 是否正确
3. 验证 Space ID 和 Event Node ID

**测试**:
```bash
curl -H "Authorization: Bearer uskOS7wIpVOyV6glpE7eOY6" \
  https://api.ohvfx.com/fusion/spaces/spch5h60Pobkk/nodes/foduzcRW7MGLv
```

### Tihai API 抢题失败

**症状**: "题海遨游"环节无法抢题

**检查**:
1. 验证 API 地址: `https://fn.ohvfx.com/quiz-pool/api`
2. 查看浏览器控制台错误信息

**测试**:
```bash
curl -X POST https://fn.ohvfx.com/quiz-pool/api/grab-with-details \
  -H "Content-Type: application/json" \
  -d '{"userId":"test"}'
```

---

## 📝 API 端点汇总

### Fusion API 端点
- `GET /spaces/{spaceId}/nodes/{nodeId}` - 获取空间节点
- `GET /datasheets/{datasheetId}/records` - 获取数据表记录  
- `PATCH /datasheets/{datasheetId}/records` - 更新记录

### Tihai API 端点
- `POST /grab-with-details` - 抢取题目
- `POST /submit-answer` - 提交答案

### Base API 端点（预留）
- `POST /auth/login` - 登录
- `POST /auth/logout` - 登出
- `GET /questions` - 获取题目
- `POST /answers` - 提交答案
- `GET /user/profile` - 获取用户信息

---

## 🔄 环境变量更新

如需修改 API 配置：

1. **编辑配置文件**: `ENV_VARS_DEPLOYED.txt`
2. **更新云托管**: 
   - 方法1: 在 CloudBase 控制台手动更新
   - 方法2: 重新部署应用

3. **重启服务**: 修改环境变量后服务会自动重启

---

## 📚 相关文档

- **环境变量配置**: `ENV_VARS_DEPLOYED.txt`
- **API 客户端代码**: `src/lib/fusionClient.ts`, `src/lib/api/client.ts`
- **API 配置**: `src/config/api.ts`, `src/config/control.ts`

---

**更新时间**: 2025-10-21 20:51:00


