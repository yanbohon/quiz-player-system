# MQTT Connection Troubleshooting

## Overview

This application uses MQTT for real-time command communication. If you encounter MQTT connection errors, the app will continue to function but without real-time updates.

## Common Errors

### "connack timeout"

This error occurs when the MQTT client cannot establish a connection to the WebSocket server within the timeout period.

**Possible causes:**
- The MQTT server is unreachable
- Network connectivity issues
- Firewall blocking WebSocket connections
- Incorrect server URL or credentials

## Solutions

### 1. Increase Connection Timeout (Already Implemented)

The connection timeout has been increased from 4 seconds to 30 seconds to allow more time for establishing connections.

### 2. Disable MQTT (If Server is Unavailable)

If the MQTT server is not available and you want to run the app without MQTT features, you can disable it:

Create a `.env.local` file in the project root with:

```env
NEXT_PUBLIC_MQTT_ENABLED=false
```

This will disable all MQTT connection attempts and the app will work without real-time command updates.

### 3. Configure Custom MQTT Server

If you want to use a different MQTT server, create a `.env.local` file with:

```env
NEXT_PUBLIC_MQTT_ENABLED=true
NEXT_PUBLIC_MQTT_URL=wss://your-mqtt-server.com:8084/mqtt
NEXT_PUBLIC_MQTT_USERNAME=your-username
NEXT_PUBLIC_MQTT_PASSWORD=your-password
```

## Configuration Options

All MQTT configuration is handled through environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_MQTT_ENABLED` | `true` | Enable/disable MQTT connections |
| `NEXT_PUBLIC_MQTT_URL` | `wss://ws.ohvfx.com:8084/mqtt` | WebSocket server URL |
| `NEXT_PUBLIC_MQTT_USERNAME` | `xdx` | MQTT username |
| `NEXT_PUBLIC_MQTT_PASSWORD` | `xdx12138` | MQTT password |
| `NEXT_PUBLIC_MQTT_TOPIC_COMMAND` | `cmd` | Host command broadcast topic |
| `NEXT_PUBLIC_MQTT_TOPIC_CONTROL` | `quiz/control` | Ultimate challenge control topic |
| `NEXT_PUBLIC_MQTT_TOPIC_STATE_PREFIX` | `state` | Presence topic prefix (`<prefix>/<clientId>`) |

## Implementation Details

### Error Handling

- MQTT connection errors are caught and logged but don't crash the app
- The app continues to function without real-time features if MQTT fails
- Automatic reconnection attempts (up to 5 times) with 5-second intervals
- Clear console warnings when MQTT is unavailable

### Timeouts

- **Connection timeout**: 30 seconds
- **Reconnect period**: 5 seconds between attempts
- **Keepalive**: 60 seconds
- **Total connection timeout**: 35 seconds (for safety)

### Graceful Degradation

When MQTT connection fails:
1. An error is logged to the console
2. The app continues to load and function normally
3. Real-time command features are disabled
4. Manual refresh or API polling can be used instead

## Testing MQTT Connection

To test if your MQTT server is reachable, you can use an MQTT client tool like:

- MQTT.fx
- MQTT Explorer
- mosquitto_sub/pub (command line)

Example test with mosquitto_sub:
```bash
mosquitto_sub -h ws.ohvfx.com -p 8084 -t "cmd" -u xdx -P xdx12138
```

## Development Recommendations

1. **For local development without MQTT**: Set `NEXT_PUBLIC_MQTT_ENABLED=false`
2. **For testing MQTT features**: Ensure the server is reachable and credentials are correct
3. **For production**: Verify server availability before deployment

## Need Help?

If you continue to experience MQTT connection issues:

1. Check your network connectivity
2. Verify the MQTT server is running and accessible
3. Check firewall settings
4. Review browser console for detailed error messages
5. Try disabling MQTT to confirm the app works otherwise
