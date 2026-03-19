# Cart & Checkout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the cart and checkout pages with Starr's brand identity (sage teal + cream), a guided accordion checkout flow, and mobile-first layout.

**Architecture:** Decompose the 1165-line `Checkout.tsx` into a `CheckoutAccordion` orchestrator with 4 step components (`BranchStep`, `ServiceDetailsStep`, `PaymentStep`, `ReviewStep`). Create a dedicated `/cart` route replacing the `/?view=cart` URL param. Preserve all existing integrations (upsells, msession, Lalamove, Meta Pixel, Messenger handoff).

**Tech Stack:** Next.js App Router, React Context (existing CartContext), Tailwind CSS with custom design tokens, existing Supabase hooks.

**Spec:** `docs/superpowers/specs/2026-03-19-checkout-cart-redesign-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `app/cart/page.tsx` | Dedicated cart route, reads CartContext, renders redesigned Cart |
| `src/components/checkout/StepHeader.tsx` | Reusable collapsed/active/locked step chrome with expand/collapse |
| `src/components/checkout/BranchStep.tsx` | Branch selection with localStorage auto-fill |
| `src/components/checkout/ServiceDetailsStep.tsx` | Service type pills, contextual fields, customer form, notes |
| `src/components/checkout/PaymentStep.tsx` | Payment method grid, QR/account display, reference number |
| `src/components/checkout/ReviewStep.tsx` | Order summary (regular + bundle items), Messenger CTA |
| `src/components/checkout/CheckoutStickyBar.tsx` | Sticky bottom bar with total + step indicator |
| `src/components/checkout/CheckoutAccordion.tsx` | Step orchestrator, manages active/completed states, form state |

### Modified Files
| File | Changes |
|------|---------|
| `tailwind.config.js` | Add brand design tokens (`starrs-sage`, `starrs-deep`, `starrs-linen`, etc.) |
| `src/components/Cart.tsx` | Complete rewrite — new brand design, renders bundleItems |
| `app/checkout/page.tsx` | Replace Checkout component with upsell flow → CheckoutAccordion |
| `app/page.tsx` | Remove cart view toggle, always show menu |
| `src/components/FloatingCartButton.tsx` | Link to `/cart` instead of toggling view |

### Untouched Files (preserved as-is)
| File | Why |
|------|-----|
| `src/contexts/CartContext.tsx` | Cart state works, no changes needed |
| `src/components/UpgradeScreen.tsx` | Upsell flow preserved |
| `src/components/BestPairScreen.tsx` | Upsell flow preserved |
| `src/components/CheckoutInterstitial.tsx` | Upsell flow preserved |
| `src/hooks/useOrders.ts` | Order creation hook unchanged |
| `src/hooks/usePaymentMethods.ts` | Payment methods hook unchanged |
| `src/hooks/useAddressAutocomplete.ts` | Address autocomplete hook unchanged |

---

## Task 1: Add Brand Design Tokens

**Files:**
- Modify: `tailwind.config.js:16-50` (colors section)

- [ ] **Step 1: Add new color tokens to Tailwind config**

Add these tokens alongside existing `starrs` colors (don't remove old ones — other components use them):

```javascript
// Inside theme.extend.colors.starrs, add:
sage: {
  DEFAULT: '#8FB8A8',
  light: '#A8CFC0',
},
deep: '#2A5A4A',
linen: '#F6F1EB',
'cream-brand': '#FFF8E7',
'mint-soft': '#F0F7F4',
muted: '#6B8F80',
```

- [ ] **Step 2: Verify Tailwind picks up the new tokens**

Run: `npx tailwindcss --help` (just verify Tailwind is installed and config is valid)

No build errors = tokens are valid.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "style: add brand design tokens for checkout redesign"
```

---

## Task 2: Create StepHeader Component

**Files:**
- Create: `src/components/checkout/StepHeader.tsx`

This is the reusable chrome for each accordion step — handles collapsed (completed), active, and locked states.

- [ ] **Step 1: Create the checkout directory**

```bash
mkdir -p src/components/checkout
```

- [ ] **Step 2: Implement StepHeader**

```tsx
// src/components/checkout/StepHeader.tsx
'use client';

import React from 'react';

export type StepState = 'completed' | 'active' | 'locked';

interface StepHeaderProps {
  stepNumber: number;
  title: string;
  state: StepState;
  summary?: string; // collapsed summary text, shown when completed
  onEdit?: () => void; // called when "Edit" tapped on completed step
  children?: React.ReactNode; // step content, shown when active
}

export default function StepHeader({
  stepNumber,
  title,
  state,
  summary,
  onEdit,
  children,
}: StepHeaderProps) {
  if (state === 'completed') {
    return (
      <div className="bg-white rounded-[14px] px-4 py-3 mb-2 border-l-[3px] border-starrs-sage shadow-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-starrs-sage text-white flex items-center justify-center text-[11px] font-bold">
              ✓
            </div>
            <div>
              <div className="text-[11px] text-starrs-sage font-semibold uppercase tracking-wider">
                {title}
              </div>
              {summary && (
                <div className="font-semibold text-sm text-gray-800">{summary}</div>
              )}
            </div>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="text-xs text-starrs-sage font-semibold"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    );
  }

  if (state === 'locked') {
    return (
      <div className="bg-gray-100 rounded-[14px] px-4 py-3 mb-2 opacity-60">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-300 text-white flex items-center justify-center text-xs">
            {stepNumber}
          </div>
          <span className="font-semibold text-gray-400">{title}</span>
        </div>
      </div>
    );
  }

  // active
  return (
    <div className="bg-white rounded-[14px] p-4 mb-2 border-2 border-starrs-sage shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-starrs-deep text-starrs-cream-brand flex items-center justify-center text-xs font-bold">
          {stepNumber}
        </div>
        <span className="font-bold text-[15px]">{title}</span>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/StepHeader.tsx
git commit -m "feat(checkout): add StepHeader component for accordion steps"
```

---

## Task 3: Create BranchStep Component

**Files:**
- Create: `src/components/checkout/BranchStep.tsx`
- Reference: `src/components/BranchSelector.tsx` (existing modal — reuse fetch logic pattern)
- Reference: `src/types/index.ts` (Branch type)

- [ ] **Step 1: Implement BranchStep**

This component handles branch selection inline (not as a modal). It reads the last-used branch from localStorage and auto-selects it.

```tsx
// src/components/checkout/BranchStep.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Branch } from '@/types';

interface BranchStepProps {
  selectedBranch: Branch | null;
  onSelect: (branch: Branch) => void;
  onContinue: () => void;
}

const STORAGE_KEY = 'starrs_selected_branch';

export default function BranchStep({ selectedBranch, onSelect, onContinue }: BranchStepProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!selectedBranch);

  useEffect(() => {
    const fetchBranches = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('is_main', { ascending: false })
        .order('name');
      if (data) setBranches(data);
      setLoading(false);
    };
    fetchBranches();
  }, []);

  // Auto-select from localStorage on mount (current code stores full JSON object)
  useEffect(() => {
    if (!selectedBranch && branches.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Match by ID from the fetched branches to get fresh data
          const match = branches.find((b) => b.id === parsed.id);
          if (match) {
            onSelect(match);
            setExpanded(false);
          }
        } catch {
          // Invalid stored value, ignore
        }
      }
    }
  }, [branches, selectedBranch, onSelect]);

  const handleSelect = (branch: Branch) => {
    onSelect(branch);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(branch));
    setExpanded(false);
  };

  if (loading) {
    return <div className="text-center py-4 text-starrs-muted text-sm">Loading branches...</div>;
  }

  if (!expanded && selectedBranch) {
    return (
      <div className="space-y-2">
        <div className="bg-starrs-mint-soft rounded-xl p-3 flex justify-between items-center">
          <div>
            <div className="font-semibold text-sm">{selectedBranch.name}</div>
            <div className="text-xs text-starrs-muted">{selectedBranch.address}</div>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-starrs-sage font-semibold"
          >
            Change
          </button>
        </div>
        <button
          onClick={onContinue}
          className="w-full py-3.5 bg-starrs-sage text-starrs-cream-brand rounded-xl text-[15px] font-bold"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {branches.map((branch) => (
        <button
          key={branch.id}
          onClick={() => handleSelect(branch)}
          className={`w-full text-left rounded-xl p-3 border-2 transition-colors ${
            selectedBranch?.id === branch.id
              ? 'border-starrs-sage bg-starrs-mint-soft'
              : 'border-transparent bg-gray-50 hover:bg-starrs-mint-soft'
          }`}
        >
          <div className="font-semibold text-sm">{branch.name}</div>
          <div className="text-xs text-starrs-muted">{branch.address}</div>
          {branch.phone && (
            <div className="text-xs text-starrs-muted">{branch.phone}</div>
          )}
        </button>
      ))}
      {selectedBranch && (
        <button
          onClick={onContinue}
          className="w-full py-3.5 bg-starrs-sage text-starrs-cream-brand rounded-xl text-[15px] font-bold"
        >
          Continue
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/checkout/BranchStep.tsx
git commit -m "feat(checkout): add BranchStep with localStorage auto-selection"
```

---

## Task 4: Create ServiceDetailsStep Component

**Files:**
- Create: `src/components/checkout/ServiceDetailsStep.tsx`
- Reference: `src/hooks/useAddressAutocomplete.ts` (address search)
- Reference: `src/types/index.ts` (ServiceType, AddressSuggestion)

- [ ] **Step 1: Implement ServiceDetailsStep**

This is the largest step component — handles service type pills, contextual fields (pickup time, delivery address), customer info, and special instructions.

```tsx
// src/components/checkout/ServiceDetailsStep.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Clock, Search, MapPin, Loader2 } from 'lucide-react';
import { ServiceType, AddressSuggestion } from '@/types';
import { useAddressAutocomplete } from '@/hooks/useAddressAutocomplete';
import { fetchDeliveryQuotation, buildLalamoveConfig } from '@/lib/lalamove';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import type { Branch } from '@/types';

interface ServiceDetailsData {
  serviceType: ServiceType;
  customerName: string;
  contactNumber: string;
  address: string;
  landmark: string;
  pickupTime: string;
  customTime: string;
  notes: string;
  deliveryCoordinates: { lat: number; lng: number } | null;
  deliveryFee: number | null;
  lalamoveQuotationId: string | null;
}

interface ServiceDetailsStepProps {
  data: ServiceDetailsData;
  onChange: (data: Partial<ServiceDetailsData>) => void;
  selectedBranch: Branch | null;
  onContinue: () => void;
}

const SERVICE_TYPES: { value: ServiceType; label: string; icon: string }[] = [
  { value: 'dine-in', label: 'Dine In', icon: '🪑' },
  { value: 'pickup', label: 'Pickup', icon: '🚶' },
  { value: 'delivery', label: 'Delivery', icon: '🛵' },
];

const PICKUP_TIMES = ['5-10', '15-20', '25-30'];

export default function ServiceDetailsStep({
  data,
  onChange,
  selectedBranch,
  onContinue,
}: ServiceDetailsStepProps) {
  const [addressQuery, setAddressQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { siteSettings } = useSiteSettings();

  const { suggestions, loading: addressLoading } = useAddressAutocomplete(
    data.serviceType === 'delivery' ? addressQuery : ''
  );

  // Pre-fill from localStorage
  useEffect(() => {
    const storedName = localStorage.getItem('starrs_customer_name');
    const storedPhone = localStorage.getItem('starrs_customer_phone');
    if (storedName && !data.customerName) onChange({ customerName: storedName });
    if (storedPhone && !data.contactNumber) onChange({ contactNumber: storedPhone });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch delivery fee when coordinates change
  // Signature: fetchDeliveryQuotation(deliveryAddress, deliveryCoordinates, config) => { quotationId, price, currency, expiresAt }
  // Signature: buildLalamoveConfig(settings, branch) => DeliveryStoreConfig | null
  useEffect(() => {
    if (data.serviceType !== 'delivery' || !data.deliveryCoordinates || !selectedBranch || !siteSettings) return;

    let cancelled = false;
    const fetchFee = async () => {
      setDeliveryFeeLoading(true);
      try {
        const config = buildLalamoveConfig(siteSettings, selectedBranch);
        if (!config) {
          onChange({ deliveryFee: null, lalamoveQuotationId: null });
          return;
        }
        const result = await fetchDeliveryQuotation(
          data.address,
          data.deliveryCoordinates!,
          config
        );
        if (!cancelled) {
          onChange({
            deliveryFee: result.price,
            lalamoveQuotationId: result.quotationId,
          });
        }
      } catch {
        if (!cancelled) {
          onChange({ deliveryFee: null, lalamoveQuotationId: null });
        }
      } finally {
        if (!cancelled) setDeliveryFeeLoading(false);
      }
    };
    fetchFee();
    return () => { cancelled = true; };
  }, [data.deliveryCoordinates, data.serviceType, data.address, selectedBranch, siteSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSuggestionSelect = (suggestion: AddressSuggestion) => {
    onChange({
      address: suggestion.display_name,
      deliveryCoordinates: {
        lat: parseFloat(suggestion.lat),
        lng: parseFloat(suggestion.lon),
      },
    });
    setAddressQuery(suggestion.display_name);
    setShowSuggestions(false);
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        addressInputRef.current &&
        !addressInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard navigation for suggestions
  const handleAddressKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      handleSuggestionSelect(suggestions[selectedSuggestionIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleContinue = () => {
    // Persist customer info for returning customers
    localStorage.setItem('starrs_customer_name', data.customerName);
    localStorage.setItem('starrs_customer_phone', data.contactNumber);
    onContinue();
  };

  // Normalize PH phone number (same logic as current Checkout)
  const normalizePhone = (value: string) => {
    const digits = value.replace(/[^\d+]/g, '');
    if (digits.startsWith('09') && digits.length >= 3) {
      return '+63' + digits.substring(1);
    }
    return value;
  };

  const isValid =
    data.customerName.trim() !== '' &&
    data.contactNumber.trim() !== '' &&
    (data.serviceType !== 'delivery' || (data.address.trim() !== '' && data.deliveryCoordinates !== null));

  return (
    <div className="space-y-4">
      {/* Service Type Pills */}
      <div className="flex gap-2">
        {SERVICE_TYPES.map((st) => (
          <button
            key={st.value}
            onClick={() => onChange({ serviceType: st.value })}
            className={`flex-1 py-2.5 px-1.5 rounded-xl text-center transition-colors ${
              data.serviceType === st.value
                ? 'bg-starrs-deep text-starrs-cream-brand'
                : 'bg-starrs-mint-soft text-starrs-deep'
            }`}
          >
            <div className="text-lg mb-0.5">{st.icon}</div>
            <div className="text-xs font-semibold">{st.label}</div>
          </button>
        ))}
      </div>

      {/* Pickup Time (conditional) */}
      {data.serviceType === 'pickup' && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-starrs-muted block">Pickup Time</label>
          <div className="flex gap-2">
            {PICKUP_TIMES.map((time) => (
              <button
                key={time}
                onClick={() => onChange({ pickupTime: time, customTime: '' })}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  data.pickupTime === time && !data.customTime
                    ? 'bg-starrs-sage text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {time} min
              </button>
            ))}
            <button
              onClick={() => onChange({ pickupTime: 'custom' })}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                data.pickupTime === 'custom' || data.customTime
                  ? 'bg-starrs-sage text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              <Clock className="w-3 h-3 mx-auto" />
            </button>
          </div>
          {(data.pickupTime === 'custom' || data.customTime) && (
            <input
              type="time"
              value={data.customTime}
              onChange={(e) => onChange({ customTime: e.target.value, pickupTime: 'custom' })}
              className="w-full px-3 py-2.5 border-[1.5px] border-starrs-mint-soft rounded-xl text-sm bg-gray-50"
            />
          )}
        </div>
      )}

      {/* Delivery Address (conditional) */}
      {data.serviceType === 'delivery' && (
        <div className="space-y-2 relative">
          <label className="text-xs font-semibold text-starrs-muted block">Delivery Address</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-starrs-muted" />
            <input
              ref={addressInputRef}
              type="text"
              value={addressQuery}
              onChange={(e) => {
                setAddressQuery(e.target.value);
                setShowSuggestions(true);
                setSelectedSuggestionIndex(-1);
              }}
              onKeyDown={handleAddressKeyDown}
              placeholder="Search for your address..."
              className="w-full pl-9 pr-3 py-2.5 border-[1.5px] border-starrs-mint-soft rounded-xl text-sm bg-gray-50"
            />
            {addressLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-starrs-sage animate-spin" />
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full bg-white rounded-xl shadow-lg border border-gray-100 max-h-48 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.place_id}
                  onClick={() => handleSuggestionSelect(s)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-starrs-mint-soft ${
                    i === selectedSuggestionIndex ? 'bg-starrs-mint-soft' : ''
                  }`}
                >
                  <MapPin className="w-3 h-3 inline mr-1 text-starrs-muted" />
                  {s.display_name}
                </button>
              ))}
            </div>
          )}
          {data.address && (
            <div className="text-xs text-starrs-muted flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {data.address}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-starrs-muted block mb-1">Landmark (recommended)</label>
            <input
              type="text"
              value={data.landmark}
              onChange={(e) => onChange({ landmark: e.target.value })}
              placeholder="Near a landmark? Helps the rider find you"
              className="w-full px-3 py-2.5 border-[1.5px] border-starrs-mint-soft rounded-xl text-sm bg-gray-50"
            />
          </div>
          {/* Delivery fee display */}
          {data.deliveryCoordinates && (
            <div className="bg-starrs-mint-soft rounded-xl p-3 text-sm flex justify-between items-center">
              <span className="text-starrs-muted">Delivery Fee</span>
              {deliveryFeeLoading ? (
                <span className="flex items-center gap-1 text-starrs-sage">
                  <Loader2 className="w-3 h-3 animate-spin" /> Calculating...
                </span>
              ) : data.deliveryFee !== null ? (
                <span className="font-bold text-starrs-deep">₱{data.deliveryFee}</span>
              ) : (
                <span className="text-amber-600 text-xs">Fee pending</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Customer Fields */}
      <div className="space-y-2">
        <div>
          <label className="text-xs font-semibold text-starrs-muted block mb-1">Full Name</label>
          <input
            type="text"
            value={data.customerName}
            onChange={(e) => onChange({ customerName: e.target.value })}
            placeholder="Your name"
            className="w-full px-3 py-2.5 border-[1.5px] border-starrs-mint-soft rounded-xl text-sm bg-gray-50"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-starrs-muted block mb-1">Phone Number</label>
          <input
            type="tel"
            value={data.contactNumber}
            onChange={(e) => onChange({ contactNumber: e.target.value })}
            onBlur={(e) => onChange({ contactNumber: normalizePhone(e.target.value) })}
            placeholder="+63 912 345 6789"
            className="w-full px-3 py-2.5 border-[1.5px] border-starrs-mint-soft rounded-xl text-sm bg-gray-50"
          />
        </div>
      </div>

      {/* Special Instructions */}
      <div>
        <label className="text-xs font-semibold text-starrs-muted block mb-1">Special Instructions (optional)</label>
        <textarea
          value={data.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Any special requests for your order?"
          rows={2}
          className="w-full px-3 py-2.5 border-[1.5px] border-starrs-mint-soft rounded-xl text-sm bg-gray-50 resize-none"
        />
      </div>

      {/* Continue */}
      <button
        onClick={handleContinue}
        disabled={!isValid}
        className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-colors ${
          isValid
            ? 'bg-starrs-sage text-starrs-cream-brand'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        Continue
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/checkout/ServiceDetailsStep.tsx
git commit -m "feat(checkout): add ServiceDetailsStep with service pills, address, and customer form"
```

---

## Task 5: Create PaymentStep Component

**Files:**
- Create: `src/components/checkout/PaymentStep.tsx`
- Reference: `src/hooks/usePaymentMethods.ts` (AdminPaymentMethod type)

- [ ] **Step 1: Implement PaymentStep**

```tsx
// src/components/checkout/PaymentStep.tsx
'use client';

import React from 'react';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import type { AdminPaymentMethod } from '@/types';

interface PaymentStepProps {
  selectedMethod: string | null;
  referenceNumber: string;
  totalAmount: number;
  onSelectMethod: (methodId: string) => void;
  onReferenceChange: (value: string) => void;
  onContinue: () => void;
}

// Map payment method names to icons
const PAYMENT_ICONS: Record<string, string> = {
  gcash: '📱',
  maya: '💜',
  'bank-transfer': '🏦',
  cash: '💵',
};

export default function PaymentStep({
  selectedMethod,
  referenceNumber,
  totalAmount,
  onSelectMethod,
  onReferenceChange,
  onContinue,
}: PaymentStepProps) {
  const { paymentMethods, loading } = usePaymentMethods();

  const selected = paymentMethods.find((pm) => pm.id === selectedMethod);

  if (loading) {
    return <div className="text-center py-4 text-starrs-muted text-sm">Loading payment methods...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Payment Method Grid */}
      <div className="grid grid-cols-2 gap-2">
        {paymentMethods.map((pm) => (
          <button
            key={pm.id}
            onClick={() => onSelectMethod(pm.id)}
            className={`rounded-xl py-3.5 px-2.5 text-center transition-colors border-2 ${
              selectedMethod === pm.id
                ? 'bg-starrs-deep text-starrs-cream-brand border-starrs-deep'
                : 'bg-starrs-mint-soft text-starrs-deep border-transparent'
            }`}
          >
            <div className="text-2xl mb-1">
              {PAYMENT_ICONS[pm.name?.toLowerCase()] || '💳'}
            </div>
            <div className="text-[13px] font-semibold">{pm.name}</div>
          </button>
        ))}
      </div>

      {/* Selected Method Details */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div className="bg-starrs-cream-brand rounded-xl p-3.5 border-[1.5px] border-amber-200/50 space-y-3">
          {/* QR Code */}
          {selected.qr_code_url && (
            <div className="text-center">
              <div className="w-[100px] h-[100px] bg-white rounded-lg mx-auto border border-gray-200 overflow-hidden">
                <img
                  src={selected.qr_code_url}
                  alt={`${selected.name} QR Code`}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          )}

          {/* Account Details */}
          <div className="text-center space-y-1">
            <div className="text-xs text-starrs-muted">Send to this number</div>
            <div className="font-mono text-lg font-bold text-starrs-deep bg-white px-3.5 py-2 rounded-lg inline-block tracking-wider">
              {selected.account_number}
            </div>
            <div className="text-xs text-starrs-muted">{selected.account_name}</div>
          </div>

          {/* Amount */}
          <div className="text-center">
            <div className="text-xs text-starrs-muted">Amount to pay</div>
            <div className="text-xl font-extrabold text-starrs-deep">
              ₱{totalAmount.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Reference Number */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div>
          <label className="text-xs font-semibold text-starrs-muted block mb-1">
            Reference Number (optional)
          </label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => onReferenceChange(e.target.value)}
            placeholder="Enter if you've already paid"
            className="w-full px-3 py-2.5 border-[1.5px] border-starrs-mint-soft rounded-xl text-sm bg-gray-50"
          />
        </div>
      )}

      {/* Info Tip */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div className="bg-starrs-mint-soft rounded-xl p-2.5 flex items-start gap-2">
          <span className="text-sm">💡</span>
          <span className="text-xs text-starrs-deep/70 leading-relaxed">
            You&apos;ll send your payment screenshot via Messenger after placing the order.
          </span>
        </div>
      )}

      {/* Continue */}
      <button
        onClick={onContinue}
        disabled={!selectedMethod}
        className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-colors ${
          selectedMethod
            ? 'bg-starrs-sage text-starrs-cream-brand'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        Continue
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/checkout/PaymentStep.tsx
git commit -m "feat(checkout): add PaymentStep with method grid and QR display"
```

---

## Task 6: Create ReviewStep Component

**Files:**
- Create: `src/components/checkout/ReviewStep.tsx`
- Reference: `src/types/index.ts` (CartItem), `src/types/bundle.ts` (BundleCartItem)

- [ ] **Step 1: Implement ReviewStep**

This renders the full order summary and the Messenger CTA. It handles order creation and redirect.

```tsx
// src/components/checkout/ReviewStep.tsx
'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CartItem, Branch, ServiceType } from '@/types';
import { BundleCartItem } from '@/types/bundle';
import { useOrders } from '@/hooks/useOrders';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import * as fpixel from '@/lib/fpixel';
import { sendPurchaseEvent } from '@/lib/meta-conversions';
import { getInterstitialOffers } from '@/actions/upsell';
import type { InterstitialOffer } from '@/types/upsell';

interface ReviewStepProps {
  cartItems: CartItem[];
  bundleItems: BundleCartItem[];
  branch: Branch | null;
  serviceType: ServiceType;
  customerName: string;
  contactNumber: string;
  address: string;
  landmark: string;
  pickupTime: string;
  customTime: string;
  notes: string;
  paymentMethodId: string | null;
  referenceNumber: string;
  deliveryFee: number | null;
  deliveryCoordinates: { lat: number; lng: number } | null;
  lalamoveQuotationId: string | null;
  totalPrice: number;
  msession?: string;
  onShowInterstitial?: (offer: InterstitialOffer) => void;
  skipInterstitial?: boolean; // Set true after interstitial is declined (proceed to order)
}

export default function ReviewStep(props: ReviewStepProps) {
  const {
    cartItems,
    bundleItems,
    branch,
    serviceType,
    customerName,
    contactNumber,
    address,
    landmark,
    pickupTime,
    customTime,
    notes,
    paymentMethodId,
    referenceNumber,
    deliveryFee,
    deliveryCoordinates,
    lalamoveQuotationId,
    totalPrice,
    msession,
    onShowInterstitial,
    skipInterstitial,
  } = props;

  const { createOrder } = useOrders();
  const { paymentMethods } = usePaymentMethods();
  const { siteSettings } = useSiteSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPayment = paymentMethods.find((pm) => pm.id === paymentMethodId);
  const grandTotal = totalPrice + (deliveryFee || 0);

  // Auto-place order when interstitial is declined (skipInterstitial flips to true)
  useEffect(() => {
    if (skipInterstitial && !isSubmitting) {
      handlePlaceOrder();
    }
  }, [skipInterstitial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for interstitial offers before placing order (same as current handlePrePlaceOrder)
  const handlePrePlaceOrder = async () => {
    if (isSubmitting) return;

    // Skip interstitial check if we've already shown it (user declined)
    if (!skipInterstitial && onShowInterstitial) {
      const cartItemsMapped = cartItems.map(i => ({
        menu_item_id: i.id,
        category: i.category,
        quantity: i.quantity,
        unit_price: i.totalPrice / i.quantity,
      }));
      const cart = { items: cartItemsMapped, total: grandTotal };
      const res = await getInterstitialOffers(cart);
      if (res.success && res.data) {
        onShowInterstitial(res.data);
        return; // Don't place order yet — interstitial will handle it
      }
    }

    // No interstitial, proceed to place order
    await handlePlaceOrder();
  };

  const handlePlaceOrder = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const order = await createOrder(
        cartItems,
        customerName,
        contactNumber,
        serviceType,
        selectedPayment?.name || 'cash',
        grandTotal,
        {
          address: serviceType === 'delivery' ? address : undefined,
          landmark: serviceType === 'delivery' ? landmark : undefined,
          pickupTime: serviceType === 'pickup' ? (customTime || pickupTime) : undefined,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
          deliveryFee: deliveryFee || undefined,
          lalamoveQuotationId: lalamoveQuotationId || undefined,
          deliveryLat: deliveryCoordinates?.lat,
          deliveryLng: deliveryCoordinates?.lng,
          branchId: branch?.id,
          branch: branch || undefined,
          msession,
        }
      );

      // Track purchase events (must match exact signatures from fpixel.ts and meta-conversions.ts)
      const currency = siteSettings?.currency_code || 'PHP';
      const contentIds = cartItems.map(item => item.id);
      const numItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

      fpixel.trackPurchase(grandTotal, currency, contentIds, numItems);

      if (siteSettings?.meta_pixel_id) {
        sendPurchaseEvent({
          testEventCode: siteSettings.meta_test_event_code,
          orderId: order.order_number,
          value: grandTotal,
          currency,
          contentIds,
          numItems,
          customerPhone: contactNumber,
        }).catch(err => {
          console.error('[Meta Conversions API] Failed to send purchase event:', err);
        });
      }

      // Build Messenger redirect
      const messengerUsername = branch?.messenger_username || siteSettings?.messenger_username || 'StarrsFamousShakes';
      if (messengerUsername) {
        const orderText = buildOrderText(order, cartItems, bundleItems, selectedPayment?.name);
        const encodedText = encodeURIComponent(orderText);
        window.location.href = `https://m.me/${messengerUsername}?text=${encodedText}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Order Items */}
      <div className="space-y-0">
        {cartItems.map((item) => (
          <div
            key={item.id}
            className="flex justify-between py-2 border-b border-gray-100 last:border-0"
          >
            <div>
              <div className="font-semibold text-sm">{item.name}</div>
              <div className="text-xs text-starrs-sage">
                {item.selectedVariation?.name}
                {item.selectedAddOns?.length
                  ? ` • +${item.selectedAddOns.map((a) => a.name).join(', ')}`
                  : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-sm text-starrs-deep">
                ₱{item.totalPrice.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">×{item.quantity}</div>
            </div>
          </div>
        ))}
        {bundleItems.map((item, index) => (
          <div
            key={`bundle-${index}`}
            className="flex justify-between py-2 border-b border-gray-100 last:border-0"
          >
            <div>
              <div className="font-semibold text-sm">{item.bundle.name}</div>
              <div className="text-xs text-starrs-sage">Bundle</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-sm text-starrs-deep">
                ₱{item.totalPrice.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">×{item.quantity}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Customer Summary */}
      <div className="bg-starrs-mint-soft rounded-xl p-3 space-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <span className="text-starrs-muted">Customer</span>
          <span className="font-semibold">{customerName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-starrs-muted">Phone</span>
          <span className="font-semibold">{contactNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-starrs-muted">Service</span>
          <span className="font-semibold">
            {serviceType === 'dine-in' ? '🪑 Dine In' : serviceType === 'pickup' ? '🚶 Pickup' : '🛵 Delivery'}
          </span>
        </div>
        {serviceType === 'pickup' && (
          <div className="flex justify-between">
            <span className="text-starrs-muted">Pickup Time</span>
            <span className="font-semibold">{customTime || `${pickupTime} min`}</span>
          </div>
        )}
        {serviceType === 'delivery' && address && (
          <div className="flex justify-between">
            <span className="text-starrs-muted">Address</span>
            <span className="font-semibold text-right max-w-[200px] truncate">{address}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-starrs-muted">Payment</span>
          <span className="font-semibold">{selectedPayment?.name || 'Cash'}</span>
        </div>
        {branch && (
          <div className="flex justify-between">
            <span className="text-starrs-muted">Branch</span>
            <span className="font-semibold">{branch.name}</span>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="border-t-2 border-starrs-deep pt-3 space-y-1">
        {deliveryFee !== null && deliveryFee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-starrs-muted">Delivery Fee</span>
            <span className="font-semibold">₱{deliveryFee.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-base font-bold">Total</span>
          <span className="text-2xl font-extrabold text-starrs-deep">
            ₱{grandTotal.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">{error}</div>
      )}

      {/* CTA */}
      <button
        onClick={handlePrePlaceOrder}
        disabled={isSubmitting}
        className="w-full py-4 bg-starrs-deep text-starrs-cream-brand rounded-[14px] text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" /> Placing Order...
          </>
        ) : (
          <>
            Send Order via Messenger <span className="text-lg">💬</span>
          </>
        )}
      </button>
      <p className="text-center text-[11px] text-gray-400">
        You&apos;ll be redirected to Messenger to confirm your order
      </p>
    </div>
  );
}

// Build formatted order text for Messenger
function buildOrderText(
  order: { order_number: string },
  cartItems: CartItem[],
  bundleItems: BundleCartItem[],
  paymentMethod?: string
): string {
  const lines = [
    `📋 Order #${order.order_number}`,
    '',
    '🛒 Items:',
  ];
  cartItems.forEach((item) => {
    let line = `• ${item.name}`;
    if (item.selectedVariation) line += ` (${item.selectedVariation.name})`;
    if (item.selectedAddOns?.length) line += ` +${item.selectedAddOns.map((a) => a.name).join(', ')}`;
    line += ` ×${item.quantity} — ₱${item.totalPrice}`;
    lines.push(line);
  });
  bundleItems.forEach((item) => {
    lines.push(`• ${item.bundle.name} ×${item.quantity} — ₱${item.totalPrice}`);
  });
  lines.push('', `💳 Payment: ${paymentMethod || 'Cash'}`);
  return lines.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/checkout/ReviewStep.tsx
git commit -m "feat(checkout): add ReviewStep with order summary and Messenger CTA"
```

---

## Task 7: Create CheckoutStickyBar Component

**Files:**
- Create: `src/components/checkout/CheckoutStickyBar.tsx`

- [ ] **Step 1: Implement CheckoutStickyBar**

```tsx
// src/components/checkout/CheckoutStickyBar.tsx
'use client';

import React from 'react';

interface CheckoutStickyBarProps {
  itemCount: number;
  totalPrice: number;
  currentStep: number;
  totalSteps: number;
}

export default function CheckoutStickyBar({
  itemCount,
  totalPrice,
  currentStep,
  totalSteps,
}: CheckoutStickyBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-starrs-deep px-5 py-3.5 flex justify-between items-center z-40">
      <div>
        <div className="text-xs text-starrs-sage-light">{itemCount} items</div>
        <div className="font-extrabold text-lg text-starrs-cream-brand">
          ₱{totalPrice.toLocaleString()}
        </div>
      </div>
      <div className="text-xs text-starrs-sage-light">
        Step {currentStep} of {totalSteps}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/checkout/CheckoutStickyBar.tsx
git commit -m "feat(checkout): add CheckoutStickyBar component"
```

---

## Task 8: Create CheckoutAccordion Orchestrator

**Files:**
- Create: `src/components/checkout/CheckoutAccordion.tsx`

This is the main orchestrator that wires together all step components, manages which step is active, and tracks form state.

- [ ] **Step 1: Implement CheckoutAccordion**

```tsx
// src/components/checkout/CheckoutAccordion.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CartItem, Branch, ServiceType } from '@/types';
import { BundleCartItem } from '@/types/bundle';
import StepHeader from './StepHeader';
import BranchStep from './BranchStep';
import ServiceDetailsStep from './ServiceDetailsStep';
import PaymentStep from './PaymentStep';
import ReviewStep from './ReviewStep';
import CheckoutStickyBar from './CheckoutStickyBar';
import type { InterstitialOffer } from '@/types/upsell';

interface CheckoutAccordionProps {
  cartItems: CartItem[];
  bundleItems: BundleCartItem[];
  totalPrice: number;
  onBack: () => void;
  msession?: string;
  onShowInterstitial?: (offer: InterstitialOffer) => void;
  skipInterstitial?: boolean; // true after user declines interstitial
}

const TOTAL_STEPS = 4;

export default function CheckoutAccordion({
  cartItems,
  bundleItems,
  totalPrice,
  onBack,
  msession,
  onShowInterstitial,
  skipInterstitial,
}: CheckoutAccordionProps) {
  const [activeStep, setActiveStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  // Form state
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [serviceData, setServiceData] = useState({
    serviceType: 'dine-in' as ServiceType,
    customerName: '',
    contactNumber: '',
    address: '',
    landmark: '',
    pickupTime: '5-10',
    customTime: '',
    notes: '',
    deliveryCoordinates: null as { lat: number; lng: number } | null,
    deliveryFee: null as number | null,
    lalamoveQuotationId: null as string | null,
  });
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');

  const totalItemCount = useMemo(
    () =>
      cartItems.reduce((sum, item) => sum + item.quantity, 0) +
      bundleItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems, bundleItems]
  );

  const grandTotal = totalPrice + (serviceData.deliveryFee || 0);

  const completeStep = (step: number) => {
    setCompletedSteps((prev) => ({ ...prev, [step]: true }));
    setActiveStep(step + 1);
  };

  const editStep = (step: number) => {
    setActiveStep(step);
  };

  const getStepState = (step: number) => {
    if (completedSteps[step] && activeStep !== step) return 'completed' as const;
    if (step === activeStep) return 'active' as const;
    return 'locked' as const;
  };

  // Step summaries for collapsed state
  const branchSummary = selectedBranch ? selectedBranch.name : undefined;
  const serviceSummary = completedSteps[2]
    ? `${serviceData.serviceType === 'dine-in' ? '🪑 Dine In' : serviceData.serviceType === 'pickup' ? '🚶 Pickup' : '🛵 Delivery'} • ${serviceData.customerName} • ${serviceData.contactNumber.slice(-4)}`
    : undefined;
  // Payment summary uses the actual method name (fetched from usePaymentMethods in PaymentStep)
  const [paymentMethodName, setPaymentMethodName] = useState('');
  const paymentSummary = paymentMethodId ? `💳 ${paymentMethodName || 'Selected'}` : undefined;

  return (
    <div className="min-h-screen bg-starrs-linen pb-24">
      {/* Header */}
      <div className="bg-starrs-sage px-5 pt-4 pb-5">
        <div className="flex items-center gap-2.5 mb-3">
          <button onClick={onBack} className="text-starrs-cream-brand">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-starrs-cream-brand font-bold text-lg tracking-tight">
            Checkout
          </span>
        </div>
        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => (
            <React.Fragment key={step}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  completedSteps[step]
                    ? 'bg-starrs-cream-brand text-starrs-deep'
                    : step === activeStep
                    ? 'bg-starrs-cream-brand text-starrs-deep'
                    : 'bg-white/30 text-starrs-cream-brand'
                }`}
              >
                {completedSteps[step] ? '✓' : step}
              </div>
              {step < TOTAL_STEPS && (
                <div
                  className={`w-6 h-0.5 ${
                    completedSteps[step] ? 'bg-starrs-cream-brand' : 'bg-white/30'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="px-4 pt-4">
        {/* Step 1: Branch */}
        <StepHeader
          stepNumber={1}
          title="Branch"
          state={getStepState(1)}
          summary={branchSummary}
          onEdit={() => editStep(1)}
        >
          <BranchStep
            selectedBranch={selectedBranch}
            onSelect={setSelectedBranch}
            onContinue={() => completeStep(1)}
          />
        </StepHeader>

        {/* Step 2: Service & Details */}
        <StepHeader
          stepNumber={2}
          title="Service & Details"
          state={getStepState(2)}
          summary={serviceSummary}
          onEdit={() => editStep(2)}
        >
          <ServiceDetailsStep
            data={serviceData}
            onChange={(partial) => setServiceData((prev) => ({ ...prev, ...partial }))}
            selectedBranch={selectedBranch}
            onContinue={() => completeStep(2)}
          />
        </StepHeader>

        {/* Step 3: Payment */}
        <StepHeader
          stepNumber={3}
          title="Payment Method"
          state={getStepState(3)}
          summary={paymentSummary}
          onEdit={() => editStep(3)}
        >
          <PaymentStep
            selectedMethod={paymentMethodId}
            referenceNumber={referenceNumber}
            totalAmount={grandTotal}
            onSelectMethod={setPaymentMethodId}
            onReferenceChange={setReferenceNumber}
            onContinue={() => completeStep(3)}
          />
        </StepHeader>

        {/* Step 4: Review & Order */}
        <StepHeader
          stepNumber={4}
          title="Review & Order"
          state={getStepState(4)}
        >
          <ReviewStep
            cartItems={cartItems}
            bundleItems={bundleItems}
            branch={selectedBranch}
            serviceType={serviceData.serviceType}
            customerName={serviceData.customerName}
            contactNumber={serviceData.contactNumber}
            address={serviceData.address}
            landmark={serviceData.landmark}
            pickupTime={serviceData.pickupTime}
            customTime={serviceData.customTime}
            notes={serviceData.notes}
            paymentMethodId={paymentMethodId}
            referenceNumber={referenceNumber}
            deliveryFee={serviceData.deliveryFee}
            deliveryCoordinates={serviceData.deliveryCoordinates}
            lalamoveQuotationId={serviceData.lalamoveQuotationId}
            totalPrice={totalPrice}
            msession={msession}
            onShowInterstitial={onShowInterstitial}
            skipInterstitial={skipInterstitial}
          />
        </StepHeader>
      </div>

      {/* Sticky Bar */}
      <CheckoutStickyBar
        itemCount={totalItemCount}
        totalPrice={grandTotal}
        currentStep={activeStep}
        totalSteps={TOTAL_STEPS}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/checkout/CheckoutAccordion.tsx
git commit -m "feat(checkout): add CheckoutAccordion orchestrator with 4-step flow"
```

---

## Task 9: Rewrite Cart Component

**Files:**
- Modify: `src/components/Cart.tsx` (complete rewrite)

- [ ] **Step 1: Read current Cart.tsx for reference**

Read `src/components/Cart.tsx` to understand the current props interface and CartContext usage.

- [ ] **Step 2: Rewrite Cart.tsx with new brand design**

Replace the entire file with the redesigned version. Keep the same props interface for backwards compatibility with `app/page.tsx`.

```tsx
// src/components/Cart.tsx
'use client';

import React from 'react';
import { ArrowLeft, Trash2, Minus, Plus } from 'lucide-react';
import { CartItem } from '@/types';
import { BundleCartItem } from '@/types/bundle';

interface CartProps {
  cartItems: CartItem[];
  bundleItems?: BundleCartItem[];
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  removeBundleFromCart?: (index: number) => void;
  updateBundleQuantity?: (index: number, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  onContinueShopping: () => void;
  onCheckout: () => void;
}

export default function Cart({
  cartItems,
  bundleItems = [],
  updateQuantity,
  removeFromCart,
  removeBundleFromCart,
  updateBundleQuantity,
  clearCart,
  getTotalPrice,
  onContinueShopping,
  onCheckout,
}: CartProps) {
  const totalItems =
    cartItems.reduce((sum, item) => sum + item.quantity, 0) +
    bundleItems.reduce((sum, item) => sum + item.quantity, 0);

  // Empty state
  if (cartItems.length === 0 && bundleItems.length === 0) {
    return (
      <div className="min-h-screen bg-starrs-linen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">🥤</div>
        <h2 className="text-xl font-bold text-starrs-deep mb-2">Your cart is empty</h2>
        <p className="text-starrs-muted text-sm mb-6">
          Browse our menu and add your favorite shakes!
        </p>
        <button
          onClick={onContinueShopping}
          className="px-6 py-3 bg-starrs-sage text-starrs-cream-brand rounded-xl font-semibold"
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-starrs-linen pb-36">
      {/* Header */}
      <div className="bg-starrs-sage px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button onClick={onContinueShopping} className="text-starrs-cream-brand">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-starrs-cream-brand font-bold text-lg tracking-tight">
            Your Cart
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-starrs-cream-brand/80 text-sm">{totalItems} items</span>
          <button
            onClick={clearCart}
            className="text-starrs-cream-brand/70 text-xs font-medium"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Cart Items */}
      <div className="px-4 pt-4 space-y-2.5">
        {cartItems.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-[14px] p-3.5 shadow-sm"
          >
            <div className="flex gap-3">
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-[10px] bg-gradient-to-br from-starrs-sage/20 to-starrs-sage/5 flex items-center justify-center text-2xl flex-shrink-0">
                🥤
              </div>
              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="font-bold text-[15px] text-gray-900">{item.name}</div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors p-0.5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs text-starrs-sage mt-0.5">
                  {item.selectedVariation?.name}
                  {item.selectedAddOns?.length
                    ? ` • +${item.selectedAddOns.map((a) => a.name).join(', ')}`
                    : ''}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-extrabold text-base text-starrs-deep">
                    ₱{item.totalPrice.toLocaleString()}
                  </span>
                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-starrs-mint-soft rounded-[10px] overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-[34px] h-[34px] flex items-center justify-center text-starrs-sage"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-7 text-center font-bold text-[15px] text-starrs-deep">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-[34px] h-[34px] flex items-center justify-center bg-starrs-sage text-white rounded-r-[10px]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Bundle Items */}
        {bundleItems.map((item, index) => (
          <div
            key={`bundle-${index}`}
            className="bg-white rounded-[14px] p-3.5 shadow-sm"
          >
            <div className="flex gap-3">
              <div className="w-16 h-16 rounded-[10px] bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center text-2xl flex-shrink-0">
                🎁
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="font-bold text-[15px] text-gray-900">{item.bundle.name}</div>
                  {removeBundleFromCart && (
                    <button
                      onClick={() => removeBundleFromCart(index)}
                      className="text-gray-300 hover:text-red-400 transition-colors p-0.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="text-xs text-starrs-sage mt-0.5">Bundle</div>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-extrabold text-base text-starrs-deep">
                    ₱{item.totalPrice.toLocaleString()}
                  </span>
                  {updateBundleQuantity && (
                    <div className="flex items-center bg-starrs-mint-soft rounded-[10px] overflow-hidden">
                      <button
                        onClick={() => updateBundleQuantity(index, item.quantity - 1)}
                        className="w-[34px] h-[34px] flex items-center justify-center text-starrs-sage"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-7 text-center font-bold text-[15px] text-starrs-deep">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateBundleQuantity(index, item.quantity + 1)}
                        className="w-[34px] h-[34px] flex items-center justify-center bg-starrs-sage text-white rounded-r-[10px]"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sticky Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[20px] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-5 py-4 z-40">
        <div className="flex justify-between mb-3.5">
          <span className="text-starrs-muted text-sm">
            Subtotal ({totalItems} items)
          </span>
          <span className="font-extrabold text-xl text-starrs-deep">
            ₱{getTotalPrice().toLocaleString()}
          </span>
        </div>
        <button
          onClick={onCheckout}
          className="w-full py-4 bg-starrs-deep text-starrs-cream-brand rounded-[14px] text-base font-bold"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Cart.tsx
git commit -m "feat(cart): redesign Cart with Starr's brand palette and bundle support"
```

---

## Task 10: Create `/cart` Route

**Files:**
- Create: `app/cart/page.tsx`

- [ ] **Step 1: Create the cart route page**

This page reads from CartContext and renders the redesigned Cart component. It handles the "Proceed to Checkout" navigation.

```tsx
// app/cart/page.tsx
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCartContext } from '@/contexts/CartContext';
import Cart from '@/components/Cart';
import Header from '@/components/Header';

export default function CartPage() {
  const router = useRouter();
  const {
    cartItems,
    bundleItems,
    updateQuantity,
    removeFromCart,
    removeBundleFromCart,
    updateBundleQuantity,
    clearCart,
    getTotalPrice,
    getTotalItems,
  } = useCartContext();

  // Redirect to menu if cart is empty
  useEffect(() => {
    if (cartItems.length === 0 && bundleItems.length === 0) {
      // Small delay so user sees the empty state briefly
      const timer = setTimeout(() => router.push('/'), 2000);
      return () => clearTimeout(timer);
    }
  }, [cartItems.length, bundleItems.length, router]);

  return (
    <>
      <Cart
        cartItems={cartItems}
        bundleItems={bundleItems}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        removeBundleFromCart={removeBundleFromCart}
        updateBundleQuantity={updateBundleQuantity}
        clearCart={clearCart}
        getTotalPrice={getTotalPrice}
        onContinueShopping={() => router.push('/')}
        onCheckout={() => router.push('/checkout')}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/cart/page.tsx
git commit -m "feat(cart): add dedicated /cart route"
```

---

## Task 11: Update Checkout Page to Use Accordion

**Files:**
- Modify: `app/checkout/page.tsx`

The checkout page wrapper keeps the upsell flow logic and msession handling, but replaces the old `Checkout` component with `CheckoutAccordion` once the upsell sequence completes.

- [ ] **Step 1: Read current checkout/page.tsx**

Read `app/checkout/page.tsx` to understand the msession loading logic and upsell wiring.

- [ ] **Step 2: Rewrite checkout/page.tsx**

The upsell state machine (`upgrade → pair → checkout → interstitial → placing`) currently lives inside `Checkout.tsx`. Move it to `app/checkout/page.tsx` so the accordion doesn't need to know about upsells.

Replace the entire file with:

```tsx
// app/checkout/page.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCartContext } from '@/contexts/CartContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import * as fpixel from '@/lib/fpixel';
import CheckoutAccordion from '@/components/checkout/CheckoutAccordion';
import UpgradeScreen from '@/components/UpgradeScreen';
import BestPairScreen from '@/components/BestPairScreen';
import CheckoutInterstitial from '@/components/CheckoutInterstitial';
import { getUpgradeOffers, getPairSuggestions, getInterstitialOffers } from '@/actions/upsell';
import type { UpsellOffer, PairOffer, InterstitialOffer } from '@/types/upsell';
import type { SlotSelection } from '@/types/bundle';

type UpsellStep = 'upgrade' | 'pair' | 'checkout' | 'interstitial' | 'placing';

export default function CheckoutPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const msession = searchParams.get('msession');
    const cart = useCartContext();
    const { siteSettings } = useSiteSettings();
    const hasTrackedCheckout = useRef(false);

    // Messenger session state
    const [messengerLoading, setMessengerLoading] = useState(!!msession);
    const [messengerError, setMessengerError] = useState<string | null>(null);

    // Upsell state (moved from old Checkout.tsx)
    const [upsellStep, setUpsellStep] = useState<UpsellStep>('upgrade');
    const [upgradeOffers, setUpgradeOffers] = useState<UpsellOffer[]>([]);
    const [pairOffers, setPairOffers] = useState<PairOffer[]>([]);
    const [interstitialOffer, setInterstitialOffer] = useState<InterstitialOffer | null>(null);

    // Load cart from Messenger session if msession param is present
    useEffect(() => {
        if (!msession) return;
        const loadMessengerSession = async () => {
            try {
                const res = await fetch(`/api/messenger/session/${msession}`);
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setMessengerError(data.error || 'Invalid or expired session link.');
                    return;
                }
                const data = await res.json();
                if (data.cart && Array.isArray(data.cart)) {
                    cart.loadFromMessengerSession(data.cart);
                }
            } catch {
                setMessengerError('Failed to load your session. Please try again.');
            } finally {
                setMessengerLoading(false);
            }
        };
        void loadMessengerSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msession]);

    // Fetch upsell offers on mount
    useEffect(() => {
        if (cart.cartItems.length === 0) return;
        const fetchUpsellData = async () => {
            const cartItemsMapped = cart.cartItems.map(i => ({
                menu_item_id: i.id,
                category: i.category,
                quantity: i.quantity,
                unit_price: i.totalPrice / i.quantity,
            }));
            const [upgradeRes, pairRes] = await Promise.all([
                getUpgradeOffers(cartItemsMapped),
                getPairSuggestions(cartItemsMapped),
            ]);
            if (upgradeRes.success && upgradeRes.data?.length > 0) {
                setUpgradeOffers(upgradeRes.data);
                setUpsellStep('upgrade');
            } else if (pairRes.success && pairRes.data?.length > 0) {
                setPairOffers(pairRes.data);
                setUpsellStep('pair');
            } else {
                setUpsellStep('checkout');
            }
            if (pairRes.success) setPairOffers(pairRes.data || []);
        };
        fetchUpsellData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Track InitiateCheckout on page load (only once)
    useEffect(() => {
        if (cart.cartItems.length > 0 && !hasTrackedCheckout.current) {
            hasTrackedCheckout.current = true;
            const currency = siteSettings?.currency_code || 'PHP';
            const contentIds = cart.cartItems.map(item => item.id);
            fpixel.trackInitiateCheckout(
                cart.getTotalPrice(),
                currency,
                cart.getTotalItems(),
                contentIds
            );
        }
    }, [cart, siteSettings?.currency_code]);

    // Redirect to menu if cart is empty (not during msession load)
    useEffect(() => {
        if (!msession && cart.cartItems.length === 0 && cart.bundleItems.length === 0) {
            router.push('/');
        }
    }, [cart.cartItems.length, cart.bundleItems.length, router, msession]);

    // Messenger loading state
    if (messengerLoading) {
        return (
            <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-starrs-sage mx-auto mb-4" />
                    <p className="text-starrs-muted">Loading your order from Messenger...</p>
                </div>
            </div>
        );
    }

    // Messenger error state
    if (messengerError) {
        return (
            <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
                <div className="text-center max-w-sm mx-auto p-6">
                    <p className="text-red-600 font-semibold mb-4">{messengerError}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-2 bg-starrs-sage text-starrs-cream-brand rounded-xl"
                    >
                        Go to Menu
                    </button>
                </div>
            </div>
        );
    }

    // Empty cart redirect state
    if (cart.cartItems.length === 0 && cart.bundleItems.length === 0) {
        return (
            <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-starrs-sage mx-auto mb-4" />
                    <p className="text-starrs-muted">Redirecting to menu...</p>
                </div>
            </div>
        );
    }

    // Phase 1: Upgrade Screen
    if (upsellStep === 'upgrade') {
        return (
            <UpgradeScreen
                offers={upgradeOffers}
                onAcceptBundle={(_bundleId: string, _selections: SlotSelection[], _totalPrice: number) => {
                    setUpsellStep(pairOffers.length > 0 ? 'pair' : 'checkout');
                }}
                onAcceptItem={(_itemId: string) => {
                    setUpsellStep(pairOffers.length > 0 ? 'pair' : 'checkout');
                }}
                onSkip={() => setUpsellStep(pairOffers.length > 0 ? 'pair' : 'checkout')}
            />
        );
    }

    // Phase 3: Best Pair Screen
    if (upsellStep === 'pair') {
        return (
            <BestPairScreen
                offers={pairOffers}
                onAddItem={(_itemId: string) => {
                    setUpsellStep('checkout');
                }}
                onSkip={() => setUpsellStep('checkout')}
            />
        );
    }

    // Interstitial declined = skip and place order directly
    const [skipInterstitial, setSkipInterstitial] = useState(false);

    // Phase 2 (checkout): Accordion
    return (
        <>
            <CheckoutAccordion
                cartItems={cart.cartItems}
                bundleItems={cart.bundleItems}
                totalPrice={cart.getTotalPrice()}
                onBack={() => router.push('/cart')}
                msession={msession ?? undefined}
                onShowInterstitial={(offer) => {
                    setInterstitialOffer(offer);
                    setUpsellStep('interstitial');
                }}
                skipInterstitial={skipInterstitial}
            />

            {/* Phase 4: Interstitial overlay on top of checkout */}
            {upsellStep === 'interstitial' && interstitialOffer && (
                <CheckoutInterstitial
                    offer={interstitialOffer}
                    onAccept={() => {
                        setInterstitialOffer(null);
                        setUpsellStep('checkout');
                    }}
                    onDecline={() => {
                        setInterstitialOffer(null);
                        setUpsellStep('checkout');
                        // Set flag so ReviewStep skips interstitial check and places order
                        setSkipInterstitial(true);
                    }}
                />
            )}
        </>
    );
}
```

**Interstitial flow summary:** User taps "Send Order" in ReviewStep → `handlePrePlaceOrder` calls `getInterstitialOffers` → if offer exists, calls `onShowInterstitial(offer)` which bubbles up through CheckoutAccordion to the page → page shows `CheckoutInterstitial` overlay → on decline, sets `skipInterstitial=true` which flows back down, and ReviewStep auto-retries `handlePrePlaceOrder` which now skips the check and calls `handlePlaceOrder` directly.

- [ ] **Step 3: Test manually**

Run: `npm run dev`

Verify:
1. Navigate to `/checkout` — upsell screens appear if configured
2. After upsells, accordion checkout renders with all 4 steps
3. Branch auto-selects from localStorage
4. Service type pills work, contextual fields appear
5. Payment methods load and display
6. Review shows all items
7. Messenger redirect works

- [ ] **Step 4: Commit**

```bash
git add app/checkout/page.tsx
git commit -m "feat(checkout): wire CheckoutAccordion into checkout page with upsell flow"
```

---

## Task 12: Update Home Page and FloatingCartButton

**Files:**
- Modify: `app/page.tsx` — remove `/?view=cart` logic, always show menu
- Modify: `src/components/FloatingCartButton.tsx` — link to `/cart`

- [ ] **Step 1: Read current app/page.tsx**

Read `app/page.tsx` to understand the `currentView` state and how it toggles between menu and cart.

- [ ] **Step 2: Simplify app/page.tsx**

Remove the `currentView` state and the cart rendering branch. The home page always shows the menu. Update the floating cart button and header cart icon to navigate to `/cart`.

Key changes:
- Remove `currentView` useState and related URL sync logic
- Remove the conditional that renders `<Cart>` when `currentView === 'cart'`
- Update `onCartClick` to use `router.push('/cart')`
- Update `onCheckout` callbacks to use `router.push('/checkout')`
- Keep everything else: menu fetching, bundle fetching, category filtering

- [ ] **Step 3: Update FloatingCartButton**

Read `src/components/FloatingCartButton.tsx` and update `onCartClick` usage — the parent now passes `() => router.push('/cart')` so no changes needed in the component itself. Verify the prop is wired correctly in `app/page.tsx`.

- [ ] **Step 4: Test manually**

Run: `npm run dev`

Verify:
1. Home page always shows menu (no cart view toggle)
2. Tapping floating cart button navigates to `/cart`
3. Cart page shows items, back button returns to menu
4. "Proceed to Checkout" navigates to `/checkout`
5. Full flow works: menu → cart → checkout → Messenger

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx src/components/FloatingCartButton.tsx
git commit -m "refactor: remove cart view toggle from home page, link to /cart route"
```

---

## Task 13: Final Cleanup and Verification

**Files:**
- Delete or archive: Old `Checkout` component will be unused after Task 11 (keep file for reference until verified)

- [ ] **Step 1: Verify no import references to old Checkout**

Search the codebase for any remaining imports of the old `Checkout` component from `@/components/Checkout` (not `@/components/checkout/CheckoutAccordion`). If found, update them.

- [ ] **Step 2: Full end-to-end manual test**

Run: `npm run dev`

Test these flows:
1. **Empty cart:** Go to `/cart` → see empty state → redirects to menu
2. **Add items:** Add items from menu → floating cart shows count → tap to go to `/cart`
3. **Cart operations:** Change quantities, remove items, verify totals update
4. **Bundle items:** If bundles are configured, add a bundle → verify it appears in cart
5. **Checkout accordion:** Proceed to checkout → complete all 4 steps in order
6. **Edit completed steps:** Go back and edit branch or service type
7. **Delivery flow:** Select delivery → enter address → verify Lalamove fee calculates
8. **Pickup flow:** Select pickup → verify time picker shows
9. **Payment methods:** Select GCash → verify QR + account number shows
10. **Review & order:** Verify summary is correct → tap "Send via Messenger"
11. **msession flow:** If test session available, verify `/checkout?msession=xxx` loads cart

- [ ] **Step 3: Build check**

Run: `npm run build`

Verify no TypeScript errors or build failures.

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: complete cart & checkout redesign with accordion flow"
```
