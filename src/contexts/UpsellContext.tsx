'use client';

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { useCartContext } from './CartContext';
import {
  getUpgradeOffers,
  getPairSuggestions,
  getInterstitialOffers,
} from '@/actions/upsell';
import { mapCartItemsToUpsell, mapCartToUpsellCart } from '@/lib/upsell-helpers';
import type { UpsellOffer, PairOffer, InterstitialOffer, UpsellCartItem } from '@/types/upsell';

// --- Types ---

type UpsellType = 'upgrade' | 'pair' | 'interstitial';
type UpsellResult = 'accepted' | 'skipped';

interface ActiveUpsell {
  type: UpsellType;
  loading: boolean;
  upgradeOffers?: UpsellOffer[];
  pairOffers?: PairOffer[];
  interstitialOffer?: InterstitialOffer;
}

interface UpsellContextValue {
  activeUpsell: ActiveUpsell | null;
  showUpgrade: (itemId: string, category: string, price: number) => Promise<UpsellResult>;
  showPair: (cartItems: UpsellCartItem[]) => Promise<UpsellResult>;
  showInterstitial: () => Promise<UpsellResult>;
  resolveUpsell: (result: UpsellResult) => void;
}

const UpsellContext = createContext<UpsellContextValue | null>(null);

export function useUpsell() {
  const ctx = useContext(UpsellContext);
  if (!ctx) throw new Error('useUpsell must be used inside UpsellProvider');
  return ctx;
}

// --- Provider ---

export function UpsellProvider({ children }: { children: ReactNode }) {
  const cart = useCartContext();
  const [activeUpsell, setActiveUpsell] = useState<ActiveUpsell | null>(null);
  const resolverRef = useRef<((result: UpsellResult) => void) | null>(null);

  const resolveUpsell = useCallback((result: UpsellResult) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setActiveUpsell(null);
  }, []);

  // Prevent stacking — if an upsell is active, skip
  const isActive = useRef(false);

  const showUpgrade = useCallback(
    async (itemId: string, category: string, price: number): Promise<UpsellResult> => {
      if (isActive.current) return 'skipped';
      isActive.current = true;

      setActiveUpsell({ type: 'upgrade', loading: true });

      try {
        const cartItem: UpsellCartItem = {
          menu_item_id: itemId,
          category,
          quantity: 1,
          unit_price: price,
        };
        const existingItems = mapCartItemsToUpsell(cart.cartItems);
        const res = await getUpgradeOffers([...existingItems, cartItem]);

        if (!res.success || !res.data?.length) {
          setActiveUpsell(null);
          isActive.current = false;
          return 'skipped';
        }

        return new Promise<UpsellResult>((resolve) => {
          resolverRef.current = (result) => {
            isActive.current = false;
            resolve(result);
          };
          setActiveUpsell({ type: 'upgrade', loading: false, upgradeOffers: res.data });
        });
      } catch {
        setActiveUpsell(null);
        isActive.current = false;
        return 'skipped';
      }
    },
    [cart.cartItems],
  );

  const showPair = useCallback(
    async (cartItems: UpsellCartItem[]): Promise<UpsellResult> => {
      if (isActive.current) return 'skipped';
      isActive.current = true;

      setActiveUpsell({ type: 'pair', loading: true });

      try {
        const res = await getPairSuggestions(cartItems);

        if (!res.success || !res.data?.length) {
          setActiveUpsell(null);
          isActive.current = false;
          return 'skipped';
        }

        return new Promise<UpsellResult>((resolve) => {
          resolverRef.current = (result) => {
            isActive.current = false;
            resolve(result);
          };
          setActiveUpsell({ type: 'pair', loading: false, pairOffers: res.data });
        });
      } catch {
        setActiveUpsell(null);
        isActive.current = false;
        return 'skipped';
      }
    },
    [],
  );

  const showInterstitial = useCallback(async (): Promise<UpsellResult> => {
    if (isActive.current) return 'skipped';
    isActive.current = true;

    setActiveUpsell({ type: 'interstitial', loading: true });

    try {
      const upsellCart = mapCartToUpsellCart(
        cart.cartItems,
        cart.bundleItems,
        cart.getTotalPrice(),
      );
      const res = await getInterstitialOffers(upsellCart);

      if (!res.success || !res.data) {
        setActiveUpsell(null);
        isActive.current = false;
        return 'skipped';
      }

      return new Promise<UpsellResult>((resolve) => {
        resolverRef.current = (result) => {
          isActive.current = false;
          resolve(result);
        };
        setActiveUpsell({
          type: 'interstitial',
          loading: false,
          interstitialOffer: res.data,
        });
      });
    } catch {
      setActiveUpsell(null);
      isActive.current = false;
      return 'skipped';
    }
  }, [cart]);

  return (
    <UpsellContext.Provider
      value={{ activeUpsell, showUpgrade, showPair, showInterstitial, resolveUpsell }}
    >
      {children}
    </UpsellContext.Provider>
  );
}
