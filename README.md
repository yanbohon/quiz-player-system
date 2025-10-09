# 答题系统 - 选手端

基于 Next.js 15 的移动端答题应用，支持实时通信和离线答题。

## 技术栈

- **UI 框架**: [Arco Design Mobile (React)](https://arco.design/mobile/react) 2.38.1
- **前端框架**: [Next.js](https://nextjs.org/) 15.5.4
- **数据管理**: [TanStack Query](https://tanstack.com/query) (React Query)
- **实时通信**: [MQTT.js](https://github.com/mqttjs/MQTT.js) (WebSocket TLS/SSL)
- **状态管理**: [Zustand](https://zustand-demo.pmnd.rs/)
- **语言**: TypeScript

> **重要提示**: 本项目使用 React 19，需要特殊的 ArcoDesign 适配。请查看 [React 19 适配指南](./docs/REACT19_MIGRATION.md) 了解如何正确使用 UI 组件。

## 项目结构

```
.
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── layout.tsx      # 根布局
│   │   ├── page.tsx        # 首页
│   │   ├── providers.tsx   # 全局 Provider
│   │   └── globals.css     # 全局样式
│   ├── components/         # 可复用组件
│   │   ├── Loading.tsx
│   │   └── ErrorBoundary.tsx
│   ├── lib/                # 工具库
│   │   ├── api/           # API 客户端
│   │   │   ├── client.ts
│   │   │   └── queries.ts
│   │   └── mqtt/          # MQTT 客户端
│   │       ├── client.ts
│   │       └── hooks.ts
│   └── store/             # Zustand 状态管理
│       └── useAppStore.ts
├── public/                # 静态资源
├── .env.example          # 环境变量示例
└── package.json          # 项目配置
```

## 开始使用

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local` 并填入实际配置：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
NEXT_PUBLIC_API_BASE_URL=http://your-api-server/api
NEXT_PUBLIC_TIHAI_API_BASE=https://znbiakwnyaoe.sealosbja.site/api
NEXT_PUBLIC_MQTT_URL=wss://your-mqtt-broker:8884/mqtt
NEXT_PUBLIC_MQTT_USERNAME=your_username
NEXT_PUBLIC_MQTT_PASSWORD=your_password
NEXT_PUBLIC_MQTT_TOPIC_COMMAND=cmd
NEXT_PUBLIC_MQTT_TOPIC_CONTROL=quiz/control
NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX=state
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

### 4. 构建生产版本

```bash
npm run build
npm start
```

## 移动端优化

本应用针对移动端进行了深度优化：

- **📱 自适应缩放**: 使用官方 flexible.js rem 自适应方案
  - 基准字体：50px（@base-font-size: 50px）
  - UI稿宽度：375px
  - 自动响应屏幕旋转和窗口大小变化
  - 详见 [Flexible 适配文档](./docs/FLEXIBLE.md)

- **🎯 触摸优化**: 针对移动端手势交互优化
- **⚡ 性能优化**: 使用 `useShallow` 避免不必要的重渲染
- **🔧 用户缩放**: 支持用户手动缩放（双指捏合）

## 核心功能模块

### 1. MQTT 实时通信

```typescript
import { useEffect } from 'react';
import { useMqtt } from '@/lib/mqtt/hooks';
import { MQTT_CONFIG, MQTT_TOPICS } from '@/config/control';

const { isConnected, subscribe } = useMqtt(MQTT_CONFIG);

useEffect(() => {
  if (!isConnected) return;
  const unsubscribe = subscribe(MQTT_TOPICS.command, (payload) => {
    console.log('主持人指令：', payload);
  });
  return () => unsubscribe?.();
}, [isConnected, subscribe]);
```

### 2. 数据查询 (TanStack Query)

```typescript
import { useQuestions, useSubmitAnswer } from '@/lib/api/queries';

// 获取题目列表
const { data, isLoading } = useQuestions();

// 提交答案
const submitMutation = useSubmitAnswer();
submitMutation.mutate({ questionId: '1', answer: 'A' });
```

> 💡 接口基础地址可通过 `NEXT_PUBLIC_API_BASE_URL` 覆盖；`src/config/api.ts` 会自动拼接相对路径。

### 3. 状态管理 (Zustand)

```typescript
import { useAppStore } from '@/store/useAppStore';

// 使用状态
const user = useAppStore(state => state.user);
const setUser = useAppStore(state => state.setUser);
```

## 开发指南

详细的开发文档：
- 📘 [开发文档](./docs/DEVELOPMENT.md) - 完整的开发指南
- 🚀 [快速开始](./docs/QUICKSTART.md) - 快速上手指南
- ⚛️ [React 19 适配](./docs/REACT19_MIGRATION.md) - React 19 和 ArcoDesign 适配说明
- 📡 [API 文档](./docs/API.md) - API 接口文档
- 📱 [Flexible 自适应适配](./docs/FLEXIBLE.md) - rem 自适应适配方案（官方）
- 📋 [Flexible 示例](./docs/FLEXIBLE_EXAMPLE.md) - px 转 rem 完整示例和转换指南
- 📱 [页面缩放适配](./docs/VIEWPORT_SCALING.md) - 移动端屏幕适配方案（旧版）
- 🔧 [MQTT 故障排除](./docs/MQTT_TROUBLESHOOTING.md) - MQTT 连接问题解决方案

### 使用 ArcoDesign 组件

**重要**: 所有 ArcoDesign 组件必须包裹在 `ArcoClient` 中：

```typescript
'use client';

import { Button } from '@arco-design/mobile-react';
import { ArcoClient } from '@/components/ArcoClient';
import { Toast } from '@/lib/arco';

export default function MyPage() {
  return (
    <ArcoClient>
      <Button 
        type="primary" 
        onClick={() => Toast.success('成功！')}
      >
        点击我
      </Button>
    </ArcoClient>
  );
}
```

### 添加新页面

在 `src/app` 目录下创建新文件夹，例如 `src/app/quiz/page.tsx`：

```typescript
export default function QuizPage() {
  return <div>答题页面</div>;
}
```

### 添加新组件

在 `src/components` 目录下创建组件文件：

```typescript
// src/components/QuestionCard.tsx
export function QuestionCard({ question }) {
  return (
    <div>
      <h3>{question.title}</h3>
      {/* ... */}
    </div>
  );
}
```

### API 集成

在 `src/lib/api/queries.ts` 中添加新的查询或变更：

```typescript
export function useMyQuery() {
  return useQuery({
    queryKey: ['my-data'],
    queryFn: () => api.get('/my-endpoint'),
  });
}
```

## 可用脚本

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run start` - 启动生产服务器
- `npm run lint` - 运行 ESLint
- `npm run type-check` - TypeScript 类型检查

## 常见问题

### MQTT 连接错误 ("connack timeout")

如果遇到 MQTT 连接超时错误，应用仍会正常运行但不会有实时更新功能。解决方案：

**快速解决**：禁用 MQTT（如果不需要实时功能）

创建 `.env.local` 文件并添加：
```env
NEXT_PUBLIC_MQTT_ENABLED=false
```

**详细说明**：查看 [MQTT 故障排除文档](./docs/MQTT_TROUBLESHOOTING.md) 了解完整的解决方案。

## 环境要求

- Node.js >= 18.18.0
- npm >= 9.0.0

## 部署

### Vercel (推荐)

1. 将代码推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目
3. 配置环境变量
4. 部署

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
