# Development Guide — Salfanet Radius

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | JavaScript runtime |
| pnpm | 9+ | Package manager (monorepo workspaces) |
| MySQL | 8.0 | Database |
| Git | 2.40+ | Version control |

Optional (for external services):
- FreeRADIUS 3.0.26
- MikroTik RouterOS device
- GenieACS server
- WhatsApp Baileys service

## Initial Setup

### 1. Clone and install

```bash
git clone https://github.com/s4lfanet/salfanet-radius.git
cd salfanet-radius
pnpm install
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL, NEXTAUTH_SECRET, etc.

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env — set NEXTAUTH_SECRET, DATABASE_URL
# Optional: NEXT_PUBLIC_API_URL=http://localhost:3001 (to use NestJS backend)
```

### 3. Database setup

```bash
# Generate Prisma client
cd frontend
npx prisma generate
npx prisma db push  # or npx prisma migrate dev
cd ..
```

### 4. Run development servers

```bash
# Terminal 1 — Backend (NestJS, port 3001)
cd backend
pnpm start:dev

# Terminal 2 — Frontend (Next.js, port 3000)
cd frontend
pnpm dev
```

### 5. Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api/v1
- Swagger docs: http://localhost:3001/api/docs

## Project Structure

```
salfanet-radius/
├── frontend/          # Next.js UI
├── backend/           # NestJS API + cron
├── packages/          # Shared types
├── deploy/            # Deployment configs
└── docs/              # Documentation
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture.

## Development Workflow

### Backend (NestJS)

```bash
cd backend

# Start dev server (hot reload)
pnpm start:dev

# Build
pnpm build

# Run tests
pnpm test:e2e

# Type check
pnpm typecheck
```

#### Adding a new module

```bash
# Generate module scaffold
npx nest g module modules/my-feature
npx nest g controller modules/my-feature
npx nest g service modules/my-feature
```

Module template:
```typescript
// my-feature.module.ts
import { Module } from '@nestjs/common';
import { MyFeatureController } from './my-feature.controller';
import { MyFeatureService } from './my-feature.service';

@Module({
  controllers: [MyFeatureController],
  providers: [MyFeatureService],
  exports: [MyFeatureService],  // Export if other modules need it
})
export class MyFeatureModule {}
```

Register in `src/app.module.ts`:
```typescript
import { MyFeatureModule } from './modules/my-feature/my-feature.module';

@Module({
  imports: [..., MyFeatureModule],
})
export class AppModule {}
```

#### Controller pattern

```typescript
@Controller('my-feature')
@ApiTags('my-feature')
export class MyFeatureController {
  constructor(private readonly service: MyFeatureService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  async list() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  async create(@Body() dto: CreateMyFeatureDto) {
    return this.service.create(dto);
  }
}
```

### Frontend (Next.js)

```bash
cd frontend

# Start dev server
pnpm dev

# Build
pnpm build

# Lint
pnpm lint
```

#### API client usage

```typescript
// Server-side (server components, layouts)
import { getCompanyInfo, apiFetch } from '@/lib/api-client';
const company = await getCompanyInfo();

// Client-side (with auth)
import { apiFetchAuth } from '@/lib/api-client';
const data = await apiFetchAuth('/api/v1/users/list');
```

### Cron Jobs

Cron jobs are defined in `backend/src/modules/cron/cron.service.ts` using
`@Cron()` decorator from `@nestjs/schedule`.

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

@Cron(CronExpression.EVERY_MINUTE)
async hotspotSync() {
  return this.runWithLock('hotspot_sync', async () => {
    // Implementation
  });
}
```

Manual trigger via API:
```
POST /api/v1/cron/trigger
{ "jobType": "hotspot_sync" }
```

## Testing

### E2E Tests

```bash
cd backend
pnpm test:e2e
```

Tests use:
- Jest + ts-jest
- supertest for HTTP requests
- Mock PrismaService (no real DB needed)
- Mock nanoid (ESM compatibility)

### Manual Testing

See [deploy/REGRESSION_TEST_CHECKLIST.md](../deploy/REGRESSION_TEST_CHECKLIST.md)
for the full manual test checklist.

## Common Issues

### nanoid ESM error in tests

nanoid 5.x is ESM-only. If Jest fails with "Cannot use import statement":
- The mock is in `backend/test/__mocks__/nanoid.js`
- Jest config maps `nanoid` to the mock

### Prisma client not generated

```bash
cd frontend
npx prisma generate
```

### NestJS DI errors (cannot resolve dependencies)

1. Check if the module exports the service:
   ```typescript
   exports: [MyService]
   ```
2. Check if the importing module has it in `imports:`
3. For guards, `AuthModule` is `@Global()` — no need to import it

### Frontend layout errors (Prisma not found)

Layout files no longer import Prisma directly. They use `getCompanyInfo()`
from `@/lib/api-client`. If the backend is not running, layouts fall back
to legacy `/api/company` route.

## Code Style

- TypeScript strict mode
- No `any` types (use `unknown` if needed)
- NestJS: follow module/controller/service pattern
- Next.js: App Router, server components by default
- Shared types in `packages/shared-types/`

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Commit (conventional commits)
git commit -m "feat(backend): add my-feature module"

# Push
git push origin feature/my-feature
```

Commit prefixes:
- `feat(backend):` — Backend feature
- `feat(frontend):` — Frontend feature
- `fix(backend):` — Backend bug fix
- `docs:` — Documentation
- `test:` — Tests
- `deploy:` — Deployment config
