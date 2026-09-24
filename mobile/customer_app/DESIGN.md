# DESIGN.md — Aplikasi Pelanggan Salfanet Radius

Arah desain untuk `mobile/customer_app`. Aplikasi web punya tema sendiri (cyberpunk);
dokumen ini hanya mengatur aplikasi Android native.

Dipakai bersama `.claude/skills/antislop/SKILL.md` sebagai filter. Dokumen ini yang
memberi arah, filter itu yang menolak slop.

---

## Keputusan pemilik produk

Dijawab langsung oleh pemilik, 24 September 2026:

1. **Rasa aplikasi: tenang dan terpercaya.** Kartu bersih berlapis, satu warna brand
   sebagai jangkar, ikon kategori berwarna per fungsi. Bukan meniru satu produk
   tertentu.
2. **Warna aksen diambil otomatis dari logo perusahaan.** Setiap ISP yang memasang
   Salfanet Radius punya logo sendiri, jadi aplikasi mengambil warnanya dari logo itu.
   Kalau logo gagal dibaca atau warnanya nyaris abu-abu, jatuh ke biru `#465FFF`.
3. **Ikon harus lebih berwarna.** Keluhan awal: tampilan lama terlalu datar, semua ikon
   satu warna.

## Identitas

Aplikasi tagihan dan layanan mandiri untuk pelanggan internet rumahan. Pemakaian
khasnya pendek dan berulang: cek sisa masa aktif, bayar tagihan, ganti password WiFi,
lapor gangguan. Bukan aplikasi yang dibuka untuk dinikmati, tapi untuk diselesaikan.

Konsekuensinya: kejelasan menang atas ekspresi. Angka yang dicari pelanggan harus
jadi elemen terbesar di layarnya.

## Dial

`ENERGY 2 / RHYTHM 2 / MOTION 1`

- **ENERGY 2** — "profesional" menolak level 1 yang datar seperti situs layanan publik,
  "warna menarik" menolak level 3 yang ramai seperti portofolio agensi.
- **RHYTHM 2** — beranda memang bervariasi (kartu status, carousel, grid menu, daftar),
  tapi layar daftar seperti tagihan dan tiket sengaja seragam supaya cepat dipindai.
- **MOTION 1** — umpan balik tekan saja. Satu pengecualian tertulis: carousel promo
  berputar otomatis karena banner kedua dan ketiga tidak punya cara lain untuk terlihat,
  dan putaran itu berhenti begitu pelanggan menggeser sendiri.

## Warna

**Palet inti:** satu warna brand (dari logo operator) + netral permukaan. Itu saja.

**Lapisan kedua, warna kategori.** Setiap tujuan punya satu rona tetap yang mengikutinya
ke mana pun: di grid menu beranda, di daftar "Lainnya", dan di kepala layar fitur itu
sendiri. Rona ini bukan hiasan, tapi penanda arah: pelanggan hafal "yang hijau itu Top Up"
tanpa membaca labelnya.

Yang menjaganya tidak jadi pelangi acak: perlakuan tilenya identik (bentuk, ukuran,
kekuatan tint sama), ronanya diambil dari satu set tetap, dan tidak ada rona di luar set.

| Tujuan | Rona | Alasan |
|---|---|---|
| Tagihan | biru | pekerjaan utama aplikasi, dekat dengan warna brand |
| Top Up | hijau | saldo masuk |
| WiFi | sian | jaringan dan perangkat |
| Tiket | ungu | bantuan manusia |
| Upgrade | kuning tua | naik tingkat |
| Perpanjang | teal | kelanjutan langganan |
| Referral | merah muda | ajakan sosial |
| Speed Test | jingga | pengukuran |
| Suspend | abu batu | jeda, sengaja diredam |

**Warna status** (lunas, terlambat, menunggu verifikasi) terpisah dari keduanya dan tidak
ikut berubah mengikuti logo, karena artinya tetap: hijau selalu berarti beres, merah selalu
berarti bermasalah. Warna status selalu ditemani teks, tidak pernah warna saja.

## Tipografi

**Plus Jakarta Sans**, dipaketkan dalam APK (bukan diunduh saat jalan, karena pelanggan
sering ada di jaringan buruk).

Alasan memilihnya: huruf ini dibuat sebagai tipografi identitas kota Jakarta, jadi ia
membawa asal Indonesia untuk pelanggan Indonesia. Secara praktis, tinggi x-nya besar dan
angkanya jelas dibedakan, dan isi aplikasi ini sebagian besar memang angka: rupiah,
tanggal jatuh tempo, sisa hari, kecepatan.

Tidak memakai huruf bawaan Flutter (Roboto) karena bawaan bukan pilihan, dan tidak memakai
Inter, Geist, atau Space Grotesk yang jadi pilihan refleks model AI.

## Bentuk

Radius dipakai bertingkat, bukan satu nilai untuk semua:

- 24 — kartu status utama di beranda, satu-satunya yang sebesar itu
- 16 — kartu isi dan tile menu
- 12 — tombol dan kolom isian
- 999 — hanya lencana status, karena bentuk pil memang bahasa lencana

Bayangan hampir tidak dipakai. Kedalaman datang dari permukaan bertingkat (`surface`,
`surfaceContainer`, `surfaceContainerHigh`), bukan dari semua elemen yang mengambang.

## Motif

Satu bentuk yang diulang: **kotak membulat bertint berisi ikon dengan rona kategorinya.**
Muncul di grid menu beranda, di setiap baris daftar "Lainnya", dan di kepala layar fitur.
Itu yang membuat layar-layar ini terasa satu keluarga.

Pola kedua, tipografis: **label kecil diredam di atas angka besar tebal.** Dipakai di kartu
status, kartu pemakaian, ringkasan referral, dan detail tagihan.

## Yang sengaja tidak dipakai

- Gradien sebagai warna utama, khususnya biru ke ungu
- Glassmorphism dan glow
- Latar grid, blueprint, atau titik-titik
- Emoji di dalam antarmuka
- Angka atau klaim yang tidak berasal dari API
