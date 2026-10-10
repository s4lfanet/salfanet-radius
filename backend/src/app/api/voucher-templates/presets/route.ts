import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { VOUCHER_TEMPLATE_PRESETS } from '@/lib/voucher-template-presets';

/**
 * GET  — the built-in voucher templates (for "start from model" pickers).
 * POST — install the built-ins that aren't in the template list yet,
 *        matched by name, so it is safe to press more than once.
 *        Body (optional): { keys: string[] } to install only some.
 */
export async function GET(_request: NextRequest) {
  const authCheck = await requirePermission('vouchers.view');
  if (!authCheck.authorized) return authCheck.response;
  return NextResponse.json({ success: true, presets: VOUCHER_TEMPLATE_PRESETS });
}

export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('hotspot.manage');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await request.json().catch(() => ({}));
    const keys: string[] | undefined = Array.isArray(body?.keys) ? body.keys : undefined;
    const wanted = VOUCHER_TEMPLATE_PRESETS.filter((p) => !keys || keys.includes(p.key));

    const existing = await prisma.voucherTemplate.findMany({
      where: { name: { in: wanted.map((p) => p.name) } },
      select: { name: true },
    });
    const have = new Set(existing.map((t) => t.name));
    const toCreate = wanted.filter((p) => !have.has(p.name));

    // The first install on an empty list also becomes the default, so
    // printing works without another step.
    const anyDefault = (await prisma.voucherTemplate.count({ where: { isDefault: true } })) > 0;

    for (const [i, p] of toCreate.entries()) {
      await prisma.voucherTemplate.create({
        data: {
          id: crypto.randomUUID(),
          name: p.name,
          htmlTemplate: p.htmlTemplate,
          isDefault: !anyDefault && i === 0,
          isActive: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      installed: toCreate.map((p) => p.name),
      skipped: wanted.filter((p) => have.has(p.name)).map((p) => p.name),
      message:
        toCreate.length > 0
          ? `${toCreate.length} template bawaan ditambahkan.`
          : 'Semua template bawaan sudah ada.',
    });
  } catch (error) {
    console.error('Install voucher template presets error:', error);
    return NextResponse.json({ error: 'Gagal memasang template bawaan' }, { status: 500 });
  }
}
