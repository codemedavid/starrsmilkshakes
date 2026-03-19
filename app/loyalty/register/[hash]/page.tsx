import { supabaseServer } from '@/lib/supabase-server';
import { isTokenExpired } from '@/lib/loyalty-hash';
import RegisterForm from './RegisterForm';

// ─── types ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ hash: string }>;
}

// ─── Server Component ────────────────────────────────────────────────────────

export default async function RegisterPage({ params }: PageProps) {
  const { hash } = await params;

  // Query the session from Supabase
  const { data: session } = await (supabaseServer.from('loyalty_sessions') as any)
    .select('*')
    .eq('token', hash)
    .eq('purpose', 'registration')
    .single();

  // Not found or tampered
  if (!session) {
    return <ErrorState message="Invalid link." />;
  }

  // Already used
  if (session.used_at) {
    return <ErrorState message="This link has already been used." />;
  }

  // Expired
  if (isTokenExpired(session.expires_at)) {
    return <ErrorState message="This link has expired. Open Messenger to get a new one." />;
  }

  return <RegisterForm hash={hash} psid={session.psid ?? null} />;
}

// ─── ErrorState ──────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5] dark:bg-[#0d1117]">
      <div className="max-w-md w-full bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl p-8 text-center shadow-sm">
        {/* Branded icon */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-xl">⭐</span>
        </div>
        <h1 className="text-lg font-semibold text-stone-800 dark:text-[#e6e6e6] mb-2">
          Starr&apos;s Famous Shakes
        </h1>
        <p className="text-sm text-stone-500 dark:text-[#999] mt-4">{message}</p>
      </div>
    </div>
  );
}
