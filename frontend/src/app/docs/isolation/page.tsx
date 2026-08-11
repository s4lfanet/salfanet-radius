import Link from 'next/link';

export const metadata = {
  title: 'Isolation System — SALFANET RADIUS Documentation',
  description: 'Dokumentasi lengkap sistem isolasi otomatis untuk PPPoE users yang masa berlangganannya habis.',
};

export default function IsolationDocsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/settings/isolation" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
            ← Kembali ke Isolation Settings
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Isolation System
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Dokumentasi lengkap sistem isolasi otomatis untuk PPPoE users yang masa berlangganannya habis (expired).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-200">FreeRADIUS</span>
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-200">MikroTik</span>
            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-purple-900 dark:text-purple-200">PPPoE</span>
            <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-orange-900 dark:text-orange-200">Cron Job</span>
          </div>
        </div>

        {/* TOC */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Daftar Isi</h2>
          <ol className="space-y-1 text-sm text-blue-600 dark:text-blue-400">
            {[
              'Gambaran Umum',
              'Alur Kerja Lengkap',
              'Komponen Sistem',
              'Cron Job — Auto Isolir',
              'Konfigurasi MikroTik',
              'Konfigurasi FreeRADIUS',
              'Database & Status PPPoE User',
              'Halaman Isolated (Customer-Facing)',
              'Pengaturan Isolasi di Admin Panel',
              'Troubleshooting',
              'Perbedaan Status: isolated vs blocked vs stop',
            ].map((item, i) => (
              <li key={i}>
                <a href={`#section-${i + 1}`} className="hover:underline">
                  {i + 1}. {item}
                </a>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-10 text-gray-800 dark:text-gray-200">

          {/* Section 1 */}
          <section id="section-1">
            <SectionTitle number={1} title="Gambaran Umum" />
            <Prose>
              <p>
                Sistem isolasi bekerja dengan cara <strong>membatasi akses internet</strong> user yang sudah expired —
                bukan memblokir login sepenuhnya. User tetap bisa connect PPPoE, namun:
              </p>
              <ul>
                <li>Mendapat IP dari <Code>pool-isolir</Code> (misal: <Code>192.168.200.x</Code>) bukan IP normal</li>
                <li>Bandwidth dibatasi (misal: <Code>64k/64k</Code>)</li>
                <li>Semua HTTP/HTTPS di-redirect ke halaman <Code>/isolated</Code> (halaman pembayaran)</li>
                <li>Hanya boleh akses DNS, payment gateway, dan billing server</li>
              </ul>
              <p>
                Setelah user melakukan pembayaran dan invoice terverifikasi, status kembali ke <Code>active</Code> dan
                isolasi otomatis dicabut.
              </p>
            </Prose>
          </section>

          {/* Section 2 */}
          <section id="section-2">
            <SectionTitle number={2} title="Alur Kerja Lengkap" />
            <CodeBlock>{`1. CRON JOB (setiap jam)
   └─► Cek pppoe_users WHERE status='active' AND expiredAt < CURDATE()
   
2. UNTUK SETIAP USER EXPIRED:
   ├─► Update status: active → isolated
   ├─► Radcheck: Cleartext-Password TETAP ADA (user boleh login!)
   ├─► Radcheck: HAPUS Auth-Type:Reject
   ├─► Radusergroup: Pindah ke group 'isolir'
   ├─► Radreply: HAPUS Framed-IP-Address (IP statis dicopot)
   ├─► MikroTik API: Disconnect session aktif
   └─► Notifikasi: WhatsApp/Email ke user

3. USER RECONNECT PPPoE:
   ├─► FreeRADIUS: Auth sukses (password OK)
   ├─► FreeRADIUS: Assign PPP profile 'isolir'
   ├─► MikroTik: Rate-limit 64k/64k
   └─► MikroTik: IP dari pool-isolir (192.168.200.x)

4. USER BUKA BROWSER:
   ├─► MikroTik NAT: Redirect HTTP(80) & HTTPS(443) ke billing server
   ├─► Next.js Middleware (proxy.ts): Deteksi IP dari isolation pool
   └─► Redirect ke /isolated?ip=192.168.200.x

5. HALAMAN /isolated:
   ├─► Tampilkan info akun (nama, expired date)
   ├─► Tampilkan invoice belum dibayar + link pembayaran
   └─► Tampilkan kontak support

6. SETELAH PEMBAYARAN:
   ├─► Invoice status: PENDING → PAID
   ├─► Status user: isolated → active
   ├─► Radusergroup: Kembali ke group/profile normal
   └─► User perlu reconnect PPPoE untuk akses penuh`}</CodeBlock>
          </section>

          {/* Section 3 */}
          <section id="section-3">
            <SectionTitle number={3} title="Komponen Sistem" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    {['Komponen', 'File', 'Peran'].map(h => (
                      <th key={h} className="text-left px-4 py-2 font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    ['Cron Job', 'cron-service.js', 'Trigger isolasi setiap jam'],
                    ['Isolir Logic', 'src/lib/cron/pppoe-sync.ts', 'Logika isolasi PPPoE users'],
                    ['Cron API', 'src/app/api/cron/route.ts', 'Endpoint handler cron job'],
                    ['Settings API', 'src/app/api/settings/isolation/route.ts', 'GET/PUT isolation settings'],
                    ['Check API', 'src/app/api/pppoe/users/check-isolation/route.ts', 'Cek status isolasi by username/IP (publik)'],
                    ['Middleware', 'src/proxy.ts', 'Deteksi IP isolasi & redirect'],
                    ['Isolation Settings', 'src/lib/isolation-settings.ts', 'Cache settings dari DB'],
                    ['Isolated Page', 'src/app/isolated/page.tsx', 'Halaman customer-facing'],
                    ['Admin Settings', 'src/app/admin/settings/isolation/page.tsx', 'Halaman konfigurasi admin'],
                    ['MikroTik Scripts', 'src/app/admin/settings/isolation/mikrotik/page.tsx', 'Generator script MikroTik'],
                  ].map(([comp, file, role]) => (
                    <tr key={comp} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-2 font-medium border border-gray-200 dark:border-gray-700">{comp}</td>
                      <td className="px-4 py-2 font-mono text-xs text-blue-700 dark:text-blue-300 border border-gray-200 dark:border-gray-700">{file}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4 */}
          <section id="section-4">
            <SectionTitle number={4} title="Cron Job — Auto Isolir" />
            <Prose>
              <p><strong>Schedule:</strong> <Code>0 * * * *</Code> — Setiap jam tepat (00 menit)</p>
              <p>Cron job berjalan di <Code>salfanet-cron</Code> (PM2) dan memanggil API endpoint <Code>POST /api/cron</Code> dengan <Code>type: "pppoe_auto_isolir"</Code>.</p>
            </Prose>
            <h3 className="font-semibold text-lg mt-4 mb-2">Yang Dilakukan Per User Expired</h3>
            <CodeBlock>{`// 1. Update status → 'isolated'
// 2. Cleartext-Password tetap di radcheck (allow login!)
// 3. Hapus Auth-Type:Reject dari radcheck
// 4. Hapus Reply-Message dari radreply
// 5. Pindah ke radusergroup 'isolir'
// 6. Hapus Framed-IP-Address dari radreply
// 7. Disconnect via MikroTik API (port 8728/8729)
// 8. Fallback: CoA disconnect jika MikroTik API gagal
// 9. Update radacct: set acctstoptime=NOW()
// 10. Kirim notifikasi WhatsApp/Email`}</CodeBlock>
            <h3 className="font-semibold text-lg mt-4 mb-2">Manual Trigger</h3>
            <CodeBlock>{`# Via API
curl -X POST http://localhost:3000/api/cron \\
  -H "Content-Type: application/json" \\
  -d '{"type": "pppoe_auto_isolir"}'`}</CodeBlock>
            <h3 className="font-semibold text-lg mt-4 mb-2">Cek Log Cron</h3>
            <CodeBlock>{`pm2 logs salfanet-cron --lines 50

# Contoh log sukses:
# [CRON] Running PPPoE Auto Isolir (attempt 1/3)...
# [PPPoE Auto-Isolir] Found 3 expired user(s) to isolate
# ✅ [PPPoE Auto-Isolir] User john123 isolated
# [CRON] PPPoE Auto Isolir completed: ✓ Isolated 3/3 users`}</CodeBlock>
          </section>

          {/* Section 5 */}
          <section id="section-5">
            <SectionTitle number={5} title="Konfigurasi MikroTik" />
            <InfoBox type="warning">
              Script lengkap bisa di-generate otomatis dari <strong>Admin Panel → Settings → Isolation → MikroTik Setup</strong>
            </InfoBox>

            <h3 className="font-semibold text-lg mt-4 mb-2">Script 1: IP Pool</h3>
            <CodeBlock>{`/ip pool
add name=pool-isolir ranges=192.168.200.2-192.168.200.254 \\
    comment="IP Pool untuk user yang diisolir"`}</CodeBlock>

            <h3 className="font-semibold text-lg mt-4 mb-2">Script 2: PPP Profile</h3>
            <CodeBlock>{`/ppp profile
add name=isolir \\
    local-address=pool-isolir \\
    remote-address=pool-isolir \\
    rate-limit=64k/64k \\
    comment="Profile untuk user yang diisolir"`}</CodeBlock>
            <InfoBox type="info">
              Name profile <strong>HARUS</strong> <Code>isolir</Code> karena sistem menulis <Code>isolir</Code> ke tabel <Code>radusergroup</Code>. FreeRADIUS membaca dari sini untuk menentukan PPP profile yang digunakan.
            </InfoBox>

            <h3 className="font-semibold text-lg mt-4 mb-2">Script 3: Firewall Filter</h3>
            <CodeBlock>{`/ip firewall filter
# Allow DNS untuk user isolir
add chain=forward src-address=192.168.200.0/24 \\
    protocol=udp dst-port=53 action=accept \\
    comment="Allow DNS for isolated users"

# Allow ICMP (ping)
add chain=forward src-address=192.168.200.0/24 \\
    protocol=icmp action=accept \\
    comment="Allow ping for isolated users"

# Allow billing server — GANTI DENGAN IP ADDRESS SERVER!
add chain=forward src-address=192.168.200.0/24 \\
    dst-address=103.x.x.x action=accept \\
    comment="Allow access to billing server"

# Allow payment gateway
add chain=forward src-address=192.168.200.0/24 \\
    dst-address-list=payment-gateways action=accept \\
    comment="Allow access to payment gateways"

# Block semua akses internet lainnya
add chain=forward src-address=192.168.200.0/24 \\
    action=drop \\
    comment="Block internet for isolated users"`}</CodeBlock>

            <h3 className="font-semibold text-lg mt-4 mb-2">Script 4: Firewall NAT (Redirect)</h3>
            <CodeBlock>{`/ip firewall nat
# Redirect HTTP — GANTI 103.x.x.x DENGAN IP SERVER!
add chain=dstnat src-address=192.168.200.0/24 \\
    protocol=tcp dst-port=80 \\
    dst-address=!103.x.x.x dst-address-list=!payment-gateways \\
    action=dst-nat to-addresses=103.x.x.x to-ports=80 \\
    comment="Redirect HTTP to isolation page"

add chain=dstnat src-address=192.168.200.0/24 \\
    protocol=tcp dst-port=443 \\
    dst-address=!103.x.x.x dst-address-list=!payment-gateways \\
    action=dst-nat to-addresses=103.x.x.x to-ports=443 \\
    comment="Redirect HTTPS to isolation page"`}</CodeBlock>
          </section>

          {/* Section 6 */}
          <section id="section-6">
            <SectionTitle number={6} title="Konfigurasi FreeRADIUS" />
            <h3 className="font-semibold text-lg mt-4 mb-2">Tabel yang Digunakan</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    {['Tabel', 'Attribute', 'Nilai saat Isolated'].map(h => (
                      <th key={h} className="text-left px-4 py-2 font-semibold border border-gray-200 dark:border-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    ['radcheck', 'Cleartext-Password', 'Password user (tetap ada)'],
                    ['radcheck', 'Auth-Type', 'DIHAPUS (allow login)'],
                    ['radusergroup', 'groupname', 'isolir'],
                    ['radgroupreply', 'Mikrotik-Rate-Limit (group isolir)', '64k/64k'],
                    ['radgroupreply', 'Framed-Pool (group isolir)', 'pool-isolir'],
                    ['radreply', 'Framed-IP-Address', 'DIHAPUS (pakai pool)'],
                  ].map(([tabel, attr, val]) => (
                    <tr key={attr} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-2 font-mono text-xs border border-gray-200 dark:border-gray-700">{tabel}</td>
                      <td className="px-4 py-2 font-mono text-xs text-blue-700 dark:text-blue-300 border border-gray-200 dark:border-gray-700">{attr}</td>
                      <td className="px-4 py-2 border border-gray-200 dark:border-gray-700">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="font-semibold text-lg mt-4 mb-2">Setup radgroupreply untuk Group 'isolir'</h3>
            <CodeBlock>{`INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
('isolir', 'Framed-Pool', ':=', 'pool-isolir'),
('isolir', 'Mikrotik-Rate-Limit', ':=', '64k/64k'),
('isolir', 'Session-Timeout', ':=', '3600');`}</CodeBlock>
          </section>

          {/* Section 7 */}
          <section id="section-7">
            <SectionTitle number={7} title="Database & Status PPPoE User" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    {['Status', 'Bisa Login RADIUS', 'Akses Internet', 'Keterangan'].map(h => (
                      <th key={h} className="text-left px-4 py-2 font-semibold border border-gray-200 dark:border-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    ['active', '✅ Ya', '✅ Penuh', 'Berlangganan aktif normal'],
                    ['isolated', '✅ Ya', '⚠️ Terbatas', 'Expired, redirect ke /isolated. Group: isolir, IP: pool-isolir, BW: 64k/64k'],
                    ['blocked', '❌ Tidak', '❌ Tidak ada', 'Diblokir manual oleh admin (Auth-Type:Reject)'],
                    ['stop', '❌ Tidak', '❌ Tidak ada', 'Dihentikan (tagihan lama, Auth-Type:Reject)'],
                  ].map(([status, login, akses, ket]) => (
                    <tr key={status} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-2 font-mono font-bold border border-gray-200 dark:border-gray-700">{status}</td>
                      <td className="px-4 py-2 border border-gray-200 dark:border-gray-700">{login}</td>
                      <td className="px-4 py-2 border border-gray-200 dark:border-gray-700">{akses}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{ket}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="font-semibold text-lg mt-4 mb-2">SQL yang Dijalankan Saat Isolasi</h3>
            <CodeBlock>{`-- 1. radusergroup: Pindah ke group isolir
DELETE FROM radusergroup WHERE username = 'john123';
INSERT INTO radusergroup (username, groupname, priority) 
VALUES ('john123', 'isolir', 1);

-- 2. radcheck: Pastikan password ada, hapus reject
-- (Cleartext-Password tetap ada — user BOLEH login)
DELETE FROM radcheck WHERE username = 'john123' AND attribute = 'Auth-Type';

-- 3. radreply: Hapus IP statis (pakai pool)
DELETE FROM radreply WHERE username = 'john123' AND attribute = 'Framed-IP-Address';`}</CodeBlock>
          </section>

          {/* Section 8 */}
          <section id="section-8">
            <SectionTitle number={8} title="Halaman Isolated (Customer-Facing)" />
            <Prose>
              <p>URL halaman isolasi:</p>
            </Prose>
            <CodeBlock>{`https://domain-anda.com/isolated?ip=192.168.200.50
# atau
https://domain-anda.com/isolated?username=john123`}</CodeBlock>
            <h3 className="font-semibold text-lg mt-4 mb-2">Cara Redirect Terjadi</h3>
            <CodeBlock>{`1. MikroTik NAT intercept HTTP/HTTPS dari IP isolation pool
2. Request diteruskan ke billing server (103.x.x.x:80/443)
3. Next.js Middleware (proxy.ts) deteksi source IP dari isolation pool
4. Middleware redirect ke /isolated?ip=192.168.200.x
5. Halaman /isolated tampilkan info akun + invoice + tombol bayar`}</CodeBlock>
            <InfoBox type="info">
              API <Code>/api/pppoe/users/check-isolation</Code> bersifat <strong>publik</strong> (tidak butuh login admin) karena diakses oleh customer yang sedang diisolasi untuk melihat info akun dan invoice mereka sendiri.
            </InfoBox>
          </section>

          {/* Section 9 */}
          <section id="section-9">
            <SectionTitle number={9} title="Pengaturan Isolasi di Admin Panel" />
            <Prose><p>Lokasi: <strong>Admin Panel → Settings → Isolation</strong></p></Prose>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    {['Setting', 'Default', 'Keterangan'].map(h => (
                      <th key={h} className="text-left px-4 py-2 font-semibold border border-gray-200 dark:border-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    ['isolationEnabled', 'true', 'Aktifkan/matikan auto-isolasi'],
                    ['isolationIpPool', '192.168.200.0/24', 'CIDR pool IP untuk user isolated'],
                    ['isolationRateLimit', '64k/64k', 'Bandwidth limit format MikroTik'],
                    ['isolationRedirectUrl', '{baseUrl}/isolated', 'URL redirect halaman isolasi'],
                    ['isolationMessage', '(teks default)', 'Pesan yang ditampilkan ke user'],
                    ['isolationAllowDns', 'true', 'User isolated boleh query DNS'],
                    ['isolationAllowPayment', 'true', 'User isolated boleh akses payment gateway'],
                    ['isolationNotifyWhatsapp', 'true', 'Kirim notif WhatsApp saat isolasi'],
                    ['isolationNotifyEmail', 'false', 'Kirim notif email saat isolasi'],
                    ['gracePeriodDays', '0', 'Hari toleransi setelah expired sebelum diisolir'],
                  ].map(([setting, def, ket]) => (
                    <tr key={setting} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-2 font-mono text-xs text-blue-700 dark:text-blue-300 border border-gray-200 dark:border-gray-700">{setting}</td>
                      <td className="px-4 py-2 font-mono text-xs border border-gray-200 dark:border-gray-700">{def}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{ket}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 10 */}
          <section id="section-10">
            <SectionTitle number={10} title="Troubleshooting" />

            <TroubleshootBlock title="User Expired Tidak Diisolir">
              <CodeBlock>{`# 1. Cek apakah cron berjalan
pm2 logs salfanet-cron --lines 100 | grep "Auto Isolir"

# 2. Trigger manual
curl -X POST http://localhost:3000/api/cron \\
  -H "Content-Type: application/json" \\
  -d '{"type": "pppoe_auto_isolir"}'

# 3. Cek database
SELECT username, status, expiredAt 
FROM pppoe_users 
WHERE status = 'active' AND expiredAt < CURDATE();`}</CodeBlock>
            </TroubleshootBlock>

            <TroubleshootBlock title="User Isolated Masih Bisa Akses Internet">
              <CodeBlock>{`# Di MikroTik — cek apakah user dapat IP dari pool-isolir
/ppp active print where name=USERNAME

# Cek radusergroup
SELECT * FROM radusergroup WHERE username = 'USERNAME';
-- Harus: groupname = 'isolir'

# Pastikan user reconnect setelah diisolir!`}</CodeBlock>
            </TroubleshootBlock>

            <TroubleshootBlock title="Halaman /isolated Tidak Muncul">
              <CodeBlock>{`# Cek rule NAT MikroTik
/ip firewall nat print

# Cek apakah user dapat IP dari pool-isolir
/ip pool used print where pool=pool-isolir

# Cek middleware log
pm2 logs salfanet-radius --lines 20 | grep PROXY`}</CodeBlock>
            </TroubleshootBlock>

            <TroubleshootBlock title="Info User Tidak Muncul di Halaman /isolated">
              <CodeBlock>{`# Test endpoint langsung
curl "https://domain-anda.com/api/pppoe/users/check-isolation?ip=192.168.200.50"

# Pastikan user sudah reconnect PPPoE setelah diisolir
# (IP lama mungkin belum diupdate di radacct)`}</CodeBlock>
            </TroubleshootBlock>

            <TroubleshootBlock title="Setelah Bayar, User Masih Terisolasi">
              <CodeBlock>{`# Cek status di database
SELECT status FROM pppoe_users WHERE username = 'USERNAME';
SELECT groupname FROM radusergroup WHERE username = 'USERNAME';
SELECT attribute, value FROM radreply WHERE username = 'USERNAME';

# User HARUS disconnect dan reconnect PPPoE setelah pembayaran!`}</CodeBlock>
            </TroubleshootBlock>
          </section>

          {/* Section 11 */}
          <section id="section-11">
            <SectionTitle number={11} title="Perbedaan Status: isolated vs blocked vs stop" />
            <InfoBox type="info">
              <strong>Kenapa isolated TIDAK menggunakan Auth-Type:Reject?</strong>
              <br /><br />
              Berbeda dengan <Code>blocked</Code>/<Code>stop</Code>, user <Code>isolated</Code> <strong>masih boleh login</strong> PPPoE karena:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Mereka perlu connect untuk bisa melihat halaman pembayaran</li>
                <li>Tanpa connect, mereka tidak tahu harus bayar ke mana</li>
                <li>Sistem membatasi akses via MikroTik (IP pool + firewall), bukan via RADIUS reject</li>
              </ul>
            </InfoBox>
            <CodeBlock>{`ALUR SINGKAT:
expiredAt < hari ini
└──► (Cron setiap jam)
     └──► status = isolated
          └──► radusergroup = 'isolir'
               └──► (User reconnect)
                    └──► IP: 192.168.200.x
                         └──► (Browser)
                              └──► MikroTik NAT redirect → /isolated
                                   └──► User bayar invoice
                                        └──► status = active
                                             └──► (Reconnect PPPoE)
                                                  └──► Internet penuh ✅`}</CodeBlock>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>SALFANET RADIUS — Isolation System Documentation</p>
          <Link href="/admin/settings/isolation" className="text-blue-600 hover:underline mt-1 inline-block">
            ← Kembali ke Isolation Settings
          </Link>
        </div>

      </div>
    </div>
  );
}

// ─── Component helpers ───────────────────────────────────────────────────

function SectionTitle({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
        {number}
      </span>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-2 text-gray-700 dark:text-gray-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-gray-100 dark:bg-gray-800 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded text-xs font-mono">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-xs font-mono leading-relaxed mt-2 mb-4 whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function InfoBox({ type, children }: { type: 'info' | 'warning'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-200',
    warning: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200',
  };
  return (
    <div className={`border rounded-lg p-4 my-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

function TroubleshootBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="font-semibold text-base text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
        <span className="text-red-500">●</span> {title}
      </h3>
      {children}
    </div>
  );
}
