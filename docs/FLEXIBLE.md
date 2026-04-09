# 自适应适配方案

本项目使用 Arco Design Mobile 官方提供的 `flexible.js` 进行 rem 自适应适配。

> 📚 **相关文档**：历史转换示例见 [archive/FLEXIBLE_EXAMPLE.md](./archive/FLEXIBLE_EXAMPLE.md)

## 配置说明

### 当前配置（默认值）

```javascript
// src/lib/flexible.tsx
setRootPixel(); // 使用默认参数

// 默认参数：
// - baseFontSize: 50 (即 @base-font-size: 50px)
// - sketchWidth: 375 (UI稿宽度)
// - maxFontSize: 64 (最大字号限制)
```

### rem 计算规则

- **1rem = 50px**（在 375px 宽度的屏幕上）
- 计算公式：`fontSize = (屏幕宽度 / 375) * 50`
- 示例：
  - 375px 屏幕：html font-size = 50px，1rem = 50px
  - 750px 屏幕：html font-size = 100px，1rem = 100px（但会被限制为 64px）
  - 320px 屏幕：html font-size ≈ 42.67px

### 如何自定义参数

如果需要修改基准字体大小，可以在 `src/lib/flexible.tsx` 中传入参数：

```tsx
// src/lib/flexible.tsx
export function FlexibleLayout() {
  useEffect(() => {
    // 自定义基准字体大小为 37.5px
    const removeRootPixel = setRootPixel(37.5);
    
    return () => {
      if (removeRootPixel) {
        removeRootPixel();
      }
    };
  }, []);

  return null;
}
```

完整参数示例：

```tsx
/**
 * @param baseFontSize 1rem基准fontSize，默认 50
 * @param sketchWidth UI稿宽度，默认 375
 * @param maxFontSize 最大fontSize限制，默认 64
 * @return {Function} removeRootPixel 取消baseFontSize设置并移除resize监听
 */
setRootPixel(37.5, 375, 64);
```

## 样式编写规范

### 使用 rem 单位

所有尺寸都应该使用 rem 单位：

```css
/* 以 50px 为基准，想要 100px 的宽度 */
.container {
  width: 2rem; /* 2 * 50px = 100px */
  padding: 0.32rem; /* 0.32 * 50px = 16px */
  font-size: 0.28rem; /* 0.28 * 50px = 14px */
}
```

### 换算关系（@base-font-size: 50px）

| 设计稿尺寸 | rem 值 | 计算方式 |
|----------|--------|---------|
| 10px | 0.2rem | 10 / 50 |
| 14px | 0.28rem | 14 / 50 |
| 16px | 0.32rem | 16 / 50 |
| 20px | 0.4rem | 20 / 50 |
| 24px | 0.48rem | 24 / 50 |
| 32px | 0.64rem | 32 / 50 |
| 50px | 1rem | 50 / 50 |
| 100px | 2rem | 100 / 50 |

### CSS Modules 示例

```css
/* page.module.css */
.container {
  width: 7.5rem; /* 375px */
  padding: 0.32rem; /* 16px */
}

.title {
  font-size: 0.48rem; /* 24px */
  margin-bottom: 0.32rem; /* 16px */
}

.button {
  width: 2.5rem; /* 125px */
  height: 0.88rem; /* 44px */
  border-radius: 0.08rem; /* 4px */
}
```

## 注意事项

1. **不要混用单位**：尽量统一使用 rem，避免 px、em 混用
2. **字体大小**：移动端建议最小字体为 0.24rem (12px)
3. **边框**：1px 边框可以使用 `0.02rem` 或保持 `1px`（hairline）
4. **响应式断点**：flexible.js 会自动处理不同屏幕尺寸
5. **最大宽度限制**：默认最大 fontSize 为 64px，防止在超大屏幕上字体过大

## 调试

在浏览器控制台运行：

```javascript
// 查看当前 html 的 font-size
console.log(getComputedStyle(document.documentElement).fontSize);

// 查看当前屏幕宽度
console.log(window.innerWidth);
```

## 兼容性

- 支持现代浏览器
- 支持 iOS Safari
- 支持 Android Chrome
- 自动响应屏幕旋转（orientationchange）
- 自动响应窗口大小变化（resize）
