'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  Terminal,
  CheckCircle2,
  Circle,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Shield,
  Server,
  RefreshCw,
  Save,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface TunnelConfig {
  baseUrl: string;
  envNextauthUrl: string;
  envAppUrl: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  return (
    <div className="relative mt-2">
      <pre className="bg-slate-900 dark:bg-black/60 text-green-400 text-xs sm:text-sm rounded-lg p-3 pr-10 overflow-x-auto font-mono leading-relaxed border border-slate-700">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function StepCard({
  number,
  title,
  icon,
  children,
  done,
}: {
  number: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  done?: boolean;
}) {
  const [open, setOpen] = useState(number === 1);
  return (
    <div className={`border rounded-xl transition-all ${done ? 'border-green-500/40 bg-green-500/5' : 'border-border bg-card'}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${done ? 'bg-green-500 text-white' : 'bg-primary/10 text-primary'}`}>
          {done ? <CheckCircle2 className="w-4 h-4" /> : number}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-muted-foreground">{icon}</span>
          <span className="font-semibold text-foreground text-sm sm:text-base">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 pt-0 space-y-3">{children}</div>}
    </div>
  );
}

export default function CloudflareTunnelPage() {
  const [config, setConfig] = useState<TunnelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [tunnelDomain, setTunnelDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [tunnelName, setTunnelName] = useState('salfanet');

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/cloudflare-tunnel');
      const data = await res.json();
      setConfig(data);
      if (data.baseUrl && data.baseUrl !== 'http://localhost:3000') {
        setTunnelDomain(data.baseUrl.replace(/^https?:\/\//, ''));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    if (!tunnelDomain.trim()) {
      setSaveError('Masukkan domain tunnel terlebih dahulu');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/admin/cloudflare-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelDomain: tunnelDomain.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveSuccess(true);
        setConfig(prev => prev ? { ...prev, baseUrl: data.baseUrl } : prev);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(data.error || 'Gagal menyimpan');
      }
    } catch {
      setSaveError('Gagal terhubung ke server');
    } finally {
      setSaving(false);
    }
  };

  const nginxConfig = `server {
    listen 80;
    server_name ${tunnelDomain || 'your-tunnel.trycloudflare.com'};

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`;

  const tunnelConfigYaml = `tunnel: ${tunnelName}
credentials-file: /root/.cloudflared/${tunnelName}.json

ingress:
  - hostname: ${tunnelDomain || 'your-domain.com'}
    service: http://localhost:3000
  - service: http_status:404`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl opacity-50"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="relative z-10 space-y-6 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
            <Cloud className="w-6 h-6 text-brand-500 dark:text-[#00f7ff]" />
            Cloudflare Tunnel Setup
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Expose aplikasi ke internet via Cloudflare Tunnel tanpa port forwarding atau SSL certificate manual.
          </p>
        </div>

        {/* Current Status */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-brand-500" />
            <span className="font-semibold text-sm text-foreground">Status Konfigurasi Saat Ini</span>
            <button onClick={loadConfig} className="ml-auto p-1 rounded hover:bg-muted transition-colors" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground min-w-[160px]">company.baseUrl</span>
              <span className={`text-foreground break-all ${config?.baseUrl ? '' : 'text-muted-foreground italic'}`}>
                {config?.baseUrl || '(kosong)'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground min-w-[160px]">NEXTAUTH_URL (.env)</span>
              <span className={`break-all ${config?.envNextauthUrl ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground italic'}`}>
                {config?.envNextauthUrl || '(tidak diset)'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground min-w-[160px]">NEXT_PUBLIC_APP_URL</span>
              <span className={`break-all ${config?.envAppUrl ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground italic'}`}>
                {config?.envAppUrl || '(tidak diset)'}
              </span>
            </div>
          </div>
          <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Catatan:</strong> Setelah menyimpan domain tunnel di sini (Step 4), Anda perlu update manual{' '}
              <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">NEXTAUTH_URL</code> dan{' '}
              <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">NEXT_PUBLIC_APP_URL</code>{' '}
              di file <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">.env</code> di VPS, lalu rebuild app.
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {/* Step 1: Install cloudflared */}
          <StepCard number={1} title="Install cloudflared di VPS" icon={<Terminal className="w-4 h-4" />}>
            <p className="text-sm text-muted-foreground">Jalankan perintah berikut di VPS (Ubuntu/Debian):</p>
            <CodeBlock code={`# Download dan install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
dpkg -i cloudflared.deb

# Verifikasi instalasi
cloudflared --version`} />
          </StepCard>

          {/* Step 2: Login */}
          <StepCard number={2} title="Login ke Cloudflare" icon={<Shield className="w-4 h-4" />}>
            <p className="text-sm text-muted-foreground">
              Jalankan perintah berikut, lalu buka URL yang muncul di browser dan authorize domain Anda:
            </p>
            <CodeBlock code="cloudflared tunnel login" />
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Perintah ini akan membuka browser. Pilih domain Cloudflare Anda dan klik <strong>Authorize</strong>.
                File credentials akan tersimpan di <code className="bg-blue-100 dark:bg-blue-500/20 px-1 rounded">~/.cloudflared/cert.pem</code>.
              </span>
            </div>
          </StepCard>

          {/* Step 3: Create tunnel */}
          <StepCard number={3} title="Buat Tunnel" icon={<Server className="w-4 h-4" />}>
            <p className="text-sm text-muted-foreground">Buat tunnel dengan nama yang diinginkan:</p>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-muted-foreground min-w-fit">Nama tunnel:</label>
              <input
                type="text"
                value={tunnelName}
                onChange={e => setTunnelName(e.target.value.replace(/\s/g, '-').toLowerCase())}
                placeholder="salfanet"
                className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
              />
            </div>
            <CodeBlock code={`# Buat tunnel
cloudflared tunnel create ${tunnelName}

# Lihat daftar tunnel
cloudflared tunnel list`} />
            <p className="text-sm text-muted-foreground mt-3">Buat file konfigurasi tunnel:</p>
            <CodeBlock code={`mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'\n${tunnelConfigYaml}\nEOF`} />
            <p className="text-xs text-muted-foreground mt-2">
              Ganti <code className="bg-muted px-1 rounded">your-domain.com</code> dengan domain/subdomain yang sudah di-proxy ke Cloudflare.
            </p>

            <p className="text-sm text-muted-foreground mt-3 font-medium">Atau gunakan Quick Tunnel (tanpa domain, cocok untuk testing):</p>
            <CodeBlock code={`# Quick tunnel - otomatis dapat domain *.trycloudflare.com
cloudflared tunnel --url http://localhost:3000`} />
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Quick tunnel domain berubah setiap kali dijalankan. Untuk produksi gunakan tunnel dengan domain tetap.</span>
            </div>

            <p className="text-sm text-muted-foreground mt-3 font-medium">Jalankan tunnel sebagai service (auto-start):</p>
            <CodeBlock code={`cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
systemctl status cloudflared`} />
          </StepCard>

          {/* Step 4: Set domain */}
          <StepCard number={4} title="Simpan Domain Tunnel ke Aplikasi" icon={<Globe className="w-4 h-4" />} done={saveSuccess}>
            <p className="text-sm text-muted-foreground">
              Masukkan domain tunnel yang akan digunakan. Domain ini akan disimpan sebagai <code className="bg-muted px-1 rounded text-xs">baseUrl</code> di pengaturan perusahaan.
            </p>
            <div className="flex gap-2">
              <div className="flex items-center px-3 bg-muted border border-r-0 border-border rounded-l-lg text-sm text-muted-foreground select-none">
                https://
              </div>
              <input
                type="text"
                value={tunnelDomain}
                onChange={e => setTunnelDomain(e.target.value.replace(/^https?:\/\//, '').replace(/\/$/, ''))}
                placeholder="abc123.trycloudflare.com"
                className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
              />
            </div>
            {saveError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {saveError}
              </p>
            )}
            {saveSuccess && (
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Domain berhasil disimpan ke database!
              </p>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !tunnelDomain.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Menyimpan...' : 'Simpan Domain'}
            </button>

            <div className="mt-3 p-3 bg-muted/50 border border-border rounded-lg space-y-2">
              <p className="text-xs font-semibold text-foreground">Setelah menyimpan, update juga .env di VPS:</p>
              <CodeBlock code={`# Edit .env di VPS
nano /var/www/salfanet-radius/.env

# Ubah/tambahkan baris berikut:
NEXTAUTH_URL=https://${tunnelDomain || 'your-tunnel.trycloudflare.com'}
NEXT_PUBLIC_APP_URL=https://${tunnelDomain || 'your-tunnel.trycloudflare.com'}
NEXTAUTH_SECRET=your-secret-here`} />
              <p className="text-xs font-semibold text-foreground mt-2">Lalu rebuild dan reload:</p>
              <CodeBlock code={`cd /var/www/salfanet-radius
NODE_OPTIONS='--max-old-space-size=2048' npm run build
pm2 reload salfanet-radius --update-env`} />
            </div>
          </StepCard>

          {/* Step 5: Nginx config */}
          <StepCard number={5} title="Konfigurasi Nginx (Opsional)" icon={<Server className="w-4 h-4" />}>
            <p className="text-sm text-muted-foreground">
              Jika menggunakan Nginx sebagai reverse proxy di depan Cloudflare Tunnel, gunakan konfigurasi HTTP sederhana
              (tanpa SSL — SSL sudah dihandle oleh Cloudflare):
            </p>
            <CodeBlock code={nginxConfig} />
            <CodeBlock code={`# Simpan ke sites-available
nano /etc/nginx/sites-available/${tunnelDomain || 'cloudflare-tunnel'}

# Enable site
ln -sf /etc/nginx/sites-available/${tunnelDomain || 'cloudflare-tunnel'} /etc/nginx/sites-enabled/

# Test dan reload
nginx -t && systemctl reload nginx`} />
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Dengan Cloudflare Tunnel, koneksi dari Cloudflare ke VPS bersifat outbound — Nginx tidak wajib.
                Tunnel langsung terhubung ke port 3000 tanpa perlu membuka port di firewall.
              </span>
            </div>
          </StepCard>

          {/* Step 6: Verify */}
          <StepCard number={6} title="Verifikasi" icon={<CheckCircle2 className="w-4 h-4" />}>
            <p className="text-sm text-muted-foreground">Cek status tunnel dan akses aplikasi:</p>
            <CodeBlock code={`# Cek status service
systemctl status cloudflared

# Lihat log tunnel
journalctl -u cloudflared -f

# Test akses (dari VPS)
curl -I https://${tunnelDomain || 'your-tunnel.trycloudflare.com'}/api/health`} />
            {tunnelDomain && (
              <a
                href={`https://${tunnelDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors mt-2"
              >
                <ExternalLink className="w-4 h-4" />
                Buka https://{tunnelDomain}
              </a>
            )}
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg text-xs text-green-700 dark:text-green-400 space-y-1">
              <p className="font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Keuntungan Cloudflare Tunnel:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>Tidak perlu membuka port 80/443 di firewall VPS</li>
                <li>SSL/TLS otomatis dari Cloudflare</li>
                <li>DDoS protection bawaan</li>
                <li>Tidak perlu IP publik statis</li>
                <li>Gratis untuk penggunaan personal</li>
              </ul>
            </div>
          </StepCard>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Dokumentasi Cloudflare Tunnel
          </a>
          <a
            href="https://github.com/cloudflare/cloudflared/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            cloudflared Releases
          </a>
        </div>
      </div>
    </div>
  );
}
