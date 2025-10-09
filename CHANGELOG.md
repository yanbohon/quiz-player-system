# 更新日志

## [0.1.4] - 2025-10-07

### 修复
- 🔧 **MQTT 连接优化**: 修复 "connack timeout" 错误并改进错误处理
  - 增加连接超时时间从 4 秒到 30 秒
  - 添加自动重连机制（最多 5 次重试，每次间隔 5 秒）
  - 改进错误处理，MQTT 连接失败时应用继续正常运行
  - 支持通过环境变量禁用 MQTT 连接
  - 添加详细的连接状态日志和警告提示
  - 新增 `docs/MQTT_TROUBLESHOOTING.md` 故障排除文档
  - 更新 README 添加常见问题解决方案

### 新增
- 🔌 **MQTT 配置选项**: 
  - `NEXT_PUBLIC_MQTT_ENABLED` - 启用/禁用 MQTT（默认启用）
  - `NEXT_PUBLIC_MQTT_URL` - 自定义 MQTT 服务器地址
  - 支持应用在无 MQTT 服务器环境下运行

## [0.1.3] - 2025-10-07

### 重构
- 📱 **自适应方案升级**: 采用官方 flexible.js rem 自适应适配方案
  - 替换自定义 viewport 缩放方案为 Arco Design Mobile 官方 `setRootPixel`
  - 基准字体大小: 50px (`@base-font-size: 50px`)
  - UI稿宽度: 375px
  - 自动响应屏幕旋转和窗口大小变化
  - 新增 `src/lib/flexible.tsx` 封装 flexible 逻辑
  - 新增 `docs/FLEXIBLE.md` 配置说明文档
  - 新增 `docs/FLEXIBLE_EXAMPLE.md` px 转 rem 完整示例和转换指南
  - 更新全局样式，移除硬编码 font-size

## [0.1.2] - 2025-10-07

### 优化
- 📱 **页面缩放适配**: 实现动态字体大小方案，解决高分辨率屏幕显示过小问题
  - 添加基于屏幕宽度的自适应缩放算法
  - 在 1200x2000 等高分辨率设备上，页面元素放大约 2 倍
  - 开启用户手动缩放功能（双指捏合）
  - 支持横竖屏切换自动适配
  - 详见 `docs/VIEWPORT_SCALING.md`

## [0.1.1] - 2025-10-07

### 优化
- 🚀 **性能优化**: 使用 `useShallow` 优化 Zustand 选择器，避免不必要的重渲染
  - 优化了 4 个页面组件的状态选择器
  - 使用浅比较缓存选择结果，提升应用性能
  - 详见 `docs/ZUSTAND_OPTIMIZATION.md`

## [0.1.0] - 2025-10-07

### 新增
- 初始化项目结构
- 集成 Next.js 15.5.4
- 集成 Arco Design Mobile (React) 2.38.1
- 集成 TanStack Query 数据管理
- 集成 MQTT.js 实时通信
- 集成 Zustand 状态管理
- 创建基础组件和工具函数
- 配置 TypeScript 和 ESLint

