import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { 
  ATTENUATION_CONSTANTS,
} from '@/lib/network/fiber-core-types';

// Trace result interface
interface TraceResult {
  startCore: {
    id: string;
    tubeNumber: number;
    coreNumber: number;
    cableId: string;
    cableName: string;
  };
  steps: TraceStep[];
  totalAttenuation: number;
  signalBudget: {
    oltTxPower: number;
    totalAttenuation: number;
    expectedSignal: number;
    onuSensitivity: number;
    safetyMargin: number;
    isWithinBudget: boolean;
    margin: number;
  };
  visitedDevices: string[];
}

interface TraceStep {
  order: number;
  type: 'CORE' | 'DEVICE';
  deviceType: string;
  deviceId: string;
  deviceName: string;
  coreId?: string;
  tubeNumber?: number;
  coreNumber?: number;
  spliceId?: string;
  spliceType?: string;
  attenuation: number;
  cumulativeAttenuation: number;
  notes: string;
}

/**
 * Trace fiber path from a specific core
 */
async function traceCoreFromId(
  coreId: string,
  direction: 'upstream' | 'downstream' | 'both' = 'both'
): Promise<TraceResult> {
  const startCore = await prisma.fiber_cores.findUnique({
    where: { id: coreId },
    include: {
      tube: {
        include: {
          cable: true,
        },
      },
    },
  });

  if (!startCore) {
    throw new Error('Core not found');
  }

  const steps: TraceStep[] = [];
  let totalAttenuation = 0;
  const visitedCores = new Set<string>();
  const visitedDevices = new Set<string>();

  // Helper to add a step
  const addStep = (step: TraceStep) => {
    steps.push(step);
    totalAttenuation += step.attenuation || 0;
  };

  // Add starting point
  addStep({
    order: 0,
    type: 'CORE',
    deviceType: startCore.tube?.cable ? 'CABLE' : 'UNKNOWN',
    deviceId: startCore.tube?.cableId || '',
    deviceName: startCore.tube?.cable?.name || 'Unknown Cable',
    coreId: startCore.id,
    tubeNumber: startCore.tube?.tubeNumber || 0,
    coreNumber: startCore.coreNumber,
    attenuation: 0,
    cumulativeAttenuation: 0,
    notes: `Starting core: T${startCore.tube?.tubeNumber}-C${startCore.coreNumber}`,
  });

  // Trace upstream (towards OLT)
  if (direction === 'upstream' || direction === 'both') {
    let currentCoreId = coreId;
    let order = 0;

    while (currentCoreId && !visitedCores.has(currentCoreId)) {
      visitedCores.add(currentCoreId);
      
      // Find splice where this core is the outgoing
      const incomingSplice = await prisma.splice_points.findFirst({
        where: {
          outgoingCoreId: currentCoreId,
          status: 'ACTIVE',
        },
        include: {
          incomingCore: {
            include: {
              tube: {
                include: {
                  cable: true,
                },
              },
            },
          },
        },
      });

      if (!incomingSplice) {
        break;
      }

      order++;
      const deviceKey = `${incomingSplice.deviceType}-${incomingSplice.deviceId}`;
      
      if (!visitedDevices.has(deviceKey)) {
        visitedDevices.add(deviceKey);
        
        // Add device step
        addStep({
          order,
          type: 'DEVICE',
          deviceType: incomingSplice.deviceType,
          deviceId: incomingSplice.deviceId,
          deviceName: `${incomingSplice.deviceType} - Tray ${incomingSplice.trayNumber}`,
          spliceId: incomingSplice.id,
          spliceType: incomingSplice.spliceType,
          attenuation: Number(incomingSplice.insertionLoss) || ATTENUATION_CONSTANTS.SPLICE_LOSS_FUSION,
          cumulativeAttenuation: totalAttenuation,
          notes: `Splice at ${incomingSplice.deviceType}`,
        });
      }

      if (incomingSplice.incomingCore) {
        order++;
        addStep({
          order,
          type: 'CORE',
          deviceType: 'CABLE',
          deviceId: incomingSplice.incomingCore.tube?.cableId || '',
          deviceName: incomingSplice.incomingCore.tube?.cable?.name || 'Unknown Cable',
          coreId: incomingSplice.incomingCore.id,
          tubeNumber: incomingSplice.incomingCore.tube?.tubeNumber || 0,
          coreNumber: incomingSplice.incomingCore.coreNumber,
          attenuation: 0,
          cumulativeAttenuation: totalAttenuation,
          notes: `Core T${incomingSplice.incomingCore.tube?.tubeNumber}-C${incomingSplice.incomingCore.coreNumber}`,
        });
        currentCoreId = incomingSplice.incomingCoreId;
      } else {
        break;
      }
    }
  }

  // Trace downstream (towards customer)
  if (direction === 'downstream' || direction === 'both') {
    let currentCoreId = coreId;
    let order = steps.length;

    while (currentCoreId && !visitedCores.has(currentCoreId)) {
      visitedCores.add(currentCoreId);
      
      // Find splice where this core is the incoming
      const outgoingSplice = await prisma.splice_points.findFirst({
        where: {
          incomingCoreId: currentCoreId,
          status: 'ACTIVE',
        },
        include: {
          outgoingCore: {
            include: {
              tube: {
                include: {
                  cable: true,
                },
              },
            },
          },
        },
      });

      if (!outgoingSplice) {
        break;
      }

      order++;
      const deviceKey = `${outgoingSplice.deviceType}-${outgoingSplice.deviceId}`;
      
      if (!visitedDevices.has(deviceKey)) {
        visitedDevices.add(deviceKey);
        
        addStep({
          order,
          type: 'DEVICE',
          deviceType: outgoingSplice.deviceType,
          deviceId: outgoingSplice.deviceId,
          deviceName: `${outgoingSplice.deviceType} - Tray ${outgoingSplice.trayNumber}`,
          spliceId: outgoingSplice.id,
          spliceType: outgoingSplice.spliceType,
          attenuation: Number(outgoingSplice.insertionLoss) || ATTENUATION_CONSTANTS.SPLICE_LOSS_FUSION,
          cumulativeAttenuation: totalAttenuation,
          notes: `Splice at ${outgoingSplice.deviceType}`,
        });
      }

      if (outgoingSplice.outgoingCore) {
        order++;
        addStep({
          order,
          type: 'CORE',
          deviceType: 'CABLE',
          deviceId: outgoingSplice.outgoingCore.tube?.cableId || '',
          deviceName: outgoingSplice.outgoingCore.tube?.cable?.name || 'Unknown Cable',
          coreId: outgoingSplice.outgoingCore.id,
          tubeNumber: outgoingSplice.outgoingCore.tube?.tubeNumber || 0,
          coreNumber: outgoingSplice.outgoingCore.coreNumber,
          attenuation: 0,
          cumulativeAttenuation: totalAttenuation,
          notes: `Core T${outgoingSplice.outgoingCore.tube?.tubeNumber}-C${outgoingSplice.outgoingCore.coreNumber}`,
        });
        currentCoreId = outgoingSplice.outgoingCoreId || '';
      } else {
        break;
      }
    }
  }

  // Calculate signal budget
  const signalBudget = {
    oltTxPower: ATTENUATION_CONSTANTS.OLT_TX_POWER,
    totalAttenuation,
    expectedSignal: ATTENUATION_CONSTANTS.OLT_TX_POWER - totalAttenuation,
    onuSensitivity: ATTENUATION_CONSTANTS.ONU_SENSITIVITY,
    safetyMargin: ATTENUATION_CONSTANTS.SAFETY_MARGIN,
    isWithinBudget: (ATTENUATION_CONSTANTS.OLT_TX_POWER - totalAttenuation) > 
      (ATTENUATION_CONSTANTS.ONU_SENSITIVITY + ATTENUATION_CONSTANTS.SAFETY_MARGIN),
    margin: (ATTENUATION_CONSTANTS.OLT_TX_POWER - totalAttenuation) - 
      (ATTENUATION_CONSTANTS.ONU_SENSITIVITY + ATTENUATION_CONSTANTS.SAFETY_MARGIN),
  };

  return {
    startCore: {
      id: startCore.id,
      tubeNumber: startCore.tube?.tubeNumber || 0,
      coreNumber: startCore.coreNumber,
      cableId: startCore.tube?.cableId || '',
      cableName: startCore.tube?.cable?.name || '',
    },
    steps: steps.sort((a, b) => a.order - b.order),
    totalAttenuation,
    signalBudget,
    visitedDevices: Array.from(visitedDevices),
  };
}

// GET /api/network/trace - Trace fiber path
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'core';
    const coreId = searchParams.get('coreId');
    const customerId = searchParams.get('customerId');
    const odpId = searchParams.get('odpId');
    const portNumber = searchParams.get('portNumber');
    const deviceType = searchParams.get('deviceType');
    const deviceId = searchParams.get('deviceId');
    const direction = (searchParams.get('direction') || 'both') as 'upstream' | 'downstream' | 'both';

    switch (type) {
      case 'core': {
        if (!coreId) {
          return NextResponse.json(
            { error: 'Missing required parameter: coreId' },
            { status: 400 }
          );
        }

        const trace = await traceCoreFromId(coreId, direction);
        return NextResponse.json(trace);
      }

      case 'customer': {
        if (!customerId) {
          return NextResponse.json(
            { error: 'Missing required parameter: customerId' },
            { status: 400 }
          );
        }

        // Find the customer's ODP assignment
        const assignment = await prisma.odpCustomerAssignment.findFirst({
          where: {
            customerId: customerId,
          },
          include: {
            odp: {
              select: {
                id: true,
                name: true,
              },
            },
            customer: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
          },
        });

        if (!assignment) {
          return NextResponse.json(
            { error: 'Customer ODP assignment not found' },
            { status: 404 }
          );
        }

        // For now, return the assignment info
        // Full core trace would require the core assignment to be set up
        return NextResponse.json({
          customer: {
            id: assignment.customer?.id,
            name: assignment.customer?.name,
            username: assignment.customer?.username,
          },
          odp: assignment.odp,
          portNumber: assignment.portNumber,
          note: 'Full core trace requires fiber core assignments to be configured',
        });
      }

      case 'odp': {
        if (!odpId) {
          return NextResponse.json(
            { error: 'Missing required parameter: odpId' },
            { status: 400 }
          );
        }

        // Get ODP info with hierarchy
        const odp = await prisma.networkODP.findUnique({
          where: { id: odpId },
          include: {
            odc: {
              select: { id: true, name: true },
            },
            olt: {
              select: { id: true, name: true },
            },
            parentOdp: {
              select: { id: true, name: true },
            },
            childOdps: {
              select: { id: true, name: true },
            },
          },
        });

        if (!odp) {
          return NextResponse.json({ error: 'ODP not found' }, { status: 404 });
        }

        // Get customer assignments
        const assignments = await prisma.odpCustomerAssignment.findMany({
          where: {
            odpId: odpId,
          },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                username: true,
                status: true,
              },
            },
          },
          orderBy: { portNumber: 'asc' },
        });

        return NextResponse.json({
          odp: {
            id: odp.id,
            name: odp.name,
            hierarchyLevel: (odp as any).hierarchyLevel,
            splitterType: odp.splitterType,
            splitterRatio: odp.splitterRatio,
            portCount: odp.portCount,
          },
          hierarchy: {
            upstream: odp.odc || odp.olt || null,
            parent: odp.parentOdp || null,
            children: odp.childOdps || [],
          },
          assignments: assignments.map(a => ({
            portNumber: a.portNumber,
            customer: a.customer,
          })),
        });
      }

      case 'device': {
        if (!deviceType || !deviceId) {
          return NextResponse.json(
            { error: 'Missing required parameters: deviceType, deviceId' },
            { status: 400 }
          );
        }

        // Map common device type names to enum values
        const deviceTypeMap: Record<string, 'OTB' | 'JOINT_CLOSURE' | 'ODC' | 'ODP'> = {
          'OTB': 'OTB',
          'JOINT_CLOSURE': 'JOINT_CLOSURE',
          'JC': 'JOINT_CLOSURE',
          'ODC': 'ODC',
          'ODP': 'ODP',
        };

        const mappedDeviceType = deviceTypeMap[deviceType.toUpperCase()];
        if (!mappedDeviceType) {
          return NextResponse.json(
            { error: 'Invalid device type. Supported types: OTB, JOINT_CLOSURE, ODC, ODP' },
            { status: 400 }
          );
        }

        // Get all splices at this device
        const splices = await prisma.splice_points.findMany({
          where: {
            deviceType: mappedDeviceType,
            deviceId,
            status: 'ACTIVE',
          },
          include: {
            incomingCore: {
              include: {
                tube: {
                  include: {
                    cable: {
                      select: { id: true, code: true, name: true },
                    },
                  },
                },
              },
            },
            outgoingCore: {
              include: {
                tube: {
                  include: {
                    cable: {
                      select: { id: true, code: true, name: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: [
            { trayNumber: 'asc' },
            { createdAt: 'asc' },
          ],
        });

        return NextResponse.json({
          deviceType,
          deviceId,
          spliceCount: splices.length,
          splices: splices.map((s) => ({
            id: s.id,
            trayNumber: s.trayNumber,
            spliceType: s.spliceType,
            insertionLoss: s.insertionLoss ? Number(s.insertionLoss) : null,
            status: s.status,
            incomingCore: s.incomingCore ? {
              id: s.incomingCore.id,
              tube: s.incomingCore.tube?.tubeNumber,
              core: s.incomingCore.coreNumber,
              cable: s.incomingCore.tube?.cable?.code,
            } : null,
            outgoingCore: s.outgoingCore ? {
              id: s.outgoingCore.id,
              tube: s.outgoingCore.tube?.tubeNumber,
              core: s.outgoingCore.coreNumber,
              cable: s.outgoingCore.tube?.cable?.code,
            } : null,
          })),
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid trace type. Supported types: core, customer, odp, device' },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[FIBER_TRACE_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to trace fiber path', details: err.message },
      { status: 500 }
    );
  }
}
