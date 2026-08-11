# Deploy Configuration — Salfanet Radius

Deployment configuration for the NestJS + Next.js architecture.

## Architecture

```
                    ┌─────────────┐
                    │   Nginx     │ :80
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         /api/v1/*    /api/*         /*
              │            │            │
              ▼            │            ▼
     ┌──────────────┐      │     ┌──────────────┐
     │  NestJS      │:3001 │     │  Next.js     │:3000
     │  Backend     │      │     │  Frontend    │
     │  + Cron Jobs │      │     │  (standalone)│
     └──────────────┘      │     └──────────────┘
              │            │            │
              ▼            │            ▼
        ┌──────────┐      │     ┌──────────────┐
        │ Database │      │     │  Legacy API  │
        │ (MySQL)  │      │     │  Routes      │
        └──────────┘      │     │  (fallback)  │
                          │     └──────────────┘
                          │
                    ┌──────────────┐
                    │  WhatsApp    │:4000
                    │  Service     │
                    │  (Baileys)   │
                    └──────────────┘
```

## PM2 Processes

| Process | Port | Description |
|---------|------|-------------|
| `salfanet-frontend` | 3000 | Next.js standalone server |
| `salfanet-backend` | 3001 | NestJS API + cron jobs |
| `salfanet-cron` | — | Legacy cron runner (frontend) |
| `salfanet-wa` | 4000 | Baileys WhatsApp service |

## Files

| File | Description |
|------|-------------|
| `ecosystem.config.js` | PM2 configuration (4 processes) |
| `nginx-salfanet.conf` | Nginx reverse proxy config |
| `deploy.sh` | Deployment script |

## Initial Setup

### 1. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL, NEXTAUTH_SECRET, etc.

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env — set NEXTAUTH_SECRET, NEXT_PUBLIC_API_URL
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Generate Prisma client

```bash
cd backend
npx prisma generate
cd ..
```

### 4. Build

```bash
# Backend
cd backend && pnpm build && cd ..

# Frontend
cd frontend && pnpm build && cd ..
```

### 5. Start PM2

```bash
pm2 start deploy/ecosystem.config.js
pm2 save
```

### 6. Configure Nginx

```bash
sudo cp deploy/nginx-salfanet.conf /etc/nginx/sites-available/salfanet
sudo ln -s /etc/nginx/sites-available/salfanet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Updating

```bash
# Full deploy (build + restart)
./deploy/deploy.sh

# Backend only
./deploy/deploy.sh --backend

# Frontend only
./deploy/deploy.sh --frontend
```

## Logs

```bash
pm2 logs salfanet-backend   # Backend API + cron
pm2 logs salfanet-frontend  # Next.js
pm2 logs salfanet-cron      # Legacy cron
pm2 logs salfanet-wa        # WhatsApp
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://your-domain/api/v1/*` | NestJS backend API |
| `http://your-domain/api/docs` | Swagger API docs |
| `http://your-domain/api/*` | Legacy Next.js routes (fallback) |
| `http://your-domain/*` | Next.js frontend |

## Migration Notes

- During migration, both `/api/v1/*` (NestJS) and `/api/*` (legacy) are active
- Frontend uses `NEXT_PUBLIC_API_URL` to call NestJS; falls back to legacy if not set
- Cron jobs run in the backend process via `@nestjs/schedule`
- Legacy cron runner (`salfanet-cron`) is kept as fallback until Phase 7
- After Phase 7 regression test, legacy routes and cron can be removed
