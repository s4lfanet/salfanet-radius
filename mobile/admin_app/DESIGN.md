# DESIGN.md — Aplikasi Admin Salfanet Radius

Arah desain untuk `mobile/admin_app`. Dipakai bersama
`.claude/skills/antislop/SKILL.md` sebagai filter: dokumen ini memberi arah,
filter itu menolak slop.

Berbeda dari `mobile/customer_app/DESIGN.md`: aplikasi itu dipakai pelanggan
sesekali sehari untuk urusan akun sendiri. Aplikasi ini dipakai staf
(customer service, teknisi, finance, super admin) berulang-ulang sepanjang
jam kerja untuk menangani banyak pelanggan sekaligus — jadi kepadatan
informasi dan kecepatan scan menang, bukan kehangatan.

## Arah yang disepakati pemilik produk

Dikonfirmasi 28 September 2026: rasa "profesional-tegas" — bukan datar kaku
seperti situs layanan publik (dial 1), bukan juga ramai seperti portofolio
agensi (dial 3). Tetap pakai warna brand biru/indigo yang sudah berjalan di
panel admin web, tetap pakai Plus Jakarta Sans yang sama dengan customer_app,
layar daftar dibuat seragam supaya cepat dipindai, animasi diminimalkan.

## Dial

`ENERGY 2 / RHYTHM 2 / MOTION 1`

- **ENERGY 2** — alat kerja operasional harian, bukan brosur. Warna dan kartu
  boleh percaya diri (mengikuti identitas panel admin web), tapi tidak ada
  dekorasi yang tidak menopang keterbacaan data.
- **RHYTHM 2** — Dashboard bervariasi (grid statistik, kartu pendapatan,
  status sistem). Layar daftar (Pelanggan, Tagihan, Registrasi, Notifikasi)
  sengaja seragam antar-baris karena staf memindai puluhan-ratusan baris per
  hari; variasi di situ hanya memperlambat mata.
- **MOTION 1** — umpan balik tekan dan transisi halaman bawaan Flutter saja.
  Tidak ada animasi hias; staf butuh aksi selesai secepat mungkin, bukan
  ditonton.

## Identitas

Alat kerja untuk menangani pelanggan PPPoE/hotspot: menyetujui registrasi,
mengisolir/mengaktifkan langganan, menandai tagihan lunas, memeriksa status
jaringan. Satu sesi pakai biasanya singkat dan berulang: buka, cari satu
pelanggan atau satu tagihan, lakukan satu aksi, tutup.

## Warna

**Inti:** biru `#2563EB` + indigo `#4F46E5` — bukan pilihan reflex AI, ini
warna gradien yang sudah dipakai halaman login panel admin web
(`frontend/src/app/admin/login/page.tsx`) sejak sebelum aplikasi native ini
ada. Dipertahankan supaya staf yang bolak-balik antara web dan aplikasi
melihat identitas yang sama, bukan dua produk berbeda.

**Warna status** dipakai ulang dari makna yang sudah staf hafal dari panel
web (hijau = lunas/aktif, kuning tua = pending/isolir, merah = overdue/stop).
Ini bukan skema dekoratif baru; mengubahnya berarti staf harus menghafal
ulang warna yang sama artinya.

## Tipografi

**Plus Jakarta Sans** — sama dengan `customer_app`, dengan alasan yang sama:
x-height besar dan angka jelas dibedakan (aplikasi ini isinya rupiah, nomor
invoice, tanggal jatuh tempo), dipaketkan dalam APK (staf sering di lokasi
pelanggan dengan sinyal buruk). Dipertahankan lintas aplikasi supaya kedua
APK terasa satu keluarga produk, bukan karena ini pilihan default model AI.

## Bentuk

Radius bertingkat, bukan satu nilai untuk semua:

- 20 — lencana merek di layar login
- 16 — kartu dan tile daftar
- 12 — tombol dan kolom isian
- 999 — hanya lencana status (bentuk pil memang bahasa status)

Bayangan tidak dipakai. Kartu diberi garis tepi 1px di atas latar abu muda:
tanpa garis, kartu putih di atas latar hampir putih tidak punya tepi yang
terlihat (audit-003 #13).

## Terang / gelap

Staf memilih sendiri di Profil & Pengaturan (Ikuti HP / Terang / Gelap).
Kedua tema dibangun dari definisi komponen yang sama; yang berbeda hanya
paletnya. Warna status punya dua shade: -700 untuk tema terang, -400 untuk
tema gelap, karena shade terang yang lolos kontras di atas putih hanya ±3:1
di atas latar gelap. Semua pasangan teks/latar diverifikasi ≥4,5:1 (WCAG AA)
di kedua tema — lihat audit-003.

## Susunan layar

- **Daftar:** kotak cari → baris filter → baris `EntityTile` seragam. Setiap
  baris bisa diketuk dan membuka detail lengkap.
- **Detail:** kartu kepala (ikon, nama, status, satu angka utama) → bagian
  berlabel berisi baris label/nilai → tombol aksi di bilah bawah. Tombol
  utama selalu di kanan, terisi; aksi kedua di kiri, bergaris.
- **Dashboard:** dibangun di sekitar pertanyaan "apa yang perlu saya urus
  hari ini" — blok Perlu Tindakan adalah isi utama, bukan deretan kartu
  statistik. Setiap angka membuka daftar di baliknya.

## Motif

Kotak membulat bertint berisi ikon dengan rona kategori/status — dipakai
ulang di kartu statistik Dashboard, avatar baris daftar Pelanggan, dan grid
menu "Lainnya". Sama dengan motif `customer_app` secara sengaja: satu bahasa
visual yang dikenali lintas kedua aplikasi.

## Yang sengaja tidak dipakai

- Gradien sebagai warna latar utama (gradien brand hanya dipakai di lencana
  login, elemen tunggal)
- Glassmorphism dan glow
- Latar grid, blueprint, atau titik-titik
- Emoji di dalam antarmuka
- Angka atau klaim yang tidak berasal dari API
- Ikon generik (sparkle, magic, robot) — ikon dipilih dari makna fungsinya
