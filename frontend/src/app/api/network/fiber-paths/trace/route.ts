import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/fiber-paths/trace?from=xxx&to=yyy
// Trace fiber path from point A to point B using BFS algorithm
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fromId = searchParams.get('from');
    const toId = searchParams.get('to');

    if (!fromId || !toId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: from, to'
      }, { status: 400 });
    }

    // Get all network nodes
    const [olts, jcs, odcs, odps] = await Promise.all([
      prisma.networkOLT.findMany(),
      prisma.network_joint_closures.findMany(),
      prisma.networkODC.findMany(),
      prisma.networkODP.findMany()
    ]);

    // Build adjacency list for graph
    const graph: Map<string, Array<{ id: string; type: string; name: string; distance?: number }>> = new Map();
    const nodeDetails: Map<string, any> = new Map();

    // Add all nodes to details map
    olts.forEach((node: any) => {
      nodeDetails.set(node.id, { ...node, type: 'OLT' });
      graph.set(node.id, []);
    });

    jcs.forEach((node: any) => {
      nodeDetails.set(node.id, { ...node, type: 'JOINT_CLOSURE' });
      graph.set(node.id, []);
      
      // Parse connections from Joint Closure
      const connections = Array.isArray(node.connections) ? node.connections : [];
      connections.forEach((conn: any) => {
        if (conn.to) {
          graph.get(node.id)?.push({
            id: conn.to,
            type: 'UNKNOWN',
            name: '',
            distance: conn.distance || 0
          });
        }
      });
    });

    odcs.forEach((node: any) => {
      nodeDetails.set(node.id, { ...node, type: 'ODC' });
      graph.set(node.id, []);
      
      // Connect ODC to parent OLT or JC
      if (node.oltId) {
        graph.get(node.oltId)?.push({
          id: node.id,
          type: 'ODC',
          name: node.name,
          distance: 0
        });
      }
    });

    odps.forEach((node: any) => {
      nodeDetails.set(node.id, { ...node, type: 'ODP' });
      graph.set(node.id, []);
      
      // Connect ODP to parent ODC
      if (node.odcId) {
        graph.get(node.odcId)?.push({
          id: node.id,
          type: 'ODP',
          name: node.name,
          distance: 0
        });
      }
    });

    // BFS to find shortest path
    const queue: Array<{ node: string; path: string[]; totalDistance: number }> = [
      { node: fromId, path: [fromId], totalDistance: 0 }
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const { node, path, totalDistance } = current;

      if (node === toId) {
        // Found the path! Build detailed response
        const detailedPath = path.map((nodeId, index) => {
          const detail = nodeDetails.get(nodeId);
          return {
            type: detail?.type || 'UNKNOWN',
            id: nodeId,
            name: detail?.name || 'Unknown',
            order: index + 1,
            coordinates: detail ? {
              lat: detail.latitude,
              lng: detail.longitude
            } : null,
            ...(index > 0 && { distance: 100 }) // Placeholder distance
          };
        });

        // Calculate summary
        const pathLength = detailedPath.reduce((sum, node) => sum + (node.distance || 0), 0);

        return NextResponse.json({
          success: true,
          path: detailedPath,
          summary: {
            totalNodes: path.length,
            totalDistance: pathLength,
            estimatedLoss: -15 - (path.length * 2), // Placeholder calculation
            status: 'active',
            redundancy: 'none'
          },
          alternatives: [] // TODO: Implement alternative routes
        });
      }

      if (visited.has(node)) {
        continue;
      }

      visited.add(node);

      const neighbors = graph.get(node) || [];
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor.id)) {
          queue.push({
            node: neighbor.id,
            path: [...path, neighbor.id],
            totalDistance: totalDistance + (neighbor.distance || 0)
          });
        }
      });
    }

    // No path found
    return NextResponse.json({
      success: false,
      error: 'No path found between the two points'
    }, { status: 404 });

  } catch (error: any) {
    console.error('Error tracing fiber path:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to trace fiber path'
    }, { status: 500 });
  }
}
