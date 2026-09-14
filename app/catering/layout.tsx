import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Party Catering — Starr's Famous Shakes",
  description:
    "Bring Starr's Cart to your next party. Freshly churned shakes and mmunchies, delivered to your celebration."
};

export default function CateringLayout({ children }: { children: ReactNode }) {
  return children;
}
