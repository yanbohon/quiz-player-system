# Flexible 自适应适配示例

本文档展示如何将现有的 px 样式转换为 rem 自适应样式。

## 转换规则

**基准**: `@base-font-size: 50px`，即 `1rem = 50px`（在 375px 宽度屏幕上）

转换公式：`rem值 = px值 / 50`

## 实际案例：登录页面

### 转换前（使用 px）

```css
/* page.module.css - 原始版本 */
.formCard {
  width: 100%;
  max-width: 520px;
  background: #ffffff;
  border-radius: 18px;
  padding: 28px 24px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
}

.label {
  font-size: 15px;
  color: #374151;
  font-weight: 600;
}

.hint {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
}
```

### 转换后（使用 rem）

```css
/* page.module.css - rem 版本 */
.formCard {
  width: 100%;
  max-width: 10.4rem;      /* 520px / 50 = 10.4rem */
  background: #ffffff;
  border-radius: 0.36rem;   /* 18px / 50 = 0.36rem */
  padding: 0.56rem 0.48rem; /* 28px / 50 = 0.56rem, 24px / 50 = 0.48rem */
  box-shadow: 0 0.4rem 0.8rem rgba(15, 23, 42, 0.12); /* 20px / 50, 40px / 50 */
}

.label {
  font-size: 0.3rem;  /* 15px / 50 = 0.3rem */
  color: #374151;
  font-weight: 600;
}

.hint {
  margin-top: 0.08rem;  /* 4px / 50 = 0.08rem */
  font-size: 0.24rem;   /* 12px / 50 = 0.24rem */
  color: #9ca3af;
}
```

## 常用尺寸转换表

### 间距（Spacing）

| 设计稿 px | rem 值 | 用途 |
|----------|--------|------|
| 4px | 0.08rem | 极小间距 |
| 8px | 0.16rem | 小间距 |
| 12px | 0.24rem | 中小间距 |
| 16px | 0.32rem | 标准间距 |
| 20px | 0.4rem | 中等间距 |
| 24px | 0.48rem | 大间距 |
| 28px | 0.56rem | 较大间距 |
| 32px | 0.64rem | 超大间距 |
| 40px | 0.8rem | 特大间距 |

### 字体大小（Font Size）

| 设计稿 px | rem 值 | 用途 |
|----------|--------|------|
| 12px | 0.24rem | 提示文字、辅助信息 |
| 14px | 0.28rem | 正文、说明文字 |
| 15px | 0.3rem | 表单标签 |
| 16px | 0.32rem | 正文、按钮文字 |
| 18px | 0.36rem | 小标题 |
| 20px | 0.4rem | 中标题 |
| 24px | 0.48rem | 大标题 |
| 28px | 0.56rem | 主标题 |
| 32px | 0.64rem | 超大标题 |

### 圆角（Border Radius）

| 设计稿 px | rem 值 | 用途 |
|----------|--------|------|
| 4px | 0.08rem | 小圆角 |
| 8px | 0.16rem | 标准圆角 |
| 12px | 0.24rem | 中等圆角 |
| 16px | 0.32rem | 大圆角 |
| 18px | 0.36rem | 卡片圆角 |
| 20px | 0.4rem | 较大圆角 |

### 宽度/高度（Width/Height）

| 设计稿 px | rem 值 | 用途 |
|----------|--------|------|
| 44px | 0.88rem | 按钮最小高度（Apple HIG） |
| 48px | 0.96rem | 输入框高度 |
| 60px | 1.2rem | 导航栏高度 |
| 80px | 1.6rem | 标题区域 |
| 100px | 2rem | 图标区域 |
| 375px | 7.5rem | 全屏宽度 |

## 完整示例：答题卡片

### 设计稿标注（px）

```
卡片：
- 宽度: 375px (全屏)
- 内边距: 16px
- 圆角: 12px
- 阴影: 0 4px 12px

题目文字:
- 字号: 18px
- 行高: 28px
- 底部间距: 16px

选项按钮:
- 高度: 48px
- 圆角: 8px
- 间距: 12px
- 字号: 16px
```

### CSS 实现（rem）

```css
/* QuestionCard.module.css */

.card {
  width: 100%;              /* 响应式宽度 */
  max-width: 7.5rem;        /* 375px */
  padding: 0.32rem;         /* 16px */
  border-radius: 0.24rem;   /* 12px */
  box-shadow: 0 0.08rem 0.24rem rgba(0, 0, 0, 0.1); /* 0 4px 12px */
  background: #fff;
}

.question {
  font-size: 0.36rem;       /* 18px */
  line-height: 0.56rem;     /* 28px */
  margin-bottom: 0.32rem;   /* 16px */
  color: #1f2937;
  font-weight: 600;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.24rem;             /* 12px */
}

.optionButton {
  height: 0.96rem;          /* 48px */
  border-radius: 0.16rem;   /* 8px */
  font-size: 0.32rem;       /* 16px */
  border: 0.02rem solid #e5e7eb; /* 1px */
  background: #f9fafb;
  transition: all 0.3s;
}

.optionButton:hover {
  background: #f3f4f6;
  border-color: #3b82f6;
}

.optionButton.selected {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1e40af;
}
```

### React 组件

```tsx
// QuestionCard.tsx
'use client';

import styles from './QuestionCard.module.css';
import { ArcoClient } from '@/components/ArcoClient';
import { Button } from '@arco-design/mobile-react';

interface QuestionCardProps {
  question: string;
  options: string[];
  onSelect: (index: number) => void;
  selected?: number;
}

export function QuestionCard({ 
  question, 
  options, 
  onSelect, 
  selected 
}: QuestionCardProps) {
  return (
    <div className={styles.card}>
      <h3 className={styles.question}>{question}</h3>
      <div className={styles.options}>
        {options.map((option, index) => (
          <ArcoClient key={index}>
            <Button
              className={`${styles.optionButton} ${
                selected === index ? styles.selected : ''
              }`}
              onClick={() => onSelect(index)}
            >
              {String.fromCharCode(65 + index)}. {option}
            </Button>
          </ArcoClient>
        ))}
      </div>
    </div>
  );
}
```

## 快速转换技巧

### 1. VS Code 批量替换

使用正则表达式批量转换：

**查找**：`(\d+)px`  
**替换**：计算后的 rem 值

### 2. CSS 变量（推荐）

定义常用的 rem 值：

```css
/* globals.css */
:root {
  /* 间距 */
  --spacing-xs: 0.08rem;   /* 4px */
  --spacing-sm: 0.16rem;   /* 8px */
  --spacing-md: 0.24rem;   /* 12px */
  --spacing-lg: 0.32rem;   /* 16px */
  --spacing-xl: 0.48rem;   /* 24px */
  
  /* 字体 */
  --text-xs: 0.24rem;      /* 12px */
  --text-sm: 0.28rem;      /* 14px */
  --text-base: 0.32rem;    /* 16px */
  --text-lg: 0.36rem;      /* 18px */
  --text-xl: 0.48rem;      /* 24px */
  
  /* 圆角 */
  --radius-sm: 0.08rem;    /* 4px */
  --radius-md: 0.16rem;    /* 8px */
  --radius-lg: 0.24rem;    /* 12px */
}

/* 使用 */
.card {
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
}
```

### 3. SCSS 函数（如果使用 SCSS）

```scss
@function px2rem($px) {
  @return ($px / 50) + rem;
}

.card {
  padding: px2rem(16);      // 自动转换为 0.32rem
  font-size: px2rem(14);    // 自动转换为 0.28rem
}
```

## 注意事项

1. **不要转换的情况**：
   - 1px 边框建议保持 `1px` 或使用 `0.02rem`
   - `line-height` 可以使用无单位数值（如 `1.5`）

2. **精度问题**：
   - 保留 2 位小数即可（如 `0.32rem`）
   - 特殊情况可以保留更多位（如 `0.28rem`）

3. **响应式设计**：
   - rem 会自动根据屏幕宽度缩放
   - 不需要使用 media query 来调整字体大小

4. **调试技巧**：
   ```javascript
   // 在浏览器控制台查看实际字体大小
   console.log(getComputedStyle(document.documentElement).fontSize);
   
   // 在 375px 屏幕上应该是 "50px"
   // 在 750px 屏幕上应该是 "64px" (受最大值限制)
   ```

## 性能优化

使用 rem 带来的好处：

1. **自动缩放**：无需编写复杂的响应式代码
2. **统一维护**：只需修改根字体大小即可调整整体比例
3. **更好的可访问性**：支持用户浏览器字体大小设置
4. **跨设备一致性**：在不同分辨率设备上保持相同的视觉比例

