# 📱 页面缩放适配方案

## 问题背景

在高分辨率设备（如 1200x2000）上测试时，页面显示过小的问题。

### 原因分析

1. **固定的 viewport 配置**：`initialScale: 1` 按设备物理像素 1:1 显示
2. **缺少响应式适配**：所有样式使用固定的 `px` 单位
3. **禁止用户缩放**：`userScalable: false` 限制了用户调整

## 解决方案

### 1. 动态字体大小方案

采用 **REM 自适应方案**，根据屏幕宽度动态调整根元素字体大小：

```javascript
// 核心算法
var designWidth = 375; // 设计稿宽度（iPhone 8 为基准）
var rootValue = 16;    // 基准字体大小
var clientWidth = document.documentElement.clientWidth;

// 限制范围：320px - 768px
clientWidth = Math.max(320, Math.min(clientWidth, 768));

// 动态计算字体大小
var scale = clientWidth / designWidth;
var fontSize = rootValue * scale;

document.documentElement.style.fontSize = fontSize + 'px';
```

### 2. 不同分辨率下的表现

| 设备宽度 | 根字体大小 | 缩放比例 |
|---------|-----------|---------|
| 320px   | 13.65px   | 0.85x   |
| 375px   | 16px      | 1x      |
| 414px   | 17.66px   | 1.10x   |
| 768px   | 32.77px   | 2.05x   |
| 1200px  | 51.2px    | 3.2x (限制在768px) |

对于 **1200x2000** 这样的高分辨率屏幕：
- 宽度会被限制在 768px 的缩放比例
- 根字体大小约为 32.77px
- 相比原来的 16px，**整体放大约 2 倍**

### 3. Viewport 调整

```typescript
viewport: {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,      // 允许放大到 5 倍
  minimumScale: 0.5,    // 允许缩小到 0.5 倍
  userScalable: true,   // 允许用户手动缩放
}
```

**优势**：
- ✅ 用户可以根据需要手动调整页面大小
- ✅ 适配不同视力需求的用户
- ✅ 提供更好的无障碍体验

## 实现细节

### layout.tsx

在 `<head>` 中注入脚本，在页面加载前执行：

```tsx
<head>
  <script dangerouslySetInnerHTML={{
    __html: `
      (function() {
        function setRootFontSize() {
          // ... 动态设置逻辑
        }
        
        setRootFontSize();
        window.addEventListener('resize', setRootFontSize);
        window.addEventListener('orientationchange', setRootFontSize);
      })();
    `
  }} />
</head>
```

### globals.css

```css
html {
  font-size: 16px; /* 默认值，JS 会动态覆盖 */
}
```

## 使用建议

### 当前实现（保持现有 px 单位）

现有代码使用固定 `px` 单位，但由于根字体大小会根据屏幕宽度缩放：
- 在小屏幕上，整体会略微缩小（最小 0.85x）
- 在大屏幕上，整体会放大（最大 2.05x）
- 这种方式**保证了视觉比例的一致性**

### 未来优化方向（可选）

如需更精细的控制，可以考虑将关键尺寸改为 `rem` 单位：

```css
/* 示例：将固定 px 转换为 rem */
.title {
  font-size: 2rem;    /* 32px ÷ 16 = 2rem */
}

.padding {
  padding: 2rem 1rem; /* 32px 16px */
}
```

**转换公式**：`rem值 = px值 ÷ 16`

## 测试验证

### 测试步骤

1. 在不同分辨率设备上测试
2. 检查元素大小是否合适
3. 验证用户缩放功能
4. 测试横竖屏切换

### 预期效果

- ✅ 1200x2000 分辨率下，页面元素放大约 2 倍
- ✅ 用户可以手动缩放（双指捏合）
- ✅ 横竖屏切换自动适配
- ✅ 保持视觉比例一致性

## 注意事项

1. **Arco Design Mobile 组件**：该库内部已有响应式处理，与我们的方案兼容
2. **性能影响**：resize 事件会频繁触发，但计算量很小，不影响性能
3. **浏览器兼容性**：主流浏览器均支持，包括 iOS Safari 和 Android Chrome

## 相关文件

- `/src/app/layout.tsx` - viewport 配置和动态字体大小脚本
- `/src/app/globals.css` - 全局样式基础配置

## 更新日志

- **2025-10-07**: 实现动态字体大小方案，解决高分辨率屏幕显示过小问题

