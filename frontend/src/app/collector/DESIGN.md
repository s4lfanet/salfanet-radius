# DESIGN.md: Portal Kolektor

Arah desain untuk `frontend/src/app/collector` (web, dibuka kolektor di HP).

## Arah yang disepakati pemilik produk

Dikonfirmasi 23 Oktober 2026: portal kolektor mengikuti `mobile/admin_app/DESIGN.md`
apa adanya, termasuk warna biru/indigo, supaya semua portal staf terlihat satu
produk. Semua yang tertulis di sana berlaku di sini; file ini hanya mencatat apa
yang khusus untuk kolektor.

## Dial

`ENERGY 2 / RHYTHM 2 / MOTION 1` (sama dengan aplikasi admin).

## Identitas

Alat kerja penagih lapangan. Satu sesi biasanya: buka di HP di depan rumah
pelanggan, cari satu nama, tandai lunas atau catat janji bayar, lanjut ke rumah
berikutnya. Pertanyaan utama dashboard: "berapa yang belum tertagih bulan ini".

## Turunan dari aplikasi admin

- Warna inti biru `#2563EB` (tombol utama, tautan aktif, fokus); indigo
  `#4F46E5` hanya di lencana merek halaman login.
- Status: hijau = lunas/aktif, kuning tua = janji bayar/pending,
  merah = isolir/belum bayar lewat jatuh tempo. Shade -700 di tema terang,
  -400 di tema gelap.
- Huruf Plus Jakarta Sans.
- Radius: 16 kartu, 12 tombol dan kolom isian, 999 hanya lencana status.
- Tanpa bayangan; kartu bergaris tepi 1px di atas latar abu muda.
- Motif: kotak membulat bertint berisi ikon dengan rona kategori/status.
- Terang dan gelap sama-sama didukung (tombol tema di bilah atas).
