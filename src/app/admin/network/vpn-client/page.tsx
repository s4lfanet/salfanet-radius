'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import { Shield, Plus, Trash2, Eye, Loader2, Users, Server, Copy, CheckCircle, XCircle, Wifi, Radio, Terminal, ChevronDown, ChevronUp, Route, Zap, Info, Key } from 'lucide-react';

interface VpnClient {
  id: string
  name: string
  vpnServerId: string
  vpnIp: string
  username: string
  password: string
  vpnType: string
  description?: string
  winboxPort?: number
  apiUsername?: string
  apiPassword?: string
  clientPublicKey?: string | null
  clientPrivateKey?: string | null
  isActive: boolean
  isRadiusServer: boolean
  createdAt: string
  vpnServer?: VpnServer
  nasSecret?: string | null
}

interface VpnServer {
  id: string
  host: string
  name: string
  subnet: string
  l2tpEnabled?: boolean
  sstpEnabled?: boolean
  pptpEnabled?: boolean
  wgPublicKey?: string | null
  wgPort?: number | null
  wgEnabled?: boolean
}

interface Credentials {
  server: string
  username: string
  password: string
  vpnIp: string
  winboxPort?: number
  winboxRemote?: string
  apiUsername?: string
  apiPassword?: string
  vpnType?: string
  nasSecret?: string        // RADIUS shared secret for this NAS
  radiusServerIp?: string  // RADIUS server VPN IP
  clientPrivateKey?: string | null  // WireGuard private key
  serverPublicKey?: string | null   // WireGuard server public key
  wgPort?: number | null            // WireGuard listen port
  serverHost?: string               // VPN server host (for WG endpoint)
  wgSubnet?: string                 // WireGuard VPN subnet e.g. 10.200.0.0/24
  wgGatewayIp?: string              // VPS tunnel gateway IP e.g. 10.200.0.1
}

export default function VpnClientPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<VpnClient[]>([]);
  const [vpnServers, setVpnServers] = useState<VpnServer[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [selectedVpnType, setSelectedVpnType] = useState<'l2tp' | 'pptp' | 'sstp' | 'wireguard'>('l2tp');
  const [creating, setCreating] = useState(false);
  const [expandedRoutingPanels, setExpandedRoutingPanels] = useState<Set<string>>(new Set());
  const [showApplyRoutingModal, setShowApplyRoutingModal] = useState(false);
  const [applyRoutingClient, setApplyRoutingClient] = useState<VpnClient | null>(null);
  const [applyRoutingForm, setApplyRoutingForm] = useState({ host: '', port: '22', username: 'root', password: '' });
  const [applyRoutingOutput, setApplyRoutingOutput] = useState('');
  const [applyRoutingRunning, setApplyRoutingRunning] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    vpnServerId: '',
    vpnType: 'l2tp' as 'l2tp' | 'pptp' | 'sstp' | 'wireguard',
  });
  // WireGuard NAS Peers (VPS as WG server)
  const [wgPeers, setWgPeers] = useState<{ publicKey: string; endpoint?: string; allowedIps?: string; lastHandshake?: string }[]>([]);
  const [wgLoading, setWgLoading] = useState(false);
  const [wgAddingPeer, setWgAddingPeer] = useState(false);
  const [wgNewPeerName, setWgNewPeerName] = useState('');
  const [wgGeneratedScript, setWgGeneratedScript] = useState<string | null>(null);
  const [showWgSection, setShowWgSection] = useState(false);
  // VPS WireGuard server info (fetched from vps-wg-peer GET)
  const [wgServerInfo, setWgServerInfo] = useState<{ installed: boolean; publicIp?: string; publicKey?: string; listenPort?: number; subnet?: string } | null>(null);
  const [wgServerInfoLoading, setWgServerInfoLoading] = useState(false);
  // VPS L2TP/IPsec server info
  const [l2tpServerInfo, setL2tpServerInfo] = useState<{ installed: boolean; publicIp?: string; ipsecPsk?: string; subnet?: string; localIp?: string } | null>(null);
  const [l2tpServerInfoLoading, setL2tpServerInfoLoading] = useState(false);
  // Tutorial toggle
  const [showTutorial, setShowTutorial] = useState(true);

  useEffect(() => {
    loadClients();
    // Restore saved routing SSH credentials from localStorage
    try {
      const saved = localStorage.getItem('routing_ssh_credentials');
      if (saved) {
        const parsed = JSON.parse(saved);
        setApplyRoutingForm(prev => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);

  const toggleRoutingPanel = (clientId: string) => {
    setExpandedRoutingPanels(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const handleApplyRouting = async (client: VpnClient) => {
    setApplyRoutingClient(client);
    setApplyRoutingOutput('');
    setShowApplyRoutingModal(true);
  };

  const executeApplyRouting = async () => {
    if (!applyRoutingClient) return;
    const { host, port, username, password } = applyRoutingForm;
    if (!host || !username || !password) { showError('SSH credentials wajib diisi'); return; }
    // Persist credentials for next time
    try {
      localStorage.setItem('routing_ssh_credentials', JSON.stringify({ host, port, username }));
    } catch { /* ignore */ }
    setApplyRoutingRunning(true);
    setApplyRoutingOutput('Menjalankan routing script...\n');
    try {
      const script = generateVpsRoutingScript(applyRoutingClient);
      const response = await fetch('/api/network/vpn-routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port: parseInt(port) || 22, username, password, script }),
      });
      const result = await response.json();
      if (result.success) {
        setApplyRoutingOutput(result.output || 'Selesai!');
        showSuccess('Routing script berhasil diterapkan!');
      } else {
        setApplyRoutingOutput('Error: ' + (result.message || 'Gagal'));
        showError(result.message || 'Gagal menerapkan routing');
      }
    } catch (e: any) {
      setApplyRoutingOutput('Error: ' + e.message);
      showError('Gagal: ' + e.message);
    } finally {
      setApplyRoutingRunning(false);
    }
  };

  // ── WireGuard NAS Peer handlers (VPS as WG server) ─────────────────────
  const loadWgPeers = async () => {
    setWgLoading(true);
    try {
      const res = await fetch('/api/network/vps-wg-peer');
      const data = await res.json();
      if (data.installed) {
        setWgPeers(data.peers || []);
      } else {
        setWgPeers([]);
        showError('WireGuard server belum terinstall. Install dulu melalui menu VPN Server → WireGuard.');
      }
    } catch (e: any) {
      showError('Gagal muat peers WireGuard: ' + e.message);
    } finally {
      setWgLoading(false);
    }
  };

  const handleWgAddPeer = async () => {
    if (!wgNewPeerName.trim()) { showError('Nama NAS wajib diisi'); return; }
    setWgAddingPeer(true);
    try {
      const res = await fetch('/api/network/vps-wg-peer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', nasName: wgNewPeerName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal tambah peer');
      const script = `# WireGuard NAS Client Setup — ${wgNewPeerName.trim()}
# Generated: ${new Date().toISOString().split('T')[0]}
# Paste script ini ke terminal MikroTik (RouterOS 7+)
# ──────────────────────────────────────────────────
# NAS VPN IP  : ${data.vpnIp}
# VPN Subnet  : ${data.vpnSubnet || '10.200.0.0/24'}
# VPS Endpoint: ${data.serverEndpoint}
# ──────────────────────────────────────────────────

# 1. Buat WireGuard interface dengan private key NAS
/interface/wireguard/add name=wg-salfanet private-key="${data.clientPrivateKey || '<PRIVATE_KEY>'}"

# 2. Tambah peer — allowed-address = seluruh subnet VPN (bukan hanya gateway)
/interface/wireguard/peers/add interface=wg-salfanet \\
  public-key="${data.serverPublicKey}" \\
  endpoint-address="${data.serverEndpoint?.split(':')[0]}" \\
  endpoint-port=${data.wgPort} \\
  allowed-address="${data.vpnSubnet || '10.200.0.0/24'}" \\
  persistent-keepalive=25

# 3. Assign IP address NAS ke interface WireGuard
/ip/address/remove [find where interface=wg-salfanet]
/ip/address/add address=${data.vpnIp}/32 interface=wg-salfanet

# 4. Route seluruh subnet VPN melalui WireGuard
/ip/route/remove [find where comment="SALFANET-VPN"]
/ip/route/add dst-address=${data.vpnSubnet || '10.200.0.0/24'} gateway=wg-salfanet comment="SALFANET-VPN"

# 5. RADIUS via WireGuard (server = VPS gateway IP di subnet VPN)
/radius/remove [find where comment~"SALFANET"]
/radius/add address=${data.gatewayIp || data.allowedIps?.split('/')[0]} \\
  secret=<RADIUS_SECRET> \\
  service=ppp,hotspot \\
  src-address=${data.vpnIp} \\
  authentication-port=1812 \\
  accounting-port=1813 \\
  timeout=3s \\
  comment="SALFANET RADIUS via WireGuard"
/ppp/aaa/set use-radius=yes accounting=yes interim-update=5m
/radius/incoming/set accept=yes port=3799`;
      setWgGeneratedScript(script);
      setWgNewPeerName('');
      showSuccess(`Peer "${wgNewPeerName}" berhasil ditambahkan! VPN IP: ${data.vpnIp}`);
      loadWgPeers();
    } catch (e: any) {
      showError('Gagal tambah peer WireGuard: ' + e.message);
    } finally {
      setWgAddingPeer(false);
    }
  };

  const handleWgRemovePeer = async (pubKey: string) => {
    const confirmed = await showConfirm('Hapus peer WireGuard ini? Koneksi NAS akan terputus.', 'Hapus Peer WireGuard');
    if (!confirmed) return;
    try {
      const res = await fetch('/api/network/vps-wg-peer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', publicKey: pubKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal hapus peer');
      showSuccess('Peer WireGuard dihapus');
      setWgPeers(prev => prev.filter(p => p.publicKey !== pubKey));
    } catch (e: any) {
      showError('Gagal hapus peer: ' + e.message);
    }
  };
  // ── End WireGuard handlers ──────────────────────────────────────────────

  const generateVpsRoutingScript = (client: VpnClient): string => {
    const server = vpnServers.find(s => s.id === client.vpnServerId);
    const subnet = server?.subnet || '10.20.30.0/24';
    const parts = subnet.split('/')[0].split('.');
    const gateway = `${parts[0]}.${parts[1]}.${parts[2]}.1`;

    return [
      `#!/bin/bash`,
      `# ============================================================`,
      `# VPS Routing Setup -- RADIUS Server (${client.name})`,
      `# VPN Subnet : ${subnet}`,
      `# CHR Gateway: ${gateway}`,
      `# Run as root on your Linux VPS / RADIUS server`,
      `# ============================================================`,
      ``,
      `VPN_SUBNET="${subnet}"`,
      ``,
      `echo ">> [1/5] Enable IP forwarding..."`,
      `sysctl -w net.ipv4.ip_forward=1`,
      `grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf || echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf`,
      ``,
      `echo ">> [2/5] Add route via active PPP interface..."`,
      `echo ">> [2/5] Add route via active PPP interface..."`,
      `PPP_IFACE=$(ip -o link show | grep -E 'ppp[0-9]' | awk -F': ' '{print $2}' | head -1)`,
      `if [ -n "$PPP_IFACE" ]; then`,
      `    PPP_PEER=$(ip route show dev $PPP_IFACE | grep 'proto kernel' | awk '{print $1}' | head -1)`,
      `    [ -z "$PPP_PEER" ] && PPP_PEER=$(ip addr show $PPP_IFACE | grep peer | awk '{print $4}' | cut -d'/' -f1)`,
      `    [ -z "$PPP_PEER" ] && PPP_PEER="${gateway}"`,
      `    ip route replace $VPN_SUBNET via $PPP_PEER dev $PPP_IFACE metric 100`,
      `    echo "  Route added: $VPN_SUBNET via $PPP_PEER dev $PPP_IFACE"`,
      `else`,
      `    echo "  WARNING: No PPP interface found. Connect VPN first, then re-run."`,
      `fi`,
      ``,
      `echo ">> [3/5] Allow RADIUS ports + ICMP from VPN subnet..."`,
      `iptables -C INPUT -s $VPN_SUBNET -p udp --dport 1812 -j ACCEPT 2>/dev/null || \\`,
      `    iptables -I INPUT 1 -s $VPN_SUBNET -p udp --dport 1812 -j ACCEPT`,
      `iptables -C INPUT -s $VPN_SUBNET -p udp --dport 1813 -j ACCEPT 2>/dev/null || \\`,
      `    iptables -I INPUT 1 -s $VPN_SUBNET -p udp --dport 1813 -j ACCEPT`,
      `iptables -C INPUT -s $VPN_SUBNET -p icmp -j ACCEPT 2>/dev/null || \\`,
      `    iptables -I INPUT 1 -s $VPN_SUBNET -p icmp -j ACCEPT`,
      `echo "  RADIUS 1812/1813 + ICMP rules applied"`,
      ``,
      `echo ">> [4/5] Allow FORWARD chain (routing between VPN peers)..."`,
      `iptables -C FORWARD -s $VPN_SUBNET -j ACCEPT 2>/dev/null || \\`,
      `    iptables -I FORWARD 1 -s $VPN_SUBNET -j ACCEPT`,
      `iptables -C FORWARD -d $VPN_SUBNET -j ACCEPT 2>/dev/null || \\`,
      `    iptables -I FORWARD 1 -d $VPN_SUBNET -j ACCEPT`,
      `echo "  FORWARD rules applied"`,
      ``,
      `echo ">> [5/5] Install persistent PPP hook..."`,
      `mkdir -p /etc/ppp/ip-up.d`,
      `cat > /etc/ppp/ip-up.d/99-vpn-routes.sh << 'HOOK'`,
      `#!/bin/bash`,
      `# Auto-configure VPN routing on PPP connect`,
      `# \$1=iface \$4=local_ip \$5=remote_ip(peer)`,
      `VPN_SUBNET="${subnet}"`,
      `ip route replace $VPN_SUBNET via $5 dev $1 metric 100 2>/dev/null || true`,
      `iptables -C INPUT -s $VPN_SUBNET -p udp --dport 1812 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -s $VPN_SUBNET -p udp --dport 1812 -j ACCEPT`,
      `iptables -C INPUT -s $VPN_SUBNET -p udp --dport 1813 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -s $VPN_SUBNET -p udp --dport 1813 -j ACCEPT`,
      `iptables -C INPUT -s $VPN_SUBNET -p icmp -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -s $VPN_SUBNET -p icmp -j ACCEPT`,
      `iptables -C FORWARD -s $VPN_SUBNET -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -s $VPN_SUBNET -j ACCEPT`,
      `iptables -C FORWARD -d $VPN_SUBNET -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -d $VPN_SUBNET -j ACCEPT`,
      `logger -t vpn-route "Routes configured: $VPN_SUBNET via $5 on $1"`,
      `HOOK`,
      `chmod +x /etc/ppp/ip-up.d/99-vpn-routes.sh`,
      ``,
      `echo ""`,
      `echo "Done! Verify with: ip route show | grep ppp"`,
      `echo "Test ping: ping ${gateway}"`,
    ].join('\n');
  };

  const loadClients = async () => {
    try {
      const response = await fetch('/api/network/vpn-client')
      const data = await response.json()
      setClients(data.clients || [])
      setVpnServers(data.vpnServers || [])
    } catch (error) {
      console.error('Load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadWgServerInfo = async () => {
    if (wgServerInfo !== null) return // already loaded
    setWgServerInfoLoading(true)
    try {
      const res = await fetch('/api/network/vps-wg-peer')
      const data = await res.json()
      if (data.installed) {
        setWgServerInfo({
          installed: true,
          publicIp: data.info?.publicIp,
          publicKey: data.info?.publicKey,
          listenPort: data.info?.listenPort,
          subnet: data.info?.subnet,
        })
      } else {
        setWgServerInfo({ installed: false })
      }
    } catch {
      setWgServerInfo({ installed: false })
    } finally {
      setWgServerInfoLoading(false)
    }
  }

  const loadL2tpServerInfo = async () => {
    if (l2tpServerInfo !== null) return // already loaded
    setL2tpServerInfoLoading(true)
    try {
      const res = await fetch('/api/network/vps-l2tp-info')
      const data = await res.json()
      setL2tpServerInfo(data.installed ? {
        installed: true,
        publicIp: data.publicIp,
        ipsecPsk: data.ipsecPsk,
        subnet: data.subnet,
        localIp: data.localIp,
      } : { installed: false })
    } catch {
      setL2tpServerInfo({ installed: false })
    } finally {
      setL2tpServerInfoLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    // VPS WireGuard mode: intercept and use vps-wg-peer flow
    if (formData.vpnType === 'wireguard' && formData.vpnServerId === '__vps_wg__') {
      if (!formData.name.trim()) return
      setWgNewPeerName(formData.name.trim())
      setShowModal(false)
      setShowWgSection(true)
      // Trigger add peer with the name from the form
      setCreating(true)
      try {
        const res = await fetch('/api/network/vps-wg-peer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', nasName: formData.name.trim() }),
        })
        const data = await res.json()
        if (data.success) {
          setWgGeneratedScript(data.routerosScript || null)
          await loadWgPeers()
          showSuccess('WireGuard peer berhasil ditambahkan ke VPS', 'Peer Ditambahkan')
          setFormData({ name: '', description: '', vpnServerId: '', vpnType: 'l2tp' })

          // Auto-show credentials with generated script so user can copy it immediately
          const wgSubnet = data.vpnSubnet || wgServerInfo?.subnet || '10.200.0.0/24'
          const wgGatewayIp = data.gatewayIp || wgSubnet.replace(/\.\d+\/\d+$/, '.1')
          setCredentials({
            server: wgServerInfo?.publicIp || data.serverEndpoint?.split(':')[0] || 'VPS',
            serverHost: wgServerInfo?.publicIp || data.serverEndpoint?.split(':')[0] || 'VPS',
            username: formData.name.trim(),
            password: '',
            vpnIp: data.vpnIp,
            vpnType: 'wireguard',
            clientPrivateKey: data.clientPrivateKey || null,
            serverPublicKey: data.serverPublicKey || wgServerInfo?.publicKey || null,
            wgPort: data.wgPort || wgServerInfo?.listenPort || 51820,
            wgSubnet,
            wgGatewayIp,
            nasSecret: data.nasSecret || undefined,
            apiUsername: data.apiUsername || undefined,
            apiPassword: data.apiPassword || undefined,
            radiusServerIp: undefined, // VPS gateway is used as fallback in generateMikroTikScript
          })
          setSelectedVpnType('wireguard')
          setShowCredentials(true)
        } else {
          showError(data.error || 'Gagal menambahkan WireGuard peer ke VPS')
        }
      } catch {
        showError('Gagal menghubungi VPS')
      } finally {
        setCreating(false)
      }
      return
    }

    // VPS L2TP mode: intercept and use vps-l2tp-peer flow
    if (formData.vpnType === 'l2tp' && formData.vpnServerId === '__vps_l2tp__') {
      if (!formData.name.trim()) return
      setCreating(true)
      try {
        const res = await fetch('/api/network/vps-l2tp-peer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', label: formData.name.trim() }),
        })
        const data = await res.json()
        if (data.success) {
          setShowModal(false)
          setCredentials({
            server: l2tpServerInfo?.publicIp || 'VPS',
            username: data.username,
            password: data.password,
            vpnIp: data.vpnIp,
            vpnType: 'l2tp',
          })
          setSelectedVpnType('l2tp')
          setShowCredentials(true)
          // Store generated script in wgGeneratedScript state for display
          setWgGeneratedScript(data.routerosScript || null)
          setShowWgSection(true)
          showSuccess('L2TP user berhasil ditambahkan ke VPS', 'Berhasil')
          setFormData({ name: '', description: '', vpnServerId: '', vpnType: 'l2tp' })
        } else {
          showError(data.error || 'Gagal menambahkan L2TP user ke VPS')
        }
      } catch {
        showError('Gagal menghubungi VPS')
      } finally {
        setCreating(false)
      }
      return
    }

    setCreating(true)

    try {
      const response = await fetch('/api/network/vpn-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result.success) {
        setCredentials(result.credentials);
        const createdType = String(result.credentials?.vpnType || 'l2tp').toLowerCase();
        setSelectedVpnType(createdType === 'pptp' || createdType === 'sstp' ? createdType : 'l2tp');
        setShowCredentials(true);
        setShowModal(false);
        loadClients();

        showSuccess(t('network.clientCredentialsDisplayed'), t('network.vpnClientCreated'));
      } else {
        showError(result.error || t('network.failedCreateClient'));
      }
    } catch (error) {
      showError(t('network.anErrorOccurred'));
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await showConfirm(
      `This will remove "${name}" from CHR and database`,
      'Delete VPN Client?'
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/network/vpn-client?id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        showSuccess(t('network.deleted'));
        loadClients();
      } else {
        showError(t('network.failedDeleteClient'));
      }
    } catch (error) {
      showError(t('network.anErrorOccurred'));
    }
  }

  const handleToggleRadiusServer = async (clientId: string, isRadiusServer: boolean) => {
    try {
      const response = await fetch('/api/network/vpn-client', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clientId, isRadiusServer }),
      })

      if (response.ok) {
        showSuccess(isRadiusServer ? t('network.setAsRadiusServerSuccess') : t('network.unsetRadiusServerSuccess'));
        loadClients();
      } else {
        showError(t('network.failedUpdateClient'));
      }
    } catch (error) {
      showError(t('network.anErrorOccurred'));
    }
  }

  const viewCredentials = (client: VpnClient) => {
    const server = vpnServers.find(s => s.id === client.vpnServerId)
    if (!server) return

    const normalizedClientType = String(client.vpnType || 'l2tp').toLowerCase()
    const clientVpnType = (
      normalizedClientType === 'pptp' || normalizedClientType === 'sstp' || normalizedClientType === 'wireguard'
        ? normalizedClientType : 'l2tp'
    ) as 'l2tp' | 'pptp' | 'sstp' | 'wireguard'
    const radiusServer = clients.find(c => c.isRadiusServer)

    setCredentials({
      server: server.host,
      serverHost: server.host,
      username: client.username,
      password: client.password,
      vpnIp: client.vpnIp,
      winboxPort: client.winboxPort || undefined,
      winboxRemote: client.winboxPort ? `${server.host}:${client.winboxPort}` : undefined,
      apiUsername: client.apiUsername || undefined,
      apiPassword: client.apiPassword || undefined,
      vpnType: clientVpnType,
      nasSecret: client.nasSecret || undefined,
      radiusServerIp: (!client.isRadiusServer && radiusServer) ? radiusServer.vpnIp : undefined,
      clientPrivateKey: client.clientPrivateKey || null,
      serverPublicKey: server.wgPublicKey || null,
      wgPort: server.wgPort || null,
      // WG subnet: derive from VPN IP if wgServerInfo available, fallback to server subnet
      wgSubnet: wgServerInfo?.subnet || server.subnet || '10.200.0.0/24',
      wgGatewayIp: wgServerInfo?.subnet
        ? wgServerInfo.subnet.replace(/\.\d+\/\d+$/, '.1')
        : server.subnet?.replace(/\.\d+\/\d+$/, '.1') || '10.200.0.1',
    })
    setSelectedVpnType(clientVpnType)
    setShowCredentials(true)
  }

  const generateMikroTikScript = () => {
    if (!credentials) return ''

    // Build RADIUS section (only for NAS clients, not the RADIUS server itself)
    const radiusSection = (credentials.radiusServerIp && credentials.nasSecret) ? `
# ============================================================
# 5. RADIUS Configuration (NAS Client)
# ============================================================

# Remove old RADIUS entries
/radius remove [find where comment~"SALFANET"]

# Add RADIUS server — src-address MUST match VPN IP in FreeRADIUS NAS table
/radius add \\
  address=${credentials.radiusServerIp} \\
  secret=${credentials.nasSecret} \\
  service=ppp,hotspot \\
  src-address=${credentials.vpnIp} \\
  authentication-port=1812 \\
  accounting-port=1813 \\
  timeout=3s \\
  require-message-auth=no \\
  comment="SALFANET RADIUS via VPN"

# Enable RADIUS for PPPoE (with interim-update every 5 minutes)
/ppp aaa set use-radius=yes accounting=yes interim-update=5m

# Enable RADIUS for Hotspot
/ip hotspot profile set [find] use-radius=yes

# Enable CoA (Change of Authorization from RADIUS)
/radius incoming set accept=yes port=3799

# Firewall: Allow CoA + Auth from RADIUS server
/ip firewall filter remove [find where comment~"SALFANET-RADIUS"]
/ip firewall filter add chain=input protocol=udp src-address=${credentials.radiusServerIp} dst-port=3799 action=accept comment="SALFANET-RADIUS CoA" place-before=0
/ip firewall filter add chain=input protocol=udp src-address=${credentials.radiusServerIp} dst-port=1812,1813 action=accept comment="SALFANET-RADIUS Auth" place-before=0

# RADIUS NAS Secret: ${credentials.nasSecret}
# Verify: /radius print; /ip firewall filter print where comment~"SALFANET-RADIUS"` : `
# --- RADIUS not configured ---
# Mark one VPN Client as "RADIUS Server" in admin panel first`

    const scriptBase = (vpnCmd: string, iface: string) => {
      const safeApiUsername = credentials.apiUsername || `api-${credentials.vpnIp?.replace(/\./g, '-')}`
      const safeApiPassword = credentials.apiPassword || '<generate-password>'
      const safeWinbox = credentials.winboxRemote || `${credentials.serverHost || credentials.server}:8291`
      return `# ============================================================
# MikroTik VPN Client + RADIUS Setup Script
# NAS: ${credentials.vpnIp}
# VPN Server: ${credentials.server}
# ============================================================

# 1. Create API User Group
/user group add name=api-users policy=read,write,policy,test,sensitive,api comment="Limited API Access Group"

# 2. Create API User
/user add name=${safeApiUsername} group=api-users password=${safeApiPassword} comment="API User for Remote Access"

# 3. Setup ${(selectedVpnType as string).toUpperCase()} Client
/interface ${iface}
${vpnCmd}

# 4. Assign IP Address (if needed)
# /ip address add address=${credentials.vpnIp}/32 interface=${iface}-salfanet

# Remote Winbox Access: ${safeWinbox}
# API Username: ${safeApiUsername}
# API Password: ${safeApiPassword}
${radiusSection}`.trim()
    }

    if (selectedVpnType === 'l2tp') {
      return scriptBase(
        `add connect-to=${credentials.server} user=${credentials.username} password=${credentials.password} disabled=no name=l2tp-client-salfanet use-ipsec=yes ipsec-secret=salfanet-vpn-secret add-default-route=no allow=mschap2 comment="SALFANET VPN"`,
        'l2tp-client'
      )
    } else if (selectedVpnType === 'sstp') {
      return scriptBase(
        `add connect-to=${credentials.server} port=992 user=${credentials.username} password=${credentials.password} disabled=no name=sstp-client-salfanet add-default-route=no authentication=mschap2 certificate=none comment="SALFANET VPN"`,
        'sstp-client'
      )
    } else if (selectedVpnType === 'wireguard') {
      // WireGuard script for RouterOS 7+
      const serverPk = credentials.serverPublicKey || '<SERVER_PUBLIC_KEY>'
      const clientPk = credentials.clientPrivateKey || '<CLIENT_PRIVATE_KEY>'
      const wgPort = credentials.wgPort || 51820
      const serverHost = credentials.serverHost || credentials.server
      const wgSubnet = credentials.wgSubnet || '10.200.0.0/24'
      const wgGatewayIp = credentials.wgGatewayIp || wgSubnet.replace(/\.\d+\/\d+$/, '.1')
      // RADIUS server: prefer explicitly marked isRadiusServer client IP,
      // fallback to VPS gateway IP (10.200.0.1) when using VPS WireGuard mode
      const wgRadiusIp = credentials.radiusServerIp || wgGatewayIp
      const wgRadiusSection = (wgRadiusIp && credentials.nasSecret) ? `

# ============================================================
# 6. RADIUS Configuration (NAS Client)
# ============================================================

# Remove old RADIUS entries
/radius remove [find where comment~"SALFANET"]

# Add RADIUS server — src-address MUST match VPN IP in FreeRADIUS NAS table
#   address     = RADIUS server VPN IP (VPS gateway or isRadiusServer client)
#   src-address = VPN IP of THIS NAS (used by FreeRADIUS to match NAS identity)
/radius add \\
  address=${wgRadiusIp} \\
  secret=${credentials.nasSecret} \\
  service=ppp,hotspot \\
  src-address=${credentials.vpnIp} \\
  authentication-port=1812 \\
  accounting-port=1813 \\
  timeout=3s \\
  require-message-auth=no \\
  comment="SALFANET RADIUS via WireGuard"

# Enable RADIUS for PPPoE
/ppp aaa set use-radius=yes accounting=yes interim-update=5m
# Enable RADIUS for Hotspot
/ip hotspot profile set [find] use-radius=yes
# Enable CoA
/radius incoming set accept=yes port=3799
# Firewall: Allow CoA + Auth from RADIUS server
/ip firewall filter remove [find where comment~"SALFANET-RADIUS"]
/ip firewall filter add chain=input protocol=udp src-address=${wgRadiusIp} dst-port=3799 action=accept comment="SALFANET-RADIUS CoA" place-before=0
/ip firewall filter add chain=input protocol=udp src-address=${wgRadiusIp} dst-port=1812,1813 action=accept comment="SALFANET-RADIUS Auth" place-before=0
# RADIUS Secret: ${credentials.nasSecret}` : `
# --- RADIUS not configured ---
# nasSecret belum tersedia. Buka ulang kredensial setelah refresh halaman.
# Atau tandai satu VPN Client sebagai "RADIUS Server" di panel admin.`
      const safeApiUsername = credentials.apiUsername || `api-${credentials.vpnIp?.replace(/\./g, '-')}`
      const safeApiPassword = credentials.apiPassword || '<generate-on-mikrotik>'
      return `# ============================================================
# MikroTik WireGuard Client Setup Script (RouterOS 7+)
# NAS IP     : ${credentials.vpnIp}
# VPN Subnet : ${wgSubnet}
# VPS Gateway: ${wgGatewayIp}
# RADIUS IP  : ${wgRadiusIp}
# API User   : ${safeApiUsername}
# ============================================================

# 1. Buat WireGuard interface dengan private key NAS
/interface/wireguard/add name=wg-salfanet private-key="${clientPk}"

# 2. Tambah peer (VPS WireGuard server)
#    allowed-address = subnet VPN agar semua host VPN dapat diakses
/interface/wireguard/peers/add interface=wg-salfanet \\
  public-key="${serverPk}" \\
  endpoint-address="${serverHost}" \\
  endpoint-port=${wgPort} \\
  allowed-address="${wgSubnet}" \\
  persistent-keepalive=25

# 3. Assign IP address NAS ke interface WireGuard
/ip/address/remove [find where interface=wg-salfanet]
/ip/address/add address=${credentials.vpnIp}/32 interface=wg-salfanet

# 4. Route seluruh subnet VPN melalui WireGuard
/ip/route/remove [find where comment="SALFANET-VPN"]
/ip/route/add dst-address=${wgSubnet} gateway=wg-salfanet comment="SALFANET-VPN"

# 5. Buat API User (untuk remote management MikroTik)
/user/group/add name=api-users policy=read,write,policy,test,sensitive,api comment="Limited API Access Group"
/user/add name=${safeApiUsername} group=api-users password=${safeApiPassword} comment="API User for Remote Access"
# API Username : ${safeApiUsername}
# API Password : ${safeApiPassword}
${wgRadiusSection}`.trim()
    } else {
      return scriptBase(
        `add connect-to=${credentials.server} user=${credentials.username} password=${credentials.password} disabled=no name=pptp-client-salfanet add-default-route=no comment="SALFANET VPN"`,
        'pptp-client'
      )
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(t('network.copiedToClipboard'), t('network.copied'));
    } catch (error) {
      showError(t('network.failedCopy'), t('network.copyFailed'));
    }
  };

  // Stats
  const totalClients = clients.length;
  const radiusServers = clients.filter(c => c.isRadiusServer).length;
  const activeClients = clients.filter(c => c.isActive).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
          <p className="text-[#00f7ff] font-medium animate-pulse">{t('network.loadingVpnClients')}</p>
        </div>
      </div>
    );
  }

  if (!vpnServers || vpnServers.length === 0) {
    return (
      <main className="bg-background p-6 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none dark:block hidden">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#bc13fe]/15 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#00f7ff]/15 rounded-full blur-[100px]"></div>
        </div>
        <div className="max-w-2xl mx-auto relative z-10">
          <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/10 border-2 border-amber-500/40 rounded-2xl p-10 text-center backdrop-blur-xl">
            <div className="w-20 h-20 mx-auto mb-6 bg-amber-500/20 rounded-2xl flex items-center justify-center">
              <Shield className="w-10 h-10 text-amber-400" />
            </div>
            <h2 className="text-lg sm:text-2xl font-bold text-foreground mb-3">{t('network.vpnServerNotConfigured')}</h2>
            <p className="text-muted-foreground mb-8">
              {t('network.setupVpnServerFirst')}
            </p>
            <a
              href="/admin/network/vpn-server"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black font-bold rounded-xl hover:shadow-[0_0_30px_rgba(0,247,255,0.5)] transition-all duration-300 transform hover:scale-105"
            >
              {t('network.goToVpnServerSetup')}
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
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
                  <div className="p-2.5 bg-gradient-to-br from-[#00f7ff] to-[#bc13fe] rounded-xl shadow-[0_0_20px_rgba(0,247,255,0.4)] flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent">
                    {t('network.vpnClientManagement')}
                  </h1>
                </div>
                <p className="text-muted-foreground ml-14">
                  {t('network.vpnClientManagementDesc')}
                </p>
              </div>
              <button
                onClick={() => {
                  setFormData({ name: '', description: '', vpnServerId: '', vpnType: 'l2tp' })
                  setShowModal(true)
                }}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black font-bold rounded-xl hover:shadow-[0_0_30px_rgba(0,247,255,0.5)] transition-all duration-300 transform hover:scale-105"
              >
                <Plus className="w-5 h-5" />
                {t('network.addVpnClient')}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-[#bc13fe]/30 p-5 hover:border-[#bc13fe]/50 transition-all group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t('common.totalClients')}</p>
                  <p className="text-3xl font-bold text-foreground">{totalClients}</p>
                </div>
                <div className="p-3 bg-[#bc13fe]/20 rounded-xl group-hover:bg-[#bc13fe]/30 transition-colors flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#bc13fe]" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-[#00f7ff]/30 p-5 hover:border-[#00f7ff]/50 transition-all group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t('network.radiusServer')}</p>
                  <p className="text-3xl font-bold text-[#00f7ff]">{radiusServers}</p>
                </div>
                <div className="p-3 bg-[#00f7ff]/20 rounded-xl group-hover:bg-[#00f7ff]/30 transition-colors flex items-center justify-center">
                  <Radio className="w-6 h-6 text-[#00f7ff]" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-green-500/30 p-5 hover:border-green-500/50 transition-all group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t('common.activeClients')}</p>
                  <p className="text-3xl font-bold text-green-400">{activeClients}</p>
                </div>
                <div className="p-3 bg-green-500/20 rounded-xl group-hover:bg-green-500/30 transition-colors flex items-center justify-center">
                  <Wifi className="w-6 h-6 text-green-400" />
                </div>
              </div>
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
                  <span className="text-sm font-bold text-[#00f7ff] uppercase tracking-wider">Cara Penggunaan — Alur VPN Client</span>
                </div>
                {showTutorial ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showTutorial && (
                <div className="px-6 pb-6 border-t border-[#00f7ff]/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
                    {[
                      { step: 1, icon: '🖥️', color: 'border-[#bc13fe]/40 bg-[#bc13fe]/5', title: 'VPN Server Dulu', desc: 'Pastikan VPN Server sudah dikonfigurasi di menu VPN Server (MikroTik CHR atau WireGuard VPS).', link: '/admin/network/vpn-server', linkLabel: '→ Menu VPN Server' },
                      { step: 2, icon: '➕', color: 'border-[#00f7ff]/40 bg-[#00f7ff]/5', title: 'Buat VPN Client', desc: 'Klik "+ Tambah VPN Client", pilih protokol (WireGuard/L2TP/SSTP/PPTP), dan nama NAS. Sistem otomatis generate user & konfigurasi di CHR.', link: null, linkLabel: null },
                      { step: 3, icon: '📋', color: 'border-green-500/40 bg-green-500/5', title: 'Apply Script ke NAS', desc: 'Copy script RouterOS yang dihasilkan → paste di terminal MikroTik/WinBox pada router/NAS pelanggan. VPN akan tersambung otomatis.', link: null, linkLabel: null },
                      { step: 4, icon: '📡', color: 'border-amber-500/40 bg-amber-500/5', title: 'Tandai RADIUS Server', desc: 'Centang "Jadikan RADIUS Server" pada client yang jalan di VPS/Raspberry Pi. Lalu daftarkan NAS di menu NAS/Router.', link: '/admin/network/routers', linkLabel: '→ Menu NAS/Router' },
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
                  <div className="mt-4 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <p className="text-xs text-amber-400/90"><span className="font-bold">💡 Tips protokol:</span> Gunakan <strong>WireGuard</strong> untuk RouterOS 7+ (lebih cepat &amp; modern). Gunakan <strong>L2TP/SSTP</strong> untuk RouterOS 6 atau jika WireGuard tidak support. PPTP sudah deprecated, hindari untuk keamanan.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── WireGuard NAS Peers (VPS sebagai WG Server) ────────────── */}
          <div className="mb-8">
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-[#bc13fe]/30 rounded-2xl overflow-hidden">
              <button
                onClick={() => { setShowWgSection(!showWgSection); if (!showWgSection && wgPeers.length === 0) loadWgPeers(); }}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#bc13fe]/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-gradient-to-br from-[#bc13fe]/30 to-[#00f7ff]/30 rounded-lg flex items-center justify-center">
                    <Wifi className="w-4 h-4 text-[#bc13fe]" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[#bc13fe] uppercase tracking-wider">WireGuard NAS Client Setup</span>
                    <span className="ml-2 text-xs text-muted-foreground">— VPS sebagai WireGuard Server (RouterOS 7+)</span>
                  </div>
                  {wgPeers.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold bg-[#bc13fe]/20 text-[#bc13fe] rounded-full border border-[#bc13fe]/40">{wgPeers.length} peers</span>
                  )}
                </div>
                {showWgSection ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showWgSection && (
                <div className="border-t border-[#bc13fe]/20">
                  {/* Info */}
                  <div className="px-6 pt-4 pb-2">
                    <p className="text-xs text-muted-foreground">Tambahkan NAS/router sebagai WireGuard peer pada VPS server. Setiap NAS mendapat IP VPN dan script RouterOS untuk dikonfigurasi. <strong className="text-[#00f7ff]">Pastikan WireGuard server sudah terinstall di VPS</strong> melalui menu VPN Server → tombol WireGuard.</p>
                  </div>
                  {/* Add Peer Form */}
                  <div className="px-6 py-4 flex items-center gap-3 border-b border-[#bc13fe]/10">
                    <input
                      type="text"
                      value={wgNewPeerName}
                      onChange={(e) => setWgNewPeerName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleWgAddPeer()}
                      placeholder="Nama NAS (contoh: NAS-Kantor-A)"
                      className="flex-1 px-4 py-2.5 bg-input border border-[#bc13fe]/30 rounded-xl text-foreground text-sm placeholder-muted-foreground focus:border-[#bc13fe] focus:ring-2 focus:ring-[#bc13fe]/20 transition-all"
                    />
                    <button
                      onClick={handleWgAddPeer}
                      disabled={wgAddingPeer}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#bc13fe] to-[#ff44cc] text-white font-bold rounded-xl hover:shadow-[0_0_20px_rgba(188,19,254,0.4)] transition-all disabled:opacity-50 text-sm whitespace-nowrap"
                    >
                      {wgAddingPeer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Tambah Peer
                    </button>
                    <button
                      onClick={loadWgPeers}
                      disabled={wgLoading}
                      className="p-2.5 bg-muted/60 dark:bg-slate-800/60 border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors"
                      title="Refresh"
                    >
                      {wgLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Generated Script */}
                  {wgGeneratedScript && (
                    <div className="mx-6 my-4 rounded-xl overflow-hidden border border-green-500/30">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-green-500/10 border-b border-green-500/20">
                        <p className="text-xs font-bold text-green-400 uppercase tracking-wider">✅ Script RouterOS — Paste di MikroTik NAS</p>
                        <button onClick={() => copyToClipboard(wgGeneratedScript)} className="flex items-center gap-1.5 px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/30 transition-all text-xs font-medium">
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                      <pre className="p-4 bg-gray-100 dark:bg-slate-950 text-green-700 dark:text-green-400 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre leading-relaxed">
                        {wgGeneratedScript}
                      </pre>
                      <div className="px-4 py-2 bg-amber-500/5 border-t border-amber-500/20">
                        <p className="text-xs text-amber-400/80">⚠️ Ganti &lt;RADIUS_SECRET&gt; dengan secret RADIUS dari menu NAS/Router → Generate Script.</p>
                      </div>
                    </div>
                  )}
                  {/* Peers List */}
                  {wgLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#bc13fe]" />
                    </div>
                  ) : wgPeers.length === 0 ? (
                    <div className="px-6 py-6 text-center">
                      <p className="text-sm text-muted-foreground">Belum ada WireGuard peer. Tambahkan nama NAS di atas untuk membuat peer baru.</p>
                    </div>
                  ) : (
                    <div className="px-6 pb-4">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 pt-3">Active Peers ({wgPeers.length})</p>
                      <div className="space-y-2">
                        {wgPeers.map((peer, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-muted/40 dark:bg-slate-900/60 border border-[#bc13fe]/20 rounded-xl group">
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-xs text-foreground truncate">{peer.publicKey}</p>
                              <div className="flex items-center gap-3 mt-1">
                                {peer.allowedIps && <span className="text-xs text-[#00f7ff]">{peer.allowedIps}</span>}
                                {peer.lastHandshake && <span className="text-xs text-muted-foreground">Last: {peer.lastHandshake}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleWgRemovePeer(peer.publicKey)}
                              className="ml-3 p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Hapus peer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Clients List */}
          {clients.length === 0 ? (
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-3xl border-2 border-dashed border-[#bc13fe]/40 p-16 text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-[#bc13fe]/20 to-[#00f7ff]/20 rounded-2xl flex items-center justify-center">
                <Shield className="w-10 h-10 text-[#bc13fe]" />
              </div>
              <h3 className="text-lg sm:text-2xl font-bold text-foreground mb-3">{t('network.noVpnClientsYet')}</h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                {t('network.noVpnClientsDesc')}
              </p>
              <button
                onClick={() => {
                  setFormData({ name: '', description: '', vpnServerId: '', vpnType: 'l2tp' })
                  setShowModal(true)
                }}
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black font-bold rounded-xl hover:shadow-[0_0_30px_rgba(0,247,255,0.5)] transition-all duration-300 transform hover:scale-105"
              >
                <Plus className="w-5 h-5" />
                {t('network.addFirstVpnClient')}
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-[#bc13fe]/30 rounded-2xl overflow-hidden hover:border-[#00f7ff]/50 hover:shadow-[0_0_30px_rgba(0,247,255,0.15)] transition-all duration-300 group"
                >
                  <div className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 bg-gradient-to-br from-[#00f7ff]/30 to-[#bc13fe]/30 rounded-lg flex items-center justify-center">
                            <Shield className="w-5 h-5 text-[#00f7ff]" />
                          </div>
                          <h3 className="font-bold text-lg text-foreground group-hover:text-[#00f7ff] transition-colors">{client.name}</h3>
                          {client.isRadiusServer && (
                            <span className="px-3 py-1 text-xs font-bold rounded-lg bg-[#00f7ff]/20 text-[#00f7ff] border border-[#00f7ff]/50 shadow-[0_0_10px_rgba(0,247,255,0.3)]">
                              {t('network.radiusServer')}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                          <div>
                            <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.vpnServer')}</p>
                            <p className="font-medium text-foreground text-sm">
                              {vpnServers.find(s => s.id === client.vpnServerId)?.name || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.vpnIp')}</p>
                            <p className="font-mono text-foreground text-sm">{client.vpnIp}</p>
                          </div>
                          <div>
                            <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.username')}</p>
                            <p className="font-mono text-foreground text-sm">{client.username}</p>
                          </div>
                          {client.winboxPort && (
                            <div>
                              <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.winboxRemote')}</p>
                              <p className="font-mono text-[#00f7ff] text-sm drop-shadow-[0_0_6px_rgba(0,247,255,0.6)]">
                                {vpnServers.find(s => s.id === client.vpnServerId)?.host}:{client.winboxPort}
                              </p>
                            </div>
                          )}
                        </div>

                        {client.description && (
                          <p className="text-xs sm:text-sm text-muted-foreground mt-3">{client.description}</p>
                        )}

                        {/* RADIUS Toggle */}
                        <div className="mt-4 pt-4 border-t border-[#bc13fe]/20">
                          <label className="flex items-center gap-3 cursor-pointer w-fit">
                            <input
                              type="checkbox"
                              checked={client.isRadiusServer || false}
                              onChange={(e) => handleToggleRadiusServer(client.id, e.target.checked)}
              className="w-5 h-5 rounded border-[#bc13fe]/50 bg-background dark:bg-slate-900 text-[#00f7ff] focus:ring-[#00f7ff]/50 focus:ring-offset-0"
                            />
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              {client.isRadiusServer ? t('network.defaultRadiusServer') : t('network.setAsRadiusServer')}
                            </span>
                          </label>
                        </div>

                        {/* VPS Routing Setup — only shown for RADIUS server nodes */}
                        {client.isRadiusServer && (
                          <div className="mt-4 pt-4 border-t border-[#00f7ff]/20">
                            <button
                              onClick={() => toggleRoutingPanel(client.id)}
                              className="flex items-center gap-2 text-sm font-medium text-[#00f7ff] hover:text-white transition-colors w-full text-left"
                            >
                              <div className="p-1.5 bg-[#00f7ff]/20 rounded-lg flex items-center justify-center">
                                <Terminal className="w-3.5 h-3.5 text-[#00f7ff]" />
                              </div>
                              <span>{t('network.vpsRoutingSetup')}</span>
                              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                                <Route className="w-3 h-3" />
                                {vpnServers.find(s => s.id === client.vpnServerId)?.subnet || '—'}
                                {expandedRoutingPanels.has(client.id)
                                  ? <ChevronUp className="w-4 h-4" />
                                  : <ChevronDown className="w-4 h-4" />}
                              </span>
                            </button>

                            {expandedRoutingPanels.has(client.id) && (
                              <div className="mt-3 rounded-xl overflow-hidden border border-[#00f7ff]/20">
                                {/* Panel header */}
                                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#00f7ff]/10 to-[#bc13fe]/10 border-b border-[#00f7ff]/20">
                                  <div>
                                    <p className="text-xs font-bold text-[#00f7ff] uppercase tracking-wider">{t('network.vpsRoutingSetup')}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{t('network.vpsRoutingSetupDesc')}</p>
                                  </div>
                                  <button
                                    onClick={() => copyToClipboard(generateVpsRoutingScript(client))}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00f7ff]/20 border border-[#00f7ff]/30 text-[#00f7ff] rounded-lg hover:bg-[#00f7ff]/30 transition-all text-xs font-medium flex-shrink-0"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    {t('network.copyVpsScript')}
                                  </button>
                                  <button
                                    onClick={() => handleApplyRouting(client)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#bc13fe]/20 border border-[#bc13fe]/30 text-[#bc13fe] rounded-lg hover:bg-[#bc13fe]/30 transition-all text-xs font-medium flex-shrink-0"
                                  >
                                    <Zap className="w-3.5 h-3.5" />
                                    Apply Frontend
                                  </button>
                                </div>
                                {/* Script content */}
                                <pre className="p-4 bg-gray-100 dark:bg-slate-950 text-green-700 dark:text-green-400 text-xs font-mono overflow-x-auto overflow-y-auto max-h-72 whitespace-pre leading-relaxed">
                                  {generateVpsRoutingScript(client)}
                                </pre>
                                {/* Notes */}
                                <div className="px-4 py-3 bg-amber-500/5 border-t border-amber-500/20">
                                  <p className="text-xs text-amber-400/80 flex items-start gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                    {t('network.vpsRoutingNote')}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 lg:pt-1">
                        <button
                          onClick={() => viewCredentials(client)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-[#00f7ff]/20 border border-[#00f7ff]/40 text-[#00f7ff] rounded-xl hover:bg-[#00f7ff]/30 transition-all"
                          title="Lihat Kredensial"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="text-sm font-medium">{t('common.view')}</span>
                        </button>
                        <button
                          onClick={() => handleDelete(client.id, client.name)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/20 transition-all"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-sm font-medium">{t('common.delete')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2.5 sm:p-4">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-[#bc13fe]/50 rounded-2xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(188,19,254,0.3)]">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#00f7ff] to-[#bc13fe] rounded-lg flex items-center justify-center">
                  <Plus className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-foreground">{t('network.addVpnClient')}</h2>
              </div>

              <form onSubmit={handleCreate} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#00f7ff] mb-2">
                    {t('network.vpnServer')} <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.vpnServerId}
                    onChange={(e) => setFormData({ ...formData, vpnServerId: e.target.value })}
                    className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all"
                    required
                  >
                    <option value="" className="bg-slate-800">{t('network.selectVpnClient')}</option>
                    {/* VPS WireGuard option */}
                    {formData.vpnType === 'wireguard' && wgServerInfoLoading && (
                      <option disabled className="bg-slate-800">⏳ Memeriksa VPS WireGuard...</option>
                    )}
                    {formData.vpnType === 'wireguard' && wgServerInfo?.installed && (
                      <option value="__vps_wg__" className="bg-slate-800">
                        🖥️ VPS WireGuard Server ({wgServerInfo.publicIp || 'VPS'} :{wgServerInfo.listenPort || 51820})
                      </option>
                    )}
                    {/* VPS L2TP option */}
                    {formData.vpnType === 'l2tp' && l2tpServerInfoLoading && (
                      <option disabled className="bg-slate-800">⏳ Memeriksa VPS L2TP...</option>
                    )}
                    {formData.vpnType === 'l2tp' && l2tpServerInfo?.installed && (
                      <option value="__vps_l2tp__" className="bg-slate-800">
                        🖥️ VPS L2TP/IPsec Server ({l2tpServerInfo.publicIp || 'VPS'})
                      </option>
                    )}
                    {/* CHR servers */}
                    {vpnServers
                      .filter(server => {
                        if (formData.vpnType === 'wireguard') return server.wgEnabled === true
                        if (formData.vpnType === 'l2tp') return server.l2tpEnabled === true
                        if (formData.vpnType === 'sstp') return server.sstpEnabled === true
                        if (formData.vpnType === 'pptp') return server.pptpEnabled === true
                        return true
                      })
                      .map((server) => (
                        <option key={server.id} value={server.id} className="bg-slate-800">
                          🔷 CHR: {server.name} ({server.host})
                        </option>
                      ))}
                  </select>
                  {formData.vpnType === 'wireguard' && !wgServerInfoLoading && wgServerInfo && !wgServerInfo.installed && vpnServers.filter(s => s.wgEnabled).length === 0 && (
                    <p className="text-xs text-amber-400 mt-1.5">
                      ⚠️ WireGuard belum terinstall di VPS dan tidak ada CHR dengan WireGuard aktif.
                      <a href="/admin/network/vpn-server" className="text-[#00f7ff] underline ml-1">Setup di menu VPN Server</a>.
                    </p>
                  )}
                  {formData.vpnType === 'l2tp' && !l2tpServerInfoLoading && l2tpServerInfo && !l2tpServerInfo.installed && vpnServers.filter(s => s.l2tpEnabled).length === 0 && (
                    <p className="text-xs text-amber-400 mt-1.5">
                      ⚠️ L2TP belum terinstall di VPS dan tidak ada CHR dengan L2TP aktif.
                      <a href="/admin/network/vpn-server" className="text-[#00f7ff] underline ml-1">Setup di menu VPN Server</a>.
                    </p>
                  )}
                  {formData.vpnType && (formData.vpnType === 'sstp' || formData.vpnType === 'pptp') && vpnServers.filter(server => {
                    if (formData.vpnType === 'sstp') return server.sstpEnabled === true
                    if (formData.vpnType === 'pptp') return server.pptpEnabled === true
                    return true
                  }).length === 0 && (
                    <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                      ⚠️ Tidak ada CHR yang mengaktifkan protokol <strong>{formData.vpnType.toUpperCase()}</strong>.
                      <span> Setup di</span><a href="/admin/network/vpn-server" className="text-[#00f7ff] underline ml-1">menu VPN Server</a>.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#00f7ff] mb-2">
                    VPN Protocol <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['wireguard', 'l2tp', 'pptp', 'sstp'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => { setFormData({ ...formData, vpnType: type, vpnServerId: '' }); if (type === 'wireguard') loadWgServerInfo(); if (type === 'l2tp') loadL2tpServerInfo(); }}
                        className={`px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${formData.vpnType === type
                          ? 'bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black shadow-[0_0_15px_rgba(0,247,255,0.4)]'
                          : 'bg-muted/60 dark:bg-slate-800/60 border border-[#bc13fe]/30 text-foreground hover:bg-[#bc13fe]/20'
                        }`}
                      >
                        {type === 'l2tp' ? 'L2TP/IPSec' : type === 'wireguard' ? 'WireGuard' : type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {formData.vpnType === 'wireguard' && (
                    <p className="text-xs text-[#00f7ff]/80 mt-2 flex items-center gap-1"><Wifi className="w-3 h-3" /> WireGuard memerlukan RouterOS 7+ di NAS. Sistem akan menambah peer ke CHR secara otomatis.</p>
                  )}
                  {formData.vpnType === 'pptp' && (
                    <p className="text-xs text-amber-400/80 mt-2">⚠️ PPTP sudah deprecated dan kurang aman. Gunakan WireGuard atau L2TP jika memungkinkan.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#00f7ff] mb-2">
                    {t('network.clientName')} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all"
                    placeholder="e.g., Branch Office A"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#00f7ff] mb-2">
                    {t('network.descriptionOptional')}
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 transition-all resize-none"
                    placeholder={t('network.additionalNotes')}
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-3 bg-muted border border-border text-foreground rounded-xl hover:bg-accent transition-all font-medium"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(0,247,255,0.4)] transition-all disabled:opacity-50"
                  >
                    {creating ? t('common.creating') : t('network.createClient')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Credentials Modal */}
        {showCredentials && credentials && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2.5 sm:p-4">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-[#bc13fe]/50 rounded-2xl max-w-4xl w-full p-6 shadow-[0_0_50px_rgba(188,19,254,0.3)] max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#00f7ff] to-[#bc13fe] rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-foreground">{t('network.vpnClientCredentials')}</h2>
              </div>

              <div className="space-y-6">
                {/* Credentials Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-gradient-to-br from-[#bc13fe]/10 to-[#00f7ff]/10 border border-[#bc13fe]/30 rounded-xl">
                  <div>
                    <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.vpnServer')}</p>
                    <p className="font-mono text-sm text-foreground">{credentials.server}</p>
                  </div>
                  <div>
                    <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.vpnIp')}</p>
                    <p className="font-mono text-sm text-foreground">{credentials.vpnIp}</p>
                  </div>
                  <div>
                    <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.username')}</p>
                    <p className="font-mono text-sm text-foreground">{credentials.username}</p>
                  </div>
                  <div>
                    <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.password')}</p>
                    <p className="font-mono text-sm text-foreground">{credentials.password}</p>
                  </div>
                  {credentials.winboxRemote && (
                    <div>
                      <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.winboxRemote')}</p>
                      <p className="font-mono text-sm text-[#00f7ff] drop-shadow-[0_0_6px_rgba(0,247,255,0.6)]">{credentials.winboxRemote}</p>
                    </div>
                  )}
                  {credentials.apiUsername && (
                    <div>
                      <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.apiUsername')}</p>
                      <p className="font-mono text-sm text-green-400">{credentials.apiUsername}</p>
                    </div>
                  )}
                  {credentials.apiPassword && (
                    <div>
                      <p className="text-[#00f7ff] text-xs uppercase tracking-wider mb-1">{t('network.apiPassword')}</p>
                      <p className="font-mono text-sm text-green-400">{credentials.apiPassword}</p>
                    </div>
                  )}
                  {credentials.radiusServerIp && (
                    <div className="col-span-2 mt-1 p-3 bg-[#bc13fe]/10 border border-[#bc13fe]/30 rounded-lg">
                      <p className="text-[#bc13fe] text-xs uppercase tracking-wider mb-2 font-bold">RADIUS Configuration</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[#bc13fe] text-xs uppercase tracking-wider mb-1">RADIUS Server IP</p>
                          <p className="font-mono text-sm text-amber-300">{credentials.radiusServerIp}</p>
                        </div>
                        <div>
                          <p className="text-[#bc13fe] text-xs uppercase tracking-wider mb-1">NAS Secret</p>
                          <p className="font-mono text-sm text-amber-300">{credentials.nasSecret}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* VPN Type Selector */}
                <div className="p-5 bg-[#00f7ff]/10 border border-[#00f7ff]/30 rounded-xl">
                  <p className="text-sm font-medium text-[#00f7ff] mb-3 uppercase tracking-wider">
                    {t('network.selectVpnType')}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {(['wireguard', 'l2tp', 'pptp', 'sstp'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setSelectedVpnType(type)}
                        className={`flex-1 min-w-[80px] px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedVpnType === type
                          ? 'bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black shadow-[0_0_20px_rgba(0,247,255,0.4)]'
                          : 'bg-muted/60 dark:bg-slate-800/60 border border-[#bc13fe]/30 text-foreground hover:bg-[#bc13fe]/20'
                          }`}
                      >
                        {type === 'l2tp' ? 'L2TP/IPSec' : type === 'wireguard' ? 'WireGuard' : type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {selectedVpnType === 'wireguard' && (
                    <div className="mt-3 p-3 bg-[#bc13fe]/10 border border-[#bc13fe]/30 rounded-xl">
                      <div className="flex items-start gap-2">
                        <Key className="w-4 h-4 text-[#bc13fe] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-[#bc13fe] mb-1">WireGuard Keys</p>
                          {credentials.clientPrivateKey ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-20 shrink-0">Private Key:</span>
                                <code className="text-xs font-mono text-green-400 truncate">{credentials.clientPrivateKey.substring(0, 20)}...</code>
                                <button onClick={() => copyToClipboard(credentials.clientPrivateKey!)} className="text-xs text-[#00f7ff] hover:underline shrink-0"><Copy className="w-3 h-3" /></button>
                              </div>
                              {credentials.serverPublicKey && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-20 shrink-0">Server PubKey:</span>
                                  <code className="text-xs font-mono text-amber-400 truncate">{credentials.serverPublicKey.substring(0, 20)}...</code>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Key dihasilkan otomatis saat membuat client. Gunakan tombol "Lihat" pada client WireGuard.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* MikroTik Script */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-[#00f7ff] uppercase tracking-wider">
                      {t('network.mikrotikConfigScript')}
                    </p>
                    <button
                      onClick={() => copyToClipboard(generateMikroTikScript())}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#bc13fe] to-[#ff44cc] text-white font-bold rounded-lg hover:shadow-[0_0_20px_rgba(188,19,254,0.4)] transition-all text-sm"
                    >
                      <Copy className="w-4 h-4" />
                      {t('network.copyScript')}
                    </button>
                  </div>
                  <pre className="p-5 bg-gray-100 dark:bg-slate-950 text-green-700 dark:text-green-400 border border-[#bc13fe]/30 rounded-xl text-xs overflow-auto max-h-80 whitespace-pre font-mono">
                    {generateMikroTikScript()}
                  </pre>
                </div>

                {/* Important Notes */}
                <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <h4 className="text-sm font-bold text-amber-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <span>⚠️</span> {t('network.importantNotes')}
                  </h4>
                  <ul className="text-xs sm:text-sm text-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-amber-300">{t('network.apiUserGroup')}:</strong> {t('network.limitedPermissions')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-amber-300">{t('network.vpnConnection')}:</strong> {t('network.noDefaultRoute')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <span><strong className="text-amber-300 dark:text-amber-300 text-amber-600">{t('network.remoteAccess')}:</strong> {t('network.useWinboxVia')} <code className="px-1.5 py-0.5 bg-muted dark:bg-slate-800 border border-[#00f7ff]/30 rounded text-[#00f7ff]">{credentials.winboxRemote}</code></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-amber-300">{t('network.apiCredentials')}:</strong> {t('network.forRemoteManagement')}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowCredentials(false)}
                className="w-full mt-6 px-4 py-4 bg-gradient-to-r from-[#bc13fe] to-[#ff44cc] hover:from-[#bc13fe]/90 hover:to-[#ff44cc]/90 rounded-xl transition-all font-bold text-white shadow-[0_0_20px_rgba(188,19,254,0.4)]"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

        {/* Apply Routing via Frontend Modal */}
        {showApplyRoutingModal && applyRoutingClient && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2.5 sm:p-4">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-[#00f7ff]/50 rounded-2xl max-w-xl w-full p-6 shadow-[0_0_50px_rgba(0,247,255,0.3)] max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-[#00f7ff] to-[#bc13fe] rounded-lg flex items-center justify-center">
                    <Route className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Apply VPS Routing</h2>
                </div>
                <button onClick={() => setShowApplyRoutingModal(false)} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Terapkan routing script ke VPS: <span className="text-[#00f7ff] font-medium">{applyRoutingClient.name}</span>
              </p>

              <div className="p-4 rounded-xl border border-[#00f7ff]/30 bg-muted/50 dark:bg-slate-900/60 mb-4">
                <p className="text-xs font-bold text-[#00f7ff] mb-3">🔑 SSH Credentials VPS RADIUS</p>
                <input
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm mb-2"
                    placeholder="IP VPS RADIUS (contoh: 103.151.140.110)"
                    value={applyRoutingForm.host}
                    onChange={(e) => setApplyRoutingForm(p => ({...p, host: e.target.value}))}
                  />
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm"
                    placeholder="SSH Port"
                    type="number"
                    value={applyRoutingForm.port}
                    onChange={(e) => setApplyRoutingForm(p => ({...p, port: e.target.value}))}
                  />
                  <input
                    className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm"
                    placeholder="Username"
                    value={applyRoutingForm.username}
                    onChange={(e) => setApplyRoutingForm(p => ({...p, username: e.target.value}))}
                  />
                </div>
                <input
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm"
                  placeholder="Password"
                  type="password"
                  value={applyRoutingForm.password}
                  onChange={(e) => setApplyRoutingForm(p => ({...p, password: e.target.value}))}
                />
              </div>

              {applyRoutingOutput && (
                <div className="mb-4 p-3 bg-gray-100 dark:bg-slate-950 rounded-xl border border-[#00f7ff]/20 max-h-52 overflow-y-auto">
                  <p className="text-[#00f7ff] text-xs uppercase mb-1 font-bold">Output:</p>
                  <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">{applyRoutingOutput}</pre>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowApplyRoutingModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors"
                >
                  Tutup
                </button>
                <button
                  onClick={executeApplyRouting}
                  disabled={applyRoutingRunning}
                  className="flex-1 px-4 py-2.5 text-sm font-bold bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black rounded-xl hover:shadow-[0_0_20px_rgba(0,247,255,0.4)] transition-all disabled:opacity-50"
                >
                  {applyRoutingRunning ? 'Menjalankan...' : '🚀 Apply Routing'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
