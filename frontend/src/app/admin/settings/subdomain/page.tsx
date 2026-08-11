'use client';
import { useState, useEffect } from 'react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { Globe, Copy, CheckCircle, AlertCircle, Info, Wifi, Shield } from 'lucide-react';

interface CompanySettings {
  baseUrl: string;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:bg-muted text-muted-foreground ml-2"
    >
      {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Tersalin' : label}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-900 text-green-300 text-[11px] rounded-lg p-4 overflow-x-auto whitespace-pre font-mono leading-5">
      {children}
    </pre>
  );
}

const PORTALS = [
  {
    label: 'Admin Portal',
    subdomains: ['admin'],
    path: '/admin',
    desc: 'Halaman manajemen utama — hanya untuk admin & staf',
    icon: '🛡️',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  },
  {
    label: 'Portal Pelanggan',
    subdomains: ['customer', 'pelanggan'],
    path: '/customer',
    desc: 'Halaman self-service pelanggan — cek tagihan, bayar, download invoice',
    icon: '👤',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  },
  {
    label: 'Portal Agent',
    subdomains: ['agent', 'agen'],
    path: '/agent',
    desc: 'Halaman reseller/agent — kelola voucher hotspot & deposit',
    icon: '🤝',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
  },
  {
    label: 'Portal Teknisi',
    subdomains: ['teknisi', 'technician'],
    path: '/technician',
    desc: 'Halaman teknisi — tiket gangguan, monitoring sesi, info pelanggan',
    icon: '🔧',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  },
];

export default function SubdomainSettingsPage() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<CompanySettings>({ baseUrl: '' });
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('example.com');

  useEffect(() => {
    fetch('/api/settings/company')
      .then(r => r.json())
      .then(data => {
        const url = data?.data?.baseUrl || data?.baseUrl || '';
        setSettings({ baseUrl: url });
        if (url) {
          try {
            const host = new URL(url).hostname;
            // Strip any existing subdomain prefix to get base domain
            const parts = host.split('.');
            if (parts.length >= 2) {
              setDomain(parts.slice(-2).join('.'));
            } else {
              setDomain(host);
            }
          } catch { /* keep default */ }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const vpsIp = (() => {
    if (!settings.baseUrl) return 'YOUR_VPS_IP';
    try {
      return new URL(settings.baseUrl).hostname;
    } catch { return 'YOUR_VPS_IP'; }
  })();

  const dnsRecords = PORTALS.flatMap(p =>
    p.subdomains.map(sub => `${sub}.${domain}  →  A  ${vpsIp}`)
  );

  const nginxConfig = `# /etc/nginx/sites-available/salfanet-subdomains

# ─── Admin Portal ───────────────────────────────────────────
server {
    listen 80;
    server_name admin.${domain};
    return 301 https://admin.${domain}$request_uri;
}
server {
    listen 443 ssl;
    server_name admin.${domain};
    # ssl_certificate / ssl_certificate_key (dari certbot)

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ─── Portal Pelanggan ────────────────────────────────────────
server {
    listen 80;
    server_name customer.${domain} pelanggan.${domain};
    return 301 https://customer.${domain}$request_uri;
}
server {
    listen 443 ssl;
    server_name customer.${domain} pelanggan.${domain};
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ─── Portal Agent ────────────────────────────────────────────
server {
    listen 80;
    server_name agent.${domain} agen.${domain};
    return 301 https://agent.${domain}$request_uri;
}
server {
    listen 443 ssl;
    server_name agent.${domain} agen.${domain};
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ─── Portal Teknisi ──────────────────────────────────────────
server {
    listen 80;
    server_name teknisi.${domain} technician.${domain};
    return 301 https://teknisi.${domain}$request_uri;
}
server {
    listen 443 ssl;
    server_name teknisi.${domain} technician.${domain};
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

  const certbotCmd = `# Install SSL wildcard (semua subdomain sekaligus)
certbot --nginx -d ${domain} -d "*.${domain}" --agree-tos

# Atau satu per satu:
certbot --nginx -d admin.${domain} -d customer.${domain} -d agent.${domain} -d teknisi.${domain}`;

  const testCmd = `# Test subdomain routing
curl -H "Host: customer.${domain}" http://localhost:3000/
curl -H "Host: agent.${domain}" http://localhost:3000/
curl -H "Host: teknisi.${domain}" http://localhost:3000/
curl -H "Host: admin.${domain}" http://localhost:3000/`;

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <span className="animate-spin">⏳</span> Memuat...
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc]">
          <Globe className="inline w-5 h-5 mr-2" />
          Subdomain Routing
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Setiap portal (pelanggan, agent, teknisi) bisa diakses lewat subdomain tersendiri tanpa mengubah kode.
        </p>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 p-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-semibold">Cara kerja subdomain routing:</p>
          <p>Middleware aplikasi (<code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">src/proxy.ts</code>) membaca header <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">Host</code> dari setiap request. Jika subdomain dikenali, request akan otomatis diarahkan ke halaman portal yang sesuai tanpa redirect (URL tetap).</p>
        </div>
      </div>

      {/* Domain Input */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">Domain Anda</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Base Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value.toLowerCase().trim())}
              placeholder="hotspotapp.net"
              className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Domain diambil dari pengaturan <strong>Base URL</strong> perusahaan. Ubah di sini hanya untuk preview — tidak disimpan ke database.
        </p>
      </div>

      {/* Portal Cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Pemetaan Subdomain → Portal</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PORTALS.map(p => (
            <div key={p.path} className={`rounded-xl border p-4 ${p.bg}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{p.icon}</span>
                <div>
                  <p className={`text-xs font-semibold ${p.color}`}>{p.label}</p>
                  <p className="text-[9px] text-muted-foreground">Path: <code>{p.path}</code></p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">{p.desc}</p>
              <div className="space-y-1">
                {p.subdomains.map(sub => (
                  <div key={sub} className="flex items-center justify-between text-[10px] bg-white/60 dark:bg-black/30 rounded px-2 py-1 font-mono">
                    <span className={p.color}>{sub}.{domain}</span>
                    <CopyButton text={`${sub}.${domain}`} label="Salin" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1 — DNS */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2 flex items-center gap-2">
          <span className="bg-primary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">1</span>
          Tambahkan DNS Records
        </h2>
        <p className="text-xs text-muted-foreground">
          Di panel DNS Anda (Cloudflare, IDCloudHost, dll), tambahkan record A berikut:
        </p>
        <div className="space-y-1.5">
          {PORTALS.flatMap(p =>
            p.subdomains.map(sub => (
              <div key={sub} className="flex items-center gap-2 text-[11px] font-mono bg-zinc-900 text-green-300 rounded px-3 py-1.5">
                <span className="text-zinc-400">A</span>
                <span className="text-blue-300">{sub}.{domain}</span>
                <span className="text-zinc-500">→</span>
                <span>{vpsIp}</span>
              </div>
            ))
          )}
        </div>
        <div className="flex items-start gap-2 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg p-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>Gunakan IP VPS <strong>{vpsIp}</strong>. Jika menggunakan Cloudflare, matikan proxy (☁️ → abu-abu) agar tidak ada masalah SSL.</p>
        </div>
      </div>

      {/* Step 2 — Nginx */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2 flex items-center gap-2">
          <span className="bg-primary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">2</span>
          Konfigurasi Nginx
        </h2>
        <p className="text-xs text-muted-foreground">Jalankan di VPS untuk menambahkan konfigurasi Nginx:</p>
        <CodeBlock>{nginxConfig}</CodeBlock>
        <div className="flex gap-2 flex-wrap">
          <CopyButton text={nginxConfig} label="Salin Nginx Config" />
          <button
            onClick={() => {
              const blob = new Blob([nginxConfig], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'salfanet-subdomains.conf';
              a.click(); URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:bg-muted text-muted-foreground"
          >
            ⬇️ Download .conf
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">Setelah edit, aktifkan dengan:</p>
        <CodeBlock>{`ln -s /etc/nginx/sites-available/salfanet-subdomains /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx`}</CodeBlock>
      </div>

      {/* Step 3 — SSL */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2 flex items-center gap-2">
          <span className="bg-primary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">3</span>
          <Shield className="w-3.5 h-3.5" /> SSL Certificate (HTTPS)
        </h2>
        <p className="text-xs text-muted-foreground">Install SSL gratis dengan Certbot:</p>
        <CodeBlock>{certbotCmd}</CodeBlock>
        <CopyButton text={certbotCmd} label="Salin" />
      </div>

      {/* Step 4 — Test */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2 flex items-center gap-2">
          <span className="bg-primary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">4</span>
          <Wifi className="w-3.5 h-3.5" /> Test Subdomain
        </h2>
        <p className="text-xs text-muted-foreground">Verifikasi routing berjalan dengan curl dari VPS:</p>
        <CodeBlock>{testCmd}</CodeBlock>
        <CopyButton text={testCmd} label="Salin" />
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-[10px] text-emerald-700 dark:text-emerald-300 space-y-1">
          <p className="font-semibold">✅ Tanda berhasil:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><code>customer.{domain}</code> → tampilkan halaman portal pelanggan</li>
            <li><code>agent.{domain}</code> → tampilkan halaman portal agent</li>
            <li><code>teknisi.{domain}</code> → tampilkan halaman portal teknisi</li>
            <li><code>admin.{domain}</code> → tampilkan halaman login admin</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
