# Deployment Guide — Omni-Piking AgentOS

## Prerequisites

- **Node.js** 22+ (recommended: latest LTS)
- **npm** or **yarn**
- **Git**

## Local Development

```bash
# Clone
git clone https://github.com/yashas-13/omni-piking-agentos.git
cd omni-piking-agentos

# Install
npm install

# Build
npx tsc

# Copy dashboard
cp src/dashboard/index.html dist/dashboard/

# Run
PORT=9420 node dist/main.js
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9420` | API server port |
| `OPENAI_API_KEY` | — | OpenAI API key for LLM features |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Custom OpenAI-compatible endpoint |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model to use for completions |

## Docker (Optional)

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ dist/
COPY src/dashboard/index.html dist/dashboard/
EXPOSE 9420
CMD ["node", "dist/main.js"]
```

```bash
docker build -t omni-piking .
docker run -p 9420:9420 omni-piking
```

## Android (Termux)

```bash
# Install Termux from F-Droid
pkg install nodejs git

# Clone and build
git clone https://github.com/yashas-13/omni-piking-agentos.git
cd omni-piking-agentos
npm install
npx tsc
cp src/dashboard/index.html dist/dashboard/

# Run
PORT=9420 node dist/main.js
```

Access from Android Chrome: `http://localhost:9420`

## Production Deployment

### PM2 Process Manager

```bash
npm install -g pm2
PORT=9420 pm2 start dist/main.js --name omni-piking
pm2 save
pm2 startup
```

### Systemd Service

```ini
[Unit]
Description=Omni-Piking AgentOS
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/omni-piking
ExecStart=/usr/bin/node dist/main.js
Environment=PORT=9420
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable omni-piking
sudo systemctl start omni-piking
```

## Port Configuration

| Port | Service | Notes |
|------|---------|-------|
| 9420 | Omni-Piking Core | Main API + Dashboard |
| 20128 | 9Router Gateway | AI model routing |
| 10402 | Loki Auto | Browser extension proxy |

## Monitoring

- **Dashboard**: `http://localhost:9420/dashboard`
- **Health Check**: `http://localhost:9420/health`
- **Status**: `http://localhost:9420/status`
- **WebSocket**: `ws://localhost:9420/ws`

## Troubleshooting

### Port in use
```bash
lsof -i :9420
kill -9 <PID>
```

### Database issues
```bash
rm ~/.agentos/omniping.db
# Database will be recreated on next start
```

### Build errors
```bash
rm -rf dist/
npx tsc
cp src/dashboard/index.html dist/dashboard/
```
