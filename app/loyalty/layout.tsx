import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: "Starr's Famous Shakes — Loyalty Card",
  description: 'Earn starrs with every order and unlock rewards at Starr\'s Famous Shakes.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3D8A80',
};

export default function LoyaltyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-[#FAF8F5] antialiased"
      data-theme="light"
      style={{ colorScheme: 'light' }}
    >
      {children}
    </div>
  );
}
