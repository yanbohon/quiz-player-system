# Zustand 性能优化

## 问题描述

在使用 Zustand 时，如果选择器返回一个对象或数组，每次都会创建新的引用，导致组件不必要的重新渲染。

### 问题代码示例

```tsx
// ❌ 每次都创建新对象，导致不必要的重渲染
const { user, isAuthenticated, answers } = useAppStore((state) => ({
  user: state.user,
  isAuthenticated: state.isAuthenticated,
  answers: state.answers,
}));
```

## 解决方案

使用 Zustand 的 `useShallow` hook 进行浅比较，只有当对象的属性值真正改变时才触发重新渲染。

### 优化后的代码

```tsx
import { useShallow } from "zustand/react/shallow";

// ✅ 使用 useShallow 进行浅比较
const { user, isAuthenticated, answers } = useAppStore(
  useShallow((state) => ({
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    answers: state.answers,
  }))
);
```

## 优化效果

- **减少不必要的重渲染**：只有当选中的状态值真正改变时才会触发组件更新
- **提升性能**：避免了对象引用变化导致的渲染浪费
- **优化用户体验**：应用响应更快，交互更流畅

## 已优化的文件

本次优化已应用到以下文件：

1. ✅ `src/app/page.tsx` - 首页
2. ✅ `src/app/login/page.tsx` - 登录页
3. ✅ `src/app/quiz/page.tsx` - 答题页
4. ✅ `src/app/waiting/page.tsx` - 等待页

## 使用建议

### 何时使用 useShallow

当你的选择器返回以下内容时，建议使用 `useShallow`：

1. **对象**：`{ prop1: value1, prop2: value2 }`
2. **数组**：`[value1, value2, value3]`
3. **多个原始值的组合**：需要从 store 中选择多个值时

### 何时不需要 useShallow

以下情况不需要使用 `useShallow`：

```tsx
// 单个原始值 - 不需要 useShallow
const user = useAppStore(state => state.user);
const isAuthenticated = useAppStore(state => state.isAuthenticated);

// 单个函数 - 不需要 useShallow
const setUser = useAppStore(state => state.setUser);
```

## 技术细节

### useShallow 的工作原理

`useShallow` 使用浅比较算法：
- 比较对象的第一层属性
- 如果所有属性的引用都相同，则认为对象没有变化
- 只有当至少一个属性的引用发生变化时，才返回新对象并触发重渲染

### 性能对比

```tsx
// ❌ 没有使用 useShallow
// Store 任何部分更新 → 创建新对象 → 组件重渲染

// ✅ 使用 useShallow
// Store 任何部分更新 → 浅比较 → 只有选中的值变化时才重渲染
```

## 相关资源

- [Zustand 官方文档 - Preventing Rerenders](https://docs.pmnd.rs/zustand/guides/prevent-rerenders-with-use-shallow)
- [React 性能优化最佳实践](https://react.dev/learn/render-and-commit)

