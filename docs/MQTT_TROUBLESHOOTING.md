# MQTT 故障排查

## 现象

常见症状：

- 等待页显示 MQTT 未连接
- 主持人发了 `cmd`，选手端无反应
- 终极挑战无法抢答或收不到结果广播

## 先确认配置

需要重点检查这些环境变量：

```env
NEXT_PUBLIC_MQTT_ENABLED=true
NEXT_PUBLIC_MQTT_URL=wss://your-broker.example.com:8084/mqtt
NEXT_PUBLIC_MQTT_USERNAME=your-username
NEXT_PUBLIC_MQTT_PASSWORD=your-password
NEXT_PUBLIC_MQTT_TOPIC_COMMAND=cmd
NEXT_PUBLIC_MQTT_TOPIC_CONTROL=quiz/control
NEXT_PUBLIC_MQTT_TOPIC_RESULT=quiz/result
NEXT_PUBLIC_MQTT_TOPIC_BUZZ_IN=quiz/buzz_in
NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX=state
```

如果本地只做 UI 开发，可直接设为：

```env
NEXT_PUBLIC_MQTT_ENABLED=false
```

## 当前客户端参数

`src/lib/mqtt/client.ts` 当前默认行为：

- 连接超时：30 秒
- 额外超时看门狗：35 秒
- 重连间隔：5 秒
- keepalive：60 秒
- 支持自动重连和重订阅

## 排查顺序

1. 确认 `NEXT_PUBLIC_MQTT_ENABLED` 不是 `false`
2. 确认 Broker 地址能从浏览器所在网络访问
3. 确认主题名和主持人端一致
4. 打开浏览器 Console，查看 `MQTT connection error`、`offline`、`reconnecting` 日志
5. 用独立 MQTT 客户端验证同一组账号密码是否可连

## 常见问题

### 连接超时

通常是以下原因：

- Broker 地址错误
- 端口未开放
- WebSocket 路径不对
- 账号密码错误
- 浏览器所在网络无法访问 Broker

### 能连接但收不到命令

重点检查：

- `cmd` / `quiz/control` / `quiz/result` 是否发到了同一个 broker
- 主题前后是否带了多余 `/`
- 主持人端 payload 是否符合当前赛制约定

### 本地测试不想依赖 MQTT

可以直接禁用 MQTT：

```env
NEXT_PUBLIC_MQTT_ENABLED=false
```

这样页面仍可打开，适合纯 UI 调整和非实时逻辑开发。
