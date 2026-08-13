import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { generateExcelBuffer, formatDateExport, formatBytes, formatDuration, generatePDFBuffer } from '@/lib/utils/export';
import { checkAuth } from '@/server/middleware/api-auth';
import { formatWIB } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'excel';
  const type = searchParams.get('type'); // pppoe or hotspot
  const routerId = searchParams.get('routerId');
  const username = searchParams.get('username');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const mode = searchParams.get('mode') || 'history'; // 'active' or 'history'

  try {
    let data: any[] = [];
    let stats: any = {};

    if (mode === 'active') {
      // Fetch active sessions from radacct (where acctstoptime is null)
      const activeSessions = await prisma.radacct.findMany({
        where: {
          acctstoptime: null,
          ...(username && { username: { contains: username } }),
          ...(routerId && { nasipaddress: routerId })
        },
        orderBy: { acctstarttime: 'desc' }
      });

      // Get router info
      const routers = await prisma.router.findMany();
      const routerMap = new Map(routers.map(r => [r.nasname, r.name]));

      data = activeSessions.map((s, idx) => ({
        no: idx + 1,
        username: s.username,
        sessionId: s.acctsessionid,
        nasIp: s.nasipaddress,
        router: routerMap.get(s.nasipaddress) || s.nasipaddress,
        framedIp: s.framedipaddress,
        macAddress: s.callingstationid,
        startTime: s.acctstarttime ? formatDateExport(s.acctstarttime) : '',
        duration: s.acctsessiontime ? formatDuration(s.acctsessiontime) : 'N/A',
        upload: formatBytes(Number(s.acctinputoctets || 0)),
        download: formatBytes(Number(s.acctoutputoctets || 0)),
        total: formatBytes(Number(s.acctinputoctets || 0) + Number(s.acctoutputoctets || 0))
      }));

      stats = {
        totalSessions: data.length,
        totalUpload: activeSessions.reduce((sum, s) => sum + Number(s.acctinputoctets || 0), 0),
        totalDownload: activeSessions.reduce((sum, s) => sum + Number(s.acctoutputoctets || 0), 0)
      };

    } else {
      // Fetch session history from radacct
      const where: any = {};
      
      if (username) {
        where.username = { contains: username };
      }
      
      if (routerId) {
        where.nasipaddress = routerId;
      }
      
      if (startDate && endDate) {
        where.acctstarttime = {
          gte: new Date(startDate),
          lte: new Date(endDate + 'T23:59:59')
        };
      }

      const sessions = await prisma.radacct.findMany({
        where,
        orderBy: { acctstarttime: 'desc' },
        take: 10000 // Limit for performance
      });

      // Get router info
      const routers = await prisma.router.findMany();
      const routerMap = new Map(routers.map(r => [r.nasname, r.name]));

      data = sessions.map((s, idx) => ({
        no: idx + 1,
        username: s.username,
        sessionId: s.acctsessionid,
        nasIp: s.nasipaddress,
        router: routerMap.get(s.nasipaddress) || s.nasipaddress,
        framedIp: s.framedipaddress,
        macAddress: s.callingstationid,
        startTime: s.acctstarttime ? formatDateExport(s.acctstarttime) : '',
        stopTime: s.acctstoptime ? formatDateExport(s.acctstoptime) : 'Active',
        duration: s.acctsessiontime ? formatDuration(s.acctsessiontime) : 'N/A',
        upload: formatBytes(Number(s.acctinputoctets || 0)),
        download: formatBytes(Number(s.acctoutputoctets || 0)),
        total: formatBytes(Number(s.acctinputoctets || 0) + Number(s.acctoutputoctets || 0)),
        terminateCause: s.acctterminatecause
      }));

      stats = {
        totalSessions: sessions.length,
        totalDuration: sessions.reduce((sum, s) => sum + (s.acctsessiontime || 0), 0),
        totalUpload: sessions.reduce((sum, s) => sum + Number(s.acctinputoctets || 0), 0),
        totalDownload: sessions.reduce((sum, s) => sum + Number(s.acctoutputoctets || 0), 0)
      };
    }

    if (format === 'pdf') {
      const headers = mode === 'active' 
        ? ['No', 'Username', 'Router', 'IP', 'Duration', 'Upload', 'Download', 'Total']
        : ['No', 'Username', 'Router', 'Start', 'Stop', 'Duration', 'Total'];
      
      const rows = mode === 'active'
        ? data.map(d => [d.no, d.username, d.router, d.framedIp, d.duration, d.upload, d.download, d.total])
        : data.map(d => [d.no, d.username, d.router, d.startTime, d.stopTime, d.duration, d.total]);

      const summary = [
        { label: 'Total Sessions', value: stats.totalSessions.toString() },
        { label: 'Total Upload', value: formatBytes(stats.totalUpload) },
        { label: 'Total Download', value: formatBytes(stats.totalDownload) },
        ...(stats.totalDuration ? [{ label: 'Total Duration', value: formatDuration(stats.totalDuration) }] : [])
      ];

      return NextResponse.json({
        pdfData: {
          title: mode === 'active' ? 'Active Sessions - SALFANET RADIUS' : 'Session History - SALFANET RADIUS',
          headers,
          rows,
          summary,
          generatedAt: formatWIB(new Date())
        }
      });
    }

    // Excel export
    const columns = mode === 'active' ? [
      { key: 'no', header: 'No', width: 6 },
      { key: 'username', header: 'Username', width: 20 },
      { key: 'sessionId', header: 'Session ID', width: 25 },
      { key: 'router', header: 'Router', width: 18 },
      { key: 'nasIp', header: 'NAS IP', width: 15 },
      { key: 'framedIp', header: 'Framed IP', width: 15 },
      { key: 'macAddress', header: 'MAC Address', width: 18 },
      { key: 'startTime', header: 'Start Time', width: 18 },
      { key: 'duration', header: 'Duration', width: 12 },
      { key: 'upload', header: 'Upload', width: 12 },
      { key: 'download', header: 'Download', width: 12 },
      { key: 'total', header: 'Total', width: 12 }
    ] : [
      { key: 'no', header: 'No', width: 6 },
      { key: 'username', header: 'Username', width: 20 },
      { key: 'sessionId', header: 'Session ID', width: 25 },
      { key: 'router', header: 'Router', width: 18 },
      { key: 'nasIp', header: 'NAS IP', width: 15 },
      { key: 'framedIp', header: 'Framed IP', width: 15 },
      { key: 'macAddress', header: 'MAC Address', width: 18 },
      { key: 'startTime', header: 'Start Time', width: 18 },
      { key: 'stopTime', header: 'Stop Time', width: 18 },
      { key: 'duration', header: 'Duration', width: 12 },
      { key: 'upload', header: 'Upload', width: 12 },
      { key: 'download', header: 'Download', width: 12 },
      { key: 'total', header: 'Total', width: 12 },
      { key: 'terminateCause', header: 'Terminate Cause', width: 18 }
    ];

    const excelBuffer = await generateExcelBuffer(data, columns, mode === 'active' ? 'Active Sessions' : 'Session History');

    const filename = `Sessions-${mode}-${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(Buffer.from(excelBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
