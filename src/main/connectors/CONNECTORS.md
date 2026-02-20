# Connecting External Programs to Tracking

The Tracking app runs a WebSocket server (default port `9876`) that broadcasts gesture events to connected programs. Any language that supports WebSocket can connect.

## Authentication

The bus server requires token authentication by default. When the server starts, it generates a random token that clients must include as a query parameter when connecting.

- **Connection URL format**: `ws://localhost:9876?token=TOKEN`
- The token is generated per server instance and can be retrieved in the main process via `busServer.getToken()`
- Connections without a valid token are immediately closed with code `1008 (Unauthorized)`
- To disable authentication (e.g. for local development), set `authenticate: false` in the `BusServerConfig`:
  ```typescript
  const server = new BusServer({ port: 9876, authenticate: false })
  ```

## Quick Start (Node.js)

```typescript
import { connect } from './sdk'

// Token is provided by the Tracking app (e.g. via IPC or env var)
const token = process.env.TRACKING_BUS_TOKEN

const conn = await connect('my-program', ['rotate', 'select'], {
  url: `ws://localhost:9876?token=${token}`
})

conn.onGesture((gesture) => {
  console.log(`${gesture.name} (${gesture.phase}) at [${gesture.position}]`)
})

conn.sendData({ action: 'hello', value: 42 })
```

## Quick Start (Python)

```python
import asyncio, json, os, websockets

async def main():
    token = os.environ.get("TRACKING_BUS_TOKEN", "")
    async with websockets.connect(f"ws://localhost:9876?token={token}") as ws:
        await ws.send(json.dumps({
            "type": "register",
            "program": "my-python-app",
            "capabilities": ["rotate", "select"]
        }))

        async for message in ws:
            msg = json.loads(message)
            if msg["type"] == "gesture":
                print(f"Gesture: {msg['name']} ({msg['phase']})")
            elif msg["type"] == "ping":
                await ws.send(json.dumps({"type": "pong", "timestamp": msg["timestamp"]}))

asyncio.run(main())
```

## Protocol

All messages are JSON objects with a `type` field.

### Registration (client → server)

```json
{
  "type": "register",
  "program": "my-app",
  "capabilities": ["rotate", "select", "zoom"]
}
```

Capabilities filter which gestures you receive:
- `"rotate"` → twist gestures
- `"select"`, `"click"` → pinch gestures
- `"zoom"`, `"scale"` → two-hand pinch
- `"pan"`, `"move"` → flat drag
- `"cursor"`, `"hover"` → point
- `"*"` → all gestures
- `[]` (empty) → all gestures

### Gesture Events (server → client)

```json
{
  "type": "gesture",
  "name": "pinch",
  "phase": "onset",
  "hand": "right",
  "position": [0.5, 0.3, 0.1],
  "confidence": 0.95,
  "data": { "distance": 0.02 }
}
```

Gesture names: `pinch`, `point`, `open_palm`, `twist`, `two_hand_pinch`, `flat_drag`, `fist`, `l_shape`

Phases: `onset`, `hold`, `release`

### Data Messages (bidirectional)

```json
{
  "type": "data",
  "program": "my-app",
  "payload": { "custom": "data" }
}
```

### Health Check

Respond to pings to stay connected:

```json
// Server sends:
{ "type": "ping", "timestamp": 1234567890 }

// Client responds:
{ "type": "pong", "timestamp": 1234567890 }
```

## Running the Example

```bash
# Start the Tracking app first, then:
npx tsx src/main/connectors/example.ts
```
