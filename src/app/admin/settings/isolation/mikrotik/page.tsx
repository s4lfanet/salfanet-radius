'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Copy,
  Download,
  CheckCircle,
  AlertCircle,
  Code,
  BookOpen,
  Server,
  Wifi,
  Shield,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';

interface IsolationSettings {
  isolationIpPool: string;
  isolationServerIp: string;
  isolationRateLimit: string;
  baseUrl: string;
}

export default function MikroTikSetupPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<IsolationSettings>({
    isolationIpPool: '192.168.200.0/24',
    isolationServerIp: '',
    isolationRateLimit: '64k/64k',
    baseUrl: '',
  });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/isolation');
      const data = await response.json();

      if (data.success) {
        setSettings({
          isolationIpPool: data.data.isolationIpPool || '192.168.200.0/24',
          isolationServerIp: data.data.isolationServerIp || '',
          isolationRateLimit: data.data.isolationRateLimit || '64k/64k',
          baseUrl: data.data.baseUrl || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    const fallbackCopy = (str: string): boolean => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = str;
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ok = fallbackCopy(text);
        if (!ok) throw new Error('copy failed');
      }
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
      addToast({ type: 'success', title: 'Berhasil disalin!', description: 'Script berhasil disalin ke clipboard' });
    } catch {
      addToast({ type: 'error', title: 'Gagal menyalin!', description: 'Gagal menyalin ke clipboard. Coba pilih teks dan Ctrl+C.' });
    }
  };

  const downloadScript = (script: string, filename: string) => {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Extract IP range from CIDR
  const getIpRange = (cidr: string) => {
    const [network] = cidr.split('/');
    const parts = network.split('.');
    parts[3] = '100';
    const start = parts.join('.');
    parts[3] = '200';
    const end = parts.join('.');
    return `${start}-${end}`;
  };

  // Gateway IP = first usable IP of the subnet (e.g. 192.168.200.1)
  const getGatewayIp = (cidr: string) => {
    const [network] = cidr.split('/');
    const parts = network.split('.');
    parts[3] = '1';
    return parts.join('.');
  };

  const getNetworkAddress = (cidr: string) => {
    return cidr.split('/')[0].replace(/\.\d+$/, '.0/24');
  };

  // Script 1: IP Pool
  const ipPoolScript = `/ip pool
add name=pool-isolir ranges=${getIpRange(settings.isolationIpPool)} comment="IP Pool untuk user yang diisolir"`;

  // Script 2: PPP Profile
  // local-address = gateway IP (router side of PPP link), MUST be an IP not a pool name
  // remote-address = pool name for client IP assignment
  const pppProfileScript = `/ppp profile
add name=isolir \\
    local-address=${getGatewayIp(settings.isolationIpPool)} \\
    remote-address=pool-isolir \\
    rate-limit=${settings.isolationRateLimit} \\
    comment="Profile untuk user yang diisolir"`;

  // Script 3: Firewall Filter (Allow DNS & Payment)
  // Get server IP: use stored isolationServerIp first, fall back to extracting from baseUrl
  const getServerIp = () => {
    if (settings.isolationServerIp) return settings.isolationServerIp;
    if (!settings.baseUrl) return 'YOUR_SERVER_IP';
    try {
      const url = new URL(settings.baseUrl);
      return url.hostname;
    } catch {
      return 'YOUR_SERVER_IP';
    }
  };

  const firewallFilterScript = `/ip firewall filter
# PENTING: Tambahkan rule-rule berikut SEBELUM rule DROP yang sudah ada!
# Gunakan: /ip firewall filter move [rule-baru] destination=[posisi-sebelum-drop]

# [1] Allow ESTABLISHED & RELATED — return traffic dari payment gateway
add chain=forward \\
    src-address=${getNetworkAddress(settings.isolationIpPool)} \\
    connection-state=established,related \\
    action=accept \\
    comment="Allow established/related for isolated users"

add chain=forward \\
    dst-address=${getNetworkAddress(settings.isolationIpPool)} \\
    connection-state=established,related \\
    action=accept \\
    comment="Allow return traffic to isolated users"

# [2] Allow DNS untuk user isolir
add chain=forward \\
    src-address=${getNetworkAddress(settings.isolationIpPool)} \\
    protocol=udp dst-port=53 \\
    action=accept \\
    comment="Allow DNS for isolated users"

# [3] Allow ICMP (ping)
add chain=forward \\
    src-address=${getNetworkAddress(settings.isolationIpPool)} \\
    protocol=icmp \\
    action=accept \\
    comment="Allow ping for isolated users"

# [4] Allow akses ke billing server (halaman isolir + payment)
# IMPORTANT: Ganti ${getServerIp()} dengan IP ADDRESS server Anda!
# MikroTik firewall tidak support hostname, hanya IP!
add chain=forward \\
    src-address=${getNetworkAddress(settings.isolationIpPool)} \\
    dst-address=${getServerIp()} \\
    action=accept \\
    comment="Allow access to billing server - GANTI DENGAN IP!"

# [5] Allow akses ke payment gateway
add chain=forward \\
    src-address=${getNetworkAddress(settings.isolationIpPool)} \\
    dst-address-list=payment-gateways \\
    action=accept \\
    comment="Allow access to payment gateways"

# [6] Block semua akses internet lainnya
add chain=forward \\
    src-address=${getNetworkAddress(settings.isolationIpPool)} \\
    action=drop \\
    comment="Block internet for isolated users"`;

  const paymentGatewayScript = `/ip firewall address-list
# ============================================
# PAYMENT GATEWAY ADDRESS LIST
# RouterOS akan auto-resolve domain -> IP saat add
# Jalankan ulang jika IP berubah (CDN/load-balance)
# ============================================

# Midtrans / Snap
add list=payment-gateways address=api.midtrans.com comment="Midtrans API"
add list=payment-gateways address=app.midtrans.com comment="Midtrans Snap"
add list=payment-gateways address=app.sandbox.midtrans.com comment="Midtrans Sandbox"
add list=payment-gateways address=payment.midtrans.com comment="Midtrans Payment"
add list=payment-gateways address=assets.midtrans.com comment="Midtrans Assets (JS/CSS)"

# Xendit
add list=payment-gateways address=api.xendit.co comment="Xendit API"
add list=payment-gateways address=checkout.xendit.co comment="Xendit Checkout"
add list=payment-gateways address=dashboard.xendit.co comment="Xendit Dashboard"
add list=payment-gateways address=pay.xendit.co comment="Xendit Pay"

# Duitku
add list=payment-gateways address=passport.duitku.com comment="Duitku API"
add list=payment-gateways address=merchant.duitku.com comment="Duitku Merchant"
add list=payment-gateways address=sandbox.duitku.com comment="Duitku Sandbox"

# Nicepay
add list=payment-gateways address=www.nicepay.co.id comment="Nicepay"
add list=payment-gateways address=dev.nicepay.co.id comment="Nicepay Dev"

# OY! Indonesia
add list=payment-gateways address=api.oyindonesia.com comment="OY! API"
add list=payment-gateways address=pay.oyindonesia.com comment="OY! Pay"

# Flip
add list=payment-gateways address=api.flip.id comment="Flip API"
add list=payment-gateways address=flip.id comment="Flip"

# Tripay
add list=payment-gateways address=tripay.co.id comment="Tripay"
add list=payment-gateways address=payment.tripay.co.id comment="Tripay Payment"

# iPaymu
add list=payment-gateways address=my.ipaymu.com comment="iPaymu"
add list=payment-gateways address=payment.ipaymu.com comment="iPaymu Payment"

# GoPay / Gojek (QRIS & VA)
add list=payment-gateways address=api.gojek.com comment="Gojek API"
add list=payment-gateways address=gopay.co.id comment="GoPay"
add list=payment-gateways address=payment.gojek.com comment="Gojek Payment"

# DANA
add list=payment-gateways address=api.dana.id comment="DANA API"
add list=payment-gateways address=m.dana.id comment="DANA Mobile"
add list=payment-gateways address=checkout.dana.id comment="DANA Checkout"

# OVO
add list=payment-gateways address=api.ovo.id comment="OVO API"
add list=payment-gateways address=checkout.ovo.id comment="OVO Checkout"

# ShopeePay / SeaMoney
add list=payment-gateways address=open-api.airpay.co.id comment="ShopeePay API"
add list=payment-gateways address=open-api.pay.shopee.co.id comment="ShopeePay"

# Bank BCA Virtual Account
add list=payment-gateways address=p2p.klikbca.com comment="BCA KlikBCA"

# Bank BRI
add list=payment-gateways address=partner.bri.co.id comment="BRI Partner API"

# QRIS Central (GPN)
add list=payment-gateways address=qris.id comment="QRIS"
add list=payment-gateways address=api.qris.id comment="QRIS API"

# NOTE: Jalankan script ini ulang setiap 7 hari agar IP tetap update
# atau gunakan RouterOS Scheduler untuk auto-refresh`;

  // Script 5: Firewall NAT (Redirect to Landing Page)
  const firewallNatScript = `/ip firewall nat
# Redirect HTTP ke landing page isolir
# IMPORTANT: Ganti ${getServerIp()} dengan IP ADDRESS server Anda!
add chain=dstnat \\
    src-address=${getNetworkAddress(settings.isolationIpPool)} \\
    protocol=tcp dst-port=80 \\
    dst-address=!${getServerIp()} \\
    dst-address-list=!payment-gateways \\
    action=dst-nat \\
    to-addresses=${getServerIp()} \\
    to-ports=80 \\
    comment="Redirect HTTP to isolation page"

# Redirect HTTPS ke landing page isolir
add chain=dstnat \\
    src-address=${getNetworkAddress(settings.isolationIpPool)} \\
    protocol=tcp dst-port=443 \\
    dst-address=!${getServerIp()} \\
    dst-address-list=!payment-gateways \\
    action=dst-nat \\
    to-addresses=${getServerIp()} \\
    to-ports=443 \\
    comment="Redirect HTTPS to isolation page"`;

  // Script 6: Address List (Alternative approach) - REMOVED, use payment gateway list instead

  // Complete Script
  const completeScript = `# ============================================
# MIKROTIK ISOLATION SYSTEM SETUP
# Auto-generated script from SALFANET RADIUS
# Generated: ${formatWIB(new Date())}
# ============================================
# 
# IMPORTANT NOTES:
# 1. Ganti ${getServerIp()} dengan IP ADDRESS server Anda!
#    Contoh: 103.xxx.xxx.xxx (IP Public router/server)
# 2. MikroTik firewall TIDAK support hostname, hanya IP!
# 3. Payment gateway akan auto-resolve domain ke IP
# 
# ============================================

${ipPoolScript}

${pppProfileScript}

${paymentGatewayScript}

${firewallFilterScript}

${firewallNatScript}

# ============================================
# SETUP COMPLETED!
# ============================================
# 
# Setelah menjalankan script ini:
# 1. User yang diisolir akan dapat IP dari pool-isolir (${getNetworkAddress(settings.isolationIpPool)})
# 2. Bandwidth dibatasi: ${settings.isolationRateLimit}
# 3. User hanya bisa akses:
#    - DNS (port 53)
#    - ICMP (ping)
#    - Billing server (${getServerIp()}) - GANTI DENGAN IP!
#    - Payment gateway (Midtrans, Xendit, Duitku)
# 4. Semua HTTP/HTTPS request akan di-redirect ke billing server
# 
# CARA TEST:
# 1. Login PPPoE dengan user yang diisolir
# 2. Cek IP: /ppp active print (harus dapat IP dari pool-isolir)
# 3. Buka browser, akses sembarang website
# 4. Harus ter-redirect ke halaman /isolated
# 
# TROUBLESHOOTING:
# - Jika user bisa akses semua site: Cek firewall filter order
# - Jika tidak bisa bayar: Cek payment-gateways address-list
# - Jika tidak ter-redirect: Cek NAT rule order
# 
# ============================================`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <Loader2 className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] mb-1.5">
            <Server className="w-6 h-6 text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] inline mr-2" />
            {t('isolation.mikrotikTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t('isolation.mikrotikSubtitle')}
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/40 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-primary dark:text-violet-200 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-foreground dark:text-violet-100">
              <p className="font-semibold mb-0.5">{t('isolation.autoScriptBanner')}</p>
              <p>
                {t('isolation.autoScriptDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* ⚠️ IMPORTANT WARNING BOX — only shown when server IP is not explicitly configured */}
        {!settings.isolationServerIp && (
        <div className="bg-gradient-to-r from-[#ff4466]/10 to-[#ff44cc]/10 border-2 border-[#ff4466]/50 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-[#ff6b8a] flex-shrink-0 mt-0.5 drop-shadow-[0_0_10px_rgba(255,68,102,0.6)]" />
            <div className="flex-1">
              <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                ⚠️ Server IP belum dikonfigurasi!
              </h3>
              <div className="space-y-2 text-sm text-[#e0d0ff]/90">
                <p>
                  <strong>MikroTik firewall TIDAK support hostname</strong>, hanya IP address!
                </p>
                <p>
                  Script ini menggunakan: <code className="bg-black/30 px-2 py-0.5 rounded text-[#ff4466]">{getServerIp()}</code> (dari Base URL, mungkin adalah hostname bukan IP)
                </p>
                <p>
                  <strong className="text-[#ff6b8a]">Atur "IP Server (untuk MikroTik NAT)" di halaman Pengaturan Isolasi agar script benar!</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>✅ Contoh benar: <code className="bg-black/30 px-2 py-0.5 rounded text-[#00ff88]">103.50.100.150</code></li>
                  <li>❌ Contoh salah: <code className="bg-black/30 px-2 py-0.5 rounded text-[#ff4466]">billing.domain.com</code></li>
                </ul>
                <p className="mt-3">
                  <strong>Cara cek IP server:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li><strong>Direct IP:</strong> IP Public router Anda</li>
                  <li><strong>VPN/Cloudflare:</strong> IP VPN server atau domain yang sudah di-resolve</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {/* Current Settings */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              {t('isolation.currentSettings')}
            </h3>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-muted-foreground dark:text-muted-foreground">IP Pool:</span>
                <p className="font-mono font-semibold">{settings.isolationIpPool}</p>
              </div>
              <div>
                <span className="text-muted-foreground dark:text-muted-foreground">Server IP (NAT):</span>
                <p className={`font-mono font-semibold ${settings.isolationServerIp ? 'text-green-500' : 'text-amber-500'}`}>
                  {settings.isolationServerIp || 'Belum diset — atur di pengaturan isolasi'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground dark:text-muted-foreground">Rate Limit:</span>
                <p className="font-mono font-semibold">{settings.isolationRateLimit}</p>
              </div>
              <div>
                <span className="text-muted-foreground dark:text-muted-foreground">Base URL:</span>
                <p className="font-mono font-semibold text-primary">{settings.baseUrl || 'Not configured'}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold text-sm text-foreground mb-3">{t('isolation.quickActions')}</h3>
            <div className="space-y-2">
              <button
                onClick={() => downloadScript(completeScript, 'mikrotik-isolation-setup.rsc')}
                className="w-full flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-white font-medium py-1.5 px-3 text-sm rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t('isolation.downloadCompleteScript')}
              </button>
              <button
                onClick={() => copyToClipboard(completeScript, 'complete')}
                className="w-full flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground font-medium py-1.5 px-3 text-sm rounded-lg transition-colors"
              >
                {copied === 'complete' ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t('common.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    {t('isolation.copyAllScripts')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Scripts */}
        <div className="space-y-6">
          {/* Script 1: IP Pool */}
          <ScriptCard
            title={t('isolation.createIpPool')}
            description={t('isolation.createIpPoolDesc')}
            script={ipPoolScript}
            icon={<Wifi className="w-5 h-5" />}
            copied={copied === 'pool'}
            onCopy={() => copyToClipboard(ipPoolScript, 'pool')}
            onDownload={() => downloadScript(ipPoolScript, '01-ip-pool.rsc')}
          />

          {/* Script 2: PPP Profile */}
          <ScriptCard
            title={t('isolation.createPppProfile')}
            description={t('isolation.createPppProfileDesc')}
            script={pppProfileScript}
            icon={<Server className="w-5 h-5" />}
            copied={copied === 'profile'}
            onCopy={() => copyToClipboard(pppProfileScript, 'profile')}
            onDownload={() => downloadScript(pppProfileScript, '02-ppp-profile.rsc')}
          />

          {/* Script 3: Firewall Filter */}
          <ScriptCard
            title={t('isolation.firewallFilter')}
            description={t('isolation.firewallFilterDesc')}
            script={firewallFilterScript}
            icon={<Shield className="w-5 h-5" />}
            copied={copied === 'filter'}
            onCopy={() => copyToClipboard(firewallFilterScript, 'filter')}
            onDownload={() => downloadScript(firewallFilterScript, '03-firewall-filter.rsc')}
          />

          {/* Script 4: Firewall NAT */}
          <ScriptCard
            title={t('isolation.firewallNat')}
            description={t('isolation.firewallNatDesc')}
            script={firewallNatScript}
            icon={<Code className="w-5 h-5" />}
            copied={copied === 'nat'}
            onCopy={() => copyToClipboard(firewallNatScript, 'nat')}
            onDownload={() => downloadScript(firewallNatScript, '04-firewall-nat.rsc')}
          />
        </div>

        {/* Tutorial Section */}
        <div className="mt-8 bg-card rounded-lg border border-border p-6">
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <BookOpen className="w-6 h-6" />
            {t('isolation.tutorialTitle')}
          </h2>

          <div className="space-y-6">
            <TutorialStep
              number={1}
              title={t('isolation.tutorialStep1')}
              description={t('isolation.tutorialStep1Desc')}
              code="ssh admin@192.168.1.1"
            />

            <TutorialStep
              number={2}
              title={t('isolation.tutorialStep2')}
              description={t('isolation.tutorialStep2Desc')}
              code="/import file=mikrotik-isolation-setup.rsc"
            />

            <TutorialStep
              number={3}
              title={t('isolation.tutorialStep3')}
              description={t('isolation.tutorialStep3Desc')}
              code={`/ip pool print
/ppp profile print
/ip firewall filter print
/ip firewall nat print`}
            />

            <TutorialStep
              number={4}
              title={t('isolation.tutorialStep4')}
              description={t('isolation.tutorialStep4Desc')}
              code={`# Di aplikasi, set user ke expired
# Tunggu cron job jalan atau trigger manual
# User akan dapat IP dari pool-isolir dan dibatasi aksesnya`}
            />

            <TutorialStep
              number={5}
              title={t('isolation.tutorialStep5')}
              description={t('isolation.tutorialStep5Desc')}
              code={`/ppp active print
/log print where topics~"ppp"
/ip firewall connection print where src-address~"192.168.200"`}
            />
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">💡 {t('isolation.tipsTitle')}</h3>
          <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
            <li>{t('isolation.tipBackup')}</li>
            <li>{t('isolation.tipTestFirst')}</li>
            <li>{t('isolation.tipMonitorLog')}</li>
            <li>{t('isolation.tipAdjustFirewall')}</li>
            <li>{t('isolation.tipCheckBaseUrl')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

interface ScriptCardProps {
  title: string;
  description: string;
  script: string;
  icon: React.ReactNode;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}

function ScriptCard({ title, description, script, icon, copied, onCopy, onDownload }: ScriptCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="text-primary dark:text-primary mt-1">
              {icon}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">{description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCopy}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground dark:text-muted-foreground" />
              )}
            </button>
            <button
              onClick={onDownload}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Download script"
            >
              <Download className="w-4 h-4 text-muted-foreground dark:text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
      <div className="p-4 bg-muted/50">
        <pre className="text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
          {script}
        </pre>
      </div>
    </div>
  );
}

interface TutorialStepProps {
  number: number;
  title: string;
  description: string;
  code?: string;
}

function TutorialStep({ number, title, description, code }: TutorialStepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
          {number}
        </div>
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-foreground mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-2">{description}</p>
        {code && (
          <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-x-auto">
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}
