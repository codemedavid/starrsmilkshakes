import type { ReactNode } from 'react';
import './globals.css';
import CustomHeaderScripts from '@/components/CustomHeaderScripts';
import FacebookPixel from '@/components/FacebookPixel';
import { CartProvider } from '@/contexts/CartContext';

export const metadata = {
  title: "Starr's Famous Shakes",
  description: 'Beracah Cafe online ordering dashboard and storefront.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-starrs-mint-light text-starrs-teal-dark">
        <CartProvider>
          {children}
        </CartProvider>
        <CustomHeaderScripts />
        <FacebookPixel />
      </body>
    </html>
  );
}
