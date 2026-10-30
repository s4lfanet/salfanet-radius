import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

interface AggregatedNode {
  id: string;
  type: 'OLT' | 'ODC' | 'ODP' | 'OTB' | 'JOINT_CLOSURE';
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  status: string;
  upstreamId: string | null;
  metadata: Record<string, unknown>;
}

/**
 * GET /api/network/nodes
 *
 * The unified map draws every infrastructure device on one canvas, so this
 * endpoint aggregates the REAL per-type tables (networkOLT, networkODC,
 * networkODP, network_otbs, network_joint_closures) into one normalized
 * node list. The generic `network_nodes` graph table stays empty because
 * every input form writes to the per-type tables — reading only that graph
 * made the unified map show nothing but customers.
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const searchParams = request.nextUrl.searchParams;
    const typeFilter = searchParams.get('type'); // OLT, ODC, ODP, OTB, JOINT_CLOSURE
    const statusFilter = searchParams.get('status');
    const search = searchParams.get('search');
    const q = search ? search.toLowerCase() : null;

    const wants = (t: string) => !typeFilter || typeFilter === t;
    const matches = (n: AggregatedNode) =>
      (!statusFilter || n.status.toLowerCase() === statusFilter.toLowerCase()) &&
      (!q || n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q) || (n.address ?? '').toLowerCase().includes(q));

    const [olts, odcs, odps, otbs, jcs] = await Promise.all([
      wants('OLT') ? prisma.networkOLT.findMany({ select: { id: true, name: true, ipAddress: true, latitude: true, longitude: true, status: true } }) : [],
      wants('ODC') ? prisma.networkODC.findMany({ select: { id: true, name: true, latitude: true, longitude: true, status: true, oltId: true } }) : [],
      wants('ODP') ? prisma.networkODP.findMany({ select: { id: true, name: true, latitude: true, longitude: true, status: true, odcId: true } }) : [],
      wants('OTB') ? prisma.network_otbs.findMany({ select: { id: true, name: true, code: true, latitude: true, longitude: true, status: true } }) : [],
      wants('JOINT_CLOSURE') ? prisma.network_joint_closures.findMany({ select: { id: true, name: true, code: true, latitude: true, longitude: true, status: true } }) : [],
    ]);

    const nodes: AggregatedNode[] = [
      ...olts.map((o): AggregatedNode => ({
        id: o.id, type: 'OLT', code: o.name, name: o.name,
        latitude: o.latitude, longitude: o.longitude,
        address: o.ipAddress ?? null, status: o.status ?? 'active', upstreamId: null,
        metadata: { ipAddress: o.ipAddress },
      })),
      ...odcs.map((o): AggregatedNode => ({
        id: o.id, type: 'ODC', code: o.name, name: o.name,
        latitude: o.latitude, longitude: o.longitude,
        address: null, status: o.status ?? 'active', upstreamId: o.oltId ?? null,
        metadata: {},
      })),
      ...odps.map((o): AggregatedNode => ({
        id: o.id, type: 'ODP', code: o.name, name: o.name,
        latitude: o.latitude, longitude: o.longitude,
        address: null, status: o.status ?? 'active', upstreamId: o.odcId ?? null,
        metadata: {},
      })),
      ...otbs.map((o): AggregatedNode => ({
        id: o.id, type: 'OTB', code: o.code, name: o.name,
        latitude: o.latitude, longitude: o.longitude,
        address: null, status: o.status ?? 'active', upstreamId: null,
        metadata: {},
      })),
      ...jcs.map((o): AggregatedNode => ({
        id: o.id, type: 'JOINT_CLOSURE', code: o.code, name: o.name,
        latitude: o.latitude, longitude: o.longitude,
        address: null, status: o.status ?? 'active', upstreamId: null,
        metadata: {},
      })),
    ];

    const filtered = q || statusFilter ? nodes.filter(matches) : nodes;
    // Stable canvas order: device types grouped, then by name.
    filtered.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '1000');
    const start = (page - 1) * limit;
    const paged = limit >= 1000 ? filtered : filtered.slice(start, start + limit);

    return NextResponse.json({
      success: true,
      data: paged,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
      },
    });
  } catch (error: any) {
    console.error('[Network Nodes API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch network nodes', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/network/nodes - Create new network node (legacy graph table)
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('network.edit');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;
  try {

    const body = await request.json();
    const {
      type,
      code,
      name,
      latitude,
      longitude,
      address,
      status = 'active',
      upstreamId,
      metadata,
    } = body;

    // Validation
    if (!type || !code || !name || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Missing required fields: type, code, name, latitude, longitude' },
        { status: 400 }
      );
    }

    // Check for duplicate code
    const existing = await prisma.network_nodes.findFirst({
      where: { code },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Node with code '${code}' already exists` },
        { status: 409 }
      );
    }

    // Create node
    const node = await prisma.network_nodes.create({
      data: {
        id: `node_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type,
        code,
        name,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address,
        status,
        upstreamId,
        // Note: capacity, usedPorts, availablePorts now stored in metadata
        metadata: metadata || {},
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: authCheck.userId,
        username: (session.user as any)?.name || (session.user as any)?.username,
        action: 'CREATE_NETWORK_NODE',
        description: `Created network node: ${code} (${name})`,
        module: 'NETWORK',
        status: 'success',
        metadata: JSON.stringify({ nodeId: node.id, type, code }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Network node created successfully',
      data: node,
    });
  } catch (error: any) {
    console.error('[Network Nodes API] Create error:', error);
    return NextResponse.json(
      { error: 'Failed to create network node', details: error.message },
      { status: 500 }
    );
  }
}
