import { RouterOSAPI } from 'node-routeros'

export interface MikroTikConfig {
  host: string
  username: string
  password: string
  port?: number
  timeout?: number
}

export class MikroTikConnection {
  private config: MikroTikConfig
  private conn: RouterOSAPI | null = null

  constructor(config: MikroTikConfig) {
    this.config = {
      ...config,
      port: config.port || 8728,
      timeout: config.timeout || 10000,
    }
  }

  async connect(): Promise<void> {
    const timeoutMs = this.config.timeout || 10000
    const connectionConfig = {
      host: this.config.host,
      user: this.config.username,
      password: this.config.password,
      port: this.config.port,
      // node-routeros expects timeout in SECONDS (not ms); our config is in ms → divide by 1000
      timeout: Math.round(timeoutMs / 1000),
    }
    
    console.log('Connecting to MikroTik with config:', {
      host: connectionConfig.host,
      user: connectionConfig.user,
      port: connectionConfig.port,
      timeout: connectionConfig.timeout,
    })
    
    this.conn = new RouterOSAPI(connectionConfig)

    try {
      // Use Promise.race to enforce a hard connection timeout.
      // node-routeros "timeout" is a socket idle timeout and does NOT cover
      // the TCP connection phase — an unreachable host can hang for minutes.
      const connectPromise = this.conn.connect()
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs / 1000}s — host may be unreachable`)), timeoutMs)
      )
      await Promise.race([connectPromise, timeoutPromise])
      console.log('MikroTik connection successful!')
    } catch (error) {
      console.error('MikroTik connection error:', error)
      // Clean up the partially-created connection so disconnect() won't hang
      const c = this.conn
      this.conn = null
      try { c?.close() } catch { /* ignore close errors on failed connection */ }
      throw new Error(`Failed to connect to MikroTik: ${error instanceof Error ? error.message : error}`)
    }
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      const c = this.conn
      this.conn = null
      try {
        await c.close()
      } catch {
        // Ignore close errors — connection may already be dead
      }
    }
  }

  // Public method to execute RouterOS commands
  async execute(command: string, params?: string[]): Promise<any> {
    if (!this.conn) {
      throw new Error('Not connected to MikroTik')
    }
    return await this.conn.write(command, params || [])
  }

  async testConnection(): Promise<{ success: boolean; identity?: string; message: string }> {
    try {
      await this.connect()
      
      // Get router identity
      const identity = await this.conn!.write('/system/identity/print')
      const identityName = identity[0]?.name || 'Unknown'

      await this.disconnect()

      return {
        success: true,
        identity: identityName,
        message: 'Connection successful!',
      }
    } catch (error) {
      try { await this.disconnect() } catch { /* ignore */ }
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : error}`,
      }
    }
  }

  async setupL2TPServer(subnet: string): Promise<boolean> {
    try {
      if (!this.conn) await this.connect()

      // Parse subnet to get IP range
      const [network] = subnet.split('/')
      const parts = network.split('.')
      const baseNetwork = `${parts[0]}.${parts[1]}.${parts[2]}`
      const poolRange = `${baseNetwork}.10-${baseNetwork}.254`
      const localAddress = `${baseNetwork}.1`

      console.log('Setting up L2TP with:', { poolRange, localAddress, subnet })

      // Create or update IP Pool
      try {
        await this.conn!.write('/ip/pool/add', [
          '=name=vpn-pool',
          `=ranges=${poolRange}`,
        ])
      } catch (error: any) {
        // If already exists, update it
        const errorMsg = error.message || ''
        if (errorMsg.includes('already exists') || errorMsg.includes('with such name exists')) {
          const pools = await this.conn!.write('/ip/pool/print', ['?name=vpn-pool'])
          if (pools.length > 0) {
            await this.conn!.write('/ip/pool/set', [
              `=.id=${pools[0]['.id']}`,
              `=ranges=${poolRange}`,
            ])
          }
        } else {
          throw error
        }
      }

      // Create or update PPP Profile
      try {
        await this.conn!.write('/ppp/profile/add', [
          '=name=vpn-profile',
          `=local-address=${localAddress}`,
          '=remote-address=vpn-pool',
          '=dns-server=8.8.8.8,8.8.4.4',
        ])
      } catch (error: any) {
        // If already exists, update it
        const errorMsg = error.message || ''
        if (errorMsg.includes('already exists') || errorMsg.includes('with the same name already exists')) {
          const profiles = await this.conn!.write('/ppp/profile/print', ['?name=vpn-profile'])
          if (profiles.length > 0) {
            await this.conn!.write('/ppp/profile/set', [
              `=.id=${profiles[0]['.id']}`,
              `=local-address=${localAddress}`,
              '=remote-address=vpn-pool',
              '=dns-server=8.8.8.8,8.8.4.4',
            ])
          }
        } else {
          throw error
        }
      }

      // Enable L2TP Server (always set, no create needed)
      await this.conn!.write('/interface/l2tp-server/server/set', [
        '=enabled=yes',
        '=default-profile=vpn-profile',
        '=authentication=mschap2',
        '=use-ipsec=yes',
        '=ipsec-secret=salfanet-vpn-secret',
      ])

      return true
    } catch (error) {
      console.error('L2TP setup error:', error)
      return false
    }
  }

  async setupSSTPServer(): Promise<boolean> {
    try {
      if (!this.conn) await this.connect()

      // Enable SSTP Server on port 992 (non-default, avoids conflict with HTTPS 443)
      await this.conn!.write('/interface/sstp-server/server/set', [
        '=enabled=yes',
        '=default-profile=vpn-profile',
        '=authentication=mschap2',
        '=port=992',
      ])

      return true
    } catch (error) {
      console.error('SSTP setup error:', error)
      return false
    }
  }

  async setupPPTPServer(): Promise<boolean> {
    try {
      if (!this.conn) await this.connect()

      // Enable PPTP Server
      await this.conn!.write('/interface/pptp-server/server/set', [
        '=enabled=yes',
        '=default-profile=vpn-profile',
        '=authentication=mschap2',
      ])

      return true
    } catch (error) {
      console.error('PPTP setup error:', error)
      return false
    }
  }

  async setupWireGuardServer(subnet: string, wgPort: number = 51820): Promise<{ success: boolean; publicKey: string }> {
    try {
      if (!this.conn) await this.connect()

      const [network] = subnet.split('/')
      const parts = network.split('.')
      const baseNetwork = `${parts[0]}.${parts[1]}.${parts[2]}`
      const wgAddress = `${baseNetwork}.1/24`

      // Step 1: Create WireGuard interface (if not exists)
      try {
        const existing = await this.conn!.write('/interface/wireguard/print', ['?name=wg0'])
        if (existing.length === 0) {
          await this.conn!.write('/interface/wireguard/add', [
            '=name=wg0',
            `=listen-port=${wgPort}`,
            '=comment=SALFANET-WG',
          ])
          console.log('WireGuard interface wg0 created')
        } else {
          // Update listen port if changed
          await this.conn!.write('/interface/wireguard/set', [
            `=.id=${existing[0]['.id']}`,
            `=listen-port=${wgPort}`,
          ])
          console.log('WireGuard interface wg0 updated')
        }
      } catch (e) {
        console.error('WireGuard interface create error (may not support WG - ROS7+ required):', e)
        return { success: false, publicKey: '' }
      }

      // Step 2: Assign IP address to wg0
      try {
        const existingAddr = await this.conn!.write('/ip/address/print', ['?interface=wg0'])
        if (existingAddr.length === 0) {
          await this.conn!.write('/ip/address/add', [
            `=address=${wgAddress}`,
            '=interface=wg0',
            '=comment=SALFANET-WG',
          ])
          console.log(`WireGuard address ${wgAddress} assigned`)
        } else {
          await this.conn!.write('/ip/address/set', [
            `=.id=${existingAddr[0]['.id']}`,
            `=address=${wgAddress}`,
          ])
        }
      } catch (e) {
        console.error('WireGuard IP address error:', e)
      }

      // Step 3: Allow WireGuard port in firewall (input chain)
      try {
        const existingFw = await this.conn!.write('/ip/firewall/filter/print', [
          '?comment=SALFANET-WG-INPUT',
        ])
        if (existingFw.length === 0) {
          await this.conn!.write('/ip/firewall/filter/add', [
            '=chain=input',
            '=protocol=udp',
            `=dst-port=${wgPort}`,
            '=action=accept',
            '=comment=SALFANET-WG-INPUT',
          ])
          console.log('WireGuard firewall rule added')
        }
      } catch (e) {
        console.error('WireGuard firewall error:', e)
      }

      // Step 4: Get server public key
      let publicKey = ''
      try {
        const wgIface = await this.conn!.write('/interface/wireguard/print', ['?name=wg0'])
        if (wgIface.length > 0 && wgIface[0]['public-key']) {
          publicKey = wgIface[0]['public-key']
        }
      } catch (e) {
        console.error('Failed to read WireGuard public key:', e)
      }

      return { success: true, publicKey }
    } catch (error) {
      console.error('WireGuard setup error:', error)
      return { success: false, publicKey: '' }
    }
  }

  /**
   * Add a WireGuard peer (NAS client) to the CHR WireGuard server.
   * Returns - peer's allowed IP used in /32 assignment.
   */
  async addWireGuardPeer(peerPublicKey: string, peerVpnIp: string, peerName: string): Promise<boolean> {
    try {
      if (!this.conn) await this.connect()

      // Remove existing peer with same IP if present
      try {
        const existing = await this.conn!.write('/interface/wireguard/peers/print', [
          `?comment=SALFANET-${peerName}`,
        ])
        for (const peer of existing) {
          await this.conn!.write('/interface/wireguard/peers/remove', [`=.id=${peer['.id']}`])
        }
      } catch { /* ignore */ }

      await this.conn!.write('/interface/wireguard/peers/add', [
        '=interface=wg0',
        `=public-key=${peerPublicKey}`,
        `=allowed-address=${peerVpnIp}/32`,
        '=persistent-keepalive=25',
        `=comment=SALFANET-${peerName}`,
      ])

      console.log(`WireGuard peer added: ${peerName} (${peerVpnIp})`)
      return true
    } catch (error) {
      console.error('AddWireGuardPeer error:', error)
      return false
    }
  }

  /**
   * Remove a WireGuard peer by name comment.
   */
  async removeWireGuardPeer(peerName: string): Promise<boolean> {
    try {
      if (!this.conn) await this.connect()
      const existing = await this.conn!.write('/interface/wireguard/peers/print', [
        `?comment=SALFANET-${peerName}`,
      ])
      for (const peer of existing) {
        await this.conn!.write('/interface/wireguard/peers/remove', [`=.id=${peer['.id']}`])
      }
      return true
    } catch (error) {
      console.error('RemoveWireGuardPeer error:', error)
      return false
    }
  }

  async setupNAT(): Promise<boolean> {
    try {
      if (!this.conn) await this.connect()

      // Add NAT Masquerade (skip if already exists)
      try {
        const existing = await this.conn!.write('/ip/firewall/nat/print', [
          '?comment=VPN NAT',
        ])
        if (existing.length === 0) {
          await this.conn!.write('/ip/firewall/nat/add', [
            '=chain=srcnat',
            '=action=masquerade',
            '=comment=VPN NAT',
          ])
        }
      } catch {
        await this.conn!.write('/ip/firewall/nat/add', [
          '=chain=srcnat',
          '=action=masquerade',
          '=comment=VPN NAT',
        ])
      }

      return true
    } catch (error) {
      console.error('NAT setup error:', error)
      return false
    }
  }

  /**
   * Setup firewall forwarding rules for VPN inter-client routing.
   * This allows all VPN clients (NAS routers + VPS/FreeRADIUS) to communicate
   * through the CHR hub. Essential for:
   * - NAS → VPS: RADIUS auth/acct (UDP 1812/1813) via VPN
   * - VPS → NAS: CoA/Disconnect (UDP 3799) via VPN
   * - VPS → NAS: MikroTik API access (TCP 8728) via VPN
   * 
   * Compatible with RouterOS 6 and 7 (uses /ip/firewall/filter path with = syntax)
   */
  async setupVPNForwarding(subnet: string): Promise<boolean> {
    try {
      if (!this.conn) await this.connect()

      const comment = 'SALFANET-VPN-Forward'

      // Check if forwarding rules already exist
      try {
        const existing = await this.conn!.write('/ip/firewall/filter/print', [
          `?comment=${comment}`,
        ])
        if (existing.length > 0) {
          console.log('VPN forwarding rules already exist, skipping...')
          return true
        }
      } catch {
        // Ignore errors, will try to add rules
      }

      // Parse subnet
      const [network] = subnet.split('/')
      const parts = network.split('.')
      const vpnSubnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`

      // Rule 1: Allow forwarding between VPN clients (ppp interfaces)
      // This enables NAS ↔ VPS communication through the CHR hub
      try {
        await this.conn!.write('/ip/firewall/filter/add', [
          '=chain=forward',
          `=src-address=${vpnSubnet}`,
          `=dst-address=${vpnSubnet}`,
          '=action=accept',
          `=comment=${comment}`,
        ])
        console.log('✓ VPN forward rule added (subnet ↔ subnet)')
      } catch (e) {
        console.error('Failed to add VPN forward rule:', e)
      }

      // Rule 2: Allow RADIUS ports from VPN subnet (input chain)
      try {
        await this.conn!.write('/ip/firewall/filter/add', [
          '=chain=input',
          '=protocol=udp',
          `=src-address=${vpnSubnet}`,
          '=dst-port=1812,1813,3799',
          '=action=accept',
          `=comment=${comment}-RADIUS`,
        ])
        console.log('✓ RADIUS input rule added')
      } catch (e) {
        console.error('Failed to add RADIUS input rule:', e)
      }

      // Rule 3: Allow MikroTik API from VPN subnet (input chain)
      try {
        await this.conn!.write('/ip/firewall/filter/add', [
          '=chain=input',
          '=protocol=tcp',
          `=src-address=${vpnSubnet}`,
          '=dst-port=8291,8728,8729',
          '=action=accept',
          `=comment=${comment}-API`,
        ])
        console.log('✓ API input rule added')
      } catch (e) {
        console.error('Failed to add API input rule:', e)
      }

      return true
    } catch (error) {
      console.error('VPN forwarding setup error:', error)
      return false
    }
  }

  async autoSetupVPN(subnet: string): Promise<{
    success: boolean
    l2tp: boolean
    sstp: boolean
    pptp: boolean
    wireguard: boolean
    wgPublicKey: string
    message: string
  }> {
    try {
      await this.connect()

      // Run L2TP/SSTP/PPTP in parallel to cut setup time significantly.
      // WireGuard is intentionally skipped here — use the dedicated
      // "Setup WG Tunnel" button which handles key exchange properly.
      const [l2tp, sstp, pptp] = await Promise.all([
        this.setupL2TPServer(subnet),
        this.setupSSTPServer(),
        this.setupPPTPServer(),
      ])

      await this.setupNAT()
      await this.setupVPNForwarding(subnet)

      await this.disconnect()

      return {
        success: l2tp || sstp || pptp,
        l2tp,
        sstp,
        pptp,
        wireguard: false,
        wgPublicKey: '',
        message: 'VPN Server configured successfully!',
      }
    } catch (error) {
      await this.disconnect()
      return {
        success: false,
        l2tp: false,
        sstp: false,
        pptp: false,
        wireguard: false,
        wgPublicKey: '',
        message: `Setup failed: ${error}`,
      }
    }
  }
}
