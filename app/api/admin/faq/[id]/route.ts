import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { upsertFaq, deleteFaq } from '@/lib/faq-service';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    const body = await request.json();
    const { question, answer, keywords } = body;

    if (!question || !answer || !keywords || !Array.isArray(keywords)) {
      return NextResponse.json(
        { error: 'question, answer, and keywords (array) are required' },
        { status: 400 }
      );
    }

    const faq = await upsertFaq({
      id,
      question,
      answer,
      keywords,
      category: body.category,
      action_type: body.action_type,
      sort_order: body.sort_order,
    });

    if (!faq) {
      return NextResponse.json({ error: 'FAQ entry not found' }, { status: 404 });
    }

    return NextResponse.json({ faq });
  } catch (err) {
    console.error('PATCH /api/admin/faq/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    const success = await deleteFaq(id);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete FAQ entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/faq/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
