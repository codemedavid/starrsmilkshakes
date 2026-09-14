'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import HeroSection from '@/components/landing/sections/HeroSection';
import PromiseSection from '@/components/landing/sections/PromiseSection';
import BestsellersSection from '@/components/landing/sections/BestsellersSection';
import StorySection from '@/components/landing/sections/StorySection';
import MoodSection from '@/components/landing/sections/MoodSection';
import MakeYourOwnSection from '@/components/landing/sections/MakeYourOwnSection';
import SocialSection from '@/components/landing/sections/SocialSection';
import LocationsSection from '@/components/landing/sections/LocationsSection';
import FinalCtaSection from '@/components/landing/sections/FinalCtaSection';
import { useCartContext } from '@/contexts/CartContext';
import { useMenu } from '@/hooks/useMenu';
import { useCategories } from '@/hooks/useCategories';
import '@/components/landing/landing.css';

const HomePage = () => {
  const router = useRouter();
  const cart = useCartContext();
  const { menuItems } = useMenu();
  const { categories } = useCategories();

  return (
    <div className="stl-root">
      <LandingHeader cartItemsCount={cart.getTotalItems()} onCartClick={() => router.push('/cart')} />

      <main>
        <HeroSection />
        <PromiseSection />
        <BestsellersSection menuItems={menuItems} />
        <StorySection />
        <MoodSection categories={categories} />
        <MakeYourOwnSection />
        <SocialSection />
        <LocationsSection />
        <FinalCtaSection />
      </main>

      <LandingFooter />
    </div>
  );
};

export default HomePage;
