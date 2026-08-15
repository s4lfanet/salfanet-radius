# Technician GenieACS Scope Audit

**Date:** 2026-08-16
**Status:** ⚠️ NOT IMPLEMENTED — REQUIRES DATA MODEL

## Problem

Technician GenieACS routes allow an active technician to access devices without
assignment-based filtering. A technician can potentially view/manage devices
outside their assigned area.

## Current Schema

The `technician` model has the following relations:

```
model technician {
  id                  String                       @id @default(cuid())
  name                String
  phoneNumber         String                       @unique
  email               String?
  isActive            Boolean                      @default(true)
  requireOtp          Boolean                      @default(true)
  createdAt           DateTime                     @default(now())
  updatedAt           DateTime                     @updatedAt
  lastLoginAt         DateTime?
  otpTokens           technicianOtp[]
  workOrders          workOrder[]
  pushSubscriptions   technicianPushSubscription[]
  registeredCustomers pppoeUser[]
}
```

### What's Available

- `workOrders` — work orders assigned to the technician
- `registeredCustomers` — PPPoE users registered by this technician
- `otpTokens` — OTP authentication tokens
- `pushSubscriptions` — push notification subscriptions

### What's Missing

- **No `routerId` or `router` relation** — technician is not assigned to a specific router/NAS
- **No `areaId` or `area` relation** — technician is not assigned to a geographic area
- **No `TechnicianRouterAssignment` model** — no many-to-many relationship between technicians and routers
- **No `TechnicianAreaAssignment` model** — no many-to-many relationship between technicians and areas
- **No `oltId` or `olt` relation** — technician is not assigned to an OLT

## Impact

Without assignment data, it is impossible to filter GenieACS devices by
technician scope. The current implementation allows any authenticated
technician to access all devices.

## Design Options

### Option A: Technician → Router Assignment (Simple)

Add a `routerId` field to `technician`:

```prisma
model technician {
  // ... existing fields ...
  routerId  String?
  router    router?  @relation(fields: [routerId], references: [id])
}
```

- **Pros**: Simple, one router per technician
- **Cons**: Can't handle technicians covering multiple routers/areas

### Option B: Technician ↔ Router Many-to-Many (Flexible)

Create a `TechnicianRouterAssignment` model:

```prisma
model TechnicianRouterAssignment {
  id           String     @id @default(cuid())
  technicianId String
  routerId     String
  technician   technician @relation(fields: [technicianId], references: [id])
  router       router     @relation(fields: [routerId], references: [id])
  createdAt    DateTime   @default(now())

  @@unique([technicianId, routerId])
  @@map("technician_router_assignments")
}
```

- **Pros**: Flexible, supports multiple routers per technician
- **Cons**: More complex queries

### Option C: Technician → Area Assignment (Hierarchical)

Create an `area` model and assign technicians to areas:

```prisma
model area {
  id        String   @id @default(cuid())
  name      String
  routerId  String
  router    router   @relation(fields: [routerId], references: [id])
}

model TechnicianAreaAssignment {
  id           String     @id @default(cuid())
  technicianId String
  areaId       String
  technician   technician @relation(fields: [technicianId], references: [id])
  area         area       @relation(fields: [areaId], references: [id])

  @@unique([technicianId, areaId])
  @@map("technician_area_assignments")
}
```

- **Pros**: Most flexible, supports geographic areas
- **Cons**: Requires area management UI, most complex

## Recommendation

**Option B** (Technician ↔ Router Many-to-Many) is recommended because:
- It matches the existing NAS isolation pattern (`nas_identifier = routerId`)
- It's flexible enough for real-world scenarios
- It doesn't require a new `area` model
- GenieACS devices can be filtered by router association

## Risk if Not Fixed

- Any authenticated technician can access all GenieACS devices
- No tenant isolation for technician portal
- Potential for unauthorized device configuration changes

## What Was NOT Changed

- Technician authentication (OTP/JWT) remains unchanged
- Technician work order system remains unchanged
- Technician customer registration remains unchanged
- No schema changes were made (requires user approval)

## Decision Required

**User must approve:**
1. Which design option to implement (A, B, or C)
2. Whether to create a new migration
3. Whether to build an admin UI for managing assignments

Until a data model is approved, this remains a **KNOWN LIMITATION**.
