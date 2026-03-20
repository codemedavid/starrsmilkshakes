import { supabaseServer } from '@/lib/supabase-server';
import { isCheckoutSessionExpired } from '@/lib/messenger-session';
import CheckoutClient from './CheckoutClient';

interface CheckoutPageProps {
  searchParams: Promise<{ msession?: string }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { msession } = await searchParams;

  let messengerCart = null;
  let messengerError: string | null = null;

  if (msession) {
    const { data: session, error } = await (supabaseServer
      .from('messenger_checkout_sessions') as any)
      .select('hash, status, expires_at, cart, branch_id')
      .eq('hash', msession)
      .single();

    if (error || !session) {
      messengerError = 'Session not found';
    } else if (session.status === 'completed') {
      messengerError = 'Session already used';
    } else if (session.status === 'expired' || isCheckoutSessionExpired(session.expires_at)) {
      messengerError = 'Session expired. Please start again in Messenger.';
    } else {
      messengerCart = session.cart;
    }
  }

  return (
    <CheckoutClient
      messengerCart={messengerCart}
      messengerError={messengerError}
      msession={msession}
    />
  );
}
