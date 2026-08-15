import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import crypto from 'crypto';

// GET - List all templates
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;
  try {

    const templates = await prisma.isolationTemplate.findMany({
      orderBy: [
        { type: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    return NextResponse.json({
      success: true,
      data: templates.map(template => ({
        ...template,
        variables: template.variables || []
      }))
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST - Create new template
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;
  try {

    const body = await request.json();
    const { type, name, subject, message, variables, isActive } = body;

    if (!type || !name || !message) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const template = await prisma.isolationTemplate.create({
      data: {
        id: crypto.randomUUID(),
        type,
        name,
        subject,
        message,
        variables: variables || null,
        isActive: isActive ?? true
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Template created successfully',
      data: template
    });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create template' },
      { status: 500 }
    );
  }
}
