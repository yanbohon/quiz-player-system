'use client';

import { useEffect } from 'react';
import setRootPixel from '@arco-design/mobile-react/tools/flexible';

/**
 * 官方自适应方案组件
 * 使用 Arco Design Mobile 提供的 flexible.js
 * @base-font-size: 50px (默认值)
 * UI稿宽度: 375px (默认值)
 * 最大fontSize限制: 64px (默认值)
 */
export function FlexibleLayout() {
  useEffect(() => {
    // 调用官方的 setRootPixel 函数
    // 参数：baseFontSize(默认50), sketchWidth(默认375), maxFontSize(默认64)
    const removeRootPixel = setRootPixel();

    // 组件卸载时清理
    return () => {
      if (removeRootPixel) {
        removeRootPixel();
      }
    };
  }, []);

  return null;
}

