# Referensi SNMP OLT

Dokumen ini mencatat OID yang dipakai pemantauan OLT untuk C-Data, HSGQ, dan V-SOL, dari mana asalnya, dan **sejauh mana sudah diperiksa**. Kodenya ada di `backend/src/lib/olt/` (`profiles.ts`, `pon-snmp.ts`, `vendors/`).

## Status verifikasi

Tidak satu pun profil di bawah sudah dijalankan pada OLT sungguhan oleh penulisnya. Logika pembacaan (satuan daya, indeks, penggabungan tabel, pemilihan profil) sudah diuji dengan data SNMP tiruan yang meniru MIB. Nomor kolom berasal dari berkas MIB dan sumber komunitas. Karena itu setiap profil adalah **kandidat** yang divalidasi saat membaca, bukan jaminan.

| Merek | Sumber OID | Diperiksa pada perangkat? |
|---|---|---|
| NSCRTV GPON (17409.2.8.4) | MIB NSCRTV-FTTX-GPON, dan catatan lapangan FD1608S (V3.3.86) dan FD1601S (V3.2.5) di KusumaVision NMS | Oleh pihak lain, pada dua OLT GPON C-Data. Belum oleh proyek ini |
| NSCRTV EPON (17409.2.3.4) | MIB NSCRTV-FTTX-EPON, catatan lapangan C-Data EPON 258 ONU di KusumaVision NMS | Oleh pihak lain. Belum oleh proyek ini |
| C-Data FD-ONU (34592.1.3.4) | MIB FD-ONU-MIB revisi 2014 dan 2017 | Tidak. Tabel ini tidak ada di dua OLT GPON uji pihak lain |
| C-Data GPON (34592.1.5) | MIB CDATA-GPON-MIB | Dinilai tidak andal oleh pihak lain (FD1601S terbaca 0 ONU, FD1608S melaporkan 3 ONU online sebagai offline). Hanya pilihan terakhir |
| HSGQ (50224) | Tiga sumber komunitas yang tidak sepakat soal kolom status | Tidak, juga oleh sumbernya. Dipilih otomatis lewat penghitung ONU per PON |
| V-SOL V1600D (37950.1.1.5) | MIB V1600D | Tidak |
| V-SOL cabang 37950.1.1.6 | Tiket Observium OBS-4553 | Tidak |
| Hioso EPON (25355.3.2.6) | Modul lama proyek ini, NMS operator, dan KusumaVision NMS | Ya, pada HA7304, HA7304C, HA7304V, dan HA7302 oleh NMS operator dan KusumaVision. Belum oleh proyek ini |
| Hioso Telnet | NMS operator dan KusumaVision NMS | Ya, oleh keduanya. Sesi di proyek ini diuji dengan server Telnet tiruan |

## Cara memastikan di OLT Anda

Buka **Data OLT**, isi IP dan community, klik **Uji Koneksi** pada protokol SNMP. Pesan hasilnya menyebut merek yang terdeteksi, profil yang terbaca, dan jumlah ONU, misalnya `Merek: CDATA (profil fd-onu-2017). Terbaca 24 ONU, 21 online.` Kalau "tabel ONU belum terbaca", pilih merek manual atau kirim hasil `snmpwalk` ke pengembang.

Untuk melihat apa yang dijawab OLT:

```
snmpwalk -On -v2c -c <community> <ip> 1.3.6.1.2.1.1.2.0
snmpwalk -On -v2c -c <community> <ip> 1.3.6.1.4.1.17409.2.3.4.1.1.8
snmpwalk -On -v2c -c <community> <ip> 1.3.6.1.4.1.34592.1.3.4.1.1.11
```

## Pilihan merek di aplikasi

| Pilihan | Perilaku |
|---|---|
| Otomatis | Mengenali merek dari `sysDescr` dan nomor enterprise `sysObjectID`. Bila tidak dikenali, mencoba C-Data, HSGQ, V-SOL, lalu Hioso. Hasilnya diingat satu jam |
| C-Data FD11xx / FD16xx | Membaca seperti Hioso dan juga dari cabang C-Data (NSCRTV, FD-ONU, GPON C-Data), lalu memakai yang mendaftarkan lebih banyak ONU. Seri sama, tetap Hioso, sehingga OLT yang sudah terbaca lengkap tidak berubah. EPON dan GPON dibaca terpisah lalu digabung, untuk OLT XPON |
| HSGQ | Profil HSGQ |
| V-SOL | V1600D, lalu cabang 37950.1.1.6 |
| Hioso / C-Data | Pembacaan SNMP seperti sebelumnya, dengan perbaikan di bawah. Telnet kini memakai sesi khusus Hioso |

Pilihan lama yang sudah tersimpan (`hioso`, `cdata`, `c-data`) tetap valid. Sebelumnya `cdata` hanya nama lain untuk Hioso.

## Nomor enterprise

| Enterprise | Merek |
|---|---|
| 2011 | Huawei |
| 3902 | ZTE |
| 5875 | FiberHome |
| 3320 | BDCOM |
| 8886 | Raisecom |
| 25355 | Hioso |
| 17409 | NSCRTV (C-Data, Hioso, dan OLT China lain) |
| 34592 | C-Data |
| 37950 | V-SOL |
| 50224 | HSGQ |

## Membaca hasil Uji Koneksi

Setelah SNMP tersambung, Uji Koneksi menampilkan merek, jumlah ONU, dan satu baris per profil yang menjawab, misalnya:

```
- nscrtv-epon (EPON): 24 ONU; nama 24, serial 0, MAC 24, jarak 24, Rx 0, Tx 0, Rx sisi OLT 24
```

Angka setelah nama kolom adalah jumlah baris yang dikembalikan OLT. ONU 24 dengan Rx 0 berarti OLT tidak memberi daya sisi ONU lewat OID itu. Kolom yang kosong di sini bukan kesalahan tampilan: OLT memang tidak mengisinya lewat profil tersebut, atau nomor OID-nya berbeda di firmware itu.

## Daya Rx: dua sumber

Daya dibaca dari ONU (arah turun) bila ada. Bila ONU tidak melaporkannya, EPON NSCRTV memakai daya yang diukur OLT dari ONU itu (`ponOpRxPowerOfOnu`, arah naik, centi-dBm). Keduanya "Rx" di panel, tetapi bukan besaran yang sama. Nilai arah naik biasanya mirip, sehingga cukup untuk melihat ONU yang melemah, tetapi jangan dibandingkan langsung dengan angka dari ONU. Sumber tiap pembacaan dicatat di data ONU.

## Hioso

OID EPON (`25355.3.2.6`, indeks `{papan}.{PON}.{ONU}`): nama `.3.2.1.37`, MAC `.3.2.1.11` (12 digit heksa; `.12` cadangan), status link `.3.2.1.39` (1 = Up, 2 = Down), dying gasp `.3.2.1.41`, Rx `.14.2.1.8`, Tx `.14.2.1.4`, keduanya berupa teks dBm.

Yang dipelajari dari NMS yang sudah berjalan, dan kini dipakai:
- **Status dari link-state `.39`, bukan dari Rx.** Sebagian ONU tidak dilaporkan DDM-nya (Rx `na`) padahal link-nya Up. Menyimpulkan offline dari Rx menimbulkan alarm palsu.
- **Nama kosong datang sebagai octet string berisi nol**, dan nama yang tidak diisi adalah `NA`. Keduanya dianggap tidak ada nama.
- **Slot tak terdaftar muncul sebagai baris dengan MAC nol**, dan dilewati.
- **Dying gasp** dibaca dari `.41` dan hanya berlaku untuk ONU yang Down.
- **Suhu chassis** dari OID chassis (`25355.3.2.1.1.1.2.0` atau `25355.3.1.8.1.1.9` dalam seperseratus derajat), bukan suhu modul optik ONU pertama. Nilai 85 diabaikan karena itu konstanta sensor yang belum terpasang. Bila tidak ada, suhu modul optik dipakai seperti sebelumnya.
- **Keluarga tidak ditebak dari `sysDescr`.** Field itu sering kosong, jadi bila profil yang terdeteksi tidak menghasilkan ONU, EPON, GPON, lalu clone BDCOM dicoba.
- Jangan walk `25355.3.2.6.2.1`: puluhan ribu baris.
- HA7302 memakai satu ruang LLID datar (indeks `1.{ONU}`) dan tidak punya `Pon-Nni` di IF-MIB. `ifOperStatus` HA7304 tidak mewakili PON fisik, jadi tidak dipakai.

### Halaman web

Hioso punya antarmuka web (GoAhead). Halaman `/onuAllPonOnuList.asp` memuat semua ONU dari semua PON dalam satu permintaan sebagai larik JavaScript berisi kutipan tunggal, 22 kolom per ONU: id (`0/1:1`), nama, MAC, Up/Down, firmware, chip, port, RTT, suhu, Tx, Rx, alasan offline, dan penanda dying gasp. Autentikasi Basic dengan login OLT; permintaan pertama ke `/` membuka sesi.

Halaman ini dibaca bila username OLT diisi, lalu digabung dengan SNMP:
- Bila halaman memuat **lebih banyak** ONU daripada SNMP, SNMP dianggap parsial (HA7304V menggabungkan PON 2 sampai 4) dan halaman dipakai utuh.
- Bila jumlahnya sama atau lebih sedikit, **SNMP tetap dasar**, karena status link-nya acuan. Halaman hanya melengkapi yang kosong: nama, MAC, daya, dan jarak.
- Halaman tidak terbaca (kata sandi salah, port bukan 80, atau bukan Hioso): SNMP dipakai apa adanya dan satu peringatan dicatat.

**Jarak** dihitung dari kolom RTT halaman dengan rumus `rtt × 1,6393 − 157`, dikurangi 157 lagi bila hasilnya di atas 157. Itu rumus JavaScript firmware sebagaimana disalin NMS operator. Bandingkan satu ONU dengan halaman web OLT. Jarak dari SNMP (`.3.2.1.25`) tetap tidak diisi, karena KusumaVision menyebutnya sudah meter sedangkan NMS operator memperlakukannya sebagai RTT.

Port web tetap 80. Alasan offline `0` atau `1` dibaca sebagai LOS, dan penanda dying gasp `1` sebagai dying gasp.

Belum dipakai karena sumbernya tidak sepakat: **jarak dari SNMP**. KusumaVision menyebut `.3.2.1.25` sudah dalam meter (contoh 1935), sedangkan NMS operator menghitungnya dari counter RTT dengan rumus `rtt × 1,6393 − 157`. Salah satunya keliru; bandingkan satu ONU dengan halaman web OLT sebelum jarak diisi.

### Telnet

Urutan yang dipakai (sesi `backend/src/lib/olt/hioso-telnet.ts`, tanpa `expect` atau biner `telnet`):
1. Sambung, jawab negosiasi opsi Telnet (HA7302 menahan banner sampai dijawab).
2. Tunggu `Username:` (sampai 15 detik), kirim username dengan **CRLF** (LF saja tidak dianggap Enter).
3. Jawab setiap `Password:` dengan password yang sama (login, Access, Enable). Saat prompt `EPON>`, kirim `enable` sampai prompt `EPON#`.
4. `show onu info epon <basis>/<PON> all`, dengan basis 0 pada firmware baru dan 1 pada firmware "V" lama. Bila basis 0 ditolak, basis 1 dicoba. Pindai berhenti di PON pertama yang ditolak.
5. Halaman panjang diberi `--- Enter Key To Continue ----`; dijawab dengan Enter, dan backspace penghapusnya dibuang.

Kolom keluaran: OnuId, MacAddress, Status (Up/Down), Firmware, ChipId, Ge, Fe, Pots, CtcStatus, CtcVer, Activate, Uptime, Name. Telnet memberi identitas dan status link, tidak ada daya optik; daya tetap dari SNMP. Klien Telnet bersama (`telnet.ts`) tidak bisa dipakai untuk Hioso: ia tidak mengirim `enable`, tidak mengenal pager ini, dan perintahnya berbeda.

## Hal yang menjebak

**Posisi ONU C-Data ada di namanya.** Pada GPON C-Data, indeks ONU adalah nomor urut global yang dimulai dari `0x480001`, jadi posisi dan label pelanggan dibaca dari nama `gpon 0/0/3 onu 5 label`. EPON C-Data juga memakai nama (`epon 0/1/3 onu 5 label`), dengan cadangan decode indeks: byte atas = slot, **nibble atas byte ketiga + 1 = port**, byte bawah = nomor ONU. Rilis 5.40.x menerjemahkan indeks GPON seperti EPON, sehingga alamat ONU-nya tidak bermakna; 5.41.0 memperbaikinya.

**Nama C-Data bisa berupa heksa berpadding NUL.** Firmware FD1608S mengirim sebagian nama sebagai Hex-STRING yang diakhiri byte nol. Dipotong di NUL pertama.

**Rx -1 berarti offline** pada GPON C-Data, bukan -0,01 dBm. Pembacaan di atas -1 dBm tidak pernah dianggap Rx ONU.

**`sysObjectID` 17409 dipakai GPON maupun EPON C-Data.** Jenisnya ditentukan dari tabel mana yang berisi ONU, bukan dari sysObjectID. Kolom `.103` di tabel GPON berisi penyebab mati (`LOS`, `dying-gasp`).

**Kolom "serial" EPON C-Data berisi MAC.** Kolom `.28` sama dengan `.7` pada 258 ONU, jadi tidak dipakai sebagai serial.

**Nomor kolom berbeda antar revisi MIB.** FD-ONU-MIB revisi 2017 menaruh daya Rx di kolom `.36`, revisi 2014 di `.35`. Kolom Tx yang berdekatan juga berisi angka yang masuk akal. Karena itu pembaca menolak profil yang daya Rx-nya mayoritas positif (itu Tx), dan profil tanpa satu pun pembacaan daya hanya dipakai bila tidak ada yang lebih baik.

**Arti status berbeda per merek.** Pada C-Data FD, `DeviceStatus` adalah notPresent(1), offline(2), online(3), normal(4), abnormal(5), jadi online berarti 3 sampai 5, bukan 1. Pada NSCRTV, V-SOL, dan HSGQ, 1 berarti online.

**Indeks NSCRTV adalah satu angka 32-bit.** Satu byte tiap untuk perangkat OLT, kartu, port PON, dan nomor ONU. Tabel daya NSCRTV memakai tiga bagian indeks (perangkat, kartu, port) sedangkan tabel ONU satu, jadi keduanya digabung lewat bagian pertama.

**Kolom Rx GPON di sheet berbeda dari MIB.** Sheet OID C-Data menulis Rx GPON di `...2.8.4.4.1.3`. Pada NSCRTV-FTTX-GPON-MIB, kolom 3 adalah indeks port, dan Rx ada di kolom 4.

**OLT XPON memuat EPON dan GPON sekaligus.** Satu chassis bisa menjawab di pohon EPON dan GPON. Pembaca memilih profil terbaik per teknologi lalu menggabungkan hasilnya, bukan berhenti pada teknologi pertama yang menjawab.

**Satuan daya.** NSCRTV memakai sepersepuluh puluhan dBm (centi-dBm): `-1234` berarti -12,34 dBm. Kolom yang berupa teks (C-Data GPON, V-SOL) membawa satuannya. Pembacaan di luar -50 sampai +10 dBm dianggap tidak ada sinyal.

## HSGQ dan jalur lain

HSGQ adalah merek yang paling sedikit terdokumentasi. Ada dua skema tabel (`50224.3.12` dan `50224.3.3`), indeksnya `0x01000000 | PON << 8 | ONU`, dan tiga sumber menyebut kolom status yang berbeda. Keempat kombinasi dicoba dan dipilih yang jumlah ONU online-nya sama dengan penghitung OLT sendiri (`50224.3.2.3.1.4`). CPU dan memori dibaca dengan GET persis (`50224.3.1.1.17` dan `.18`); subtree sistem di sekitarnya menyimpan kredensial yang bisa dibaca dengan community baca, jadi tidak pernah di-walk. Beberapa proyek komunitas tidak memakai SNMP untuk HSGQ, tetapi membaca API web bawaan OLT (login sesi lalu JSON) atau Telnet. Itu menandakan sebagian model atau firmware HSGQ menyediakan sedikit data lewat SNMP. Jika Uji Koneksi tidak menemukan ONU pada HSGQ Anda, jalur API web atau Telnet bisa menjadi langkah berikutnya. Proyek-proyek itu tidak berlisensi, jadi kodenya tidak dipakai; yang dipelajari hanya cara kerja perangkatnya.

## Sumber

- MIB resmi dalam kumpulan MIB LibreNMS: [cdata](https://github.com/librenms/librenms/tree/master/mibs/cdata), [vsolution](https://github.com/librenms/librenms/tree/master/mibs/vsolution)
- [NSCRTV-EPON-ONU-MIB di Observium](https://mibs.observium.org/mib/NSCRTV-EPON-ONU-MIB/tables) dan [FD-ONU-MIB di Observium](https://mibs.observium.org/mib/FD-ONU-MIB/)
- [Tiket Observium OBS-4553](https://jira.observium.org/browse/OBS-4553) (OID V-SOL)
- [OLT_MGMT](https://github.com/Kim-puL/OLT_MGMT) (tabel OID HSGQ dan Hioso)
- [olt-redaman-api](https://github.com/ukhin101/olt-redaman-api) (cara kerja HSGQ dan Hioso, dipelajari saja)
- [nms-ztec320](https://github.com/s4lfanet/nms-ztec320) (NMS operator, MIT): adapter Hioso, C-Data GPON, dan tabel OID
- [KusumaVision NMS](https://github.com/Masamune21-dev/KusumaVisionNMS) (MIT): panduan Hioso, C-Data, dan HSGQ, serta catatan snmpwalk C-Data GPON
