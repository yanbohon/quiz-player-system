# React 19 适配指南

本项目使用 React 19 和 ArcoDesign Mobile React，需要特殊的适配处理。

## 问题背景

React 19 修改了 `createRoot` 的引入路径，从 `react-dom` 改为 `react-dom/client`。这导致 ArcoDesign Mobile 的浮层组件在使用命令式 API 时无法找到 `createRoot` 方法。

### 受影响的组件

以下组件通过方法调用时会报错：
- Toast
- Dialog
- Masking
- Popup
- ActionSheet

## 官方解决方案

ArcoDesign Mobile 官方提供了解决方案：在调用浮层组件方法时，手动传入 `createRoot`。

```typescript
import { createRoot } from 'react-dom/client';
import { Toast } from '@arco-design/mobile-react';

Toast.toast('提示信息', { createRoot });
```

## 项目适配方案

为了简化使用，项目已将所有浮层组件的适配工具统一封装在 `@/lib/arco` 中，开发时直接导入即可。

### 统一导入方式

**位置**: `src/lib/arco/index.ts`

所有浮层组件（Toast、Dialog、Masking、Popup、ActionSheet）都从 `@/lib/arco` 统一导入：

```typescript
// ✅ 正确 - 统一从 @/lib/arco 导入
import { Toast, Dialog, Masking, Popup, ActionSheet } from '@/lib/arco';

// ❌ 错误 - 不要直接导入
// import { Toast, Dialog } from '@arco-design/mobile-react';
```

### 1. Toast 使用

```typescript
import { Toast } from '@/lib/arco';

Toast.toast('普通提示');
Toast.info('信息提示');
Toast.success('成功提示');
Toast.error('错误提示');
Toast.warn('警告提示');

// 加载提示
const { close } = Toast.loading('加载中...');
// 完成后关闭
close();
```

### 2. Dialog 使用

```typescript
import { Dialog } from '@/lib/arco';

// 警告框
Dialog.alert({
  title: '提示',
  content: '这是一条提示信息',
});

// 确认框
Dialog.confirm({
  title: '确认',
  content: '确定要删除吗？',
  onConfirm: () => {
    console.log('已确认');
  },
  onCancel: () => {
    console.log('已取消');
  },
});

// 自定义对话框
Dialog.open({
  title: '自定义对话框',
  children: <div>自定义内容</div>,
});
```

### 3. 其他浮层组件

```typescript
import { Masking, Popup, ActionSheet } from '@/lib/arco';

// Masking - 图片预览
Masking.open({
  children: <img src="image.png" alt="预览" />,
});

// Popup - 弹出层
Popup.open({
  position: 'bottom',
  children: <div>弹出内容</div>,
});

// ActionSheet - 动作面板
ActionSheet.open({
  items: [
    { label: '拍照', value: 'camera' },
    { label: '从相册选择', value: 'album' },
  ],
  onItemClick: (item) => {
    console.log('选择了:', item.label);
  },
});
```

## 水合不匹配 (Hydration Mismatch) 问题

ArcoDesign Mobile 会在客户端检测平台（iOS/Android），导致服务端渲染的 HTML 与客户端渲染的 HTML 不一致。

### 解决方案：使用 ArcoClient 包裹器

**位置**: `src/components/ArcoClient.tsx`

```typescript
import { Button, Input } from '@arco-design/mobile-react';
import { ArcoClient } from '@/components/ArcoClient';

function MyComponent() {
  return (
    <ArcoClient>
      <Button type="primary">按钮</Button>
      <Input placeholder="请输入" />
    </ArcoClient>
  );
}
```

### 带 Fallback 的用法

```typescript
<ArcoClient fallback={<div>加载中...</div>}>
  <Button type="primary">按钮</Button>
</ArcoClient>
```

## 完整示例

```typescript
'use client';

import { useState } from 'react';
import { Button, Input } from '@arco-design/mobile-react';
import { ArcoClient } from '@/components/ArcoClient';
import { Toast, Dialog } from '@/lib/arco';

export default function ExamplePage() {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    if (!value) {
      Toast.error('请输入内容');
      return;
    }

    Dialog.confirm({
      title: '确认提交',
      content: `确定要提交"${value}"吗？`,
      onConfirm: () => {
        // 提交逻辑
        Toast.success('提交成功！');
      },
    });
  };

  return (
    <ArcoClient>
      <Input 
        value={value}
        onChange={setValue}
        placeholder="请输入内容"
      />
      <Button type="primary" onClick={handleSubmit}>
        提交
      </Button>
    </ArcoClient>
  );
}
```

## 注意事项

1. **必须使用封装工具**: 所有浮层组件（Toast、Dialog 等）都必须使用 `@/lib/toast` 或 `@/lib/arco` 导出的版本
2. **必须使用 ArcoClient**: 所有 ArcoDesign 组件都必须包裹在 `<ArcoClient>` 中
3. **SSR 安全**: 封装工具已处理 SSR 环境检查，无需额外处理
4. **关闭方法**: 所有浮层组件调用后返回的对象包含 `close()` 方法用于关闭

## 参考链接

- [ArcoDesign Mobile React 官方文档](https://arco.design/mobile/react)
- [React 19 升级指南](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [Next.js 与 React 19](https://nextjs.org/docs/app/building-your-application/upgrading/version-15)

