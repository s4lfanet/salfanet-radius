'use client';

import { useState } from 'react';
import {
  BookOpen,
  Cpu,
  Settings2,
  FileCode2,
  Sliders,
  AlertTriangle,
  ListChecks,
  Code2,
  Zap,
  Wifi,
  RefreshCw,
  Server,
  Shield,
  Bug,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lightbulb,
} from 'lucide-react';
import { GenieACSLayout } from '@/components/genieacs/GenieACSLayout';

type SectionId =
  | 'overview'
  | 'setup'
  | 'ont-config'
  | 'devices'
  | 'wifi'
  | 'tasks'
  | 'virtual-parameters'
  | 'parameter-config'
  | 'presets'
  | 'vp-scripts'
  | 'provisions'
  | 'faults'
  | 'config'
  | 'troubleshooting'
  | 'security';

const SECTIONS: { id: SectionId; label: string; icon: typeof BookOpen }[] = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'setup', label: 'Setup GenieACS', icon: Server },
  { id: 'ont-config', label: 'ONT Configuration', icon: Cpu },
  { id: 'devices', label: 'Device Management', icon: Cpu },
  { id: 'wifi', label: 'WiFi Configuration', icon: Wifi },
  { id: 'tasks', label: 'Task Monitoring', icon: ListChecks },
  { id: 'virtual-parameters', label: 'Virtual Parameters', icon: Sliders },
  { id: 'parameter-config', label: 'Parameter Config', icon: Settings2 },
  { id: 'presets', label: 'Presets', icon: Settings2 },
  { id: 'vp-scripts', label: 'VP Scripts', icon: Code2 },
  { id: 'provisions', label: 'Provisions', icon: FileCode2 },
  { id: 'faults', label: 'Faults', icon: AlertTriangle },
  { id: 'config', label: 'GenieACS Config', icon: Settings2 },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: Bug },
  { id: 'security', label: 'Security', icon: Shield },
];

function CodeBlock({ children, lang }: { children: string; lang?: string }) {
  return (
    <pre className="mt-2 mb-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100 dark:bg-gray-950">
      {lang && <span className="mb-1 block text-xs text-gray-500">{lang}</span>}
      <code>{children}</code>
    </pre>
  );
}

function InfoBox({ type, children }: { type: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
    warning:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    tip: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300',
  };
  const icons = { info: 'ℹ️', warning: '⚠️', tip: '💡' };
  return (
    <div className={`my-3 rounded-lg border p-3 text-sm ${styles[type]}`}>
      <span className="mr-1">{icons[type]}</span>
      {children}
    </div>
  );
}

function Collapsible({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && <div className="mt-2 pl-2">{children}</div>}
    </div>
  );
}

function Section({ id }: { id: SectionId }) {
  switch (id) {
    case 'overview':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>
            GenieACS adalah server TR-069 (CWMP) untuk manajemen perangkat CPE/ONT secara remote. Integrasi ini
            memungkinkan monitoring dan konfigurasi perangkat pelanggan langsung dari Salfanet Radius.
          </p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Menu yang Tersedia</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b text-gray-500">
                <tr>
                  <th className="py-2 pr-4">Menu</th>
                  <th className="py-2 pr-4">Path</th>
                  <th className="py-2">Deskripsi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                <tr><td className="py-2 pr-4 font-medium">Devices</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/devices</td><td className="py-2">Lihat & kelola semua perangkat CPE</td></tr>
                <tr><td className="py-2 pr-4 font-medium">Tasks</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/tasks</td><td className="py-2">Monitor antrian task TR-069</td></tr>
                <tr><td className="py-2 pr-4 font-medium">Virtual Parameters</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/virtual-parameters</td><td className="py-2">Kelola virtual parameter GenieACS</td></tr>
                <tr><td className="py-2 pr-4 font-medium">Parameter Config</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/parameter-config</td><td className="py-2">Konfigurasi tampilan parameter di device list & detail</td></tr>
                <tr><td className="py-2 pr-4 font-medium">Presets</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/presets</td><td className="py-2">Kelola preset (auto-applied config)</td></tr>
                <tr><td className="py-2 pr-4 font-medium">VP Scripts</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/vp-scripts</td><td className="py-2">VP scripts dengan sync status & backup</td></tr>
                <tr><td className="py-2 pr-4 font-medium">Provisions</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/provisions</td><td className="py-2">Kelola provision scripts</td></tr>
                <tr><td className="py-2 pr-4 font-medium">Faults</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/faults</td><td className="py-2">Lihat & hapus fault perangkat</td></tr>
                <tr><td className="py-2 pr-4 font-medium">Config</td><td className="py-2 pr-4 font-mono text-xs">/admin/genieacs/config</td><td className="py-2">Konfigurasi runtime GenieACS</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'setup':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <h4 className="font-semibold text-gray-900 dark:text-white">1. Install GenieACS</h4>
          <p>Install GenieACS di server terpisah atau VPS yang sama:</p>
          <CodeBlock lang="bash">{`# Install MongoDB
sudo apt install -y mongodb

# Install GenieACS
sudo npm install -g genieacs`}</CodeBlock>

          <h4 className="font-semibold text-gray-900 dark:text-white">2. Buat Config File</h4>
          <p>Buat file <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">/opt/genieacs/config.json</code>:</p>
          <CodeBlock lang="json">{`{
  "MONGODB_CONNECTION_URL": "mongodb://127.0.0.1:27017/genieacs",
  "CWMP_INTERFACE": "0.0.0.0",
  "CWMP_PORT": 7547,
  "NBI_INTERFACE": "0.0.0.0",
  "NBI_PORT": 7557,
  "FS_INTERFACE": "0.0.0.0",
  "FS_PORT": 7567,
  "UI_INTERFACE": "0.0.0.0",
  "UI_PORT": 3000,
  "LOG_LEVEL": "info"
}`}</CodeBlock>

          <h4 className="font-semibold text-gray-900 dark:text-white">3. Buat Systemd Services</h4>
          <p>Buat 4 service files: <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">genieacs-cwmp</code>, <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">genieacs-nbi</code>, <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">genieacs-fs</code>, <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">genieacs-ui</code></p>
          <CodeBlock lang="bash">{`sudo systemctl daemon-reload
sudo systemctl enable genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
sudo systemctl start genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui

# Check status
sudo systemctl status genieacs-*`}</CodeBlock>

          <h4 className="font-semibold text-gray-900 dark:text-white">4. Konfigurasi di Salfanet Radius</h4>
          <p>Buka <strong>Admin → Settings → GenieACS</strong> dan isi:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>GenieACS URL</strong>: <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">http://IP_GENIEACS:7557</code> (port NBI)</li>
            <li><strong>Username/Password</strong>: Kosongkan jika tidak ada auth</li>
          </ul>
          <p>Klik <strong>Test Connection</strong> untuk verifikasi.</p>
        </div>
      );

    case 'ont-config':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <h4 className="font-semibold text-gray-900 dark:text-white">Konfigurasi TR-069 di ONT (Huawei HG8145V5)</h4>
          <ol className="ml-4 list-decimal space-y-2">
            <li>Login ke web interface ONT (biasanya <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">192.168.100.1</code>)</li>
            <li>Buka <strong>Management → TR-069 Configuration</strong></li>
            <li>Set:
              <ul className="ml-4 list-disc space-y-1 mt-1">
                <li><strong>ACS URL</strong>: <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">http://IP_GENIEACS:7547/</code></li>
                <li><strong>Periodic Inform Enable</strong>: Yes</li>
                <li><strong>Periodic Inform Interval</strong>: 300 (5 menit)</li>
                <li><strong>Connection Request Username</strong>: admin</li>
                <li><strong>Connection Request Password</strong>: admin</li>
              </ul>
            </li>
            <li>Klik <strong>Apply</strong> dan tunggu device muncul di GenieACS</li>
          </ol>
          <InfoBox type="warning">
            Jika Connection Request tidak berfungsi, perubahan akan tetap diterapkan pada periodic inform berikutnya (setiap 5 menit).
          </InfoBox>
        </div>
      );

    case 'devices':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → Devices</strong></p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Fitur</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li>Lihat semua perangkat terdaftar</li>
            <li>Status real-time (Online/Offline)</li>
            <li>Detail perangkat: serial number, model, PPPoE, RX power, WiFi</li>
          </ul>
          <h4 className="font-semibold text-gray-900 dark:text-white">Aksi</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Force Sync</strong> - Trigger connection request langsung</li>
            <li><strong>Refresh Parameters</strong> - Ambil data terbaru</li>
            <li><strong>Reboot</strong> - Restart perangkat remote</li>
            <li><strong>Edit WiFi</strong> - Konfigurasi SSID & password</li>
          </ul>
        </div>
      );

    case 'wifi':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Klik device → <strong>Edit WiFi</strong></p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Parameter yang Didukung</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>SSID</strong> - Nama jaringan (1-32 karakter)</li>
            <li><strong>Security Mode</strong>: None, WPA-PSK, WPA2-PSK (rekomendasi), WPA/WPA2-PSK</li>
            <li><strong>Password</strong> - 8-63 karakter</li>
            <li><strong>Enable/Disable</strong> - ON/OFF WiFi</li>
          </ul>
          <h4 className="font-semibold text-gray-900 dark:text-white">Cara Kerja</h4>
          <ol className="ml-4 list-decimal space-y-1">
            <li>User klik "Update WiFi"</li>
            <li>API membuat task <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">setParameterValues</code></li>
            <li>GenieACS mengirim connection request ke device</li>
            <li>Device connect dan menerima task</li>
            <li>Parameter diterapkan langsung</li>
          </ol>
          <InfoBox type="tip">
            Untuk Huawei HG8145V5, gunakan <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">KeyPassphrase</code> bukan <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">PreSharedKey.1.KeyPassphrase</code>
          </InfoBox>
        </div>
      );

    case 'tasks':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → Tasks</strong></p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Fitur</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li>Real-time task list dengan status</li>
            <li>Auto-refresh setiap 10 detik (toggle on/off)</li>
            <li>Filter status: All / Pending / Fault / Done</li>
          </ul>
          <h4 className="font-semibold text-gray-900 dark:text-white">Status Task</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong className="text-yellow-600">Pending</strong> - Menunggu device connect</li>
            <li><strong className="text-green-600">Done</strong> - Berhasil dieksekusi</li>
            <li><strong className="text-red-600">Fault</strong> - Error, cek detail</li>
          </ul>
          <h4 className="font-semibold text-gray-900 dark:text-white">Aksi</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Retry</strong> - Eksekusi ulang task yang gagal</li>
            <li><strong>Delete</strong> - Hapus task dari antrian</li>
          </ul>
        </div>
      );

    case 'virtual-parameters':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → Virtual Parameters</strong></p>
          <p>
            Virtual parameter adalah script GenieACS yang menghitung atau mengekspos data perangkat
            (mis. PPPoE IP, RX Power, WiFi password). Disimpan langsung di GenieACS via NBI API.
          </p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Format Data</h4>
          <CodeBlock lang="json">{`{
  "_id": "pppoeIP",
  "script": "// JavaScript code that returns {writable, value}"
}`}</CodeBlock>
          <h4 className="font-semibold text-gray-900 dark:text-white">Contoh VP Script (RX Power)</h4>
          <CodeBlock lang="javascript">{`let huawei = declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower", {value: Date.now()});
let m = "N/A";
for (let p of huawei) {
  if (p.value[0]) { m = p.value[0]; break; }
}
return {writable: false, value: [m, "xsd:string"]};`}</CodeBlock>
        </div>
      );

    case 'parameter-config':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → Parameter Config</strong></p>
          <p>Konfigurasi parameter yang muncul di <strong>Device List</strong> dan <strong>Device Detail</strong>.</p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Fitur</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li>Dua tab: <strong>DEVICE_LIST</strong> (kolom tabel) & <strong>DEVICE_DETAIL</strong> (section detail)</li>
            <li>Add/edit/remove parameter display</li>
            <li>Drag-and-drop reordering</li>
            <li>Enable/disable individual parameter</li>
            <li>Virtual parameters dari GenieACS tersedia di dropdown</li>
            <li>Reset ke default</li>
          </ul>
        </div>
      );

    case 'presets':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → Presets</strong></p>
          <p>
            Preset adalah aturan konfigurasi yang otomatis diterapkan ke perangkat yang memenuhi kriteria tertentu.
          </p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Struktur Preset</h4>
          <CodeBlock lang="json">{`{
  "_id": "preset-name",
  "weight": 0,
  "channel": "default",
  "precondition": "",
  "configurations": [],
  "events": {}
}`}</CodeBlock>
          <h4 className="font-semibold text-gray-900 dark:text-white">Field</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>_id</strong> - Nama preset unik</li>
            <li><strong>weight</strong> - Prioritas (lebih rendah = lebih tinggi)</li>
            <li><strong>channel</strong> - Channel komunikasi</li>
            <li><strong>precondition</strong> - JavaScript expression (harus true)</li>
            <li><strong>configurations</strong> - Array parameter/provision config</li>
            <li><strong>events</strong> - Event triggers (mis. <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">bootstrap: true</code>)</li>
          </ul>
        </div>
      );

    case 'vp-scripts':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → VP Scripts</strong></p>
          <p>
            VP Scripts adalah interface enhanced untuk virtual parameters dengan sync tracking, backup/restore,
            dan integrasi GenieACS. Script disimpan lokal di database dan di-sync ke GenieACS.
          </p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Fitur</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li>List VP scripts dengan sync status badge</li>
            <li>Create/edit/delete VP script</li>
            <li>Sync individual atau sync all ke GenieACS</li>
            <li>Backup & restore VP scripts</li>
            <li>Auto-generate VP dari device parameters</li>
          </ul>
          <h4 className="font-semibold text-gray-900 dark:text-white">Sync Status</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong className="text-green-600">Synced</strong> - Berhasil di-sync ke GenieACS</li>
            <li><strong className="text-yellow-600">Pending</strong> - Belum di-sync</li>
            <li><strong className="text-red-600">Error</strong> - Sync gagal (cek <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">syncError</code>)</li>
          </ul>
          <InfoBox type="tip">
            Auto-generate VP: Buka <strong>Devices</strong> → klik device → <strong>Parameters</strong> → pilih parameter → klik <strong>Generate VP</strong>
          </InfoBox>
        </div>
      );

    case 'provisions':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → Provisions</strong></p>
          <p>
            Provision adalah JavaScript script yang dieksekusi GenieACS saat provisioning. Bisa set parameter,
            declare dependencies, dan run custom logic.
          </p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Contoh Provision Script</h4>
          <CodeBlock lang="javascript">{`// Set WiFi SSID for 2.4GHz
declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
  {value: Date.now()},
  {value: "MyNetwork"});`}</CodeBlock>
        </div>
      );

    case 'faults':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → Faults</strong></p>
          <p>Lihat fault yang terjadi saat komunikasi dengan perangkat.</p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Field Fault</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>device</strong> - Device ID yang trigger fault</li>
            <li><strong>code</strong> - TR-069 error code (mis. <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">cwmp.9002</code>)</li>
            <li><strong>message</strong> - Deskripsi error</li>
            <li><strong>timestamp</strong> - Waktu fault</li>
            <li><strong>retries</strong> - Jumlah retry</li>
          </ul>
        </div>
      );

    case 'config':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Buka <strong>Admin → GenieACS → Config</strong></p>
          <p>View dan edit konfigurasi runtime GenieACS via NBI API.</p>
          <h4 className="font-semibold text-gray-900 dark:text-white">Common Config Keys</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><code className="rounded bg-gray-200 px-1 dark:bg-gray-700">cwmp.queue_threshold</code> - Max CWMP queue size</li>
            <li><code className="rounded bg-gray-200 px-1 dark:bg-gray-700">cwmp.connection_request_timeout</code> - Timeout (ms)</li>
            <li><code className="rounded bg-gray-200 px-1 dark:bg-gray-700">nbi.max_commit_interval</code> - Max NBI commit interval</li>
          </ul>
          <InfoBox type="warning">
            Mengubah config dapat mempengaruhi perilaku GenieACS. Hanya ubah jika memahami konsekuensinya.
          </InfoBox>
        </div>
      );

    case 'troubleshooting':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <Collapsible title="Device Tidak Muncul di GenieACS">
            <ul className="ml-4 list-disc space-y-1">
              <li>Cek konfigurasi TR-069 di ONT</li>
              <li>Verifikasi ACS URL: <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">http://GENIEACS_IP:7547/</code></li>
              <li>Cek firewall - port 7547 harus terbuka</li>
              <li>Cek service: <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">systemctl status genieacs-cwmp</code></li>
              <li>View logs: <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">journalctl -u genieacs-cwmp -f</code></li>
            </ul>
          </Collapsible>
          <Collapsible title="Task Stuck di Pending">
            <p className="mb-2">Penyebab:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Connection request URL tidak berfungsi (device behind NAT)</li>
              <li>Firewall memblokir connection request</li>
              <li>Device offline</li>
            </ul>
            <p className="mt-2 mb-1">Solusi:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Tunggu periodic inform (5 menit default)</li>
              <li>Setup port forwarding jika behind NAT</li>
              <li>Klik "Force Sync" untuk retry</li>
            </ul>
          </Collapsible>
          <Collapsible title="Error cwmp.9002 - Internal Error">
            <p className="mb-2">Penyebab:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Wrong parameter path</li>
              <li>Parameter read-only</li>
              <li>Value tidak sesuai type</li>
            </ul>
            <p className="mt-2 mb-1">Solusi:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Cek device data model di GenieACS UI</li>
              <li>Verifikasi parameter writable</li>
              <li>Untuk Huawei HG8145V5: gunakan <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">KeyPassphrase</code></li>
            </ul>
          </Collapsible>
          <Collapsible title="Connection Request Failed">
            <p className="mb-2">Test dari GenieACS server:</p>
            <CodeBlock lang="bash">{`curl -v http://DEVICE_IP:7547/
# Expected: HTTP 401 Unauthorized (device responds)
# If timeout: Device not reachable`}</CodeBlock>
            <p className="mt-2">Solusi:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Verifikasi Connection Request URL di device</li>
              <li>Cek firewall device</li>
              <li>Setup port forwarding jika behind NAT</li>
            </ul>
          </Collapsible>
          <Collapsible title="Cek Log GenieACS">
            <CodeBlock lang="bash">{`# CWMP service (device connections)
journalctl -u genieacs-cwmp -f

# NBI service (API)
journalctl -u genieacs-nbi -f

# UI service
journalctl -u genieacs-ui -f`}</CodeBlock>
          </Collapsible>
        </div>
      );

    case 'security':
      return (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <h4 className="font-semibold text-gray-900 dark:text-white">Best Practices</h4>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>HTTPS</strong> - Setup reverse proxy dengan SSL</li>
            <li><strong>Authentication</strong> - Konfigurasi username/password di GenieACS</li>
            <li><strong>Firewall</strong> - Hanya buka port yang necessary</li>
            <li><strong>VPN</strong> - Untuk akses GenieACS yang aman</li>
            <li><strong>Regular Updates</strong> - Update GenieACS secara berkala</li>
          </ul>
          <h4 className="font-semibold text-gray-900 dark:text-white">Nginx Reverse Proxy (HTTPS)</h4>
          <CodeBlock lang="nginx">{`server {
    listen 443 ssl http2;
    server_name genieacs.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/genieacs.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/genieacs.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:7557/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`}</CodeBlock>
        </div>
      );

    default:
      return null;
  }
}

export default function GenieACSGuidePage() {
  const [active, setActive] = useState<SectionId>('overview');

  return (
    <GenieACSLayout title="Panduan GenieACS">
      <div className="flex gap-6">
        {/* Section nav */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Panduan
          </p>
          <nav className="space-y-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const isActive = active === id;
              return (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile section selector */}
        <div className="lg:hidden w-full mb-4">
          <select
            value={active}
            onChange={(e) => setActive(e.target.value as SectionId)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {SECTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
              {(() => {
                const section = SECTIONS.find((s) => s.id === active);
                if (!section) return null;
                const Icon = section.icon;
                return (
                  <>
                    <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{section.label}</h2>
                  </>
                );
              })()}
            </div>
            <Section id={active} />
          </div>

          {/* Navigation buttons */}
          <div className="mt-4 flex justify-between">
            {(() => {
              const idx = SECTIONS.findIndex((s) => s.id === active);
              const prev = idx > 0 ? SECTIONS[idx - 1] : null;
              const next = idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null;
              return (
                <>
                  {prev ? (
                    <button
                      onClick={() => setActive(prev.id)}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      ← {prev.label}
                    </button>
                  ) : (
                    <span />
                  )}
                  {next ? (
                    <button
                      onClick={() => setActive(next.id)}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      {next.label} →
                    </button>
                  ) : (
                    <span />
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </GenieACSLayout>
  );
}
