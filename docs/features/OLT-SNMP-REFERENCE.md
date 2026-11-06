# Referensi SNMP OLT

Dokumen ini mencatat OID yang dipakai pemantauan OLT untuk C-Data, HSGQ, dan V-SOL, dari mana asalnya, dan **sejauh mana sudah diperiksa**. Kodenya ada di `backend/src/lib/olt/` (`profiles.ts`, `pon-snmp.ts`, `vendors/`).

## Status verifikasi

Tidak satu pun profil di bawah sudah dijalankan pada OLT sungguhan oleh penulisnya. Logika pembacaan (satuan daya, indeks, penggabungan tabel, pemilihan profil) sudah diuji dengan data SNMP tiruan yang meniru MIB. Nomor kolom berasal dari berkas MIB dan sumber komunitas. Karena itu setiap profil adalah **kandidat** yang divalidasi saat membaca, bukan jaminan.

| Merek | Sumber OID | Diperiksa pada perangkat? |
|---|---|---|
| NSCRTV EPON / GPON (17409) | MIB NSCRTV-FTTX-EPON/GPON, sheet OID C-Data dari operator; tabel EPON juga dipakai driver Hioso komunitas pada HA7304 | Tidak |
| C-Data FD-ONU (34592.1.3.4) | MIB FD-ONU-MIB revisi 2014 dan 2017 | Tidak |
| C-Data GPON (34592.1.5) | MIB CDATA-GPON-MIB | Tidak |
| HSGQ (50224) | Tabel OID proyek OLT_MGMT | Tidak |
| V-SOL V1600D (37950.1.1.5) | MIB V1600D | Tidak |
| V-SOL cabang 37950.1.1.6 | Tiket Observium OBS-4553 | Tidak |
| Hioso (25355) | Modul lama proyek ini; OID yang sama muncul di dua proyek komunitas | Dikatakan terverifikasi di produksi oleh modul lama |

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
| C-Data FD11xx / FD16xx | Membaca seperti Hioso dulu, supaya OLT yang sudah berjalan tidak berubah. Bila kosong, mencoba NSCRTV, FD-ONU, dan GPON C-Data |
| HSGQ | Profil HSGQ |
| V-SOL | V1600D, lalu cabang 37950.1.1.6 |
| Hioso / C-Data | Tidak berubah |

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

## Hal yang menjebak

**Nomor kolom berbeda antar revisi MIB.** FD-ONU-MIB revisi 2017 menaruh daya Rx di kolom `.36`, revisi 2014 di `.35`. Kolom Tx yang berdekatan juga berisi angka yang masuk akal. Karena itu pembaca menolak profil yang daya Rx-nya mayoritas positif (itu Tx), dan profil tanpa satu pun pembacaan daya hanya dipakai bila tidak ada yang lebih baik.

**Arti status berbeda per merek.** Pada C-Data FD, `DeviceStatus` adalah notPresent(1), offline(2), online(3), normal(4), abnormal(5), jadi online berarti 3 sampai 5, bukan 1. Pada NSCRTV, V-SOL, dan HSGQ, 1 berarti online.

**Indeks NSCRTV adalah satu angka 32-bit.** Satu byte tiap untuk perangkat OLT, kartu, port PON, dan nomor ONU. Tabel daya NSCRTV memakai tiga bagian indeks (perangkat, kartu, port) sedangkan tabel ONU satu, jadi keduanya digabung lewat bagian pertama.

**Kolom Rx GPON di sheet berbeda dari MIB.** Sheet OID C-Data menulis Rx GPON di `...2.8.4.4.1.3`. Pada NSCRTV-FTTX-GPON-MIB, kolom 3 adalah indeks port, dan Rx ada di kolom 4.

**Satuan daya.** NSCRTV memakai sepersepuluh puluhan dBm (centi-dBm): `-1234` berarti -12,34 dBm. Kolom yang berupa teks (C-Data GPON, V-SOL) membawa satuannya. Pembacaan di luar -50 sampai +10 dBm dianggap tidak ada sinyal.

## HSGQ dan jalur lain

HSGQ adalah merek yang paling sedikit terdokumentasi. Beberapa proyek komunitas tidak memakai SNMP untuk HSGQ, tetapi membaca API web bawaan OLT (login sesi lalu JSON) atau Telnet. Itu menandakan sebagian model atau firmware HSGQ menyediakan sedikit data lewat SNMP. Jika Uji Koneksi tidak menemukan ONU pada HSGQ Anda, jalur API web atau Telnet bisa menjadi langkah berikutnya. Proyek-proyek itu tidak berlisensi, jadi kodenya tidak dipakai; yang dipelajari hanya cara kerja perangkatnya.

## Sumber

- MIB resmi dalam kumpulan MIB LibreNMS: [cdata](https://github.com/librenms/librenms/tree/master/mibs/cdata), [vsolution](https://github.com/librenms/librenms/tree/master/mibs/vsolution)
- [NSCRTV-EPON-ONU-MIB di Observium](https://mibs.observium.org/mib/NSCRTV-EPON-ONU-MIB/tables) dan [FD-ONU-MIB di Observium](https://mibs.observium.org/mib/FD-ONU-MIB/)
- [Tiket Observium OBS-4553](https://jira.observium.org/browse/OBS-4553) (OID V-SOL)
- [OLT_MGMT](https://github.com/Kim-puL/OLT_MGMT) (tabel OID HSGQ dan Hioso)
- [olt-redaman-api](https://github.com/ukhin101/olt-redaman-api) (cara kerja HSGQ dan Hioso, dipelajari saja)
