# Flexible 自适应方案迁移指南

本文档记录了从自定义 viewport 缩放方案迁移到 Arco Design Mobile 官方 flexible.js 方案的过程。

## 迁移概述

### 变更前
- 使用自定义内联脚本设置根字体大小
- 基准值：16px
- 计算方式：`(屏幕宽度 / 375) * 16`
- 实现位置：`layout.tsx` 中的 `<script>` 标签

### 变更后
- 使用 Arco Design Mobile 官方 `setRootPixel` 函数
- 基准值：50px (`@base-font-size: 50px`)
- 计算方式：`(屏幕宽度 / 375) * 50`，最大 64px
- 实现位置：`src/lib/flexible.tsx` 客户端组件

## 实施步骤

### 1. 创建 Flexible 封装组件

**文件**: `src/lib/flexible.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import setRootPixel from '@arco-design/mobile-react/tools/flexible';

export function FlexibleLayout() {
  useEffect(() => {
    const removeRootPixel = setRootPixel();
    return () => {
      if (removeRootPixel) {
        removeRootPixel();
      }
    };
  }, []);

  return null;
}
```

**要点**:
- 必须是客户端组件（`'use client'`）
- 使用 `useEffect` 在组件挂载时调用 `setRootPixel`
- 返回清理函数，组件卸载时移除监听器

### 2. 更新根布局

**文件**: `src/app/layout.tsx`

**变更**:
```diff
import type { Metadata } from "next";
import { Providers } from "@/app/providers";
+ import { FlexibleLayout } from "@/lib/flexible";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
-     <head>
-       <script dangerouslySetInnerHTML={{...}} />
-     </head>
      <body>
+       <FlexibleLayout />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**要点**:
- 移除自定义的内联脚本
- 在 `<body>` 顶部添加 `<FlexibleLayout />`
- 保留其他配置不变

### 3. 更新全局样式

**文件**: `src/app/globals.css`

**变更**:
```diff
html {
  /* 
-  * 基准字体大小（默认值/后备值）
-  * 实际值由 layout.tsx 中的内联脚本动态设置为：(屏幕宽度 / 375) * 16px
-  * 例如：375px 屏幕 = 16px, 768px 屏幕 ≈ 32.77px
+  * 基准字体大小由 @arco-design/mobile-react/tools/flexible 动态设置
+  * @base-font-size: 50px (1rem = 50px)
+  * UI稿宽度: 375px
+  * 计算规则: fontSize = (屏幕宽度 / 375) * 50
+  * 例如：375px 屏幕 = 50px, 750px 屏幕 = 100px
+  * 最大限制: 64px
   */
-  font-size: 160px;
  max-width: 100vw;
  overflow-x: hidden;
}
```

**要点**:
- 移除硬编码的 `font-size: 160px`（这个值明显不对）
- 添加详细的注释说明 flexible 工作原理
- 保留其他样式不变

## 技术对比

### 自定义方案 vs 官方方案

| 特性 | 自定义方案 | 官方 Flexible |
|-----|----------|--------------|
| 基准字体 | 16px | 50px |
| 最大限制 | 无 | 64px |
| 实现方式 | 内联脚本 | React Hook |
| 清理机制 | 手动管理 | 自动清理 |
| 维护性 | 需要自己维护 | 官方维护 |
| 兼容性 | 需要自己测试 | 官方保证 |
| TypeScript | 无类型 | 完整类型 |

### rem 计算对比

**自定义方案**（基准 16px）:
- 1rem = 16px (375px 屏幕)
- 1rem = 32.77px (768px 屏幕)

**官方方案**（基准 50px）:
- 1rem = 50px (375px 屏幕)
- 1rem = 64px (768px 屏幕，受最大值限制)

## 验证步骤

### 1. 开发环境验证

```bash
# 启动开发服务器
npm run dev
```

### 2. 浏览器控制台验证

```javascript
// 检查 flexible.js 是否正常工作
console.log(getComputedStyle(document.documentElement).fontSize);

// 在 375px 宽度屏幕上应该输出: "50px"
// 在 750px 宽度屏幕上应该输出: "64px" (最大值限制)
```

### 3. 响应式测试

1. 打开 Chrome DevTools (F12)
2. 切换到设备模拟模式 (Ctrl+Shift+M / Cmd+Shift+M)
3. 测试不同设备:
   - iPhone SE (375px): 50px
   - iPhone 12 Pro (390px): 52px
   - iPad (768px): 64px (最大值)
4. 测试屏幕旋转
5. 测试窗口大小调整

### 4. 功能测试

- ✅ 页面正常加载
- ✅ 样式正常渲染
- ✅ 屏幕旋转时自动适配
- ✅ 窗口大小变化时自动适配
- ✅ 无控制台错误
- ✅ 无内存泄漏（使用 React DevTools 检查）

## 后续工作

### 1. 样式迁移（可选）

如果需要充分利用 rem 自适应，可以将现有的 px 样式转换为 rem：

```css
/* 转换前 */
.button {
  width: 100px;
  height: 44px;
  font-size: 16px;
}

/* 转换后（50px 基准）*/
.button {
  width: 2rem;      /* 100 / 50 */
  height: 0.88rem;  /* 44 / 50 */
  font-size: 0.32rem; /* 16 / 50 */
}
```

详见 [FLEXIBLE_EXAMPLE.md](./FLEXIBLE_EXAMPLE.md) 了解完整的转换指南。

### 2. 自定义配置（如需要）

如果设计稿不是 375px 或需要不同的基准值：

```tsx
// src/lib/flexible.tsx
export function FlexibleLayout() {
  useEffect(() => {
    // baseFontSize, sketchWidth, maxFontSize
    const removeRootPixel = setRootPixel(37.5, 750, 100);
    return () => {
      if (removeRootPixel) {
        removeRootPixel();
      }
    };
  }, []);

  return null;
}
```

## 常见问题

### Q1: 为什么选择 50px 作为基准？

**A**: 这是 Arco Design Mobile 的默认配置，便于计算：
- 50px → 1rem
- 100px → 2rem
- 25px → 0.5rem

### Q2: 为什么有最大值限制（64px）？

**A**: 防止在超大屏幕（如 iPad）上字体过大，影响阅读体验。

### Q3: 旧的 px 样式还能用吗？

**A**: 可以，但不会自动缩放。建议逐步迁移到 rem。

### Q4: 如何调试 rem 值？

**A**: 
```javascript
// 查看当前基准字体大小
console.log(getComputedStyle(document.documentElement).fontSize);

// 计算 rem 转 px
const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
console.log(`1rem = ${baseFontSize}px`);
```

### Q5: flexible.js 和 viewport 缩放冲突吗？

**A**: 不冲突。flexible.js 设置 `html` 的 `font-size`，viewport 控制整体缩放。但建议只使用一种方案。

## 回滚方案

如果需要回滚到自定义方案：

### 1. 恢复 layout.tsx

```tsx
export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              function setRootFontSize() {
                var clientWidth = document.documentElement.clientWidth || window.innerWidth;
                clientWidth = Math.max(320, Math.min(clientWidth, 768));
                var fontSize = (clientWidth / 375) * 16;
                document.documentElement.style.fontSize = fontSize + 'px';
              }
              setRootFontSize();
              window.addEventListener('resize', setRootFontSize);
              window.addEventListener('orientationchange', setRootFontSize);
            })();
          `,
        }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 2. 删除 flexible.tsx

```bash
rm src/lib/flexible.tsx
```

### 3. 恢复 globals.css

```css
html {
  font-size: 16px;
  /* ... */
}
```

## 相关文档

- [FLEXIBLE.md](./FLEXIBLE.md) - Flexible 配置说明
- [FLEXIBLE_EXAMPLE.md](./FLEXIBLE_EXAMPLE.md) - px 转 rem 示例和转换指南
- [Arco Design Mobile - flexible.js](https://arco.design/mobile/react/guide/advanced) - 官方文档

## 更新记录

- 2025-10-07: 初始迁移完成
- 版本: 0.1.3

