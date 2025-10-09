# 快速开始指南

## 5 分钟上手

### 1️⃣ 安装依赖

```bash
cd "/Users/yanbo./Downloads/答题系统/[重构]选手端"
npm install
```

### 2️⃣ 配置环境变量

创建 `.env.local` 文件：

```bash
cat > .env.local << 'EOF'
# API 配置
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
NEXT_PUBLIC_TIHAI_API_BASE=https://znbiakwnyaoe.sealosbja.site/api

# MQTT 配置（暂时留空，后续配置）
NEXT_PUBLIC_MQTT_URL=ws://localhost:1883
NEXT_PUBLIC_MQTT_USERNAME=
NEXT_PUBLIC_MQTT_PASSWORD=

# 调试模式
NEXT_PUBLIC_DEBUG=true
EOF
```

### 3️⃣ 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用！

## 项目结构一览

```
答题系统-选手端/
├── 📁 src/                        # 源代码目录
│   ├── 📁 app/                   # Next.js 页面和路由
│   │   ├── layout.tsx           # 全局布局
│   │   ├── page.tsx             # 首页
│   │   ├── providers.tsx        # 全局 Provider
│   │   └── globals.css          # 全局样式
│   │
│   ├── 📁 components/            # 可复用组件
│   │   ├── Loading.tsx
│   │   └── ErrorBoundary.tsx
│   │
│   ├── 📁 lib/                   # 核心库
│   │   ├── 📁 api/              # API 相关
│   │   │   ├── client.ts        # HTTP 客户端
│   │   │   └── queries.ts       # React Query hooks
│   │   ├── 📁 mqtt/             # MQTT 实时通信
│   │   │   ├── client.ts        # MQTT 客户端
│   │   │   └── hooks.ts         # MQTT hooks
│   │   └── 📁 utils/            # 工具函数
│   │
│   ├── 📁 store/                 # 状态管理 (Zustand)
│   │   └── useAppStore.ts
│   │
│   ├── 📁 hooks/                 # 自定义 Hooks
│   │   ├── useCountdown.ts      # 倒计时
│   │   └── useLocalStorage.ts   # 本地存储
│   │
│   ├── 📁 types/                 # TypeScript 类型
│   │   └── index.ts
│   │
│   └── 📁 constants/             # 常量定义
│       └── index.ts
│
├── 📁 public/                     # 静态资源
├── 📁 docs/                       # 文档
│   ├── QUICKSTART.md            # 本文件
│   ├── DEVELOPMENT.md           # 开发文档
│   └── API.md                   # API 文档
│
├── 📄 package.json               # 项目配置
├── 📄 tsconfig.json              # TypeScript 配置
├── 📄 next.config.ts             # Next.js 配置
└── 📄 README.md                  # 项目说明
```

## 技术栈速查

| 技术 | 用途 | 文档链接 |
|------|------|----------|
| **Next.js 15.5.4** | React 框架 | [文档](https://nextjs.org/docs) |
| **Arco Design Mobile 2.38.1** | UI 组件库 | [文档](https://arco.design/mobile/react) |
| **TanStack Query** | 数据获取和缓存 | [文档](https://tanstack.com/query) |
| **MQTT.js** | 实时通信 | [文档](https://github.com/mqttjs/MQTT.js) |
| **Zustand** | 状态管理 | [文档](https://zustand-demo.pmnd.rs/) |

## 常用命令

```bash
# 开发
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run start        # 启动生产服务器

# 代码质量
npm run lint         # ESLint 检查
npm run type-check   # TypeScript 类型检查
```

## 开始开发

### 创建新页面

1. 在 `src/app` 下创建新文件夹：

```typescript
// src/app/quiz/page.tsx
export default function QuizPage() {
  return (
    <div>
      <h1>答题页面</h1>
    </div>
  );
}
```

2. 访问 `http://localhost:3000/quiz`

### 使用 UI 组件

```typescript
import { Button, Toast } from '@arco-design/mobile-react';

export default function MyPage() {
  const handleClick = () => {
    Toast.toast('操作成功！');
  };

  return <Button onClick={handleClick}>点击我</Button>;
}
```

### 数据获取

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export default function DataPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['myData'],
    queryFn: () => api.get('/my-endpoint'),
  });

  if (isLoading) return <div>加载中...</div>;

  return <div>{JSON.stringify(data)}</div>;
}
```

### 状态管理

```typescript
import { useAppStore } from '@/store/useAppStore';

export default function StatePage() {
  const user = useAppStore(state => state.user);
  const setUser = useAppStore(state => state.setUser);

  return (
    <div>
      <p>当前用户: {user?.name || '未登录'}</p>
      <button onClick={() => setUser({ id: '1', name: '张三' })}>
        登录
      </button>
    </div>
  );
}
```

## 下一步

- 📖 阅读 [开发文档](./DEVELOPMENT.md) 了解详细架构
- 📡 查看 [API 文档](./API.md) 了解后端接口
- 🎨 浏览 [Arco Design Mobile 组件](https://arco.design/mobile/react/components/button) 
- 🔧 配置 MQTT 服务器连接
- 🚀 开始实现业务功能

## 需要帮助？

- 查看项目 README.md
- 阅读 docs/ 目录下的文档
- 检查浏览器控制台错误
- 使用 React Query DevTools（页面底部）

祝开发愉快！🎉
