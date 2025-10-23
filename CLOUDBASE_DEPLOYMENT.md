# CloudBase 云托管部署说明

## ✅ 部署成功

您的答题系统选手端已成功部署到腾讯云 CloudBase 云托管！

### 📋 服务信息

- **服务名称**: `xinsai-player`
- **服务类型**: 容器型云托管
- **访问地址**: https://xinsai-player-192017-4-1379237404.sh.run.tcloudbase.com
- **环境ID**: `cloud1-8gzz6a4hc1833f5e`
- **初次部署**: 2025-10-21 20:37:03
- **最新更新**: 2025-10-21 20:40:29 (修复 Suspense 边界问题)

### 🔧 资源配置

| 配置项 | 值 |
|--------|-----|
| CPU | 1核 |
| 内存 | 2GB |
| 最小实例数 | 1 |
| 最大实例数 | 5 |
| 端口 | 3000 |
| 访问类型 | 公网访问 (PUBLIC) |

### ⚙️ 自动扩缩容

- **触发条件**: CPU 使用率达到 60%
- **扩容策略**: 自动扩展实例数（最多5个）

---

## 🔐 环境变量配置

服务已部署，但需要配置以下环境变量才能正常运行：

### 必需的环境变量

```bash
# API 配置
NEXT_PUBLIC_API_BASE_URL=https://your-api-server.com/api
NEXT_PUBLIC_TIHAI_API_BASE=https://znbiakwnyaoe.sealosbja.site/api

# MQTT 实时通信配置
NEXT_PUBLIC_MQTT_URL=wss://your-mqtt-broker:8884/mqtt
NEXT_PUBLIC_MQTT_USERNAME=your_username
NEXT_PUBLIC_MQTT_PASSWORD=your_password
NEXT_PUBLIC_MQTT_TOPIC_COMMAND=cmd
NEXT_PUBLIC_MQTT_TOPIC_CONTROL=quiz/control
NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX=state

# 可选配置
NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS=false
NEXT_PUBLIC_MQTT_ENABLED=true
```

### 如何配置环境变量

#### 方法1: 通过 CloudBase 控制台（推荐）

1. 访问 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 选择环境 `cloud1-8gzz6a4hc1833f5e`
3. 进入 **云托管** → **xinsai-player**
4. 点击 **版本配置** → **环境变量**
5. 添加上述环境变量
6. 保存后等待服务重启

#### 方法2: 使用命令行工具

```bash
# 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 更新环境变量
tcb run:config --envId cloud1-8gzz6a4hc1833f5e \
  --serverName xinsai-player \
  --envParams '{"NEXT_PUBLIC_API_BASE_URL":"https://your-api.com/api"}'
```

---

## 📊 服务监控

### 查看服务状态

- **控制台**: https://console.cloud.tencent.com/tcb/service
- **日志查看**: 云托管 → xinsai-player → 日志

### 常用命令

```bash
# 查看服务详情
tcb run:detail --envId cloud1-8gzz6a4hc1833f5e --serverName xinsai-player

# 查看实时日志
tcb run:logs --envId cloud1-8gzz6a4hc1833f5e --serverName xinsai-player --follow

# 查看服务版本
tcb run:versions --envId cloud1-8gzz6a4hc1833f5e --serverName xinsai-player
```

---

## 🚀 更新部署

### 方法1: 自动部署（推荐）

每次代码更新后，在项目根目录执行：

```bash
# 构建并部署
npm run build

# 使用 CloudBase CLI 部署
tcb run:deploy --envId cloud1-8gzz6a4hc1833f5e \
  --serverName xinsai-player \
  --localPath .
```

### 方法2: 使用 Dockerfile

```bash
# 本地构建镜像
docker build -t xinsai-player:latest .

# 测试镜像
docker run -p 3000:3000 xinsai-player:latest

# 推送并部署到云托管
# （需要先配置镜像仓库）
```

---

## 🔍 故障排查

### 服务无法访问

1. **检查服务状态**: 确认状态为 "normal"
2. **查看日志**: 
   ```bash
   tcb run:logs --envId cloud1-8gzz6a4hc1833f5e --serverName xinsai-player
   ```
3. **检查环境变量**: 确保所有必需的环境变量已配置

### MQTT 连接失败

1. 确认 MQTT broker 地址可访问
2. 检查用户名和密码是否正确
3. 验证端口是否开放（通常是 8883 或 8884）
4. 如不需要 MQTT，设置 `NEXT_PUBLIC_MQTT_ENABLED=false`

### 应用启动慢

- 考虑增加最小实例数到 2+，避免冷启动
- 优化 Dockerfile 构建缓存

---

## 📱 移动端访问优化

服务已配置：
- ✅ 公网 HTTPS 访问
- ✅ 自适应缩放（flexible.js）
- ✅ 支持移动端手势
- ✅ PWA 就绪

移动端可直接访问：https://xinsai-player-192017-4-1379237404.sh.run.tcloudbase.com

---

## 🔒 安全建议

1. **配置自定义域名**（可选）:
   - 提升品牌形象
   - 启用 SSL 证书
   
2. **访问控制**:
   - 如需限制访问，配置 IP 白名单或认证中间件

3. **环境变量安全**:
   - 敏感信息（密码、密钥）务必通过环境变量配置
   - 不要将密钥硬编码到代码中

---

## 📚 相关文档

- [CloudBase 云托管文档](https://cloud.tencent.com/document/product/876/45154)
- [Next.js 部署指南](https://nextjs.org/docs/deployment)
- [项目 README](./README.md)
- [开发文档](./docs/DEVELOPMENT.md)

---

## 🎯 下一步

1. ✅ ~~部署服务~~ (已完成)
2. ⏳ **配置环境变量**（重要！）
3. ⏳ 测试应用功能
4. ⏳ 配置自定义域名（可选）
5. ⏳ 设置监控告警

**需要帮助？** 查看 [CloudBase 控制台](https://console.cloud.tencent.com/tcb) 或联系技术支持。

