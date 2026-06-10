# Deployment — Hostinger VPS (Primary)

## Prerequisites
- Hostinger VPS with Ubuntu 22.04+
- Domain `spaienoids.com` pointed at Hostinger
- SSH access configured

## One-time server setup

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Nginx (reverse proxy)
sudo apt install -y nginx certbot python3-certbot-nginx

# Clone repo
git clone https://github.com/YOU/mai0.1.git /opt/mai0.1
cd /opt/mai0.1
cp .env.example .env
# Edit .env with your API keys
nano .env
```

## Nginx config (`/etc/nginx/sites-available/mai0.1`)

```nginx
server {
    server_name spaienoids.com;

    # Web UI at /mai0.1
    location /mai0.1 {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API at /mai0.1/api
    location /mai0.1/api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mai0.1 /etc/nginx/sites-enabled/
sudo certbot --nginx -d spaienoids.com
sudo systemctl reload nginx
```

## Deploy

```bash
cd /opt/mai0.1
git pull
docker compose pull
docker compose up -d --build
```

## Updates (CI/CD push)
See `docs/deploy-ci.md` for GitHub Actions workflow.
