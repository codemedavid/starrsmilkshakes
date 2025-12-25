import type { ReactNode } from 'react';
import './globals.css';
import FacebookPixel from '@/components/FacebookPixel';

export const metadata = {
  title: "Starr's Famous Shakes",
  description: 'Beracah Cafe online ordering dashboard and storefront.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-starrs-mint-light text-starrs-teal-dark">
        {children}
        <FacebookPixel />
      </body>
    </html>
  );
}
