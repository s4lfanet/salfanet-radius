import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { changePPPoERateLimit } from '@/server/services/mikrotik/rate-limit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET - List all PPPoE profiles with user count
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profiles = await prisma.pppoeProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    // Map to include userCount
    const profilesWithCount = profiles.map(profile => ({
      ...profile,
      userCount: profile._count?.users || 0,
      _count: undefined, // Remove _count from response
    }));

    return NextResponse.json({
      profiles: profilesWithCount,
      count: profiles.length,
    });
  } catch (error) {
    console.error('Get PPPoE profiles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new PPPoE profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      groupName,
      price,
      downloadSpeed: rawDownloadSpeed,
      uploadSpeed: rawUploadSpeed,
      rateLimit,
      validityValue,
      validityUnit,
      sharedUser,
      hpp,
      ppnActive,
      ppnRate,
    } = body;

    // Parse rateLimit if provided (format: "10M/5M" or full MikroTik format)
    let downloadSpeed = rawDownloadSpeed;
    let uploadSpeed = rawUploadSpeed;

    if (rateLimit && !downloadSpeed && !uploadSpeed) {
      // Extract download/upload from rateLimit (first part before space)
      const speedPart = rateLimit.split(' ')[0]; // e.g., "10M/5M" from "10M/5M 0/0 0/0 8 0/0"
      const [dl, ul] = speedPart.split('/');
      if (dl && ul) {
        // Remove 'M', 'k', etc. suffix and parse
        downloadSpeed = parseInt(dl.replace(/[^0-9]/g, '')) || 0;
        uploadSpeed = parseInt(ul.replace(/[^0-9]/g, '')) || 0;
        // Handle 'k' suffix (kilobits) - convert to Mbps
        if (dl.toLowerCase().includes('k')) downloadSpeed = Math.ceil(downloadSpeed / 1000);
        if (ul.toLowerCase().includes('k')) uploadSpeed = Math.ceil(uploadSpeed / 1000);
      }
    }

    // Validate required fields
    if (!name || !groupName || !price || !downloadSpeed || !uploadSpeed || !validityValue || !validityUnit) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create profile
    const profile = await prisma.pppoeProfile.create({
      data: {
        id: crypto.randomUUID(),
        name,
        description: description || null,
        groupName,
        price: parseInt(price),
        downloadSpeed: parseInt(downloadSpeed),
        uploadSpeed: parseInt(uploadSpeed),
        rateLimit: rateLimit || `${downloadSpeed}M/${uploadSpeed}M`,
        validityValue: parseInt(validityValue),
        validityUnit,
        sharedUser: sharedUser !== undefined ? sharedUser : true,
        isActive: true,
        hpp: hpp !== undefined ? parseInt(hpp) || null : null,
        ppnActive: ppnActive === true,
        ppnRate: ppnRate !== undefined && ppnRate !== null ? (parseInt(ppnRate) || 11) : 11,
      },
    });

    // Sync to FreeRADIUS radgroupreply
    try {
      // Use full rateLimit if provided, otherwise format as downloadM/uploadM
      const finalRateLimit = rateLimit || `${downloadSpeed}M/${uploadSpeed}M`;

      // Check if radgroupreply already exists for this groupName
      const existingGroup = await prisma.radgroupreply.findFirst({
        where: { groupname: groupName, attribute: 'Mikrotik-Group' },
      });

      // Only create radgroupreply if not exists (allow multiple profiles with same group)
      if (!existingGroup) {
        // Create Mikrotik-Group attribute (maps to MikroTik PPP profile)
        await prisma.radgroupreply.create({
          data: {
            groupname: groupName,
            attribute: 'Mikrotik-Group',
            op: ':=',
            value: groupName, // Must match PPP profile name in MikroTik
          },
        });

        // Create Mikrotik-Rate-Limit attribute (bandwidth limitation)
        await prisma.radgroupreply.create({
          data: {
            groupname: groupName,
            attribute: 'Mikrotik-Rate-Limit',
            op: ':=',
            value: finalRateLimit,
          },
        });

        // Create Simultaneous-Use attribute if sharedUser is true (only one device)
        if (sharedUser !== false) {
          await prisma.radgroupcheck.create({
            data: {
              groupname: groupName,
              attribute: 'Simultaneous-Use',
              op: ':=',
              value: '1', // Only 1 concurrent session
            },
          });
        }
      }

      // Mark as synced
      await prisma.pppoeProfile.update({
        where: { id: profile.id },
        data: {
          syncedToRadius: true,
          lastSyncAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        profile: {
          ...profile,
          syncedToRadius: true,
        },
      }, { status: 201 });
    } catch (syncError: any) {
      console.error('RADIUS sync error:', syncError);
      // Profile created but sync failed
      return NextResponse.json({
        success: true,
        profile,
        warning: 'Profile created but RADIUS sync failed',
      }, { status: 201 });
    }
  } catch (error) {
    console.error('Create PPPoE profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update PPPoE profile
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      name,
      description,
      groupName,
      price,
      downloadSpeed: rawDownloadSpeed,
      uploadSpeed: rawUploadSpeed,
      rateLimit: bodyRateLimit,
      validityValue,
      validityUnit,
      sharedUser,
      isActive,
      hpp,
      ppnActive,
      ppnRate,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const currentProfile = await prisma.pppoeProfile.findUnique({ where: { id } });
    if (!currentProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Only parse rateLimit if explicit speeds were NOT provided by client
    let downloadSpeed = rawDownloadSpeed;
    let uploadSpeed = rawUploadSpeed;
    let parsedFromRateLimit = false;

    // Only extract speeds from rateLimit if downloadSpeed or uploadSpeed not provided
    if (bodyRateLimit && (!rawDownloadSpeed || !rawUploadSpeed)) {
      const speedPart = bodyRateLimit.split(' ')[0];
      const [dl, ul] = speedPart.split('/');
      if (dl && ul) {
        if (!rawDownloadSpeed) {
          downloadSpeed = parseInt(dl.replace(/[^0-9]/g, '')) || 0;
          if (dl.toLowerCase().includes('k')) downloadSpeed = Math.ceil(downloadSpeed / 1000);
        }
        if (!rawUploadSpeed) {
          uploadSpeed = parseInt(ul.replace(/[^0-9]/g, '')) || 0;
          if (ul.toLowerCase().includes('k')) uploadSpeed = Math.ceil(uploadSpeed / 1000);
        }
        parsedFromRateLimit = true;
      }
    }

    // Check if groupName changed and new one already exists
    if (groupName && groupName !== currentProfile.groupName) {
      const existingProfile = await prisma.pppoeProfile.findFirst({
        where: { groupName },
      });

      if (existingProfile) {
        return NextResponse.json(
          { error: `Group name "${groupName}" already exists.` },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (groupName) updateData.groupName = groupName;
    if (price) updateData.price = parseInt(price);
    if (downloadSpeed !== undefined) updateData.downloadSpeed = parseInt(downloadSpeed.toString());
    if (uploadSpeed !== undefined) updateData.uploadSpeed = parseInt(uploadSpeed.toString());
    if (bodyRateLimit !== undefined) updateData.rateLimit = bodyRateLimit;
    if (validityValue) updateData.validityValue = parseInt(validityValue);
    if (validityUnit) updateData.validityUnit = validityUnit;
    if (sharedUser !== undefined) updateData.sharedUser = sharedUser;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (hpp !== undefined) updateData.hpp = hpp !== null ? (parseInt(hpp) || null) : null;
    if (ppnActive !== undefined) updateData.ppnActive = ppnActive === true;
    if (ppnRate !== undefined) updateData.ppnRate = ppnRate !== null ? (parseInt(ppnRate) || 11) : 11;

    // Update profile
    const profile = await prisma.pppoeProfile.update({
      where: { id },
      data: updateData,
    });

    // Re-sync to RADIUS if groupName or speeds or sharedUser changed
    if (groupName || parsedFromRateLimit || bodyRateLimit || sharedUser !== undefined) {
      try {
        const oldGroupName = currentProfile.groupName;
        const newGroupName = groupName || currentProfile.groupName;
        const newDownload = downloadSpeed !== undefined ? downloadSpeed : currentProfile.downloadSpeed;
        const newUpload = uploadSpeed !== undefined ? uploadSpeed : currentProfile.uploadSpeed;
        // Use full rateLimit if provided, otherwise simple format
        const rateLimit = bodyRateLimit || `${newDownload}M/${newUpload}M`;

        // Delete old RADIUS entries
        await prisma.radgroupreply.deleteMany({
          where: { groupname: oldGroupName },
        });

        // Delete old Simultaneous-Use check entry
        await prisma.radgroupcheck.deleteMany({
          where: {
            groupname: oldGroupName,
            attribute: 'Simultaneous-Use'
          },
        });

        // Create new RADIUS entries
        await prisma.radgroupreply.createMany({
          data: [
            {
              groupname: newGroupName,
              attribute: 'Mikrotik-Group',
              op: ':=',
              value: newGroupName,
            },
            {
              groupname: newGroupName,
              attribute: 'Mikrotik-Rate-Limit',
              op: ':=',
              value: rateLimit,
            },
          ],
        });

        // Handle Simultaneous-Use attribute for shared user feature
        const finalSharedUser = sharedUser !== undefined ? sharedUser : currentProfile.sharedUser;
        if (finalSharedUser) {
          await prisma.radgroupcheck.create({
            data: {
              groupname: newGroupName,
              attribute: 'Simultaneous-Use',
              op: ':=',
              value: '1',
            },
          });
        }

        // Mark as synced
        await prisma.pppoeProfile.update({
          where: { id },
          data: {
            syncedToRadius: true,
            lastSyncAt: new Date(),
          },
        });

        // If speed changed, apply rate limit change to all active sessions using this profile
        if (parsedFromRateLimit || bodyRateLimit) {
          console.log(`[Profile Update] Speed changed for profile ${newGroupName}, applying rate limit to active sessions...`);

          // Find all users using this profile
          const usersWithProfile = await prisma.pppoeUser.findMany({
            where: { profileId: id },
            select: { username: true },
          });

          // For each user, find active session and apply new rate limit
          const coaResults: any[] = [];
          for (const user of usersWithProfile) {
            const activeSession = await prisma.radacct.findFirst({
              where: { username: user.username, acctstoptime: null },
              select: { acctsessionid: true, nasipaddress: true, framedipaddress: true },
            });

            if (activeSession) {
              // Get router config — prefer match by nasname/ipAddress from radacct
              const routerRow = await prisma.router.findFirst({
                where: {
                  OR: [
                    { nasname: activeSession.nasipaddress ?? '' },
                    { ipAddress: activeSession.nasipaddress ?? '' },
                  ],
                },
                select: { ipAddress: true, nasname: true, port: true, username: true, password: true, secret: true },
              }) || await prisma.router.findFirst({
                where: { isActive: true },
                select: { ipAddress: true, nasname: true, port: true, username: true, password: true, secret: true },
              });

              if (routerRow) {
                const effectiveRateLimit = rateLimit; // Already the new rateLimit
                const result = await changePPPoERateLimit(
                  {
                    ipAddress: routerRow.ipAddress,
                    nasname: routerRow.nasname,
                    port: routerRow.port,
                    username: routerRow.username,
                    password: routerRow.password,
                    secret: routerRow.secret,
                  },
                  user.username,
                  effectiveRateLimit,
                  {
                    acctSessionId: activeSession.acctsessionid || undefined,
                    nasIpAddress: routerRow.ipAddress,
                    framedIpAddress: activeSession.framedipaddress || undefined,
                  },
                  { allowDisconnect: true }
                );

                coaResults.push({ username: user.username, ...result });
              }
            }
          }

          console.log(`[Profile Update] Rate limit applied to ${coaResults.filter(r => r.success).length}/${coaResults.length} active sessions`);

          return NextResponse.json({
            success: true,
            profile,
            coaApplied: coaResults.some(r => r.success),
            coaResults: coaResults.map(r => ({
              username: r.username,
              success: r.success,
              method: r.method,
            })),
          });
        }
      } catch (syncError) {
        console.error('RADIUS re-sync error:', syncError);
      }
    }

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Update PPPoE profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove PPPoE profile
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const profile = await prisma.pppoeProfile.findUnique({ where: { id } });
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if profile is used by any users
    const userCount = await prisma.pppoeUser.count({
      where: { profileId: id },
    });

    if (userCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete profile. ${userCount} user(s) are using this profile.` },
        { status: 400 }
      );
    }

    // Delete RADIUS entries
    try {
      await prisma.radgroupreply.deleteMany({
        where: { groupname: profile.groupName },
      });
    } catch (syncError) {
      console.error('RADIUS cleanup error:', syncError);
    }

    // Delete profile
    await prisma.pppoeProfile.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: 'Profile deleted successfully',
    });
  } catch (error) {
    console.error('Delete PPPoE profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
