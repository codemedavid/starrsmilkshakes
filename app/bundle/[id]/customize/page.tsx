'use client';

import { use, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useCartContext } from '@/contexts/CartContext';
import { fetchBundleById } from '@/lib/bundle-fetcher';
import type { Bundle, SlotSelection, SlotState } from '@/types/bundle';
import type { MenuItem, Variation, AddOn } from '@/types';
import type { BundleSlot } from '@/types/bundle';
import type { PairOffer, InterstitialOffer, UpsellCartItem, UpsellCart } from '@/types/upsell';
import {
  validateBundleSelections,
  calculateBundlePrice,
  calculateBundleSavings,
} from '@/lib/bundle-engine';
import { getPairSuggestions, getInterstitialOffers } from '@/actions/upsell';

import WizardStepIndicator from '@/components/bundle-wizard/WizardStepIndicator';
import SlotStep from '@/components/bundle-wizard/SlotStep';
import BundleReviewStep from '@/components/bundle-wizard/BundleReviewStep';
import BundleUpsellPair from '@/components/bundle-wizard/BundleUpsellPair';
import BundleUpsellInterstitial from '@/components/bundle-wizard/BundleUpsellInterstitial';
import WizardBottomBar from '@/components/bundle-wizard/WizardBottomBar';

interface PageProps {
  params: Promise<{ id: string }>;
}

type WizardPhase = 'slots' | 'review' | 'upsell-pair' | 'upsell-interstitial' | 'done';

export default function BundleWizardPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const cart = useCartContext();

  // Bundle data
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [phase, setPhase] = useState<WizardPhase>('slots');
  const [slotStates, setSlotStates] = useState<SlotState[]>([]);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Upsell state
  const [pairOffers, setPairOffers] = useState<PairOffer[] | null>(null);
  const [interstitialOffer, setInterstitialOffer] = useState<InterstitialOffer | null>(null);

  // Ref to guard pushState against popstate-triggered re-renders
  const isPopStateNav = useRef(false);
  // Ref to track slide direction for step transitions
  const slideDirection = useRef<'left' | 'right'>('left');
  // Ref for step content container to manage focus on transition
  const stepContentRef = useRef<HTMLDivElement>(null);

  // Sorted slots for consistent ordering
  const sortedSlots = useMemo(
    () => bundle ? [...bundle.slots].sort((a, b) => a.sort_order - b.sort_order) : [],
    [bundle]
  );

  // Build SlotSelection[] for engine functions
  const selections = useMemo<SlotSelection[]>(
    () => slotStates.map(s => ({
      slot_id: s.slot_id,
      selected_items: s.selected_items.map(i => ({
        menu_item_id: i.menu_item_id,
        selected_variation: i.selected_variation,
        selected_add_ons: i.selected_add_ons,
      })),
    })),
    [slotStates]
  );

  const priceInfo = useMemo(
    () => bundle ? calculateBundlePrice(bundle, selections, new Date()) : { effectivePrice: 0, addOnsTotal: 0, variationsExtra: 0, total: 0 },
    [bundle, selections]
  );

  const savingsInfo = useMemo(
    () => bundle ? calculateBundleSavings(bundle, selections, new Date()) : { individualTotal: 0, bundleTotal: 0, savings: 0, savingsPercent: 0 },
    [bundle, selections]
  );

  // Validation for the current slot
  const currentSlotValid = useMemo(() => {
    if (!bundle || phase !== 'slots') return false;
    const slot = sortedSlots[currentSlotIndex];
    if (!slot) return false;
    const state = slotStates.find(s => s.slot_id === slot.id);
    return (state?.selected_items.length ?? 0) >= slot.min_selections;
  }, [bundle, phase, sortedSlots, currentSlotIndex, slotStates]);

  // All slots completed
  const allSlotsValid = useMemo(
    () => bundle ? validateBundleSelections(bundle, selections).valid : false,
    [bundle, selections]
  );

  // Completed steps set for indicator
  const completedSteps = useMemo(() => {
    const set = new Set<number>();
    sortedSlots.forEach((slot, i) => {
      const state = slotStates.find(s => s.slot_id === slot.id);
      if (state && state.selected_items.length >= slot.min_selections) set.add(i);
    });
    if (allSlotsValid && phase !== 'slots') set.add(sortedSlots.length); // review step
    return set;
  }, [sortedSlots, slotStates, allSlotsValid, phase]);

  // Step labels for indicator
  const stepLabels = useMemo(
    () => [...sortedSlots.map(s => ({ label: s.label })), { label: 'Review' }],
    [sortedSlots]
  );

  // Fetch bundle
  useEffect(() => {
    async function load() {
      const data = await fetchBundleById(id);
      if (data) {
        setBundle(data);
        const sorted = [...data.slots].sort((a, b) => a.sort_order - b.sort_order);
        setSlotStates(sorted.map(slot => ({ slot_id: slot.id, selected_items: [] })));
      }
      setLoading(false);
    }
    void load();
  }, [id]);

  // Browser history management
  useEffect(() => {
    const handlePopState = () => {
      isPopStateNav.current = true;
      if (phase === 'slots' && currentSlotIndex > 0) {
        slideDirection.current = 'right';
        setCurrentSlotIndex(i => i - 1);
      } else if (phase === 'review') {
        setPhase('slots');
        setCurrentSlotIndex(sortedSlots.length - 1);
      } else if (phase === 'upsell-pair') {
        setPhase('review');
      } else if (phase === 'upsell-interstitial') {
        setPhase(pairOffers && pairOffers.length > 0 ? 'upsell-pair' : 'review');
      } else {
        router.replace('/');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [phase, currentSlotIndex, sortedSlots.length, pairOffers, router]);

  // Push history entry on step change — skip when triggered by popstate
  useEffect(() => {
    if (!bundle) return;
    if (isPopStateNav.current) {
      isPopStateNav.current = false;
      return;
    }
    window.history.pushState({ step: currentSlotIndex, phase }, '');
  }, [currentSlotIndex, phase, bundle]);

  // Focus management: auto-focus first interactive element on step transition
  useEffect(() => {
    if (!stepContentRef.current) return;
    const timer = setTimeout(() => {
      const focusable = stepContentRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus({ preventScroll: true });
    }, 300); // after slide animation completes
    return () => clearTimeout(timer);
  }, [currentSlotIndex, phase]);

  // --- Handlers ---

  const handleSelectItem = useCallback((slotId: string, menuItem: MenuItem) => {
    const slot = sortedSlots.find(s => s.id === slotId);
    if (!slot) return;

    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;

      const alreadySelected = s.selected_items.find(i => i.menu_item_id === menuItem.id);
      if (alreadySelected) {
        return { ...s, selected_items: s.selected_items.filter(i => i.menu_item_id !== menuItem.id) };
      }

      if (slot.max_selections === 1) {
        return {
          ...s,
          selected_items: [{
            menu_item_id: menuItem.id,
            menu_item: menuItem,
            selected_variation: null,
            selected_add_ons: [],
          }],
        };
      }

      if (s.selected_items.length < slot.max_selections) {
        return {
          ...s,
          selected_items: [
            ...s.selected_items,
            { menu_item_id: menuItem.id, menu_item: menuItem, selected_variation: null, selected_add_ons: [] },
          ],
        };
      }
      return s;
    }));
  }, [sortedSlots]);

  const handleVariation = useCallback((slotId: string, menuItemId: string, variation: Variation | null) => {
    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;
      return {
        ...s,
        selected_items: s.selected_items.map(i =>
          i.menu_item_id === menuItemId ? { ...i, selected_variation: variation } : i
        ),
      };
    }));
  }, []);

  const handleToggleAddOn = useCallback((slotId: string, menuItemId: string, addOn: AddOn) => {
    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;
      return {
        ...s,
        selected_items: s.selected_items.map(i => {
          if (i.menu_item_id !== menuItemId) return i;
          const exists = i.selected_add_ons.find(a => a.id === addOn.id);
          return exists
            ? { ...i, selected_add_ons: i.selected_add_ons.filter(a => a.id !== addOn.id) }
            : { ...i, selected_add_ons: [...i.selected_add_ons, addOn] };
        }),
      };
    }));
  }, []);

  const handleNext = useCallback(() => {
    if (phase === 'slots') {
      slideDirection.current = 'left';
      if (editingFromReview) {
        setEditingFromReview(false);
        setPhase('review');
        return;
      }
      if (currentSlotIndex < sortedSlots.length - 1) {
        setCurrentSlotIndex(i => i + 1);
      } else {
        setPhase('review');
      }
    }
  }, [phase, editingFromReview, currentSlotIndex, sortedSlots.length]);

  const handleBack = useCallback(() => {
    slideDirection.current = 'right';
    if (phase === 'slots') {
      if (editingFromReview) {
        setEditingFromReview(false);
        setPhase('review');
        return;
      }
      if (currentSlotIndex > 0) {
        setCurrentSlotIndex(i => i - 1);
      } else {
        // Step 1 back — confirm discard
        const hasSelections = slotStates.some(s => s.selected_items.length > 0);
        if (!hasSelections || window.confirm('Discard your selections?')) {
          router.replace('/');
        }
      }
    } else if (phase === 'review') {
      setPhase('slots');
      setCurrentSlotIndex(sortedSlots.length - 1);
    } else if (phase === 'upsell-pair') {
      setPhase('review');
    } else if (phase === 'upsell-interstitial') {
      setPhase(pairOffers && pairOffers.length > 0 ? 'upsell-pair' : 'review');
    }
  }, [phase, editingFromReview, currentSlotIndex, slotStates, sortedSlots.length, pairOffers, router]);

  const handleEditSlot = useCallback((slotIndex: number) => {
    setEditingFromReview(true);
    setCurrentSlotIndex(slotIndex);
    setPhase('slots');
  }, []);

  // addBundleToCart and addToCartAndFinish must be defined BEFORE handleConfirmReview
  const addBundleToCart = useCallback(() => {
    if (!bundle) return;
    cart.addBundleToCart(bundle, selections, priceInfo.total);
    // cart.bundleItems.length is the pre-add length, which equals the index
    // of the newly pushed item in the [...prev, newItem] callback
    if (quantity > 1) {
      cart.updateBundleQuantity(cart.bundleItems.length, quantity);
    }
  }, [bundle, selections, priceInfo.total, quantity, cart]);

  const addToCartAndFinish = useCallback(() => {
    addBundleToCart();
    router.replace('/');
  }, [addBundleToCart, router]);

  const handleConfirmReview = useCallback(async () => {
    if (!bundle || submitting) return;
    setSubmitting(true);

    // Build upsell cart items from selections
    const upsellCartItems: UpsellCartItem[] = selections.flatMap(sel =>
      sel.selected_items.map(item => ({
        menu_item_id: item.menu_item_id,
        category: bundle.category,
        quantity: quantity,
        unit_price: priceInfo.total,
      }))
    );

    // Fetch upsell data
    try {
      const [pairResult, interstitialResult] = await Promise.all([
        getPairSuggestions(upsellCartItems),
        getInterstitialOffers({
          items: upsellCartItems,
          total: priceInfo.total * quantity,
        }),
      ]);

      const pairs = pairResult.success ? (pairResult.data as PairOffer[] ?? []) : [];
      const interstitial = interstitialResult.success ? (interstitialResult.data as InterstitialOffer | null) : null;

      setPairOffers(pairs);
      setInterstitialOffer(interstitial);

      if (pairs.length > 0) {
        setPhase('upsell-pair');
      } else if (interstitial) {
        setPhase('upsell-interstitial');
      } else {
        addToCartAndFinish();
      }
    } catch {
      // Upsell fetch failed — skip and add to cart
      setSubmitting(false);
      addToCartAndFinish();
    }
  }, [bundle, selections, quantity, priceInfo.total, addToCartAndFinish, submitting]);

  const handlePairSkip = useCallback(() => {
    if (interstitialOffer) {
      setPhase('upsell-interstitial');
    } else {
      addToCartAndFinish();
    }
  }, [interstitialOffer, addToCartAndFinish]);

  const handlePairAdd = useCallback((itemId: string) => {
    // Add the bundle to cart first so it's not lost, then navigate
    // to the paired product page for customization
    addBundleToCart();
    router.replace(`/product/${itemId}?source=pair`);
  }, [addBundleToCart, router]);

  const handleInterstitialAccept = useCallback(() => {
    if (interstitialOffer?.type === 'loyalty_nudge') {
      // Loyalty nudge — just add bundle and go to menu
      addToCartAndFinish();
      return;
    }
    // Add the upsell offer item to regular cart, then add bundle and finish
    if (interstitialOffer?.item) {
      cart.addToCart(interstitialOffer.item as any, 1, undefined, []);
    }
    addToCartAndFinish();
  }, [interstitialOffer, addToCartAndFinish, cart]);

  const handleInterstitialDecline = useCallback(() => {
    addToCartAndFinish();
  }, [addToCartAndFinish]);

  // --- Render ---

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#3D8A80]" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center p-4">
        <h2 className="font-playfair text-2xl font-bold text-stone-900 mb-4">Combo Not Found</h2>
        <button
          onClick={() => router.replace('/')}
          className="px-6 py-2 bg-[#3D8A80] text-white rounded-xl font-nunito font-semibold"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  if (!bundle.available) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center p-4">
        <h2 className="font-playfair text-2xl font-bold text-stone-900 mb-2">Currently Unavailable</h2>
        <p className="font-nunito text-stone-500 mb-4">This bundle is currently unavailable</p>
        <button
          onClick={() => router.replace('/')}
          className="px-6 py-2 bg-[#3D8A80] text-white rounded-xl font-nunito font-semibold"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  const currentSlot = sortedSlots[currentSlotIndex];
  const currentSlotState = slotStates.find(s => s.slot_id === currentSlot?.id);
  const indicatorCurrentStep = phase === 'slots' ? currentSlotIndex : sortedSlots.length;

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Top header with back button */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-100">
        <div className="flex items-center px-4 py-2">
          <button
            onClick={handleBack}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-stone-100 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="flex-1 text-center font-nunito font-bold text-sm text-stone-700 truncate pr-11">
            {bundle.name}
          </h1>
        </div>

        {/* Step indicator — only during slots and review */}
        {(phase === 'slots' || phase === 'review') && (
          <WizardStepIndicator
            steps={stepLabels}
            currentStep={indicatorCurrentStep}
            completedSteps={completedSteps}
          />
        )}
      </div>

      {/* Step content with slide transition */}
      <div
        ref={stepContentRef}
        className="pt-2 transition-transform duration-300 ease-out"
        key={`${phase}-${currentSlotIndex}`}
        style={{
          animation: `${slideDirection.current === 'left' ? 'slideInLeft' : 'slideInRight'} 250ms ease-out`,
        }}
      >
        {/* Slot steps */}
        {phase === 'slots' && currentSlot && currentSlotState && (
          <SlotStep
            slot={currentSlot}
            slotState={currentSlotState}
            onSelectItem={(mi) => handleSelectItem(currentSlot.id, mi)}
            onVariation={(menuItemId, v) => handleVariation(currentSlot.id, menuItemId, v)}
            onToggleAddOn={(menuItemId, a) => handleToggleAddOn(currentSlot.id, menuItemId, a)}
          />
        )}

        {/* Review step */}
        {phase === 'review' && (
          <BundleReviewStep
            bundle={bundle}
            slotStates={slotStates}
            quantity={quantity}
            onQuantityChange={setQuantity}
            onEditSlot={handleEditSlot}
            priceInfo={priceInfo}
            savingsInfo={savingsInfo}
          />
        )}

        {/* Upsell pair — only render when offers exist */}
        {phase === 'upsell-pair' && pairOffers && pairOffers.length > 0 && (
          <BundleUpsellPair
            offers={pairOffers}
            onAddItem={handlePairAdd}
            onSkip={handlePairSkip}
          />
        )}

        {/* Upsell interstitial */}
        {phase === 'upsell-interstitial' && interstitialOffer && (
          <BundleUpsellInterstitial
            offer={interstitialOffer}
            onAccept={handleInterstitialAccept}
            onDecline={handleInterstitialDecline}
          />
        )}
      </div>

      {/* Bottom bar — for slots and review phases */}
      {phase === 'slots' && (
        <WizardBottomBar
          onBack={handleBack}
          onNext={handleNext}
          nextLabel={editingFromReview ? 'Done' : 'Next'}
          nextDisabled={!currentSlotValid}
          totalPrice={priceInfo.total}
          showBack={true}
        />
      )}
      {phase === 'review' && (
        <WizardBottomBar
          onBack={handleBack}
          onNext={handleConfirmReview}
          nextLabel={submitting ? 'Loading...' : `Confirm · ₱${(priceInfo.total * quantity).toFixed(0)}`}
          nextDisabled={!allSlotsValid || submitting}
          totalPrice={0}
          showBack={true}
        />
      )}
      {phase === 'upsell-pair' && (
        <WizardBottomBar
          onBack={handleBack}
          onNext={handlePairSkip}
          nextLabel="Skip"
          nextDisabled={false}
          totalPrice={0}
          showBack={true}
        />
      )}

      {/* Slide transition keyframes */}
      <style>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
