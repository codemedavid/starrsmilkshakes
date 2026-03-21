import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { getAllFaqs, upsertFaq } from '@/lib/faq-service';

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const faqs = await getAllFaqs();
    return NextResponse.json({ faqs });
  } catch (err) {
    console.error('GET /api/admin/faq error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const { question, answer, keywords } = body;

    if (!question || !answer || !keywords || !Array.isArray(keywords)) {
      return NextResponse.json(
        { error: 'question, answer, and keywords (array) are required' },
        { status: 400 }
      );
    }

    const faq = await upsertFaq({
      question,
      answer,
      keywords,
      category: body.category,
      action_type: body.action_type,
      sort_order: body.sort_order,
    });

    if (!faq) {
      return NextResponse.json({ error: 'Failed to create FAQ entry' }, { status: 500 });
    }

    return NextResponse.json({ faq }, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/faq error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
