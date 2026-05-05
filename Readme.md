# Remote Video Handler

A full-stack application for remote video control across multiple client devices. Designed for digital signage, video walls, synchronized multi-screen displays, and interactive installations.

## Architecture

```
remote-video-handler/
├── server/                    # Node.js backend
│   ├── src/
│   │   ├── server.js        # HTTPS server entry point
│   │   ├── app.js           # Express configuration
│   │   ├── api/            # REST API endpoints
│   │   ├── sockets/        # Socket.IO real-time handlers
│   │   ├── services/      # Business logic
│   │   └── bridge/        # OSC bridge for external control
│   └── static/
│       ├── videos/         # Video files directory
│       ├── client-webapp/ # Built client PWA
│       └── admin-frontend/
├── client-webapp/          # React client Progressive Web App
├── admin-frontend/        # React admin dashboard
└── cert/                   # SSL certificates
```

## Features

- **Real-time Control**: Send commands to all connected clients simultaneously via Socket.IO
- **OSC Protocol Support**: Integrate with external software (Resolume, TouchDesigner, etc.)
- **Progressive Web App**: Client webapp works offline and can be installed as a native app
- **Admin Dashboard**: Visual interface to monitor and control all clients
- **Video Management**: Multiple video support with automatic discovery
- **Playback Controls**: Play, Pause, Set Opacity, Change Video
- **HTTPS Built-in**: Self-signed certificates auto-generated

## Tech Stack

| Component | Technology |
|-----------|-------------|
| Backend | Node.js, Express.js |
| Real-time | Socket.IO |
| External Protocol | OSC (Open Sound Control) |
| Frontend | React (Create React App) |
| PWA | Service Workers |

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

This will:
1. Build the `client-webapp` and `admin-frontend`
2. Start the Node.js HTTPS server
3. Start the OSC bridge

## Access

- **Client PWA**: `https://localhost:3000/client`
- **Admin Dashboard**: `https://localhost:3000/admin`

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/videos` | List available videos |
| `GET /api/clients` | List connected clients |

## Socket.IO Events

### Server → Client

| Event | Description |
|-------|-------------|
| `videoCommand` | Command to change video, play/pause, set opacity |
| `nicknameUpdated` | Nickname change confirmation |

### Client → Server

| Event | Description |
|-------|-------------|
| `registerClient` | Register client with nickname |
| `clientStatusUpdate` | Send status updates to server |
| `requestVideoList` | Request available videos |

### Admin → Server

| Event | Description |
|-------|-------------|
| `adminCommand` | Send control commands |

## OSC Commands

The OSC bridge listens on UDP port `9000`:

| OSC Address | Description |
|------------|-------------|
| `/command/getVideos` | Request video list |
| `/command/getTargets` | Get client list |
| `/command/play` | Play current video |
| `/command/pause` | Pause playback |
| `/command/load` | Load video (arg: video filename) |
| `/command/opacity` | Set opacity (arg: 0.0-1.0) |
| `/command/target` | Target specific client (arg: client ID) |

## Supported Commands

- `changeVideo` - Switch to a different video
- `changeVideoAndPlay` - Switch video and auto-play
- `play` / `pause` - Playback control
- `setOpacity` - Adjust opacity (0.0 - 1.0)

## Docker

```bash
docker build -t remote-video-handler .
docker run -p 3000:3000 -p 9000:9000/udp remote-video-handler
```