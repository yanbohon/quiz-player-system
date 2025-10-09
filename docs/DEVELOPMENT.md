# 开发文档

## 项目架构

### 目录结构说明

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 根布局，包含全局 Provider
│   ├── page.tsx           # 首页
│   ├── providers.tsx      # React Query Provider
│   └── globals.css        # 全局样式
│
├── components/            # 可复用组件
│   ├── Loading.tsx       # 加载组件
│   └── ErrorBoundary.tsx # 错误边界
│
├── lib/                   # 工具库和服务
│   ├── api/              # API 相关
│   │   ├── client.ts     # API 客户端
│   │   └── queries.ts    # React Query hooks
│   ├── mqtt/             # MQTT 相关
│   │   ├── client.ts     # MQTT 客户端
│   │   └── hooks.ts      # MQTT hooks
│   └── utils/            # 工具函数
│
├── store/                 # Zustand 状态管理
│   └── useAppStore.ts    # 应用状态
│
├── hooks/                 # 自定义 Hooks
│   ├── useCountdown.ts   # 倒计时
│   └── useLocalStorage.ts # 本地存储
│
├── types/                 # TypeScript 类型定义
│   └── index.ts
│
└── constants/             # 常量定义
    └── index.ts
```

## 核心模块说明

### 1. 状态管理 (Zustand)

使用 Zustand 进行全局状态管理，支持：
- 持久化存储（通过 persist 中间件）
- 不可变更新（通过 immer 中间件）
- DevTools 集成

示例：
```typescript
import { useAppStore } from '@/store/useAppStore';

function MyComponent() {
  const user = useAppStore(state => state.user);
  const setUser = useAppStore(state => state.setUser);
  
  // 使用状态...
}
```

### 2. 数据获取 (TanStack Query)

使用 TanStack Query 管理服务器状态：
- 自动缓存和重新验证
- 后台更新
- 乐观更新
- 分页和无限滚动

示例：
```typescript
import { useQuestions } from '@/lib/api/queries';

function QuestionList() {
  const { data, isLoading, error } = useQuestions();
  
  if (isLoading) return <Loading />;
  if (error) return <div>错误：{error.message}</div>;
  
  return <div>{/* 渲染数据 */}</div>;
}
```

### 3. 实时通信 (MQTT)

使用 MQTT.js 实现 WebSocket 实时通信：

```typescript
import { useEffect } from 'react';
import { useMqtt } from '@/lib/mqtt/hooks';
import { MQTT_CONFIG, MQTT_TOPICS } from '@/config/control';

function RealtimeComponent() {
  const { isConnected, subscribe } = useMqtt(MQTT_CONFIG);

  useEffect(() => {
    if (!isConnected) return;

    return subscribe(MQTT_TOPICS.command, (message) => {
      console.log('收到主持人指令：', message);
    });
  }, [isConnected, subscribe]);
}
```

### 4. UI 组件 (Arco Design Mobile)

使用 Arco Design Mobile 的 React 组件：

#### 基本使用

**重要**: 由于 ArcoDesign Mobile 会在客户端检测平台（iOS/Android），这会导致服务端渲染和客户端渲染的 HTML 不一致（hydration mismatch）。因此，所有 ArcoDesign 组件都需要用 `ArcoClient` 包裹：

```typescript
import { Button } from '@arco-design/mobile-react';
import { ArcoClient } from '@/components/ArcoClient';
import { Toast } from '@/lib/arco';

function MyComponent() {
  const handleClick = () => {
    Toast.toast('操作成功！');
  };
  
  return (
    <ArcoClient>
      <Button type="primary" onClick={handleClick}>点击</Button>
    </ArcoClient>
  );
}
```

#### React 19 适配说明

**重要**: React 19 修改了 `createRoot` 的引入路径，导致 ArcoDesign Mobile 的浮层组件（Toast、Dialog、Masking、Popup、ActionSheet）在方法调用时需要手动传入 `createRoot`。

项目已封装好适配工具，请使用以下方式：

#### Toast 和其他浮层组件使用

所有浮层组件统一从 `@/lib/arco` 导入：

```typescript
import { Toast, Dialog, Masking, Popup, ActionSheet } from '@/lib/arco';

// Toast 提示
Toast.toast('这是一条消息');
Toast.info('提示信息');
Toast.success('操作成功！');
Toast.error('操作失败！');
Toast.warn('警告信息');

// 加载提示
const { close } = Toast.loading('加载中...');
// 完成后关闭
close();
```

#### Dialog 对话框

```typescript
import { Dialog } from '@/lib/arco';

// Dialog 警告框
Dialog.alert({
  title: '提示',
  content: '这是一条提示信息',
});

// Dialog 确认框
Dialog.confirm({
  title: '确认',
  content: '确定要执行此操作吗？',
  onConfirm: () => {
    console.log('已确认');
  },
});

// Masking 图片预览
Masking.open({
  children: <img src="image.png" />,
});

// Popup 弹出层
Popup.open({
  children: <div>弹出内容</div>,
});

// ActionSheet 动作面板
ActionSheet.open({
  items: [
    { label: '选项1', value: '1' },
    { label: '选项2', value: '2' },
  ],
});
```

#### ArcoClient 选项

可以为 ArcoClient 提供 fallback 内容，在客户端渲染前显示：

```typescript
<ArcoClient fallback={<div>加载中...</div>}>
  <Button type="primary">点击我</Button>
</ArcoClient>
```

## 开发规范

### 1. 命名规范

- **组件文件**: PascalCase (例：`QuestionCard.tsx`)
- **工具文件**: camelCase (例：`formatTime.ts`)
- **常量**: UPPER_SNAKE_CASE (例：`API_BASE_URL`)
- **类型/接口**: PascalCase (例：`Question`, `UserInfo`)

### 2. 文件组织

- 每个组件一个文件
- 相关的样式文件使用 CSS Modules (`.module.css`)
- 复杂组件可以创建文件夹，包含 index.tsx 和相关文件

### 3. TypeScript

- 严格模式开启
- 避免使用 `any`，使用 `unknown` 代替
- 为所有函数参数和返回值添加类型
- 使用接口定义对象结构

### 4. 代码风格

- 使用 ESLint 和 Prettier
- 2 空格缩进
- 使用分号
- 单引号用于字符串（JSX 除外）

## API 集成

### 定义 API 查询

在 `src/lib/api/queries.ts` 中定义：

```typescript
export function useMyQuery(id: string) {
  return useQuery({
    queryKey: ['my-resource', id],
    queryFn: () => api.get(`/my-resource/${id}`),
    enabled: !!id,
  });
}
```

### 定义 API 变更

```typescript
export function useCreateResource() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data) => api.post('/resources', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
```

## 环境配置

### 开发环境

在 `.env.local` 中配置开发环境变量：

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
NEXT_PUBLIC_TIHAI_API_BASE=https://znbiakwnyaoe.sealosbja.site/api
NEXT_PUBLIC_MQTT_URL=ws://localhost:1883
NEXT_PUBLIC_DEBUG=true
```

### 生产环境

在部署平台配置生产环境变量：

```env
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_TIHAI_API_BASE=https://tihai.example.com/api
NEXT_PUBLIC_MQTT_URL=wss://mqtt.example.com:8884/mqtt
```

## 调试

### React Query DevTools

开发模式下自动启用，可在页面底部看到浮动按钮。

### Redux DevTools

Zustand 集成了 Redux DevTools，在浏览器扩展中可查看状态变化。

### MQTT 调试

查看浏览器控制台的 MQTT 连接日志。

## 性能优化

### 1. 代码分割

使用动态导入：

```typescript
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Loading />,
});
```

### 2. 图片优化

使用 Next.js Image 组件：

```typescript
import Image from 'next/image';

<Image src="/image.jpg" width={500} height={300} alt="描述" />
```

### 3. 数据预取

```typescript
const queryClient = useQueryClient();

// 预取数据
queryClient.prefetchQuery({
  queryKey: ['question', id],
  queryFn: () => api.get(`/questions/${id}`),
});
```

## 测试

（待添加测试配置）

## 部署

参考主 README.md 的部署章节。
