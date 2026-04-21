'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { Shield, Server, Plus, Pencil, Trash2, Zap, Activity, CheckCircle, XCircle, Settings, Terminal, RefreshCw, FileText, X, Wifi, ChevronDown, ChevronUp, Info } from 'lucide-react';

interface VpnServer {
  id: string
  name: string
  host: string
  username: string
  apiPort: number
  subnet: string
  poolStart: number
  poolEnd: number
  gateway: string | null
  l2tpEnabled: boolean
  sstpEnabled: boolean
  pptpEnabled: boolean
  openVpnEnabled: boolean
  wgEnabled: boolean
  wgPublicKey?: string | null
  wgPort?: number | null
  isActive: boolean
}

interface WgPeer {
  publicKey: string
  endpoint?: string
  allowedIps?: string
  lastHandshake?: string
  transfer?: string
}

interface VpnClientData {
  id: string
  name: string
  username: string
  password: string
  vpnType: string
  vpnServerId: string
  vpnServerHost: string
  isRadiusServer: boolean
}

export default function VpnServerPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();

  const [servers, setServers] = useState<VpnServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [vpnClients, setVpnClients] = useState<VpnClientData[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<VpnServer | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [settingUpId, setSettingUpId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    identity?: string;
  } | null>(null);

  // L2TP VPN Control States
  const [showL2tpControl, setShowL2tpControl] = useState(false);
  const [l2tpStatus, setL2tpStatus] = useState<any>(null);
  const [l2tpLoading, setL2tpLoading] = useState(false);
  const [l2tpLogs, setL2tpLogs] = useState<string[]>([]);
  const [l2tpConnections, setL2tpConnections] = useState<string>('');

  // PPTP VPN Control States
  const [showPptpControl, setShowPptpControl] = useState(false);
  const [pptpStatus, setPptpStatus] = useState<any>(null);
  const [pptpLoading, setPptpLoading] = useState(false);
  const [pptpLogs, setPptpLogs] = useState<string[]>([]);

  // WireGuard VPN Server States
  const [showWgPanel, setShowWgPanel] = useState(false);
  const [wgPanelServer, setWgPanelServer] = useState<VpnServer | null>(null);
  const [wgServerInfo, setWgServerInfo] = useState<any>(null);
  const [wgPeers, setWgPeers] = useState<WgPeer[]>([]);
  const [wgLoading, setWgLoading] = useState(false);
  const [wgAddingPeer, setWgAddingPeer] = useState(false);
  const [wgNewPeerName, setWgNewPeerName] = useState('');
  const [wgGeneratedScript, setWgGeneratedScript] = useState<string | null>(null);
  // WG Pool Config edit state
  const [wgPoolEdit, setWgPoolEdit] = useState(false);
  const [wgPoolForm, setWgPoolForm] = useState({ poolStart: '', poolEnd: '', gatewayIp: '' });
  const [wgPoolSaving, setWgPoolSaving] = useState(false);
  // L2TP Pool Config edit state
  const [l2tpPoolEdit, setL2tpPoolEdit] = useState(false);
  const [l2tpPoolForm, setL2tpPoolForm] = useState({ poolStart: '', poolEnd: '', gateway: '' });
  const [l2tpPoolSaving, setL2tpPoolSaving] = useState(false);

  // --- Modal States --------------------------------------------------------
  const [showL2tpSshModal, setShowL2tpSshModal] = useState(false);
  const [pendingL2tpAction, setPendingL2tpAction] = useState('');
  const [pendingL2tpServer, setPendingL2tpServer] = useState<VpnServer | null>(null);
  const [l2tpSshForm, setL2tpSshForm] = useState({ host: '', port: '22', username: 'root', password: '', vpnServerIp: '', l2tpUsername: '', l2tpPassword: '' });
  const [showPptpSshModal, setShowPptpSshModal] = useState(false);
  const [pendingPptpAction, setPendingPptpAction] = useState('');
  const [pendingPptpServer, setPendingPptpServer] = useState<VpnServer | null>(null);
  const [pptpSshForm, setPptpSshForm] = useState({ host: '', port: '22', username: 'root', password: '', pptpServer: '', pptpUser: '', pptpPass: '' });
  const [showTestPasswordModal, setShowTestPasswordModal] = useState(false);
  const [testPasswordServer, setTestPasswordServer] = useState<VpnServer | null>(null);
  const [testPasswordValue, setTestPasswordValue] = useState('');
  const [showSetupPasswordModal, setShowSetupPasswordModal] = useState(false);
  const [setupPasswordServer, setSetupPasswordServer] = useState<VpnServer | null>(null);
  const [setupPasswordValue, setSetupPasswordValue] = useState('');
  const [setupResultModal, setSetupResultModal] = useState<{ success: boolean | null; title: string; message: string; stepsHtml: string } | null>(null);
  const [showVpnScriptModal, setShowVpnScriptModal] = useState(false);
  const [vpnScriptData, setVpnScriptData] = useState<{ ros7: string; ros6: string } | null>(null);


  // Store SSH credentials and L2TP config
  const [savedSshCredentials, setSavedSshCredentials] = useState<{
    host: string;
    port: string;
    username: string;
    password: string;
  } | null>(null);

  const [l2tpConfig, setL2tpConfig] = useState({
    vpnServerIp: '',
    l2tpUsername: '',
    l2tpPassword: '',
  });

  const [formData, setFormData] = useState({
    name: '',
    host: '',
    username: 'admin',
    password: '',
    apiPort: '8728',
    subnet: '10.20.30.0/24',
    poolStart: '10',
    poolEnd: '254',
    gateway: '',
    l2tpEnabled: false,
    sstpEnabled: false,
    pptpEnabled: false,
    openVpnEnabled: false,
  });
  const [showTutorial, setShowTutorial] = useState(true);

  useEffect(() => {
    // Restore saved SSH + L2TP credentials from localStorage
    try {
      const savedCreds = localStorage.getItem('l2tp_ssh_credentials');
      const savedConf = localStorage.getItem('l2tp_config');
      if (savedCreds) setSavedSshCredentials(JSON.parse(savedCreds));
      if (savedConf) setL2tpConfig(JSON.parse(savedConf));
    } catch {}
    loadServers();
    loadVpnClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadVpnClients = async () => {
    try {
      const res = await fetch('/api/network/vpn-client');
      const data = await res.json();
      const clients = (data.clients || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        username: c.username,
        password: c.password,
        vpnType: (c.vpnType || 'l2tp').toLowerCase(),
        vpnServerId: c.vpnServerId,
        vpnServerHost: (data.vpnServers || []).find((s: any) => s.id === c.vpnServerId)?.host || '',
        isRadiusServer: c.isRadiusServer ?? false,
      }));
      setVpnClients(clients);
    } catch {
      // non-critical — ignore
    }
  };

  const handleL2tpAction = async (action: string, server: VpnServer) => {
    if (!savedSshCredentials) {
      addToast({ type: 'error', title: 'Isi kredensial SSH terlebih dahulu di panel kontrol' });
      return;
    }
    await executeL2tpAction(action, server, savedSshCredentials);
  };

  const handleConnectL2tp = async () => {
    const { host, port, username, password, vpnServerIp, l2tpUsername, l2tpPassword } = l2tpSshForm;
    if (!host || !username || !password) { addToast({ type: 'error', title: 'SSH credentials wajib diisi' }); return; }
    if (!vpnServerIp || !l2tpUsername || !l2tpPassword) { addToast({ type: 'error', title: 'Detail koneksi L2TP wajib diisi semua' }); return; }
    // Block jika VPN Client tidak dikonfigurasi sebagai RADIUS Server
    const matchedClient = vpnClients.find(c => c.username === l2tpUsername && c.vpnType === 'l2tp');
    if (matchedClient && !matchedClient.isRadiusServer) {
      addToast({ type: 'error', title: `"${matchedClient.name}" belum dikonfigurasi sebagai RADIUS Server. Buka VPN Client → aktifkan "Jadikan Server RADIUS".` });
      return;
    }
    const server = editingServer!;
    const sshCreds = { host, port, username, password };
    setSavedSshCredentials(sshCreds);
    setL2tpConfig({ vpnServerIp, l2tpUsername, l2tpPassword });
    // Persist to localStorage so modal doesn't ask again on next open
    try {
      localStorage.setItem('l2tp_ssh_credentials', JSON.stringify(sshCreds));
      localStorage.setItem('l2tp_config', JSON.stringify({ vpnServerIp, l2tpUsername, l2tpPassword }));
    } catch {}
    await executeL2tpAction('status', server, sshCreds);
  };

  const executeL2tpAction = async (action: string, server: VpnServer, formValues: { host: string; port: string; username: string; password: string }) => {
    setL2tpLoading(true);
    try {
      const response = await fetch('/api/network/vpn-server/l2tp-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          host: formValues.host,
          username: formValues.username,
          password: formValues.password,
          port: parseInt(formValues.port) || 22,
          vpnServerIp: l2tpConfig.vpnServerIp,
          l2tpUsername: l2tpConfig.l2tpUsername,
          l2tpPassword: l2tpConfig.l2tpPassword,
        }),
      });
      const result = await response.json();
      if (result.success) {
        if (action === 'status') setL2tpStatus(result.result);
        else if (action === 'logs') setL2tpLogs(result.result.logs || []);
        else if (action === 'connections') setL2tpConnections(result.result.connections || '');
        showSuccess(result.message);
        if (action !== 'status' && action !== 'logs' && action !== 'connections') {
          setTimeout(() => handleL2tpAction('status', server), 1000);
        }
      } else {
        showError(result.message || t('network.operationFailed'));
      }
    } catch (error: any) {
      showError(t('network.failedExecuteL2tpCommand') + ': ' + error.message);
    } finally {
      setL2tpLoading(false);
    }
  };

  // handleL2tpSshSubmit removed — form is now inline in the L2TP Control modal via handleConnectL2tp

  const loadServers = async () => {
    try {
      const response = await fetch('/api/network/vpn-server');
      const data = await response.json();
      setServers(data.servers || []);
    } catch (error) {
      console.error('Load servers error:', error);
      showError(t('error.loadFailed') || 'Failed to load VPN servers');
    } finally {
      setLoading(false);
    }
  };


  // --- PPTP Control Handler ----------------------------------------------------
  const handlePptpAction = async (action: string, server: VpnServer) => {
    if (!savedSshCredentials) {
      addToast({ type: 'error', title: 'Isi kredensial SSH terlebih dahulu di panel kontrol' });
      return;
    }
    if (action === 'configure') {
      setPptpLoading(true);
      try {
        const r = await fetch('/api/network/vpn-server/pptp-control', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'configure', ...savedSshCredentials, port: parseInt(savedSshCredentials.port), vpnServerIp: pptpSshForm.pptpServer, pptpUsername: pptpSshForm.pptpUser, pptpPassword: pptpSshForm.pptpPass }),
        });
        const res = await r.json();
        if (res.success) { showSuccess(res.message || 'PPTP dikonfigurasi'); setTimeout(() => handlePptpAction('status', server), 2000); }
        else showError(res.message || 'Konfigurasi PPTP gagal');
      } catch (e: any) { showError('Gagal: ' + e.message); } finally { setPptpLoading(false); }
      return;
    }
    setPptpLoading(true);
    try {
      const r = await fetch('/api/network/vpn-server/pptp-control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...savedSshCredentials, port: parseInt(savedSshCredentials.port) }),
      });
      const res = await r.json();
      if (res.success) {
        if (action === 'status') setPptpStatus(res.result);
        else if (action === 'logs') setPptpLogs(res.result?.logs || [res.result?.output || '']);
        showSuccess(res.message);
      } else showError(res.message || 'Operasi gagal');
    } catch (e: any) { showError('Gagal: ' + e.message); } finally { setPptpLoading(false); }
  };

  const handleConnectPptp = async () => {
    const { host, port, username, password } = pptpSshForm;
    if (!host || !username || !password) { addToast({ type: 'error', title: 'SSH credentials wajib diisi' }); return; }
    const server = editingServer!;
    const sshCreds = { host, port, username, password };
    setSavedSshCredentials(sshCreds);
    if (pptpSshForm.pptpServer && pptpSshForm.pptpUser && pptpSshForm.pptpPass) {
      setPptpLoading(true);
      try {
        const r = await fetch('/api/network/vpn-server/pptp-control', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'configure', ...sshCreds, port: parseInt(port), vpnServerIp: pptpSshForm.pptpServer, pptpUsername: pptpSshForm.pptpUser, pptpPassword: pptpSshForm.pptpPass }),
        });
        const res = await r.json();
        if (res.success) { showSuccess(res.message || 'PPTP dikonfigurasi'); setTimeout(() => handlePptpAction('status', server), 2000); }
        else showError(res.message || 'Konfigurasi PPTP gagal');
      } catch (e: any) { showError('Gagal: ' + e.message); } finally { setPptpLoading(false); }
      return;
    }
    setPptpLoading(true);
    try {
      const r = await fetch('/api/network/vpn-server/pptp-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', ...sshCreds, port: parseInt(port) }) });
      const res = await r.json();
      if (res.success) { setPptpStatus(res.result); showSuccess(res.message); }
      else showError(res.message || 'Gagal');
    } catch (e: any) { showError('Gagal: ' + e.message); } finally { setPptpLoading(false); }
  };

  // --- Manual Script Generator -------------------------------------------------
  const handleManualScript = (server: VpnServer) => {
    const [network] = server.subnet.split('/');
    const parts = network.split('.');
    const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const poolRange = `${base}.10-${base}.254`;
    const localAddr = `${base}.1`;
    const vpnNet = `${base}.0/24`;

    const ros7Script = `# -------------------------------------------------------
# MikroTik RouterOS 7 - VPN Server Setup Script
# Server: ${server.name} (${server.host})
# Subnet: ${server.subnet}
# Generated: ${new Date().toISOString().split('T')[0]}
# -------------------------------------------------------

# --- Step 1: IP Pool ---
/ip/pool/add name=vpn-pool ranges=${poolRange}

# --- Step 2: PPP Profile ---
/ppp/profile/add name=vpn-profile local-address=${localAddr} remote-address=vpn-pool dns-server=8.8.8.8,8.8.4.4

# --- Step 3: L2TP Server ---
/interface/l2tp-server/server/set enabled=yes default-profile=vpn-profile use-ipsec=no

# --- Step 4: PPTP Server ---
/interface/pptp-server/server/set enabled=yes default-profile=vpn-profile

# --- Step 5: NAT Masquerade ---
/ip/firewall/nat/add chain=srcnat action=masquerade comment="VPN NAT"

# --- Step 6: Firewall Forward ---
/ip/firewall/filter/add chain=forward src-address=${vpnNet} dst-address=${vpnNet} action=accept comment="SALFANET-VPN-Forward"
/ip/firewall/filter/add chain=input protocol=udp src-address=${vpnNet} dst-port=1812,1813,3799 action=accept comment="SALFANET-VPN-Forward-RADIUS"
/ip/firewall/filter/add chain=input protocol=tcp src-address=${vpnNet} dst-port=8291,8728,8729 action=accept comment="SALFANET-VPN-Forward-API"
`;

    const ros6Script = `# -------------------------------------------------------
# MikroTik RouterOS 6 - VPN Server Setup Script
# Server: ${server.name} (${server.host})
# Subnet: ${server.subnet}
# Generated: ${new Date().toISOString().split('T')[0]}
# -------------------------------------------------------

# --- Step 1: IP Pool ---
/ip pool add name=vpn-pool ranges=${poolRange}

# --- Step 2: PPP Profile ---
/ppp profile add name=vpn-profile local-address=${localAddr} remote-address=vpn-pool dns-server=8.8.8.8,8.8.4.4

# --- Step 3: L2TP Server ---
/interface l2tp-server server set enabled=yes default-profile=vpn-profile use-ipsec=no

# --- Step 4: PPTP Server ---
/interface pptp-server server set enabled=yes default-profile=vpn-profile

# --- Step 5: NAT Masquerade ---
/ip firewall nat add chain=srcnat action=masquerade comment="VPN NAT"

# --- Step 6: Firewall Forward ---
/ip firewall filter add chain=forward src-address=${vpnNet} dst-address=${vpnNet} action=accept comment="SALFANET-VPN-Forward"
/ip firewall filter add chain=input protocol=udp src-address=${vpnNet} dst-port=1812,1813,3799 action=accept comment="SALFANET-VPN-Forward-RADIUS"
/ip firewall filter add chain=input protocol=tcp src-address=${vpnNet} dst-port=8291,8728,8729 action=accept comment="SALFANET-VPN-Forward-API"

# --- Verify ---
/interface l2tp-server server print
/interface pptp-server server print
/ip pool print where name=vpn-pool
/ppp profile print where name=vpn-profile`;

    setVpnScriptData({ ros7: ros7Script, ros6: ros6Script });
    setShowVpnScriptModal(true);
  };

  // ── WireGuard Handlers ──────────────────────────────────────────────────
  const openWgPanel = async (server: VpnServer) => {
    setWgPanelServer(server);
    setWgServerInfo(null);
    setWgPeers([]);
    setWgGeneratedScript(null);
    setShowWgPanel(true);
    setWgLoading(true);
    try {
      const res = await fetch('/api/network/vps-wg-peer');
      const data = await res.json();
      if (data.installed) {
        setWgServerInfo(data);
        setWgPeers(data.peers || []);
        // Sync publicKey to DB if not yet saved
        if (data.publicKey && data.publicKey !== server.wgPublicKey) {
          await fetch('/api/network/vpn-server', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: server.id, name: server.name, host: server.host, username: server.username, apiPort: server.apiPort, subnet: server.subnet, l2tpEnabled: server.l2tpEnabled, sstpEnabled: server.sstpEnabled, pptpEnabled: server.pptpEnabled, wgEnabled: true, wgPublicKey: data.publicKey, wgPort: data.listenPort }),
          });
          loadServers();
        }
      } else {
        setWgServerInfo({ installed: false, message: data.message });
      }
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal membaca status WireGuard', description: e.message });
    } finally {
      setWgLoading(false);
    }
  };

  const handleWgAddPeer = async () => {
    if (!wgNewPeerName.trim()) { addToast({ type: 'error', title: 'Nama NAS wajib diisi' }); return; }
    setWgAddingPeer(true);
    try {
      const res = await fetch('/api/network/vps-wg-peer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', nasName: wgNewPeerName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal tambah peer');

      // Build RouterOS 7 WireGuard setup script
      const parts = data.vpnIp.split('.');
      const script = `# WireGuard NAS Setup — ${wgNewPeerName}
# Generated: ${new Date().toISOString().split('T')[0]}
# ────────────────────────────────────────────────

/interface/wireguard/add name=wg-salfanet private-key="${data.clientPrivateKey || '<PASTE_NAS_PRIVATE_KEY>'}"
/interface/wireguard/peers/add interface=wg-salfanet public-key="${data.serverPublicKey}" endpoint-address="${data.serverEndpoint?.split(':')[0]}" endpoint-port=${data.wgPort} allowed-address="${data.allowedIps}" persistent-keepalive=25
/ip/address/add address=${data.vpnIp}/32 interface=wg-salfanet
/ip/route/add dst-address=${data.allowedIps.includes('/') ? data.allowedIps : data.allowedIps + '/32'} gateway=wg-salfanet

# FreeRADIUS server source IP via WireGuard
/radius/add address=${data.allowedIps?.split('/')[0] || data.serverEndpoint?.split(':')[0]} secret=<RADIUS_SECRET> service=ppp,login timeout=3000

# RADIUS auth via WireGuard tunnel
/ip/firewall/filter/add chain=input src-address=${data.vpnIp}/32 protocol=udp dst-port=1812,1813,3799 action=accept comment="RADIUS via WG"
`;
      setWgGeneratedScript(script);
      setWgNewPeerName('');
      addToast({ type: 'success', title: `Peer "${wgNewPeerName}" ditambahkan`, description: `VPN IP: ${data.vpnIp}` });
      // Refresh peer list
      await openWgPanel(wgPanelServer!);
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal tambah peer WireGuard', description: e.message });
    } finally {
      setWgAddingPeer(false);
    }
  };

  const handleWgRemovePeer = async (pubKey: string) => {
    const confirmed = await showConfirm('Hapus peer WireGuard ini? Koneksi NAS akan terputus.', 'Hapus Peer');
    if (!confirmed) return;
    try {
      const res = await fetch('/api/network/vps-wg-peer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', publicKey: pubKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal hapus peer');
      addToast({ type: 'success', title: 'Peer dihapus' });
      setWgPeers(prev => prev.filter(p => p.publicKey !== pubKey));
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal hapus peer', description: e.message });
    }
  };

  const handleWgSavePoolConfig = async () => {
    setWgPoolSaving(true);
    try {
      const res = await fetch('/api/network/vps-wg-peer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolStart: wgPoolForm.poolStart || undefined,
          poolEnd: wgPoolForm.poolEnd || undefined,
          gatewayIp: wgPoolForm.gatewayIp || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal simpan');
      setWgServerInfo((prev: any) => ({ ...prev, poolStart: data.poolStart, poolEnd: data.poolEnd, gatewayIp: data.gatewayIp }));
      setWgPoolEdit(false);
      addToast({ type: 'success', title: 'Konfigurasi pool WireGuard disimpan' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal simpan pool config', description: e.message });
    } finally {
      setWgPoolSaving(false);
    }
  };

  const handleL2tpSavePoolConfig = async () => {
    setL2tpPoolSaving(true);
    try {
      const res = await fetch('/api/network/vps-l2tp-peer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolStart: l2tpPoolForm.poolStart || undefined,
          poolEnd: l2tpPoolForm.poolEnd || undefined,
          gateway: l2tpPoolForm.gateway || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal simpan');
      setL2tpStatus((prev: any) => ({ ...prev, poolStart: data.poolStart, poolEnd: data.poolEnd, gateway: data.gateway }));
      setL2tpPoolEdit(false);
      addToast({ type: 'success', title: 'Konfigurasi pool L2TP disimpan' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal simpan pool config', description: e.message });
    } finally {
      setL2tpPoolSaving(false);
    }
  };
  // ── End WireGuard Handlers ──────────────────────────────────────────────

  const handleAdd = () => {
    setEditingServer(null);
    setTestResult(null);
    setFormData({ name: '', host: '', username: 'admin', password: '', apiPort: '8728', subnet: '10.20.30.0/24', poolStart: '10', poolEnd: '254', gateway: '', l2tpEnabled: false, sstpEnabled: false, pptpEnabled: false, openVpnEnabled: false });
    setShowModal(true);
  }

  const handleEdit = (server: VpnServer) => {
    setEditingServer(server)
    setTestResult(null)
    setFormData({ name: server.name, host: server.host, username: server.username, password: '', apiPort: server.apiPort.toString(), subnet: server.subnet, poolStart: String(server.poolStart ?? 10), poolEnd: String(server.poolEnd ?? 254), gateway: server.gateway ?? '', l2tpEnabled: server.l2tpEnabled, sstpEnabled: server.sstpEnabled, pptpEnabled: server.pptpEnabled, openVpnEnabled: server.openVpnEnabled })
    setShowModal(true)
  }

  const handleTestInModal = async () => {
    if (!formData.host || !formData.username || !formData.password) {
      showError(t('network.fillHostUsernamePassword'))
      return
    }

    setTestingId('modal')
    setTestResult(null)

    try {
      const response = await fetch('/api/network/vpn-server/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: formData.host, username: formData.username, password: formData.password, apiPort: parseInt(formData.apiPort) || 8728 }),
      })

      const result = await response.json();
      setTestResult(result);

      if (result.success) {
        showSuccess(`Router Identity: ${result.identity}\n${result.message}`, t('network.connectionSuccess'));
      } else {
        showError(result.message, t('network.connectionFailed'));
      }
    } catch (error) {
      const errorResult = { success: false, message: t('network.failedTestConnection') }
      setTestResult(errorResult);
      showError(errorResult.message);
    } finally {
      setTestingId(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (!editingServer) {
        // Save new server to DB (use Auto Setup button to configure MikroTik protocols)
        const response = await fetch('/api/network/vpn-server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData }),
        })

        const result = await response.json()

        if (response.ok) {
          showSuccess(t('network.vpnServerUpdated') || 'VPN Server berhasil disimpan');
          setShowModal(false)
          loadServers()
        } else {
          showError(result.error || t('common.error'));
        }
      } else {
        const response = await fetch('/api/network/vpn-server', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, id: editingServer.id }),
        })

        if (response.ok) {
          showSuccess(t('network.vpnServerUpdated'));
          setShowModal(false)
          loadServers()
        } else {
          showError(t('network.failedUpdateVpnServer'));
        }
      }
    } catch (error) {
      showError(t('common.error'));
    }
  }

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await showConfirm(t('network.deleteConfirm').replace('{name}', name), t('network.deleteVpnServer'));

    if (confirmed) {
      try {
        const response = await fetch(`/api/network/vpn-server?id=${id}`, { method: 'DELETE' })

        if (response.ok) {
          showSuccess(t('network.vpnServerDeleted'), t('common.deleted'));
          loadServers();
        }
      } catch (error) {
        showError(t('network.failedDeleteVpnServer'));
      }
    }
  }

  const handleTest = async (server: VpnServer) => {
    setTestPasswordServer(server);
    setTestPasswordValue('');
    setShowTestPasswordModal(true);
  };

  const handleSubmitTestPassword = async () => {
    const server = testPasswordServer;
    if (!server || !testPasswordValue) { addToast({ type: 'error', title: t('network.passwordRequired') || 'Password diperlukan' }); return; }
    setShowTestPasswordModal(false);
    setTestingId(server.id);
    try {
      const response = await fetch('/api/network/vpn-server/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: server.host, username: server.username, password: testPasswordValue, apiPort: server.apiPort }),
      });
      if (!response.ok && response.status === 401) {
        addToast({ type: 'error', title: 'Sesi telah habis, silakan login ulang' });
        return;
      }
      const result = await response.json();
      if (result.success) {
        addToast({ type: 'success', title: t('network.connectionSuccess') || 'Koneksi Berhasil', description: `Identity: ${result.identity || '-'} — ${result.message || ''}` });
      } else {
        addToast({ type: 'error', title: t('network.connectionFailed') || 'Koneksi Gagal', description: result.message || 'Tidak dapat terhubung ke RouterOS API' });
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Gagal Uji Koneksi', description: error?.message || String(error) });
    } finally {
      setTestingId(null);
      setTestPasswordValue('');
    }
  };

  const handleSetup = async (server: VpnServer) => {
    setSetupPasswordServer(server);
    setSetupPasswordValue('');
    setShowSetupPasswordModal(true);
  };

  const handleSubmitSetupPassword = async () => {
    const server = setupPasswordServer;
    if (!server || !setupPasswordValue) { addToast({ type: 'error', title: t('network.passwordRequired') }); return; }
    setShowSetupPasswordModal(false);
    setSettingUpId(server.id);

    const formatStep = (s: string) => {
      const cls = s.startsWith('✅') ? 'text-green-400' : s.startsWith('❌') ? 'text-red-400' : s.startsWith('⚠️') ? 'text-yellow-400' : 'text-gray-300';
      return `<p class="text-xs ${cls}">${s}</p>`;
    };

    // Show live modal immediately so user sees progress
    setSetupResultModal({ success: null, title: 'Setup Sedang Berjalan...', message: 'Menghubungkan ke RouterOS API...', stepsHtml: '<p class="text-xs text-gray-400 animate-pulse">⏳ Menghubungkan...</p>' });

    const liveSteps: string[] = [];
    try {
      const response = await fetch('/api/network/vpn-server/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id, host: server.host, username: server.username, password: setupPasswordValue, apiPort: server.apiPort.toString(), subnet: server.subnet, name: server.name }),
      });

      if (!response.body) {
        throw new Error(`No response body (HTTP ${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.step) {
              liveSteps.push(data.step);
              setSetupResultModal({
                success: null,
                title: 'Setup Sedang Berjalan...',
                message: 'Mengkonfigurasi RouterOS API, mohon tunggu...',
                stepsHtml: liveSteps.map(formatStep).join(''),
              });
            }
            if (data.done) {
              const allSteps: string[] = data.steps || liveSteps;
              const stepsHtml = allSteps.map(formatStep).join('');
              if (data.success) {
                const protocols: string[] = [];
                if (data.l2tp) protocols.push('L2TP');
                if (data.sstp) protocols.push('SSTP');
                if (data.pptp) protocols.push('PPTP');
                const successMsg = (t('network.protocolsEnabled') || 'Protokol aktif: {protocols}').replace('{protocols}', protocols.join(', ')) + (data.rosVersion ? ` | RouterOS: ${data.rosVersion}` : '');
                setSetupResultModal({ success: true, title: t('network.setupComplete') || 'Setup Selesai', message: successMsg, stepsHtml });
                addToast({ type: 'success', title: t('network.setupComplete') || 'Setup VPN Berhasil', description: `Protokol aktif: ${protocols.join(', ') || '-'}` });
                loadServers();
              } else {
                const errMsg = data.message || 'Setup gagal — periksa koneksi ke CHR';
                setSetupResultModal({ success: false, title: t('network.connectionFailed') || 'Setup Gagal', message: errMsg, stepsHtml });
                addToast({ type: 'error', title: 'Setup VPN Gagal', description: errMsg });
              }
            }
          } catch { /* ignore JSON parse errors on partial lines */ }
        }
      }
    } catch (error: any) {
      const msg = error?.message || t('network.failedSetupVpnServer') || 'Setup VPN gagal';
      const stepsHtml = liveSteps.map(formatStep).join('') + `<p class="text-xs text-red-400">❌ Error: ${msg}</p>`;
      addToast({ type: 'error', title: 'Setup VPN Gagal', description: msg });
      setSetupResultModal({ success: false, title: 'Setup Gagal', message: msg, stepsHtml });
    } finally {
      setSettingUpId(null);
      setSetupPasswordValue('');
    }
  };

  // Stats calculations
  const totalServers = servers.length;
  const activeServers = servers.filter(s => s.l2tpEnabled || s.sstpEnabled || s.pptpEnabled).length;
  const l2tpServers = servers.filter(s => s.l2tpEnabled).length;
  const sstpServers = servers.filter(s => s.sstpEnabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-[#00f7ff] border-t-transparent rounded-full animate-spin shadow-[0_0_30px_rgba(0,247,255,0.5)]"></div>
          <p className="text-[#00f7ff] font-medium animate-pulse">{t('network.loadingVpnServers')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* L2TP SSH Credential Modal — removed, form is now inline in L2TP Control modal */}
      {/* PPTP SSH Credential Modal — removed, form is now inline in PPTP Control modal */}
      {/* Test Password Modal */}
      {showTestPasswordModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowTestPasswordModal(false)}>
          <div className="bg-[#1e1b2e] border border-[#bc13fe]/40 rounded-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#bc13fe]/20">
              <h2 className="font-bold text-[#00f7ff]">{t('network.enterPassword')}</h2>
              <button onClick={() => setShowTestPasswordModal(false)}><X className="w-5 h-5 text-muted-foreground hover:text-foreground" /></button>
            </div>
            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-3">{t('network.mikrotikPassword')} - {testPasswordServer?.name}</p>
              <input className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm" type="password" placeholder={t('network.mikrotikPassword')} value={testPasswordValue} onChange={(e) => setTestPasswordValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmitTestPassword()} autoFocus />
            </div>
            <div className="flex gap-2 p-4 border-t border-[#bc13fe]/20">
              <button onClick={() => setShowTestPasswordModal(false)} className="flex-1 px-4 py-2 text-sm border border-gray-600 rounded-lg text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
              <button onClick={handleSubmitTestPassword} className="flex-1 px-4 py-2 text-sm font-bold bg-[#00f7ff] text-[#1a0f35] rounded-lg">Test</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Setup Password Modal */}
      {showSetupPasswordModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowSetupPasswordModal(false)}>
          <div className="bg-[#1e1b2e] border border-[#bc13fe]/40 rounded-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#bc13fe]/20">
              <h2 className="font-bold text-[#00f7ff]">Auto-Setup VPN Server?</h2>
              <button onClick={() => setShowSetupPasswordModal(false)}><X className="w-5 h-5 text-muted-foreground hover:text-foreground" /></button>
            </div>
            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-3">This will configure: L2TP, SSTP (port 992), PPTP, IP Pool ({setupPasswordServer?.subnet}), PPP Profile, NAT.</p>
              <label className="block text-sm font-medium text-[#00f7ff] mb-2">MikroTik Password:</label>
              <input className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm" type="password" placeholder="Enter password..." value={setupPasswordValue} onChange={(e) => setSetupPasswordValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmitSetupPassword()} autoFocus />
            </div>
            <div className="flex gap-2 p-4 border-t border-[#bc13fe]/20">
              <button onClick={() => setShowSetupPasswordModal(false)} className="flex-1 px-4 py-2 text-sm border border-gray-600 rounded-lg text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
              <button onClick={handleSubmitSetupPassword} className="flex-1 px-4 py-2 text-sm font-bold bg-[#00f7ff] text-[#1a0f35] rounded-lg">{t('network.yesSetupNow')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Setup Result Modal */}
      {setupResultModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setupResultModal?.success !== null && setSetupResultModal(null)}>
          <div className="bg-[#1e1b2e] border border-[#bc13fe]/40 rounded-xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#bc13fe]/20">
              <h2 className={`font-bold ${setupResultModal.success === false ? 'text-red-400' : 'text-[#00f7ff]'}`}>{setupResultModal.title}</h2>
              <button onClick={() => setupResultModal.success !== null && setSetupResultModal(null)} disabled={setupResultModal.success === null}>
                <X className={`w-5 h-5 ${setupResultModal.success === null ? 'text-muted-foreground/30' : 'text-muted-foreground hover:text-foreground'}`} />
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <p className="text-sm mb-3 text-gray-300">{setupResultModal.message}</p>
              {setupResultModal.stepsHtml && <div className="space-y-1" dangerouslySetInnerHTML={{ __html: setupResultModal.stepsHtml }} />}
            </div>
            <div className="p-4 border-t border-[#bc13fe]/20">
              <button onClick={() => setSetupResultModal(null)} disabled={setupResultModal.success === null} className={`w-full px-4 py-2 text-sm font-bold rounded-lg ${setupResultModal.success === null ? 'bg-muted/30 text-foreground/40 cursor-not-allowed' : 'bg-muted text-foreground'}`}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* VPN Script Modal */}
      {showVpnScriptModal && vpnScriptData && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowVpnScriptModal(false)}>
          <div className="bg-[#1e1b2e] border border-[#bc13fe]/40 rounded-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#bc13fe]/20">
              <h2 className="font-bold text-[#00f7ff]">📋 Manual Setup Script</h2>
              <button onClick={() => setShowVpnScriptModal(false)}><X className="w-5 h-5 text-muted-foreground hover:text-foreground" /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-xs text-muted-foreground mb-3">Copy & paste script ke Terminal/Winbox MikroTik.</p>
              <div className="flex gap-2 mb-3">
                <button id="vpnbtn-ros7" className="px-3 py-1.5 bg-teal-500/30 border border-teal-500/50 text-teal-300 rounded-lg text-xs font-bold ring-2 ring-teal-400" onClick={() => { document.getElementById('vpnscript-ros7')?.classList.remove('hidden'); document.getElementById('vpnscript-ros6')?.classList.add('hidden'); }}>RouterOS 7 (CHR)</button>
                <button id="vpnbtn-ros6" className="px-3 py-1.5 bg-orange-500/30 border border-orange-500/50 text-orange-300 rounded-lg text-xs font-bold" onClick={() => { document.getElementById('vpnscript-ros6')?.classList.remove('hidden'); document.getElementById('vpnscript-ros7')?.classList.add('hidden'); }}>RouterOS 6</button>
              </div>
              <div id="vpnscript-ros7">
                <div className="flex justify-between items-center mb-1"><span className="text-xs text-teal-400 font-bold">RouterOS 7</span><button className="text-xs text-[#00f7ff] bg-muted dark:bg-slate-800 px-2 py-1 rounded" onClick={() => { navigator.clipboard.writeText(vpnScriptData.ros7); addToast({ type: 'success', title: 'Script ROS7 disalin!' }); }}>Copy</button></div>
                <pre className="bg-gray-100 dark:bg-slate-900 text-green-700 dark:text-green-300 p-3 rounded-lg text-xs overflow-auto max-h-64 whitespace-pre font-mono border border-teal-500/20">{vpnScriptData.ros7}</pre>
              </div>
              <div id="vpnscript-ros6" className="hidden">
                <div className="flex justify-between items-center mb-1"><span className="text-xs text-orange-400 font-bold">RouterOS 6</span><button className="text-xs text-[#00f7ff] bg-muted dark:bg-slate-800 px-2 py-1 rounded" onClick={() => { navigator.clipboard.writeText(vpnScriptData.ros6); addToast({ type: 'success', title: 'Script ROS6 disalin!' }); }}>Copy</button></div>
                <pre className="bg-gray-100 dark:bg-slate-900 text-yellow-700 dark:text-yellow-300 p-3 rounded-lg text-xs overflow-auto max-h-64 whitespace-pre font-mono border border-orange-500/20">{vpnScriptData.ros6}</pre>
              </div>
            </div>
            <div className="p-4 border-t border-[#bc13fe]/20">
              <button onClick={() => setShowVpnScriptModal(false)} className="w-full px-4 py-2 text-sm bg-muted text-foreground rounded-lg">Tutup</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <main className="bg-background relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none dark:block hidden">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#bc13fe]/15 rounded-full blur-[120px] animate-pulse"></div>
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-[#00f7ff]/15 rounded-full blur-[100px] animate-pulse delay-700"></div>
          <div className="absolute bottom-0 left-1/2 w-[600px] h-[400px] bg-[#ff44cc]/10 rounded-full blur-[150px] animate-pulse delay-1000"></div>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:60px_60px]"></div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10 p-6 lg:p-8">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] rounded-xl shadow-[0_0_20px_rgba(188,19,254,0.4)] flex items-center justify-center">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent">
                    {t('network.vpnServerManagement')}
                  </h1>
                </div>
                <p className="text-muted-foreground ml-14">
                  {t('network.vpnServerManagementDesc')}
                </p>
              </div>
              <button
                onClick={handleAdd}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black font-bold rounded-xl hover:shadow-[0_0_30px_rgba(0,247,255,0.5)] transition-all duration-300 transform hover:scale-105"
              >
                <Plus className="w-5 h-5" />
                {t('network.addVpnServer')}
              </button>
            </div>
          </div>

          {/* ── Tutorial / Flow Banner ───────────────────────────────── */}
          <div className="mb-8">
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-[#00f7ff]/20 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowTutorial(!showTutorial)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#00f7ff]/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-[#00f7ff]/20 rounded-lg flex items-center justify-center">
                    <Info className="w-4 h-4 text-[#00f7ff]" />
                  </div>
                  <span className="text-sm font-bold text-[#00f7ff] uppercase tracking-wider">Cara Penggunaan — Alur VPN Server</span>
                </div>
                {showTutorial ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showTutorial && (
                <div className="px-6 pb-6 border-t border-[#00f7ff]/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
                    {[
                      { step: 1, icon: '☁️', color: 'border-[#bc13fe]/40 bg-[#bc13fe]/5', title: 'Install di VPS', desc: 'Jalankan installer SALFANET di VPS: bash vps-install.sh. FreeRADIUS, Node.js, dan PM2 akan terinstall otomatis.', link: null, linkLabel: null },
                      { step: 2, icon: '🖥️', color: 'border-[#00f7ff]/40 bg-[#00f7ff]/5', title: 'Tambah VPN Server', desc: 'Isi IP MikroTik CHR, username admin, dan subnet VPN (contoh: 10.20.30.0/24). Klik "Test Koneksi" lalu Simpan.', link: null, linkLabel: null },
                      { step: 3, icon: '⚙️', color: 'border-green-500/40 bg-green-500/5', title: 'Setup Protokol', desc: 'Klik tombol "Setup" pada kartu server untuk konfigurasi L2TP/SSTP/PPTP di MikroTik CHR secara otomatis. Untuk WireGuard (RouterOS 7+) klik tombol WireGuard.', link: null, linkLabel: null },
                      { step: 4, icon: '📡', color: 'border-amber-500/40 bg-amber-500/5', title: 'Tambah VPN Client', desc: 'Setelah server siap, pergi ke menu VPN Client untuk tambahkan setiap NAS sebagai client. Sistem generate script RouterOS otomatis.', link: '/admin/network/vpn-client', linkLabel: '→ Menu VPN Client' },
                    ].map(item => (
                      <div key={item.step} className={`rounded-xl border ${item.color} p-4`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{item.icon}</span>
                          <span className="text-xs font-bold text-muted-foreground bg-muted/50 dark:bg-slate-800/80 px-2 py-0.5 rounded-full">Step {item.step}</span>
                        </div>
                        <p className="text-sm font-bold text-foreground mb-1">{item.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                        {item.link && (
                          <a href={item.link} className="inline-block mt-2 text-xs font-medium text-[#00f7ff] hover:underline">{item.linkLabel}</a>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border border-[#bc13fe]/20 bg-[#bc13fe]/5">
                      <p className="text-xs font-bold text-[#bc13fe] mb-1">🔷 WireGuard (RouterOS 7+)</p>
                      <p className="text-xs text-muted-foreground">Arsitektur baru: VPS sebagai WG server, setiap NAS connect langsung ke VPS. Lebih cepat, lebih aman, tidak perlu CHR.</p>
                    </div>
                    <div className="p-3 rounded-xl border border-[#00f7ff]/20 bg-[#00f7ff]/5">
                      <p className="text-xs font-bold text-[#00f7ff] mb-1">🔶 L2TP/SSTP (RouterOS 6+)</p>
                      <p className="text-xs text-muted-foreground">Arsitektur legacy: VPS connect ke MikroTik CHR via L2TP/SSTP. NAS kemudian connect ke CHR. Gunakan jika RouterOS belum di-upgrade.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Total Servers */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-[#bc13fe]/30 p-5 hover:border-[#bc13fe]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-[#bc13fe]/20 rounded-lg group-hover:bg-[#bc13fe]/30 transition-colors flex items-center justify-center">
                  <Server className="w-5 h-5 text-[#bc13fe]" />
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{totalServers}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Server</p>
            </div>
            {/* Active Servers */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-green-500/30 p-5 hover:border-green-500/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-green-500/20 rounded-lg group-hover:bg-green-500/30 transition-colors flex items-center justify-center">
                  <Activity className="w-5 h-5 text-green-400" />
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{activeServers}</p>
              <p className="text-xs text-muted-foreground mt-1">Server Aktif</p>
            </div>
            {/* L2TP Servers */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-green-500/30 p-5 hover:border-green-500/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-green-500/20 rounded-lg group-hover:bg-green-500/30 transition-colors flex items-center justify-center">
                  <Shield className="w-5 h-5 text-green-400" />
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{l2tpServers}</p>
              <p className="text-xs text-muted-foreground mt-1">L2TP Aktif</p>
            </div>
            {/* SSTP Servers */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-cyan-500/30 p-5 hover:border-cyan-500/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg group-hover:bg-cyan-500/30 transition-colors flex items-center justify-center">
                  <Shield className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{sstpServers}</p>
              <p className="text-xs text-muted-foreground mt-1">SSTP Aktif</p>
            </div>
          </div>

          {/* Server List */}
          {servers.length === 0 ? (
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-3xl border-2 border-dashed border-[#bc13fe]/40 p-16 text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-[#bc13fe]/20 to-[#00f7ff]/20 rounded-2xl flex items-center justify-center">
                <Shield className="w-10 h-10 text-[#bc13fe]" />
              </div>
              <h3 className="text-lg sm:text-2xl font-bold text-foreground mb-3">{t('network.noVpnServersYet')}</h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                {t('network.noVpnServersDesc')}
              </p>
              <button
                onClick={handleAdd}
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black font-bold rounded-xl hover:shadow-[0_0_30px_rgba(0,247,255,0.5)] transition-all duration-300 transform hover:scale-105"
              >
                <Plus className="w-5 h-5" />
                {t('network.addFirstVpnServer')}
              </button>
            </div>
          ) : (
            <div className="grid gap-6">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-[#bc13fe]/30 overflow-hidden hover:border-[#00f7ff]/50 hover:shadow-[0_0_40px_rgba(0,247,255,0.15)] transition-all duration-300 group"
                >
                  {/* Server Header */}
                  <div className="p-6 border-b border-[#bc13fe]/20">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-[#bc13fe]/30 to-[#00f7ff]/30 rounded-xl group-hover:from-[#bc13fe]/40 group-hover:to-[#00f7ff]/40 transition-colors flex items-center justify-center">
                          <Server className="w-7 h-7 text-[#00f7ff]" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-foreground group-hover:text-[#00f7ff] transition-colors">{server.name}</h3>
                          <p className="text-muted-foreground text-sm mt-0.5">{server.host}:{server.apiPort}</p>
                        </div>
                      </div>

                      {/* Protocol Badges */}
                      <div className="flex flex-wrap gap-2">
                        {server.l2tpEnabled && (
                          <span className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/40 text-xs font-bold rounded-lg shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                            L2TP/IPSec
                          </span>
                        )}
                        {server.sstpEnabled && (
                          <span className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-xs font-bold rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                            SSTP
                          </span>
                        )}
                        {server.pptpEnabled && (
                          <span className="px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/40 text-xs font-bold rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                            PPTP
                          </span>
                        )}
                        {server.wgEnabled && (
                          <span className="px-3 py-1.5 bg-teal-500/20 text-teal-400 border border-teal-500/40 text-xs font-bold rounded-lg shadow-[0_0_15px_rgba(20,184,166,0.2)] flex items-center gap-1">
                            <Wifi className="w-3 h-3" />
                            WireGuard
                          </span>
                        )}
                        {!server.l2tpEnabled && !server.sstpEnabled && !server.pptpEnabled && !server.wgEnabled && (
                          <span className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-bold rounded-lg">
                            {t('network.notConfigured')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Server Details */}
                  <div className="p-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                      <div>
                        <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.hostAddress')}</p>
                        <p className="font-mono text-foreground">{server.host}</p>
                      </div>
                      <div>
                        <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.username')}</p>
                        <p className="font-mono text-foreground">{server.username}</p>
                      </div>
                      <div>
                        <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.apiPort')}</p>
                        <p className="font-mono text-foreground">{server.apiPort}</p>
                      </div>
                      <div>
                        <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.vpnSubnet')}</p>
                        <p className="font-mono text-foreground text-sm">{server.subnet}</p>
                      </div>
                    </div>

                    {/* Pool Config Info */}
                    <div className="mb-4 px-4 py-3 rounded-xl bg-[#00f7ff]/5 border border-[#00f7ff]/20 flex flex-wrap gap-4 text-xs">
                      <span className="text-muted-foreground">Pool IP: <span className="font-mono text-foreground">{server.subnet.split('.').slice(0,3).join('.')}.{server.poolStart ?? 10} – {server.subnet.split('.').slice(0,3).join('.')}.{server.poolEnd ?? 254}</span></span>
                      <span className="text-muted-foreground">Gateway: <span className="font-mono text-foreground">{server.gateway || (server.subnet.split('.').slice(0,3).join('.') + '.1')}</span></span>
                      <button onClick={() => handleEdit(server)} className="ml-auto text-[#00f7ff] hover:underline flex items-center gap-1"><Settings className="w-3 h-3" /> Edit Pool</button>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleTest(server)}
                        disabled={testingId === server.id}
                        className="flex items-center gap-2 px-4 py-2.5 bg-muted border border-border text-foreground rounded-xl hover:bg-accent hover:border-[#00f7ff]/50 transition-all disabled:opacity-50"
                      >
                        {testingId === server.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-[#00f7ff]" />
                        ) : (
                          <Activity className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">{testingId === server.id ? t('network.testing') : t('network.testConnection')}</span>
                      </button>

                      <button
                        onClick={() => handleSetup(server)}
                        disabled={settingUpId === server.id}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(0,247,255,0.4)] transition-all disabled:opacity-50"
                      >
                        {settingUpId === server.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                        <span className="text-sm">{settingUpId === server.id ? t('network.settingUp') : t('network.autoSetup')}</span>
                      </button>

                      <button
                        onClick={() => handleManualScript(server)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 border border-amber-500/50 text-amber-300 rounded-xl hover:bg-amber-500/30 transition-all"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="text-sm font-medium">Script Manual</span>
                      </button>

                      {server.l2tpEnabled && (
                        <button
                          onClick={() => {
                            setShowL2tpControl(true);
                            setEditingServer(server);
                            setL2tpSshForm(f => ({
                              ...f,
                              host: savedSshCredentials?.host || '',
                              port: savedSshCredentials?.port || '22',
                              username: savedSshCredentials?.username || 'root',
                              password: savedSshCredentials?.password || '',
                              vpnServerIp: l2tpConfig.vpnServerIp || server.host,
                              l2tpUsername: l2tpConfig.l2tpUsername,
                              l2tpPassword: l2tpConfig.l2tpPassword,
                            }));
                            if (savedSshCredentials) {
                              setTimeout(() => executeL2tpAction('status', server, savedSshCredentials), 150);
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 bg-[#bc13fe]/20 border border-[#bc13fe]/50 text-[#bc13fe] rounded-xl hover:bg-[#bc13fe]/30 transition-all"
                        >
                          <Terminal className="w-4 h-4" />
                          <span className="text-sm font-medium">L2TP Control</span>
                        </button>
                      )}

                      <button
                        onClick={() => openWgPanel(server)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-teal-500/20 border border-teal-500/50 text-teal-300 rounded-xl hover:bg-teal-500/30 transition-all"
                        title="WireGuard VPN Server (VPS as server)"
                      >
                        <Wifi className="w-4 h-4" />
                        <span className="text-sm font-medium">WireGuard</span>
                      </button>

                      <button
                        onClick={() => handleEdit(server)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-muted border border-border text-foreground rounded-xl hover:bg-accent hover:border-amber-500/50 transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                        <span className="text-sm font-medium">{t('common.edit')}</span>
                      </button>

                      <button
                        onClick={() => handleDelete(server.id, server.name)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/20 hover:border-red-500/50 transition-all ml-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-sm font-medium">{t('common.delete')}</span>
                      </button>
                    </div>
                  </div>
                </div >
              ))
              }
            </div >
          )}
        </div >

        {/* Add/Edit Modal */}
        {
          showModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2.5 sm:p-4">
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-[#bc13fe]/50 rounded-2xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(188,19,254,0.3)] max-h-[90vh] overflow-y-auto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] rounded-lg flex items-center justify-center">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">
                    {editingServer ? t('network.editVpnServer') : t('network.addNewVpnServer')}
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-[#00f7ff] mb-2">{t('network.serverName')}</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all"
                      placeholder={t('network.mainVpnServerPlaceholder')}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#00f7ff] mb-2">{t('network.hostIp')}</label>
                      <input
                        type="text"
                        value={formData.host}
                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                        className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all"
                        placeholder={t('network.ipAddressPlaceholder')}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#00f7ff] mb-2">{t('network.apiPort')}</label>
                      <input
                        type="number"
                        value={formData.apiPort}
                        onChange={(e) => setFormData({ ...formData, apiPort: e.target.value })}
                        className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all"
                        placeholder={t('network.apiPortPlaceholder')}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#00f7ff] mb-2">{t('network.username')}</label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all"
                        placeholder={t('network.adminPlaceholder')}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#00f7ff] mb-2">{t('network.password')}</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all"
                        placeholder={t('network.passwordPlaceholder')}
                        required={!editingServer}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#00f7ff] mb-2">{t('network.vpnSubnet')}</label>
                    <input
                      type="text"
                      value={formData.subnet}
                      onChange={(e) => setFormData({ ...formData, subnet: e.target.value })}
                      className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all font-mono"
                      placeholder={t('network.vpnSubnetPlaceholder')}
                      required
                    />
                  </div>

                  {/* Pool Config */}
                  <div className="p-4 rounded-xl border border-[#00f7ff]/20 bg-[#00f7ff]/5">
                    <label className="block text-sm font-semibold text-[#00f7ff] mb-3">Konfigurasi Pool IP</label>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">IP Mulai (pool start)</label>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground font-mono">x.x.x.</span>
                          <input
                            type="number"
                            min={2}
                            max={253}
                            value={formData.poolStart}
                            onChange={(e) => setFormData({ ...formData, poolStart: e.target.value })}
                            className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono focus:border-[#00f7ff] focus:ring-1 focus:ring-[#00f7ff]/30 transition-all"
                            placeholder="10"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">IP Akhir (pool end)</label>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground font-mono">x.x.x.</span>
                          <input
                            type="number"
                            min={3}
                            max={254}
                            value={formData.poolEnd}
                            onChange={(e) => setFormData({ ...formData, poolEnd: e.target.value })}
                            className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono focus:border-[#00f7ff] focus:ring-1 focus:ring-[#00f7ff]/30 transition-all"
                            placeholder="254"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Gateway Override <span className="text-gray-500">(kosongkan = otomatis .1 dari subnet)</span></label>
                      <input
                        type="text"
                        value={formData.gateway}
                        onChange={(e) => setFormData({ ...formData, gateway: e.target.value })}
                        className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono placeholder-gray-500 focus:border-[#00f7ff] focus:ring-1 focus:ring-[#00f7ff]/30 transition-all"
                        placeholder="mis. 10.20.30.1 (opsional)"
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Pool: x.x.x.<strong>{formData.poolStart || '10'}</strong> – x.x.x.<strong>{formData.poolEnd || '254'}</strong> · Gateway: <strong>{formData.gateway || (formData.subnet ? formData.subnet.split('.').slice(0,3).join('.') + '.1' : 'auto')}</strong></p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#00f7ff] mb-3">Protokol VPN</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'l2tpEnabled', label: 'L2TP/IPSec', color: 'green' },
                        { key: 'sstpEnabled', label: 'SSTP (port 992)', color: 'cyan' },
                        { key: 'pptpEnabled', label: 'PPTP', color: 'purple' },
                      ].map(({ key, label, color }) => (
                        <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${(formData as any)[key] ? `bg-${color}-500/20 border-${color}-500/40` : 'bg-muted/50 dark:bg-slate-900/50 border-border/50 dark:border-slate-700/50 hover:border-slate-600'}`}>
                          <input
                            type="checkbox"
                            checked={(formData as any)[key]}
                            onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                            className="w-4 h-4 rounded accent-[#00f7ff]"
                          />
                          <span className={`text-sm font-medium ${(formData as any)[key] ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Test Result */}
                  {testResult && (
                    <div className={`p-4 rounded-xl border ${testResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                      <div className="flex items-center gap-2">
                        {testResult.success ? (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-400" />
                        )}
                        <span className={testResult.success ? 'text-green-400' : 'text-red-400'}>
                          {testResult.success ? `Connected: ${testResult.identity}` : testResult.message}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={handleTestInModal}
                      disabled={testingId === 'modal'}
                      className="flex-1 px-4 py-3 bg-muted border border-border text-foreground rounded-xl hover:bg-accent transition-all font-medium disabled:opacity-50"
                    >
                      {testingId === 'modal' ? t('network.testing') : t('network.testConnection')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="flex-1 px-4 py-3 bg-muted border border-border text-foreground rounded-xl hover:bg-accent transition-all font-medium"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(0,247,255,0.4)] transition-all"
                    >
                      {editingServer ? t('common.update') : t('common.save')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {/* ── WireGuard Panel Modal ── */}
        {showWgPanel && wgPanelServer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2.5 sm:p-4" onClick={() => setShowWgPanel(false)}>
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-teal-500/50 rounded-2xl max-w-3xl w-full p-6 shadow-[0_0_50px_rgba(20,184,166,0.3)] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-teal-500 to-[#00f7ff] rounded-lg flex items-center justify-center">
                    <Wifi className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">WireGuard VPN Server — {wgPanelServer.name}</h2>
                </div>
                <button onClick={() => setShowWgPanel(false)} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {wgLoading && <p className="text-sm text-teal-400 animate-pulse">⏳ Membaca status WireGuard dari VPS...</p>}

              {!wgLoading && wgServerInfo && !wgServerInfo.installed && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
                  <p className="text-sm text-amber-400 font-bold mb-1">⚠️ WireGuard server belum di-install</p>
                  <p className="text-xs text-muted-foreground mb-3">{wgServerInfo.message}</p>
                  <p className="text-xs text-muted-foreground">Jalankan di VPS:</p>
                  <pre className="text-xs font-mono bg-slate-900 text-green-300 p-3 rounded-lg mt-1 overflow-x-auto">bash /var/www/salfanet-radius/vps-install/install-wg-server.sh</pre>
                </div>
              )}

              {!wgLoading && wgServerInfo?.installed && (
                <>
                  {/* Server Info */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                    {[
                      { label: 'Public IP', value: wgServerInfo.publicIp },
                      { label: 'Listen Port', value: `${wgServerInfo.listenPort}/UDP` },
                      { label: 'Subnet', value: wgServerInfo.subnet },
                      { label: 'Peers Aktif', value: wgPeers.length.toString() },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3">
                        <p className="text-teal-400 text-xs uppercase tracking-wider mb-1">{label}</p>
                        <p className="font-mono text-sm text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Server Public Key */}
                  <div className="mb-5 p-3 rounded-xl bg-slate-900 border border-teal-500/20">
                    <p className="text-xs text-teal-400 mb-1">Server Public Key (untuk config NAS)</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-green-300 flex-1 break-all">{wgServerInfo.publicKey}</code>
                      <button onClick={() => { navigator.clipboard.writeText(wgServerInfo.publicKey); addToast({ type: 'success', title: 'Public key disalin' }); }} className="text-xs text-[#00f7ff] bg-muted px-2 py-1 rounded shrink-0">Copy</button>
                    </div>
                  </div>

                  {/* Pool Config */}
                  <div className="mb-5 p-4 rounded-xl border border-teal-500/30 bg-teal-500/5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-teal-300 flex items-center gap-2"><Settings className="w-4 h-4" /> Konfigurasi Pool IP WireGuard</p>
                      {!wgPoolEdit && (
                        <button onClick={() => { setWgPoolEdit(true); setWgPoolForm({ poolStart: String(wgServerInfo.poolStart ?? 2), poolEnd: String(wgServerInfo.poolEnd ?? 254), gatewayIp: wgServerInfo.gatewayIp ?? '' }); }} className="text-xs text-teal-400 hover:text-teal-300 border border-teal-500/40 px-2 py-1 rounded-lg">Edit</button>
                      )}
                    </div>
                    {!wgPoolEdit ? (
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div><p className="text-muted-foreground mb-0.5">IP Mulai</p><p className="font-mono text-foreground">{wgServerInfo.subnet?.split('.').slice(0,3).join('.')}.{wgServerInfo.poolStart ?? 2}</p></div>
                        <div><p className="text-muted-foreground mb-0.5">IP Akhir</p><p className="font-mono text-foreground">{wgServerInfo.subnet?.split('.').slice(0,3).join('.')}.{wgServerInfo.poolEnd ?? 254}</p></div>
                        <div><p className="text-muted-foreground mb-0.5">Gateway VPS</p><p className="font-mono text-foreground">{wgServerInfo.gatewayIp || (wgServerInfo.subnet?.split('.').slice(0,3).join('.') + '.1')}</p></div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">IP Mulai (x.x.x.<strong>?</strong>)</label>
                            <input type="number" min={2} max={253} value={wgPoolForm.poolStart} onChange={(e) => setWgPoolForm(p => ({...p, poolStart: e.target.value}))} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30" placeholder="2" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">IP Akhir (x.x.x.<strong>?</strong>)</label>
                            <input type="number" min={3} max={254} value={wgPoolForm.poolEnd} onChange={(e) => setWgPoolForm(p => ({...p, poolEnd: e.target.value}))} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30" placeholder="254" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Gateway IP VPS <span className="text-gray-500">(IP wg0 di VPS, default .1)</span></label>
                          <input type="text" value={wgPoolForm.gatewayIp} onChange={(e) => setWgPoolForm(p => ({...p, gatewayIp: e.target.value}))} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30" placeholder={wgServerInfo.subnet?.split('.').slice(0,3).join('.') + '.1'} />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={handleWgSavePoolConfig} disabled={wgPoolSaving} className="flex-1 py-2 bg-teal-500 text-white text-sm font-bold rounded-lg hover:bg-teal-400 disabled:opacity-50 transition-colors">{wgPoolSaving ? 'Menyimpan...' : 'Simpan'}</button>
                          <button onClick={() => setWgPoolEdit(false)} className="flex-1 py-2 bg-muted border border-border text-foreground text-sm rounded-lg hover:bg-accent transition-colors">Batal</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mb-5">
                    <p className="text-sm font-bold text-teal-300 mb-2">NAS Peers ({wgPeers.length})</p>
                    {wgPeers.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-xl">Belum ada peer terhubung. Tambahkan NAS di bawah.</p>
                    ) : (
                      <div className="space-y-2">
                        {wgPeers.map((peer) => (
                          <div key={peer.publicKey} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-teal-500/20">
                            <div>
                              <p className="text-xs font-mono text-foreground">{peer.allowedIps || '–'}</p>
                              <p className="text-xs text-muted-foreground">{peer.endpoint || 'no endpoint'} • {peer.transfer || '–'}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{peer.publicKey}</p>
                              {peer.lastHandshake && <p className="text-xs text-teal-400">Handshake: {new Date(peer.lastHandshake).toLocaleString('id-ID')}</p>}
                            </div>
                            <button onClick={() => handleWgRemovePeer(peer.publicKey)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors" title="Hapus peer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add New Peer */}
                  <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/5">
                    <p className="text-sm font-bold text-teal-300 mb-2">Tambah NAS Baru via WireGuard</p>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm"
                        placeholder="Nama NAS / Router (misal: NAS-Jakarta-01)"
                        value={wgNewPeerName}
                        onChange={(e) => setWgNewPeerName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleWgAddPeer()}
                      />
                      <button
                        onClick={handleWgAddPeer}
                        disabled={wgAddingPeer || !wgNewPeerName.trim()}
                        className="px-4 py-2 bg-teal-500 text-white text-sm font-bold rounded-lg hover:bg-teal-400 transition-colors disabled:opacity-50"
                      >
                        {wgAddingPeer ? '...' : '+ Tambah'}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">VPS akan generate keypair dan assign VPN IP. Script RouterOS 7 ditampilkan otomatis.</p>
                  </div>

                  {/* Generated RouterOS Script */}
                  {wgGeneratedScript && (
                    <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-teal-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-teal-300">Script RouterOS 7 — Copy ke Winbox Terminal</p>
                        <button onClick={() => { navigator.clipboard.writeText(wgGeneratedScript); addToast({ type: 'success', title: 'Script disalin!' }); }} className="text-xs text-[#00f7ff] bg-muted px-2 py-1 rounded">Copy</button>
                      </div>
                      <pre className="text-xs font-mono text-green-300 whitespace-pre overflow-x-auto max-h-64">{wgGeneratedScript}</pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* L2TP Control Modal */}
        {showL2tpControl && editingServer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2.5 sm:p-4">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-[#bc13fe]/50 rounded-2xl max-w-2xl w-full p-6 shadow-[0_0_50px_rgba(188,19,254,0.3)] max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] rounded-lg flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">L2TP Control - {editingServer.name}</h2>
                </div>
                <button
                  onClick={() => setShowL2tpControl(false)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {/* Inline SSH + L2TP Credentials */}
              {!savedSshCredentials ? (
                <div className="mb-6 p-4 rounded-xl border border-[#bc13fe]/30 bg-muted/50 dark:bg-slate-900/60">
                  <p className="text-xs font-bold text-[#00f7ff] mb-1">🔑 SSH Connection — VPS RADIUS Server</p>
                  <p className="text-xs text-muted-foreground mb-3">Target: <span className="text-[#bc13fe] font-medium">{editingServer.name}</span> ({editingServer.host})</p>
                  <input className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm mb-2" placeholder="VPS IP/Hostname" value={l2tpSshForm.host} onChange={(e) => setL2tpSshForm(p => ({...p, host: e.target.value}))} />
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm" placeholder="SSH Port" type="number" value={l2tpSshForm.port} onChange={(e) => setL2tpSshForm(p => ({...p, port: e.target.value}))} />
                    <input className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm" placeholder="SSH Username" value={l2tpSshForm.username} onChange={(e) => setL2tpSshForm(p => ({...p, username: e.target.value}))} />
                  </div>
                  <input className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm mb-3" placeholder="SSH Password" type="password" value={l2tpSshForm.password} onChange={(e) => setL2tpSshForm(p => ({...p, password: e.target.value}))} />
                  <div className="border-t border-[#bc13fe]/20 pt-3">
                    <p className="text-xs font-bold text-[#00f7ff] mb-2">🔗 L2TP Connection Details</p>
                    {(() => {
                      const radiusClients = vpnClients.filter(c => c.vpnType === 'l2tp' && c.isRadiusServer);
                      const allL2tp = vpnClients.filter(c => c.vpnType === 'l2tp');
                      return (
                        <div className="mb-2">
                          {allL2tp.length > 0 && radiusClients.length === 0 && (
                            <p className="text-xs text-amber-400 mb-2 p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">⚠️ Tidak ada VPN Client L2TP yang dikonfigurasi sebagai RADIUS Server. Buka menu VPN Client → centang &ldquo;Jadikan Server RADIUS&rdquo;.</p>
                          )}
                          {radiusClients.length > 0 && (
                            <select
                              className="w-full px-3 py-2 bg-input border border-[#bc13fe]/40 rounded-lg text-foreground text-sm"
                              defaultValue=""
                              onChange={(e) => {
                                const client = radiusClients.find(c => c.id === e.target.value);
                                if (client) {
                                  setL2tpSshForm(p => ({
                                    ...p,
                                    l2tpUsername: client.username,
                                    l2tpPassword: client.password,
                                    vpnServerIp: client.vpnServerHost || p.vpnServerIp,
                                  }));
                                }
                              }}
                            >
                              <option value="" disabled>📋 Pilih akun VPN Client (RADIUS Server)...</option>
                              {radiusClients.map(c => (
                                <option key={c.id} value={c.id}>
                                  🔐 {c.name} — {c.username} ({c.vpnServerHost || 'no host'})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })()}
                    <input className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm mb-2" placeholder="VPN Server IP (CHR/MikroTik)" value={l2tpSshForm.vpnServerIp} onChange={(e) => setL2tpSshForm(p => ({...p, vpnServerIp: e.target.value}))} />
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <input className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm" placeholder="L2TP Username" value={l2tpSshForm.l2tpUsername} onChange={(e) => setL2tpSshForm(p => ({...p, l2tpUsername: e.target.value}))} />
                      <input className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm" placeholder="L2TP Password" type="password" value={l2tpSshForm.l2tpPassword} onChange={(e) => setL2tpSshForm(p => ({...p, l2tpPassword: e.target.value}))} />
                    </div>
                  </div>
                  <button onClick={handleConnectL2tp} disabled={l2tpLoading} className="w-full px-4 py-2.5 text-sm font-bold bg-[#00f7ff] text-[#1a0f35] rounded-lg hover:bg-[#00d4e6] transition-colors disabled:opacity-50">
                    {l2tpLoading ? 'Menghubungkan...' : '🔌 Connect & Cek Status'}
                  </button>
                </div>
              ) : (
                <div className="mb-4 flex items-center justify-between p-3 rounded-xl bg-green-500/10 border border-green-500/30">
                  <p className="text-sm text-green-400">✅ SSH: <span className="font-mono text-foreground">{savedSshCredentials.username}@{savedSshCredentials.host}</span></p>
                  <button onClick={() => { setSavedSshCredentials(null); setL2tpStatus(null); setL2tpLogs([]); try { localStorage.removeItem('l2tp_ssh_credentials'); localStorage.removeItem('l2tp_config'); } catch {} }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 bg-muted dark:bg-slate-700 rounded-lg transition-colors">Ubah</button>
                </div>
              )}

              {/* VPN Connection Status */}
              {l2tpStatus && (
                <div className="mb-6">
                  <div className={`p-4 rounded-xl border ${l2tpStatus.connected ? 'bg-green-500/10 border-green-500/40' : 'bg-muted/80 dark:bg-slate-900/80 border-border/40 dark:border-slate-600/40'}`}>
                    <div className="flex items-center gap-3">
                      {l2tpStatus.connected ? <CheckCircle className="w-6 h-6 text-green-400" /> : <XCircle className="w-6 h-6 text-red-400" />}
                      <div>
                        <p className="text-xs text-muted-foreground uppercase mb-0.5">VPN Tunnel</p>
                        <p className={`font-semibold ${l2tpStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                          {l2tpStatus.connected ? 'Connected' : 'Disconnected'}
                        </p>
                      </div>
                    </div>
                    {l2tpStatus.connected && (
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div className="bg-muted/50 dark:bg-slate-900/60 rounded-lg p-2">
                          <p className="text-[10px] text-gray-500 uppercase mb-0.5">VPN IP (VPS)</p>
                          <p className="text-sm font-mono text-foreground">{l2tpStatus.vpnIp ?? '-'}</p>
                        </div>
                        <div className="bg-muted/50 dark:bg-slate-900/60 rounded-lg p-2">
                          <p className="text-[10px] text-gray-500 uppercase mb-0.5">Remote (CHR)</p>
                          <p className="text-sm font-mono text-foreground">{l2tpStatus.vpnPeer ?? '-'}</p>
                        </div>
                        <div className="bg-muted/50 dark:bg-slate-900/60 rounded-lg p-2">
                          <p className="text-[10px] text-gray-500 uppercase mb-0.5">Interface</p>
                          <p className="text-sm font-mono text-foreground">{l2tpStatus.pppIface ?? '-'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* L2TP Pool Config */}
              <div className="mb-5 p-4 rounded-xl border border-[#bc13fe]/30 bg-[#bc13fe]/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-[#bc13fe] flex items-center gap-2"><Settings className="w-4 h-4" /> Konfigurasi Pool IP L2TP</p>
                  {!l2tpPoolEdit && (
                    <button onClick={() => { setL2tpPoolEdit(true); setL2tpPoolForm({ poolStart: String(l2tpStatus?.poolStart ?? 10), poolEnd: String(l2tpStatus?.poolEnd ?? 254), gateway: l2tpStatus?.gateway ?? '' }); }} className="text-xs text-[#bc13fe] hover:text-[#d060ff] border border-[#bc13fe]/40 px-2 py-1 rounded-lg">Edit</button>
                  )}
                </div>
                {!l2tpPoolEdit ? (
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><p className="text-muted-foreground mb-0.5">IP Mulai</p><p className="font-mono text-foreground">x.x.x.{l2tpStatus?.poolStart ?? 10}</p></div>
                    <div><p className="text-muted-foreground mb-0.5">IP Akhir</p><p className="font-mono text-foreground">x.x.x.{l2tpStatus?.poolEnd ?? 254}</p></div>
                    <div><p className="text-muted-foreground mb-0.5">Gateway</p><p className="font-mono text-foreground">{l2tpStatus?.gateway || 'auto (.1)'}</p></div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">IP Mulai (x.x.x.<strong>?</strong>)</label>
                        <input type="number" min={2} max={253} value={l2tpPoolForm.poolStart} onChange={(e) => setL2tpPoolForm(p => ({...p, poolStart: e.target.value}))} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono text-sm" placeholder="10" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">IP Akhir (x.x.x.<strong>?</strong>)</label>
                        <input type="number" min={3} max={254} value={l2tpPoolForm.poolEnd} onChange={(e) => setL2tpPoolForm(p => ({...p, poolEnd: e.target.value}))} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono text-sm" placeholder="254" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Gateway <span className="text-gray-500">(IP lokal VPS L2TP, kosong = auto .1)</span></label>
                      <input type="text" value={l2tpPoolForm.gateway} onChange={(e) => setL2tpPoolForm(p => ({...p, gateway: e.target.value}))} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono text-sm" placeholder="mis. 10.201.0.1" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={handleL2tpSavePoolConfig} disabled={l2tpPoolSaving} className="flex-1 py-2 bg-[#bc13fe] text-white text-sm font-bold rounded-lg hover:bg-[#d060ff] disabled:opacity-50 transition-colors">{l2tpPoolSaving ? 'Menyimpan...' : 'Simpan'}</button>
                      <button onClick={() => setL2tpPoolEdit(false)} className="flex-1 py-2 bg-muted border border-border text-foreground text-sm rounded-lg hover:bg-accent transition-colors">Batal</button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">Perubahan langsung berlaku untuk assign IP client L2TP berikutnya. Tidak memerlukan restart VPS.</p>
              </div>

              {/* Control Buttons */}
              <div className="flex flex-wrap gap-3 mb-6">
                <button onClick={() => handleL2tpAction('status', editingServer)} disabled={l2tpLoading} className="px-4 py-2 bg-muted border border-border text-foreground rounded-xl hover:bg-accent transition-all disabled:opacity-50">
                  {l2tpLoading ? 'Loading...' : 'Refresh Status'}
                </button>
                <button onClick={() => handleL2tpAction('start', editingServer)} disabled={l2tpLoading} className="px-4 py-2 bg-green-500/20 border border-green-500/40 text-green-400 rounded-xl hover:bg-green-500/30 transition-all disabled:opacity-50">
                  Start Services
                </button>
                <button onClick={() => handleL2tpAction('stop', editingServer)} disabled={l2tpLoading} className="px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-400 rounded-xl hover:bg-red-500/30 transition-all disabled:opacity-50">
                  Stop Services
                </button>
                <button onClick={() => handleL2tpAction('restart', editingServer)} disabled={l2tpLoading} className="px-4 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl hover:bg-amber-500/30 transition-all disabled:opacity-50">
                  Restart
                </button>
                <button onClick={() => handleL2tpAction('configure', editingServer)} disabled={l2tpLoading} className="px-4 py-2 bg-[#bc13fe]/20 border border-[#bc13fe]/40 text-[#bc13fe] rounded-xl hover:bg-[#bc13fe]/30 transition-all disabled:opacity-50">
                  Configure
                </button>
                <button onClick={() => handleL2tpAction('logs', editingServer)} disabled={l2tpLoading} className="px-4 py-2 bg-muted border border-border text-foreground rounded-xl hover:bg-accent transition-all disabled:opacity-50">
                  Logs
                </button>
              </div>

              {l2tpLogs.length > 0 && (
                <div className="p-4 bg-slate-950 rounded-xl border border-[#bc13fe]/30 max-h-60 overflow-y-auto">
                  <p className="text-[#00f7ff] text-xs uppercase mb-2">{t('network.recentLogs')}</p>
                  <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">{l2tpLogs.join('\n')}</pre>
                </div>
              )}
            </div>
          </div>
        )}

      </main >
    </>
  );
}
