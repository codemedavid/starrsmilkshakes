import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { isCheckoutSessionExpired } from '@/lib/messenger-session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
): Promise<NextResponse> {
  const { hash } = await params;

  const { data: session, error } = await supabaseServer
    .from('messenger_checkout_sessions')
    .select('hash, status, expires_at, cart, branch_id')
    .eq('hash', hash)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.status === 'completed') {
    return NextResponse.json({ error: 'Session already used' }, { status: 410 });
  }

  if (session.status === 'expired' || isCheckoutSessionExpired(session.expires_at)) {
    return NextResponse.json({ error: 'Session expired. Please start again in Messenger.' }, { status: 410 });
  }

  return NextResponse.json({
    cart: session.cart,
    branchId: session.branch_id,
  });
}
