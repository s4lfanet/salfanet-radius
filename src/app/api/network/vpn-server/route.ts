import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'

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
    const vpnServers = await prisma.vpnServer.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        host: true,
        username: true,
        apiPort: true,
        subnet: true,
        l2tpEnabled: true,
        sstpEnabled: true,
        pptpEnabled: true,
        openVpnEnabled: true,
        openVpnPort: true,
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
        password: data.password, // TODO: Encrypt password
        apiPort: parseInt(data.apiPort) || 8728,
        subnet: data.subnet || '10.20.30.0/24',
        l2tpEnabled: !!data.l2tpEnabled,
        sstpEnabled: false,
        pptpEnabled: !!data.pptpEnabled,
        openVpnEnabled: !!data.openVpnEnabled,
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
      l2tpEnabled: !!data.l2tpEnabled,
      sstpEnabled: false,
      pptpEnabled: !!data.pptpEnabled,
      openVpnEnabled: !!data.openVpnEnabled,
    }

    // Only update password if provided
    if (data.password && data.password.trim() !== '') {
      updateData.password = data.password // TODO: Encrypt password
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
