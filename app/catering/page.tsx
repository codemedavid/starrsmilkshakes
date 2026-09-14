'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import PartyHeroSection from '@/components/landing/sections/PartyHeroSection';
import BookingStepsSection from '@/components/landing/sections/BookingStepsSection';
import PartyMenuSection from '@/components/landing/sections/PartyMenuSection';
import PartyCtaSection from '@/components/landing/sections/PartyCtaSection';
import { useCartContext } from '@/contexts/CartContext';
import '@/components/landing/landing.css';

const CateringPage = () => {
  const router = useRouter();
  const cart = useCartContext();

  return (
    <div className="stl-root">
      <LandingHeader cartItemsCount={cart.getTotalItems()} onCartClick={() => router.push('/cart')} />

      <main>
        <PartyHeroSection />
        <BookingStepsSection />
        <PartyMenuSection />
        <PartyCtaSection />
      </main>

      <LandingFooter />
    </div>
  );
};

export default CateringPage;
