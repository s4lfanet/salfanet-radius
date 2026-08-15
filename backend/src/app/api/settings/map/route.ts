import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

const SINGLETON_ID = 'map-settings-singleton';

// GET /api/settings/map
export async function GET() {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;
  try {
    let settings = await prisma.mapSettings.findFirst();

    if (!settings) {
      settings = await prisma.mapSettings.create({
        data: {
          id: SINGLETON_ID,
          defaultLat: -7.071273611475302,
          defaultLon: 108.04475042198051,
          defaultZoom: 13,
          mapTheme: 'default',
          osrmApiUrl: 'http://router.project-osrm.org',
          followRoad: false,
        },
      });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('[settings/map] Error fetching map settings:', error);
    return NextResponse.json({ error: 'Failed to fetch map settings' }, { status: 500 });
  }
}

// PUT /api/settings/map
export async function PUT(request: NextRequest) {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;
  try {

    const body = await request.json();
    const { defaultLat, defaultLon, defaultZoom, mapTheme, osrmApiUrl, followRoad } = body;

    const lat = parseFloat(defaultLat);
    const lon = parseFloat(defaultLon);
    const zoom = parseInt(defaultZoom, 10);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return NextResponse.json({ error: 'Latitude tidak valid (-90 s/d 90)' }, { status: 400 });
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      return NextResponse.json({ error: 'Longitude tidak valid (-180 s/d 180)' }, { status: 400 });
    }
    if (isNaN(zoom) || zoom < 1 || zoom > 20) {
      return NextResponse.json({ error: 'Zoom tidak valid (1-20)' }, { status: 400 });
    }

    const existing = await prisma.mapSettings.findFirst();

    const data = {
      defaultLat: lat,
      defaultLon: lon,
      defaultZoom: zoom,
      mapTheme: mapTheme || 'default',
      osrmApiUrl: osrmApiUrl || 'http://router.project-osrm.org',
      followRoad: Boolean(followRoad),
    };

    const settings = existing
      ? await prisma.mapSettings.update({ where: { id: existing.id }, data })
      : await prisma.mapSettings.create({ data: { id: SINGLETON_ID, ...data } });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('[settings/map] Error saving map settings:', error);
    return NextResponse.json({ error: 'Failed to save map settings' }, { status: 500 });
  }
}
