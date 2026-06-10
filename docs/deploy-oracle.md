# Deployment — Oracle Always Free ARM (Fallback)

## Oracle Always Free ARM specs
- 4 Ampere A1 cores (ARM64)
- 24 GB RAM
- 200 GB block storage
- No GPU — perfect for this stack

## One-time setup

```bash
# Same Docker install as Hostinger
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Allow ports in Oracle security list:
#   22 (SSH), 80 (HTTP), 443 (HTTPS), 3001 (API direct)

# Clone and configure
git clone https://github.com/YOU/mai0.1.git /opt/mai0.1
cd /opt/mai0.1
cp .env.example .env
nano .env  # add API keys
```

## Running as fallback

The Oracle instance runs the same `docker-compose.yml`.
It's the fallback when Hostinger is unreachable.

Health probe from Hostinger (cron, every 5 min):
```bash
curl -sf http://ORACLE_IP:3001/health || echo "Oracle unreachable"
```

## Switching traffic to Oracle

If Hostinger goes down:
1. Update DNS `spaienoids.com` → Oracle IP
2. TTL propagation: ~5 min (set DNS TTL to 300 for fast failover)
3. Oracle instance is already running and warmed up

## Why Oracle is always running

The `docker compose up -d` on Oracle runs at boot via systemd:

```bash
sudo systemctl enable docker
# /etc/systemd/system/mai01.service
[Unit]
Description=M.AI0.1
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/opt/mai0.1
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always

[Install]
WantedBy=multi-user.target
```
