# Type Safety Exceptions

> Generated: 14 Aug 2026 — Phase 6C
> Total remaining `any`: 6 (all in third-party declaration file)
> Total remaining `as any`: 0
> Total remaining `as unknown as`: 24 (all documented with inline comments)

---

## 1. midtrans-client.d.ts — Midtrans Snap API declaration

**File:** `frontend/src/types/midtrans-client.d.ts`
**Lines:** 93–98

```ts
approve(orderId: string): Promise<any>;
deny(orderId: string): Promise<any>;
cancel(orderId: string): Promise<any>;
expire(orderId: string): Promise<any>;
refund(orderId: string, parameter?: any): Promise<any>;
notification(notificationJson: any): Promise<TransactionStatus>;
```

**Reason:** This is a hand-written ambient declaration file for the `midtrans-client` npm package, which does not ship its own TypeScript types. The Midtrans API returns untyped JSON responses with varying shapes per endpoint.

**Third-party:** Yes — `midtrans-client` npm package.

**Risk:** Low — these methods are only called in payment gateway routes, and the response is immediately narrowed by the caller.

**Possible future solution:** Install `@types/midtrans-client` if it becomes available, or define proper response interfaces for each method based on Midtrans API documentation.

---

## 2. `as unknown as` — 24 documented casts

All 24 `as unknown as` usages have inline comments explaining the reason. They fall into 4 categories:

### Category A: Leaflet internal property (4 usages)

**Files:**
- `src/components/network/NetworkTopologyMap.tsx:16`
- `src/components/network/UnifiedNetworkMap.tsx:17`
- `src/components/MapPicker.tsx:62`
- `src/app/admin/network/map/page.tsx:192`

**Pattern:** `L.Icon.prototype` extended with `_getIconUrl` — internal Leaflet property not exposed in `@types/leaflet`.

**Reason:** Leaflet's icon resolution uses an internal `_getIconUrl` method that is not in the public type definitions. This is the standard workaround used across the Leaflet ecosystem.

**Third-party:** Yes — `leaflet` / `@types/leaflet`.

**Risk:** Low — only affects custom icon URL resolution.

**Possible future solution:** Submit a PR to `@types/leaflet` to expose `_getIconUrl`.

---

### Category B: jsPDF AutoTable plugin (6 usages)

**Files:**
- `src/app/admin/invoices/page.tsx:383, 438`
- `src/app/admin/pppoe/users/page.tsx:1059`
- `src/app/admin/hotspot/voucher/page.tsx:399`
- `src/app/admin/keuangan/page.tsx:472`
- `src/lib/utils/export.ts:406`

**Pattern:** `(doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable`

**Reason:** `jspdf-autotable` monkey-patches the jsPDF `Document` prototype at runtime to add `lastAutoTable`, but this property is not in the jsPDF type definitions.

**Third-party:** Yes — `jspdf-autotable`.

**Risk:** Low — only used to read `finalY` for cursor positioning after table generation.

**Possible future solution:** Import `jsPDFWithAutoTable` type from `jspdf-autotable` if it exports one, or create a local augmentation.

---

### Category C: API type → local type boundary (5 usages)

**Files:**
- `src/app/admin/invoices/page.tsx:192` — API `Invoice` lacks nested `user` relation
- `src/app/admin/pppoe/users/page.tsx:482` — API uses `pppoe_profiles`/`nas`/`pppoe_areas`; local uses `profile`/`router`/`area`
- `src/app/admin/network/olts/page.tsx:222` — API `OLT` type has different field names than local `OLT`
- `src/app/admin/network/trace/page.tsx:91` — `PathNode[][]` → different shape for `ImpactAnalysisPanel`
- `src/app/admin/pppoe/profiles/page.tsx:342` — API type lacks `savedProfile`/`debug` fields

**Reason:** The backend API response types (defined in `src/types/api/`) use Prisma field naming conventions (snake_case relations, nested objects), while the frontend local types use camelCase with flattened relations. The two type systems don't overlap sufficiently for a direct cast.

**Third-party:** No — this is an internal type boundary mismatch.

**Risk:** Medium — if the API response shape changes, the cast may hide runtime errors.

**Possible future solution:** Unify the API response types and local types, or add a proper adapter/mapper function that converts API responses to local types with validation.

---

### Category D: SplitterNode dynamic data (6 usages)

**Files:**
- `src/components/network/NetworkTopologyMap.tsx:311, 320, 329, 338, 347` — `Record<string, unknown>` → `SplitterNode`
- `src/app/admin/network/diagrams/page.tsx:615` — Object with extra fields vs `SplitterNode['incomingCable']`

**Reason:** Network topology nodes are stored as `Record<string, unknown>` in the API response (dynamic entity data), but diagram components require the `SplitterNode` interface. The data shape is known at runtime but not at compile time.

**Third-party:** No — internal type boundary.

**Risk:** Medium — if the API returns a node that doesn't match `SplitterNode`, the diagram component may crash at runtime.

**Possible future solution:** Add a type guard `isSplitterNode(data: unknown): data is SplitterNode` and use it before passing data to diagram components.

---

### Category E: Custom DOM property (1 usage)

**File:** `src/app/admin/AdminClientLayout.tsx` (2 occurrences, same pattern)

**Pattern:** `(e.currentTarget as unknown as HTMLDivElement & { touchStartX: number })`

**Reason:** Touch event handler stores `touchStartX` on the DOM element for swipe detection. This is a custom property not in the `HTMLDivElement` type.

**Third-party:** No — custom application pattern.

**Risk:** Low — only used for touch swipe navigation.

**Possible future solution:** Use a `useRef<number>` to store touch start X instead of attaching to the DOM element.

---

## Summary

| Category | Count | Third-party | Action |
|----------|-------|-------------|--------|
| Midtrans declaration | 6 | Yes | Keep — no types available |
| Leaflet internal | 4 | Yes | Keep — standard workaround |
| jsPDF AutoTable | 6 | Yes | Keep — runtime monkey-patch |
| API → local type | 5 | No | Future: unify types or add adapter |
| SplitterNode dynamic | 6 | No | Future: add type guard |
| Custom DOM property | 2 | No | Future: use useRef instead |
| **Total** | **29** | | |

All exceptions are documented with inline comments in the source code.
