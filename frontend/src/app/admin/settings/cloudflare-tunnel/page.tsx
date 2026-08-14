'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
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
  Terminal,
  Power,
  Play,
  Square,
  ToggleRight,
  ToggleLeft,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { apiAdmin } from '@/lib/api';

interface TunnelStatus {
  baseUrl: string;
  envNextauthUrl: string;
  envAppUrl: string;
  cloudflared: {
    installed: boolean;
    version: string;
    serviceStatus: 'active' | 'inactive' | 'failed' | 'not-installed';
    serviceEnabled: boolean;
    connections: number;
    tunnelConfig: { hasToken: boolean; tokenPreview: string } | null;
  };
  nginx: { port: string };
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

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative mt-2">
      <pre className="bg-slate-900 dark:bg-black/60 text-green-400 text-xs sm:text-sm rounded-lg p-3 pr-10 overflow-x-auto font-mono leading-relaxed border border-slate-700">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

export default function CloudflareTunnelPage() {
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tunnelDomain, setTunnelDomain] = useState('');
  const [tunnelToken, setTunnelToken] = useState('');
  const [localPort, setLocalPort] = useState('8080');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiAdmin<any>('/api/admin/cloudflare-tunnel');
      setStatus(data);
      if (data.baseUrl) {
        setTunnelDomain(data.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      }
      if (data.nginx?.port) {
        setLocalPort(data.nginx.port);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Auto-refresh status every 10s when service is active
  useEffect(() => {
    if (status?.cloudflared?.serviceStatus === 'active') {
      const interval = setInterval(loadStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [status?.cloudflared?.serviceStatus, loadStatus]);

  const doAction = async (action: string, extra?: Record<string, unknown>) => {
    setActionLoading(action);
    try {
      const data = await apiAdmin<{ success?: boolean; message?: string; error?: string }>('/api/admin/cloudflare-tunnel', {
        method: 'POST',
        body: JSON.stringify({ action, ...extra }),
      });
      if (data.success !== false) {
        showToast('success', data.message || data.success || 'Berhasil');
        await loadStatus();
      } else {
        showToast('error', data.error || 'Gagal');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Gagal terhubung ke server');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveConfig = async () => {
    if (!tunnelDomain.trim()) {
      showToast('error', 'Masukkan domain tunnel terlebih dahulu');
      return;
    }
    await doAction('save_config', {
      tunnelDomain: tunnelDomain.trim(),
      tunnelToken: tunnelToken.trim() || undefined,
      localPort,
    });
    setTunnelToken(''); // Clear token after save for security
  };

  const cf = status?.cloudflared;
  const isInstalled = cf?.installed;
  const isActive = cf?.serviceStatus === 'active';
  const isAutoStart = cf?.serviceEnabled;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl opacity-50"></div>
      </div>

      <div className="relative z-10 space-y-6 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
            <Cloud className="w-6 h-6 text-brand-500 dark:text-[#00f7ff]" />
            Cloudflare Tunnel
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Konfigurasi Cloudflare Tunnel otomatis dari halaman admin — tanpa SSH manual.
          </p>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 p-3 rounded-lg shadow-lg border text-sm flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400' :
            toast.type === 'error' ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400' :
            'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.msg}
          </div>
        )}

        {/* Status Card */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-brand-500" />
            <span className="font-semibold text-sm text-foreground">Status Cloudflare Tunnel</span>
            <button onClick={loadStatus} className="ml-auto p-1 rounded hover:bg-muted transition-colors" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Status grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* cloudflared installed */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
              {isInstalled ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
              <div>
                <div className="text-xs text-muted-foreground">cloudflared</div>
                <div className="text-sm font-medium text-foreground">
                  {isInstalled ? 'Terinstall' : 'Belum diinstall'}
                </div>
              </div>
            </div>

            {/* Service status */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
              {isActive ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
              <div>
                <div className="text-xs text-muted-foreground">Service</div>
                <div className="text-sm font-medium text-foreground">
                  {cf?.serviceStatus === 'active' && <span className="text-green-600 dark:text-green-400">Active</span>}
                  {cf?.serviceStatus === 'inactive' && <span className="text-amber-600 dark:text-amber-400">Inactive</span>}
                  {cf?.serviceStatus === 'failed' && <span className="text-red-600 dark:text-red-400">Failed</span>}
                  {cf?.serviceStatus === 'not-installed' && <span className="text-muted-foreground">Not Installed</span>}
                </div>
              </div>
            </div>

            {/* Auto-start */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
              {isAutoStart ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
              <div>
                <div className="text-xs text-muted-foreground">Auto-start on boot</div>
                <div className="text-sm font-medium text-foreground">
                  {isAutoStart ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            </div>

            {/* Connections */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
              <Globe className="w-4 h-4 text-brand-500" />
              <div>
                <div className="text-xs text-muted-foreground">Tunnel Connections</div>
                <div className="text-sm font-medium text-foreground">
                  {cf?.connections || 0} active
                </div>
              </div>
            </div>
          </div>

          {/* Version */}
          {isInstalled && cf?.version && (
            <div className="text-xs text-muted-foreground font-mono pl-2">
              {cf.version}
            </div>
          )}

          {/* Current config */}
          <div className="space-y-1.5 text-xs font-mono border-t border-border pt-3">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground min-w-[160px]">Domain (baseUrl)</span>
              <span className={`text-foreground break-all ${status?.baseUrl ? '' : 'text-muted-foreground italic'}`}>
                {status?.baseUrl || '(kosong)'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground min-w-[160px]">NEXTAUTH_URL</span>
              <span className={`break-all ${status?.envNextauthUrl ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground italic'}`}>
                {status?.envNextauthUrl || '(tidak diset)'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground min-w-[160px]">Nginx Port</span>
              <span className="text-foreground">{status?.nginx?.port || '80'}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground min-w-[160px]">Token</span>
              <span className={cf?.tunnelConfig?.hasToken ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground italic'}>
                {cf?.tunnelConfig?.hasToken ? `Tersimpan (${cf.tunnelConfig.tokenPreview})` : '(belum diset)'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {isInstalled && (
          <div className="flex flex-wrap gap-2">
            {isActive ? (
              <button
                onClick={() => doAction('stop')}
                disabled={actionLoading === 'stop'}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                Stop Service
              </button>
            ) : (
              <button
                onClick={() => doAction('start')}
                disabled={actionLoading === 'start'}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Service
              </button>
            )}
            <button
              onClick={() => doAction('restart')}
              disabled={actionLoading === 'restart'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === 'restart' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Restart
            </button>
            <button
              onClick={() => doAction(isAutoStart ? 'disable' : 'enable')}
              disabled={actionLoading === 'enable' || actionLoading === 'disable'}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                isAutoStart
                  ? 'bg-muted hover:bg-muted/80 text-foreground'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {actionLoading === 'enable' || actionLoading === 'disable' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                isAutoStart ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
              {isAutoStart ? 'Disable Auto-start' : 'Enable Auto-start'}
            </button>
          </div>
        )}

        {/* Install cloudflared (if not installed) */}
        {!isInstalled && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-brand-500" />
              <span className="font-semibold text-sm text-foreground">Install cloudflared</span>
            </div>
            <p className="text-sm text-muted-foreground">
              cloudflared belum terinstall di VPS. Klik tombol di bawah untuk install otomatis via apt package manager.
            </p>
            <button
              onClick={() => doAction('install')}
              disabled={actionLoading === 'install'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === 'install' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
              {actionLoading === 'install' ? 'Menginstall...' : 'Install cloudflared'}
            </button>
          </div>
        )}

        {/* Configuration Form */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-brand-500" />
            <span className="font-semibold text-sm text-foreground">Konfigurasi Tunnel</span>
          </div>

          {/* Domain input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Subdomain/Domain Tunnel</label>
            <div className="flex gap-2">
              <div className="flex items-center px-3 bg-muted border border-r-0 border-border rounded-l-lg text-sm text-muted-foreground select-none">
                https://
              </div>
              <input
                type="text"
                value={tunnelDomain}
                onChange={e => setTunnelDomain(e.target.value.replace(/^https?:\/\//, '').replace(/\/$/, ''))}
                placeholder="radius.salfa.my.id"
                className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Domain ini akan disimpan sebagai <code className="bg-muted px-1 rounded">baseUrl</code> dan update <code className="bg-muted px-1 rounded">NEXTAUTH_URL</code> di semua file .env
            </p>
          </div>

          {/* Token input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Tunnel Token (opsional)</label>
            <textarea
              value={tunnelToken}
              onChange={e => setTunnelToken(e.target.value)}
              placeholder="eyJhIjoi... (token dari Cloudflare dashboard → Tunnels → Create tunnel)"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Token dari Cloudflare Zero Trust dashboard. Disimpan ke <code className="bg-muted px-1 rounded">/etc/cloudflared/token</code>.
              Jika sudah ada token tersimpan, biarkan kosong.
            </p>
          </div>

          {/* Local port */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Local Port (Nginx)</label>
            <div className="flex gap-2">
              <select
                value={localPort}
                onChange={e => setLocalPort(e.target.value)}
                className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="8080">8080 (recommended for tunnel)</option>
                <option value="80">80 (direct HTTP)</option>
              </select>
              {status?.nginx?.port && status.nginx.port !== localPort && (
                <button
                  onClick={() => doAction('switch_nginx_port', { port: localPort })}
                  disabled={actionLoading === 'switch_nginx_port'}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'switch_nginx_port' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                  Switch ke {localPort}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Port Nginx yang akan di-forward oleh tunnel. Gunakan 8080 jika tunnel mengarah ke Nginx.
            </p>
          </div>

          {/* Save button */}
          <button
            onClick={handleSaveConfig}
            disabled={actionLoading === 'save_config' || !tunnelDomain.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'save_config' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {actionLoading === 'save_config' ? 'Menyimpan...' : 'Simpan Konfigurasi'}
          </button>
        </div>

        {/* Install as service (if installed but not as service) */}
        {isInstalled && cf?.serviceStatus === 'not-installed' && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Power className="w-4 h-4 text-brand-500" />
              <span className="font-semibold text-sm text-foreground">Install sebagai Systemd Service</span>
            </div>
            <p className="text-sm text-muted-foreground">
              cloudflared terinstall tapi belum terdaftar sebagai systemd service. Masukkan token tunnel untuk install service.
            </p>
            <div className="space-y-2">
              <textarea
                value={tunnelToken}
                onChange={e => setTunnelToken(e.target.value)}
                placeholder="eyJhIjoi... (tunnel token)"
                rows={3}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-xs"
              />
              <button
                onClick={() => doAction('install_service', { tunnelToken: tunnelToken.trim() })}
                disabled={actionLoading === 'install_service' || !tunnelToken.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === 'install_service' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                Install Service
              </button>
            </div>
          </div>
        )}

        {/* Quick test */}
        {tunnelDomain && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-500" />
              <span className="font-semibold text-sm text-foreground">Test Akses</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://${tunnelDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Buka https://{tunnelDomain}
              </a>
              <a
                href={`https://${tunnelDomain}/api/health`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors"
              >
                <Server className="w-4 h-4" />
                Test API Health
              </a>
            </div>
          </div>
        )}

        {/* Info card */}
        <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm text-foreground">Cara Setup Cloudflare Tunnel</span>
          </div>
          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Buat tunnel di <a href="https://one.dash.cloudflare.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">Cloudflare Zero Trust <ExternalLink className="w-3 h-3" /></a> → Networks → Tunnels → Create tunnel</li>
            <li>Pilih "Cloudflared" installation method, copy tunnel token</li>
            <li>Paste token di form "Tunnel Token" di atas, klik "Install Service"</li>
            <li>Di Cloudflare dashboard, tambah Public Hostname: subdomain → <code className="bg-muted px-1 rounded">http://localhost:8080</code></li>
            <li>Masukkan subdomain di form "Domain Tunnel" di atas, klik "Simpan Konfigurasi"</li>
            <li>Klik "Start Service" jika belum running</li>
          </ol>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="https://one.dash.cloudflare.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Cloudflare Zero Trust Dashboard
          </a>
          <a
            href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Dokumentasi Cloudflare Tunnel
          </a>
        </div>
      </div>
    </div>
  );
}
