# Weekly Remediation Checklist (Audit-Driven)

> Last updated: 2026-03-28
> Horizon: 6 minggu
> Sumber: audit keamanan, kualitas kode, dan performa.

---

## Cara Pakai

- Jalankan per minggu dengan review di akhir minggu.
- Setiap item harus punya owner, bukti (PR/commit), dan status.
- Prioritas: `P0` (harus selesai), `P1` (sangat dianjurkan), `P2` (lanjutan).

---

## Minggu 1 - Security P0 (Critical)

- [x] Aktifkan verifikasi signature webhook payment (`P0`)
- [ ] Tutup command injection di endpoint admin/system (`P0`)
- [ ] Tutup shell injection di script execution path (`P0`)
- [ ] Tutup path traversal pada file API (`P0`)
- [x] Audit ulang seluruh endpoint update/deploy agar ada auth + role check (`P0`)
- [ ] Tambah negative test untuk payload berbahaya (`P0`)

Progress update (2026-03-28):
- Selesai: signature verification pada webhook agent deposit; role guard SUPER_ADMIN pada system update/info; auth wajib pada logout-log; hardening filename pada route logo upload serving.
- Lanjut: eliminasi sisa shell/command injection pattern dan audit endpoint file API lain agar path traversal benar-benar tertutup.

Target file prioritas minggu ini:
- [src/app/api/agent/deposit/webhook/route.ts](../../backend/src/app/api/agent/deposit/webhook/route.ts) - tambahkan signature/token verification per gateway.
- src/app/api/admin/system/update/route.ts - tambah role guard (minimal SUPER_ADMIN) dan kurangi shell string execution.
- [src/app/api/admin/system/info/route.ts](../../backend/src/app/api/admin/system/info/route.ts) - tambah role guard (minimal SUPER_ADMIN) dan review pemanggilan git/kill.
- [src/app/api/auth/logout-log/route.ts](../../frontend/src/app/api/auth/logout-log/route.ts) - wajibkan auth, jangan percaya role dari body.
- [src/app/api/uploads/logos/[filename]/route.ts](src/app/api/uploads/logos/[filename]/route.ts) - validasi filename allowlist + extension whitelist ketat.

Definition of done:
- Semua exploit kritikal tidak bisa direproduksi lagi di test env.

---

## Minggu 2 - Security P1 (High)

- [ ] Standarisasi middleware auth di semua route admin/agent (`P1`)
- [ ] Harden validasi input (zod/schema) di endpoint sensitif (`P1`)
- [ ] Review endpoint payment callback untuk idempotency (`P1`)
- [ ] Pastikan penyimpanan secret tidak plaintext (`P1`)
- [ ] Tambah test otorisasi: unauthorized, forbidden, role mismatch (`P1`)

Definition of done:
- Tidak ada endpoint sensitif yang bisa diakses tanpa otorisasi valid.

---

## Minggu 3 - Performance P0

- [ ] Lindungi endpoint export agar tidak load seluruh data ke RAM (`P0`)
- [ ] Terapkan pagination limit maksimum di list API (`P0`)
- [ ] Benahi pola N+1 query pada cron/service loop (`P0`)
- [ ] Tambahkan rate limit untuk endpoint berat/export (`P0`)
- [ ] Evaluasi dan sesuaikan connection pool Prisma (`P0`)

Definition of done:
- Endpoint berat memiliki guardrail dan tidak OOM di beban simulasi.

---

## Minggu 4 - Performance P1 + Reliability

- [ ] Jadwal cron diperhalus agar tidak backlog (`P1`)
- [ ] Tambah lock/guard supaya job yang sama tidak overlap (`P1`)
- [ ] Tambahkan retry + dead-letter style logging untuk job gagal (`P1`)
- [ ] Tambah metrik dasar: latency API, error rate, job failure (`P1`)

Definition of done:
- Cron stabil, tidak ada lonjakan antrian pada jam sibuk.

---

## Minggu 5 - Code Quality + DX

- [ ] Rapikan console log raw ke logger terstruktur (`P1`)
- [ ] Perbaiki null-safety dan error handling di service utama (`P1`)
- [ ] Pastikan route handler tipis (validate -> service -> response) (`P1`)
- [ ] Jalankan `npx tsc --noEmit`, `npm run test:run`, `npm run build` tanpa error (`P1`)
- [ ] Kurangi duplikasi util/proxy yang sudah obsolete (`P2`)

Definition of done:
- Build dan test green, readability service meningkat.

---

## Minggu 6 - Documentation Closure + Governance

- [ ] Buat status tracker fix security yang terhubung ke PR/commit (`P0`)
- [ ] Dokumentasikan API reference minimum per route group (`P1`)
- [ ] Dokumentasikan matrix permission RBAC (`P1`)
- [ ] Tambah `.env.example` + daftar env var wajib/opsional (`P1`)
- [ ] Final review terhadap `MASTER_AUDIT_REPORT.md` gap (`P1`)

Definition of done:
- Tim baru bisa onboarding tanpa knowledge transfer verbal berlebihan.

---

## Template Status Mingguan

Gunakan format ini pada weekly review:

- Minggu: `W1`
- Progress: `x/y item selesai`
- Blocker: `...`
- Risiko baru: `...`
- PR/Commit utama: `...`
- Keputusan: `lanjut / rollback / mitigasi`
