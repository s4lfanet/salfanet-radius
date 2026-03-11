# Fiber Network Topology — Panduan Lengkap

> Versi: 2.10.25 | Referensi dari billing-radius

---

## Ringkasan

Modul **Fiber Network Topology** menyediakan manajemen infrastruktur jaringan fiber optik secara menyeluruh — mulai dari pendaftaran perangkat (OTB, ODC, ODP, Joint Closure), manajemen kabel dan core, pencatatan splice, visualisasi peta interaktif, diagram splitter, hingga pelacakan jalur fisik dan logis.

Modul ini **belum tersedia di salfanet-radius** saat ini dan merupakan fitur roadmap yang sudah diimplementasikan penuh di `billing-radius`. Dokumen ini mendokumentasikan arsitektur, model data, dan fitur untuk referensi integrasi ke depan.

---

## Menu & Halaman

Semua halaman berada di `/admin/network/`:

| Path | Deskripsi |
|------|-----------|
| `/admin/network/infrastruktur` | Manajemen perangkat: OTB, Joint Closure, ODC, ODP (4 tab CRUD) |
| `/admin/network/fiber-cables` | Katalog kabel fiber + detail tube & core |
| `/admin/network/fiber-cores` | Manajemen core: assign, release, reserve, mark damaged |
| `/admin/network/splice-points` | Pencatatan titik splice antar core |
| `/admin/network/map` | Peta Leaflet interaktif (OLT/ODC/ODP/Customer/Router) |
| `/admin/network/unified-map` | Peta terpadu semua node + Connect Mode + Add Mode |
| `/admin/network/diagrams` | Diagram splitter visual: OTB/JC/ODC/ODP |
| `/admin/network/trace` | Path tracing: logical (BFS) + physical (core-level) |

---

## Hierarki Jaringan Fiber

```
OLT (Optical Line Terminal)
 └── OTB (Optical Terminal Box)   ← feeder dari OLT
       └── cable_segments (tube → Joint Closure)
             └── Joint Closure (JC / Closure Box)
                   ├── network_odcs (ODC — Optical Distribution Cabinet)
                   │     └── network_odps (ODP — Optical Distribution Point)
                   │           ├── pelanggan (odp_customer_assignments)
                   │           └── ODP sub-level (daisy-chain, maks 2 level)
                   └── network_odps  ← langsung dari JC tanpa ODC
```

**Catatan hierarki ODP (`upstreamType`):**

| upstreamType | Arti |
|---|---|
| `OLT` | ODP langsung dari OLT (tanpa ODC) |
| `OTB` | ODP di downstream OTB |
| `JC` | ODP dari Joint Closure |
| `ODC` | ODP dari ODC (paling umum) |
| `ODP_PARENT` | ODP level 2 (cascading) |
| `ODP_SUB_PARENT` | ODP level 3 (maks level cascading) |

---

## Model Data (Prisma)

### OTB — `network_otbs`

Perangkat passive di lapangan, menampung splitter dan mendistribusikan ke ODC.

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | String | UUID |
| `name` | String | Nama OTB |
| `code` | String UNIQUE | Kode unik (misal: `OTB-JKT-001`) |
| `latitude`, `longitude` | Float | Koordinat GPS |
| `address` | Text? | Alamat fisik |
| `oltId` | String? | FK ke `network_olts` |
| `portCount` | Int | Kapasitas port (default: 24) |
| `usedPorts` | Int | Port terpakai |
| `feederCable` | String? | Kode kabel feeder dari OLT |
| `hasSplitter` | Boolean | Ada splitter (default: true) |
| `splitterRatio` | String? | Misal: `1:8`, `1:16` |
| `coverageRadiusKm` | Float? | Estimasi radius jangkauan (default: 3 km) |
| `incomingCableId` | String? | FK ke `fiber_cables` |
| `spliceTrayCount` | Int | Jumlah tray splice (default: 1) |
| `totalSpliceCapacity` | Int | Kapasitas total splice (default: 24) |
| `status` | Enum | `ACTIVE` \| `INACTIVE` \| `MAINTENANCE` \| `DAMAGED` |
| `installDate` | DateTime? | Tanggal pemasangan |
| `metadata` | Json? | Data tambahan fleksibel |

**Relasi:** `network_otbs` → `network_odcs[]` (ODC yang terhubung ke OTB ini)

---

### ODC — `network_odcs`

Kabinet distribusi di lapangan, biasanya berupa box besar berisi splitter.

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | String | UUID |
| `name` | String | Nama ODC |
| `latitude`, `longitude` | Float | Koordinat GPS |
| `oltId` | String | FK ke `network_olts` (required) |
| `otbId` | String? | FK ke `network_otbs` (optional) |
| `ponPort` | Int | Port PON di OLT yang dilayani |
| `portCount` | Int | Kapasitas port (default: 8) |
| `fiberCableType` | String? | Tipe kabel masuk |
| `splitterConfig` | Json? | Konfigurasi splitter `{ratio, type, loss}` |
| `incomingCableId` | String? | FK ke `fiber_cables` |
| `incomingCoreId` | String? | FK ke `fiber_cores` (core yang masuk) |
| `spliceTrayCount` | Int | Jumlah tray splice (default: 2) |
| `totalSpliceCapacity` | Int | Kapasitas total splice (default: 48) |
| `followRoad` | Boolean | Routing ikut jalan (OSRM) |
| `customRouteWaypoints` | Json? | Array titik waypoint kustom |
| `status` | String | `active` \| `inactive` \| `maintenance` |

**Relasi:** `network_odcs` → `network_odps[]` (ODP di bawah ODC ini)

---

### ODP — `network_odps`

Perangkat distribusi terakhir sebelum pelanggan, biasanya instalasi di tiang/rumah.

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | String | UUID |
| `name` | String | Nama ODP |
| `latitude`, `longitude` | Float | Koordinat GPS |
| `portCount` | Int | Kapasitas port (default: 8) |
| `odcId` | String? | FK ke `network_odcs` |
| `oltId` | String? | FK ke `network_olts` (jika direct) |
| `ponPort` | Int? | Port PON di OLT |
| `parentOdpId` | String? | FK self-relasi — ODP induk |
| `hierarchyLevel` | Int | Level cascading (0 = root) |
| `maxChildLevel` | Int | Maks level anak (default: 2) |
| `splitterRatio` | String | Rasio splitter (default: `1:8`) |
| `splitterType` | String | `PLC` \| `FBT` |
| `fbtRatioType` | Enum | `even` \| `uneven` (untuk FBT) |
| `fbtTapLoss` | Decimal? | Loss tap port FBT (dB) |
| `fbtThroughLoss` | Decimal? | Loss through port FBT (dB) |
| `upstreamType` | Enum? | Tipe upstream: `OLT`/`OTB`/`JC`/`ODC`/`ODP_PARENT`/`ODP_SUB_PARENT` |
| `upstreamId` | String? | ID perangkat upstream |
| `incomingCableId` | String? | FK ke `fiber_cables` |
| `incomingCoreId` | String? | FK ke `fiber_cores` |
| `splitterDiagram` | Json? | Konfigurasi diagram splitter |
| `childType` | String | `standalone` \| `cascade` |
| `customRouteWaypoints` | Json? | Waypoint routing kustom |
| `status` | String | `active` \| `inactive` \| `damaged` |

**Relasi:**
- `network_odps` → `odp_customer_assignments[]`
- `network_odps` → `network_odps?` (parent — self relasi)
- `network_odps` → `network_odps[]` (children — self relasi)

---

### Joint Closure — `network_joint_closures`

Closure box di lapangan untuk penyambungan/percabangan kabel.

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | String | UUID |
| `name` | String | Nama JC |
| `code` | String UNIQUE | Kode unik |
| `type` | String | `CORE` / `DISTRIBUTION` / `FEEDER` |
| `closureType` | Enum | `INLINE` (sambungan lurus) \| `BRANCHING` (percabangan) \| `TERMINAL` (ujung) |
| `latitude`, `longitude` | Float | Koordinat GPS |
| `cableType` | String | Tipe kabel |
| `fiberCount` | Int | Jumlah fiber dalam kabel |
| `connections` | Json | Array koneksi: `[{to, distance}]` |
| `hasSplitter` | Boolean | Ada splitter pasif |
| `splitterRatio` | String? | Rasio splitter |
| `spliceTrayCount` | Int | Jumlah tray splice (default: 4) |
| `totalSpliceCapacity` | Int | Kapasitas total splice (default: 96) |
| `followRoad` | Boolean | Routing ikut jalan |
| `customRouteWaypoints` | Json? | Waypoint routing kustom |
| `lastInspection` | DateTime? | Waktu inspeksi terakhir |
| `status` | String | `active` \| `inactive` \| `damaged` |

---

## Manajemen Kabel Fiber

### Struktur Kabel

```
fiber_cables (katalog kabel)
 └── fiber_tubes (tabung per kabel, diberi warna TIA-598-D)
       └── fiber_cores (core individual, diberi warna TIA-598-D)
```

### `fiber_cables` — Katalog Kabel

| Field | Tipe | Keterangan |
|---|---|---|
| `code` | String UNIQUE | Kode kabel (misal: `KABEL-OTB01-ODC01`) |
| `name` | String | Nama deskriptif |
| `cableType` | Enum | `SM_G652` \| `SM_G657A1` \| `SM_G657A2` \| `MM_OM3` \| `MM_OM4` \| `GPON` \| `ADSS` \| `OPGW` \| `Figure_8` \| `Aerial` \| `Underground` \| `Indoor` |
| `tubeCount` | Int | Jumlah tabung |
| `coresPerTube` | Int | Core per tabung |
| `totalCores` | Int? | Total core (auto: tubeCount × coresPerTube) |
| `outerDiameter` | Decimal? | Diameter luar kabel (mm) |
| `manufacturer` | String? | Merek/produsen |
| `partNumber` | String? | Nomor part |
| `status` | Enum | `ACTIVE` \| `INACTIVE` \| `DAMAGED` |
| `notes` | Text? | Catatan |

**Preset kabel cepat:** 12C (1×12), 24C (2×12), 48C (4×12), 96C (8×12), 144C (12×12)

### `fiber_tubes` — Tabung dalam Kabel

| Field | Keterangan |
|---|---|
| `tubeNumber` | Nomor tabung (1, 2, 3, ...) |
| `colorCode` | Nama warna TIA-598-D (Blue, Orange, Green, dsb) |
| `colorHex` | Hex warna untuk tampilan dot (`#0000FF`, dll) |
| `coreCount` | Jumlah core dalam tabung |
| `usedCores` | Core terpakai |
| `availableCores` | Core tersedia |
| `status` | `ACTIVE` \| `DAMAGED` \| `RESERVED` |

### `fiber_cores` — Core Individual

| Field | Keterangan |
|---|---|
| `coreNumber` | Nomor core dalam tabung |
| `colorCode` | Nama warna TIA-598-D |
| `colorHex` | Hex warna |
| `status` | `AVAILABLE` \| `ASSIGNED` \| `RESERVED` \| `DAMAGED` \| `DARK` |
| `assignedToType` | Perangkat tujuan: `ODP` \| `ODC` \| `OTB` \| `JC` \| `CUSTOMER` |
| `assignedToId` | ID perangkat tujuan |
| `attenuation` | Atenuasi core (dB/km) |

**Aksi core (bulk/single):**
- **Assign** — tetapkan ke perangkat (ODP/ODC/OTB/JC)
- **Release** — kembalikan ke AVAILABLE
- **Reserve** — tandai RESERVED untuk proyek mendatang
- **Mark Damaged** — tandai rusak, catat alasan

Setiap perubahan status tercatat di `core_assignment_history` dengan `performedBy`, `reason`, dan waktu.

---

## Manajemen Splice

### `splice_points` — Titik Splice

Pencatatan setiap penyambungan fisik antar dua core.

| Field | Keterangan |
|---|---|
| `deviceType` | Lokasi splice: `OTB` \| `JOINT_CLOSURE` \| `ODC` \| `ODP` |
| `deviceId` | ID perangkat lokasi splice |
| `trayNumber` | Nomor tray splice di dalam perangkat |
| `incomingCoreId` | Core masuk (FK ke `fiber_cores`) |
| `outgoingCoreId` | Core keluar (FK ke `fiber_cores`) |
| `spliceType` | `FUSION` (ditampilkan biru) \| `MECHANICAL` (oranye) |
| `insertionLoss` | Loss penyambungan (dB, tipikal FUSION: ≤0.1 dB) |
| `reflectance` | Reflektansi (dB) |
| `spliceDate` | Tanggal penyambungan |
| `splicedBy` | Nama teknisi |
| `status` | `ACTIVE` \| `REPAIRED` \| `DAMAGED` |

---

## Segmen Kabel Fisik

### `cable_segments` — Routing Fisik Antar Perangkat

| Field | Keterangan |
|---|---|
| `cableId` | FK ke `fiber_cables` |
| `fromDeviceType` | `OTB` \| `JOINT_CLOSURE` \| `ODC` \| `ODP` \| `FEEDER` |
| `fromDeviceId` | ID perangkat asal |
| `fromPort` | Nomor port asal (opsional) |
| `toDeviceType` | Tipe perangkat tujuan |
| `toDeviceId` | ID perangkat tujuan (`"unlinked"` jika belum terhubung) |
| `toPort` | Nomor port tujuan (opsional) |
| `lengthMeters` | Panjang kabel (meter) |
| `attenuationPerKm` | Atenuasi per km (default: 0.350 dB/km) |
| `calculatedAttenuation` | Atenuasi total = lengthMeters/1000 × attenuationPerKm |
| `installDate` | Tanggal pemasangan |
| `status` | `ACTIVE` \| `INACTIVE` \| `DAMAGED` |

---

## Koneksi Pelanggan ke ODP

### `odp_customer_assignments`

| Field | Keterangan |
|---|---|
| `customerId` | FK ke `pppoe_users` (UNIQUE — 1 pelanggan = 1 port) |
| `odpId` | FK ke `network_odps` |
| `portNumber` | Nomor port di ODP (1–portCount) |
| `distance` | Jarak pelanggan ke ODP (km) |
| `notes` | Catatan pemasangan |

**Constraint:** `(odpId, portNumber)` UNIQUE — 1 port hanya untuk 1 pelanggan.

**Auto-assign:** API `/api/network/customers/assign` mencari ODP terdekat (algoritma Haversine) yang masih memiliki port kosong, lalu menawarkan pilihan ke admin.

---

## Visualisasi & Peta

### Peta Klasik (`/admin/network/map`)

- **Layer:** OLT, ODC, ODP, Customer, Router — masing-masing dengan ikon berbeda
- **Garis koneksi:** OLT→ODC, ODC→ODP, ODP→Customer mengikuti jalan (OSRM routing)
- **Editor waypoint:** klik peta untuk tambah/ubah titik routing kustom
- **Popup pelanggan:** klik marker customer → `UserDetailModal` lengkap
- **Ping OLT:** test koneksi real-time (success/failed/timeout)
- **Filter:** per layer, per OLT/router, per status

### Unified Map (`/admin/network/unified-map`)

Peta modern dengan semua 6 tipe node dan fitur tambahan:

**Mode Tambah Node:**
1. Aktifkan "Add Mode"
2. Klik lokasi di peta → `AddNodePanel` muncul
3. Pilih tipe node (OLT/OTB/JC/ODC/ODP/Customer)
4. Isi form → simpan ke DB

**Mode Connect:**
1. Aktifkan "Connect Mode"
2. Klik node A → node A ter-highlight
3. Klik node B → sistem buat `fiber_cables` + `cable_segments` otomatis
4. Panjang kabel = jarak Haversine × 1.3 (faktor selubung kabel)

**Warna garis koneksi:**

| Dari → Ke | Warna |
|---|---|
| OTB → JC | Violet |
| JC → JC | Purple |
| JC → ODC | Cyan |
| JC → ODP | Emerald |
| ODC → ODP | Green |
| ODP → ODP | Lime |
| OTB → ODC | Blue |

**Panel statistik:** total count per tipe node + status (active/issue).

---

## Diagram Splitter Visual (`/admin/network/diagrams`)

4 tab diagram:

| Tab | Komponen | Fitur |
|---|---|---|
| **OTB** | `OTBDiagramV2` | Port assignment diagram; form assign tube→JC (tubeNumber + jcId + lengthMeters) |
| **JC** | `JointClosureDiagramV2` | Diagram splice tray; input/output connections; splice points list |
| **ODC** | `ODCDiagram` | Port splitter diagram (portCount port) |
| **ODP** | `ODPDiagram` | Port splitter dengan rasio (1:8 default) |

---

## Fiber Path Tracing (`/admin/network/trace`)

### Logical Trace (BFS)

1. Pilih node **From** (OLT/JC/ODC/ODP) dan **To**
2. Server menjalankan BFS melalui `network_fiber_paths` dan relasi node
3. Hasil: daftar node path urut + total jarak + estimasi total loss (dB)
4. **Impact Analysis:** hitung pelanggan terdampak jika jalur diputus, estimasi downtime, estimasi kerugian revenue

### Physical Trace (Core-Level)

1. Input `coreId` atau `deviceType + deviceId`
2. Server traverse `splice_points`: `incomingCoreId` ↔ `outgoingCoreId`
3. Hasil step-by-step:
   - **Core entry:** colorDot, nomor core, nomor tube, kode kabel
   - **Splice:** tipe (FUSION/MECHANICAL), insertion loss (dB), lokasi (tray #N di perangkat X)
   - **Device:** tipe dan nama perangkat

---

## Signal Budget Calculator

Library `src/lib/network/fiber-core-types.ts` menyediakan kalkulasi optical budget:

```
OLT Tx Power:          +5 dBm   (tipikal GPON)
ONU Rx Sensitivity:   -28 dBm   (tipikal)
Link Budget:           33 dB    (tanpa margin)
Safety Margin:          3 dB
Max Allowed Loss:      30 dB
```

**Tabel loss splitter PLC standar:**

| Rasio | Loss |
|---|---|
| 1:2 | 3.5 dB |
| 1:4 | 7.0 dB |
| 1:8 | 10.5 dB |
| 1:16 | 14.0 dB |
| 1:32 | 17.5 dB |
| 1:64 | 21.0 dB |

**Atenuasi kabel** (per km):
- SM G.652: 0.35 dB/km
- SM G.657A1/A2: 0.35 dB/km
- Splice FUSION: ≤ 0.1 dB per titik

---

## Warna Koding TIA-598-D

Standar pewarnaan tube dan core:

| No | Warna | Hex |
|---|---|---|
| 1 | Blue | #0000FF |
| 2 | Orange | #FF8C00 |
| 3 | Green | #008000 |
| 4 | Brown | #8B4513 |
| 5 | Slate | #708090 |
| 6 | White | #FFFFFF |
| 7 | Red | #FF0000 |
| 8 | Black | #000000 |
| 9 | Yellow | #FFD700 |
| 10 | Violet | #8B00FF |
| 11 | Rose | #FF69B4 |
| 12 | Aqua | #00CED1 |

---

## Import Excel

Perangkat berikut mendukung import massal dari file Excel:

| Perangkat | Endpoint | Template |
|---|---|---|
| ODC | `POST /api/network/odcs/import` | `GET /api/network/odcs/template` |
| ODP | `POST /api/network/odps/import` | `GET /api/network/odps/template` |
| Joint Closure | `POST /api/network/joint-closures/import` | `GET /api/network/joint-closures/template` |

---

## OTB Statistics Dashboard

Endpoint `GET /api/network/otbs/stats` mengembalikan:

```json
{
  "total": 12,
  "byStatus": { "ACTIVE": 10, "MAINTENANCE": 1, "DAMAGED": 1 },
  "ports": {
    "total": 288,
    "used": 156,
    "available": 132,
    "utilization": 54.2
  },
  "byOlt": [
    { "oltName": "OLT-JKT-01", "count": 5, "ports": 120 }
  ]
}
```

---

## Daftar API Endpoint

### OTB
| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/network/otbs` | List OTB (paginated, filter: search/status/oltId) |
| POST | `/api/network/otbs` | Buat OTB baru |
| GET | `/api/network/otbs/:id` | Detail OTB + kabel masuk + segmen output |
| PUT | `/api/network/otbs/:id` | Update OTB |
| DELETE | `/api/network/otbs/:id` | Hapus OTB |
| GET | `/api/network/otbs/stats` | Statistik OTB (total, byStatus, port utilization) |
| GET | `/api/network/otbs/:id/feeder-cables` | Feeder cable assignments ke OTB |
| POST | `/api/network/otbs/:id/segments` | Assign tube OTB → Joint Closure |
| DELETE | `/api/network/otbs/:id/segments?segmentId=` | Hapus assignment tube→JC |

### ODC
| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/network/odcs` | List ODC + info OLT + jumlah ODP |
| POST | `/api/network/odcs` | Buat ODC baru |
| GET | `/api/network/odcs/:id` | Detail ODC |
| PUT | `/api/network/odcs/:id` | Update ODC |
| DELETE | `/api/network/odcs/:id` | Hapus ODC |
| POST | `/api/network/odcs/import` | Import ODC dari Excel |

### ODP
| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/network/odps` | List ODP (filter: routerId) |
| POST | `/api/network/odps` | Buat ODP baru |
| GET | `/api/network/odps/:id` | Detail ODP + jumlah pelanggan |
| PUT | `/api/network/odps/:id` | Update ODP |
| DELETE | `/api/network/odps/:id` | Hapus ODP |
| POST | `/api/network/odps/import` | Import ODP dari Excel |

### Joint Closure
| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/network/joint-closures` | List JC (filter: type/status/search) |
| POST | `/api/network/joint-closures` | Buat JC baru |
| GET/PUT/DELETE | `/api/network/joint-closures/:id` | CRUD JC by ID |
| GET/POST/DELETE | `/api/network/joint-closures/:id/segments` | Segment routing dari JC |
| GET/POST | `/api/network/joint-closures/:id/splices` | Splice points di dalam JC |
| POST | `/api/network/joint-closures/import` | Import JC dari Excel |

### Kabel & Core
| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/network/cables` | List kabel + statistik penggunaan core |
| POST | `/api/network/cables` | Buat kabel (auto-generate semua tube & core) |
| GET/PUT/DELETE | `/api/network/cables/:id` | CRUD kabel by ID |
| GET | `/api/network/cores` | List core (filter: cableId/status/assignedToId) |
| POST | `/api/network/cores` | Manajemen core: `assign`/`release`/`reserve`/`mark_damaged` |

### Splice & Segments
| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/network/splices` | List splice (filter: deviceType/deviceId/status/spliceType) |
| POST | `/api/network/splices` | Buat splice baru |
| GET/PUT/DELETE | `/api/network/splices/:id` | CRUD splice by ID |

### Peta & Trace
| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/network/nodes` | Unified node registry semua tipe |
| POST | `/api/network/nodes` | Tambah node ke unified registry |
| GET | `/api/network/connections` | Semua cable_segments sebagai polylines peta |
| POST | `/api/network/auto-connect` | Smart connect: buat kabel+segmen otomatis antar 2 node |
| GET | `/api/network/fiber-paths` | List named fiber paths |
| POST | `/api/network/fiber-paths` | Buat fiber path |
| GET | `/api/network/fiber-paths/trace?from=X&to=Y` | BFS trace logical antar 2 node |
| GET | `/api/network/trace?coreId=X` | Physical trace dari core ID |
| GET | `/api/network/trace?deviceType=ODP&deviceId=X` | Physical trace dari device |

### Pelanggan & OLT
| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/network/customers/assign?customerId=X` | Cari ODP terdekat dengan port kosong |
| POST | `/api/network/customers/assign` | Assign pelanggan ke port ODP |
| GET | `/api/network/olt-routers` | List OLT-Router connections |
| GET/POST/PUT/DELETE | `/api/network/olts` | CRUD OLT |

---

## Status Roadmap di salfanet-radius

Fitur ini **belum diimplementasikan** di salfanet-radius. Untuk mengintegrasikan:

1. **Migrasi Prisma** — tambahkan semua model fiber (`fiber_cables`, `fiber_tubes`, `fiber_cores`, `splice_points`, `cable_segments`, `network_otbs`, `network_joint_closures`, `network_odcs`, `network_odps`, `odp_customer_assignments`, `network_fiber_paths`, `network_nodes`, `core_assignment_history`, `network_maintenance_history`) ke `prisma/schema.prisma`
2. **API Routes** — salin `billing-radius/src/app/api/network/` ke `src/app/api/network/`
3. **Pages** — salin `billing-radius/src/app/admin/network/` ke `src/app/admin/network/`
4. **Library** — salin `billing-radius/src/lib/network/` ke `src/lib/network/`
5. **Navigasi** — tambahkan menu "Network & Infrastruktur" di `src/app/admin/layout.tsx`
6. **Dependencies** — pastikan `leaflet`, `react-leaflet` sudah ada di `package.json`
