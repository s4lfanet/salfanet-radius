import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-this-32'; // Must be 32 chars
const ALGORITHM = 'aes-256-cbc';

function encryptPassword(text: string): string {
  if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY is required in production.');
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// GET - List all VPN servers
export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Exclude VPS built-in servers (WireGuard & L2TP) — mereka dikelola via halaman VPN Client,
    // bukan VPN Server. Record-nya ada di DB hanya untuk memenuhi FK vpnClient.vpnServerId.
    const VPS_BUILTIN_IDS = ['__vps_wg_server__', '__vps_l2tp_server__']
    const vpnServers = await prisma.vpnServer.findMany({
      where: { id: { notIn: VPS_BUILTIN_IDS } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        host: true,
        username: true,
        apiPort: true,
        subnet: true,
        poolStart: true,
        poolEnd: true,
        gateway: true,
        l2tpEnabled: true,
        sstpEnabled: true,
        pptpEnabled: true,
        openVpnEnabled: true,
        openVpnPort: true,
        wgEnabled: true,
        wgPublicKey: true,
        wgPort: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ servers: vpnServers })
  } catch (error) {
    console.error('Error fetching VPN servers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch VPN servers' },
      { status: 500 }
    )
  }
}

// POST - Create new VPN server
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const data = await request.json()

    const vpnServer = await prisma.vpnServer.create({
      data: {
        name: data.name,
        host: data.host,
        username: data.username,
        password: encryptPassword(data.password),
        apiPort: parseInt(data.apiPort) || 8728,
        subnet: data.subnet || '10.20.30.0/24',
        poolStart: data.poolStart !== undefined ? parseInt(data.poolStart) : 10,
        poolEnd: data.poolEnd !== undefined ? parseInt(data.poolEnd) : 254,
        gateway: data.gateway?.trim() || null,
        l2tpEnabled: !!data.l2tpEnabled,
        sstpEnabled: !!data.sstpEnabled,
        pptpEnabled: !!data.pptpEnabled,
        openVpnEnabled: false,
        wgEnabled: !!data.wgEnabled,
        wgPublicKey: data.wgPublicKey || null,
        wgPort: data.wgPort ? parseInt(data.wgPort) : 51820,
      },
    })

    return NextResponse.json({ server: vpnServer })
  } catch (error) {
    console.error('Error creating VPN server:', error)
    return NextResponse.json(
      { error: 'Failed to create VPN server' },
      { status: 500 }
    )
  }
}

// PUT - Update VPN server
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const data = await request.json()

    const updateData: any = {
      name: data.name,
      host: data.host,
      username: data.username,
      apiPort: parseInt(data.apiPort) || 8728,
      subnet: data.subnet,
      ...(data.poolStart !== undefined ? { poolStart: parseInt(data.poolStart) } : {}),
      ...(data.poolEnd !== undefined ? { poolEnd: parseInt(data.poolEnd) } : {}),
      ...(data.gateway !== undefined ? { gateway: data.gateway?.trim() || null } : {}),
      l2tpEnabled: !!data.l2tpEnabled,
      sstpEnabled: !!data.sstpEnabled,
      pptpEnabled: !!data.pptpEnabled,
      openVpnEnabled: false,
      wgEnabled: !!data.wgEnabled,
      ...(data.wgPublicKey !== undefined ? { wgPublicKey: data.wgPublicKey || null } : {}),
      ...(data.wgPort !== undefined ? { wgPort: parseInt(data.wgPort) || 51820 } : {}),
    }

    // Only update password if provided
    if (data.password && data.password.trim() !== '') {
      updateData.password = encryptPassword(data.password) // encrypted before storage
    }

    const vpnServer = await prisma.vpnServer.update({
      where: { id: data.id },
      data: updateData,
    })

    return NextResponse.json({ server: vpnServer })
  } catch (error) {
    console.error('Error updating VPN server:', error)
    return NextResponse.json(
      { error: 'Failed to update VPN server' },
      { status: 500 }
    )
  }
}

// DELETE - Delete VPN server
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'VPN Server ID required' },
        { status: 400 }
      )
    }

    await prisma.vpnServer.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting VPN server:', error)
    return NextResponse.json(
      { error: 'Failed to delete VPN server' },
      { status: 500 }
    )
  }
}
