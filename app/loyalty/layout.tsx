import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Starr's Famous Shakes — Loyalty Card",
  description: 'Earn starrs with every order',
};

export default function LoyaltyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0d1117] transition-colors">
      {children}
    </div>
  );
}
