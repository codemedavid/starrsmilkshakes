// src/components/checkout/ServiceDetailsStep.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  hideServiceToggle?: boolean;
}

const SERVICE_TYPES: { value: ServiceType; label: string; icon: string }[] = [
  { value: 'dine-in', label: 'Dine In', icon: 'restaurant' },
  { value: 'pickup', label: 'Pickup', icon: 'shopping_basket' },
  { value: 'delivery', label: 'Delivery', icon: 'moped' },
];

const PICKUP_TIMES = ['5-10', '15-20', '25-30'];

const INPUT_CLASS =
  'w-full bg-[#bceddc] border-none rounded-[1rem] h-16 px-6 focus:ring-2 focus:ring-[#006b5e]/20 focus:bg-white transition-all placeholder:text-[#bec9c5] font-medium text-lg';
const LABEL_CLASS =
  'block font-label text-xs font-bold uppercase tracking-widest text-[#005b50] mb-2 ml-4';

export default function ServiceDetailsStep({
  data,
  onChange,
  selectedBranch,
  onContinue,
  hideServiceToggle,
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

  // Pre-fill from localStorage (normalize old formats)
  useEffect(() => {
    const storedName = localStorage.getItem('starrs_customer_name');
    const storedPhone = localStorage.getItem('starrs_customer_phone');
    if (storedName && !data.customerName) onChange({ customerName: storedName });
    if (storedPhone && !data.contactNumber) {
      // Normalize: 09xx → +639xx, raw digits → +63...
      let phone = storedPhone.replace(/\D/g, '');
      if (phone.startsWith('0')) phone = phone.substring(1);
      if (phone.startsWith('63')) phone = phone.substring(2);
      if (phone.length > 0 && phone[0] === '9') {
        onChange({ contactNumber: `+63${phone.slice(0, 10)}` });
      } else {
        onChange({ contactNumber: storedPhone });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch delivery fee when coordinates change
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
    localStorage.setItem('starrs_customer_name', data.customerName);
    localStorage.setItem('starrs_customer_phone', data.contactNumber);
    onContinue();
  };

  const isPhoneValid = /^\+639\d{9}$/.test(data.contactNumber);

  // Extract the 10-digit local number from stored contactNumber
  const displayPhone = data.contactNumber
    .replace(/^\+63/, '')
    .replace(/^0/, '')
    .replace(/\D/g, '');

  const handlePhoneChange = (value: string) => {
    let digits = value.replace(/\D/g, '');
    // Must start with 9
    if (digits.length > 0 && digits[0] !== '9') return;
    // Limit to 10 digits
    digits = digits.slice(0, 10);
    onChange({ contactNumber: digits ? `+63${digits}` : '' });
  };

  const isValid =
    data.customerName.trim() !== '' &&
    isPhoneValid &&
    (data.serviceType !== 'delivery' || (data.address.trim() !== '' && data.deliveryCoordinates !== null));

  return (
    <div className="space-y-8">
      {/* Service Type Pills (when not hidden) */}
      {!hideServiceToggle && (
        <div className="flex gap-3">
          {SERVICE_TYPES.map((st) => {
            const isActive = data.serviceType === st.value;
            return (
              <button
                key={st.value}
                onClick={() => onChange({ serviceType: st.value })}
                className={`flex-1 py-3 px-2 rounded-[1rem] text-center transition-all active:scale-[0.96] ${
                  isActive
                    ? 'bg-[#006b5e] text-[#e6fff5] shadow-lg'
                    : 'bg-[#bceddc] text-[#005b50] hover:bg-[#c8f8e8]'
                }`}
              >
                <span className="material-symbols-outlined text-xl mb-1 block">{st.icon}</span>
                <div className="text-xs font-bold">{st.label}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Name & Phone */}
      <div className="space-y-6">
        <div>
          <label className={LABEL_CLASS}>Full Name</label>
          <div className="relative">
            <input
              type="text"
              value={data.customerName}
              onChange={(e) => onChange({ customerName: e.target.value })}
              placeholder="Who's enjoying today?"
              className={INPUT_CLASS}
            />
            <span className="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-[#006b5e]/40">
              person
            </span>
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS}>Phone Number</label>
          <div className="relative flex items-center">
            <span className="absolute left-6 text-[#005b50] font-semibold text-lg pointer-events-none z-10 select-none">
              +63
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={displayPhone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="912 345 6789"
              maxLength={10}
              className="w-full bg-[#bceddc] border-none rounded-[1rem] h-16 pl-16 pr-14 focus:ring-2 focus:ring-[#006b5e]/20 focus:bg-white transition-all placeholder:text-[#bec9c5] font-medium text-lg"
            />
            <span className="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-[#006b5e]/40">
              call
            </span>
          </div>
        </div>
      </div>

      {/* Pickup Time (conditional) */}
      {data.serviceType === 'pickup' && (
        <div className="space-y-4">
          <div className="bg-[#cdfeed] rounded-[1rem] p-6 relative overflow-hidden">
            <div className="absolute -bottom-4 -right-4 text-[#006b5e]/5">
              <span className="material-symbols-outlined text-8xl">schedule</span>
            </div>
            <label className={LABEL_CLASS}>Pickup Time</label>
            <div className="flex gap-2 mt-3">
              {PICKUP_TIMES.map((time) => (
                <button
                  key={time}
                  onClick={() => onChange({ pickupTime: time, customTime: '' })}
                  className={`flex-1 py-3 rounded-[1rem] text-sm font-semibold transition-colors ${
                    data.pickupTime === time && !data.customTime
                      ? 'bg-[#006b5e] text-[#e6fff5]'
                      : 'bg-white text-[#005b50] hover:bg-[#c8f8e8]'
                  }`}
                >
                  {time} min
                </button>
              ))}
              <button
                onClick={() => onChange({ pickupTime: 'custom' })}
                className={`flex-1 py-3 rounded-[1rem] text-sm font-semibold transition-colors flex items-center justify-center ${
                  data.pickupTime === 'custom' || data.customTime
                    ? 'bg-[#006b5e] text-[#e6fff5]'
                    : 'bg-white text-[#005b50] hover:bg-[#c8f8e8]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">schedule</span>
              </button>
            </div>
          </div>
          {(data.pickupTime === 'custom' || data.customTime) && (
            <div>
              <label className={LABEL_CLASS}>Custom Time</label>
              <input
                type="time"
                value={data.customTime}
                onChange={(e) => onChange({ customTime: e.target.value, pickupTime: 'custom' })}
                className={INPUT_CLASS}
              />
            </div>
          )}
          {/* Curbside indicator */}
          <div className="bg-[#7ed2c2]/30 rounded-[1rem] p-6">
            <span className="material-symbols-outlined text-[#006b5e] mb-2">check</span>
            <p className="text-[#005b50] font-bold text-sm">Pickup Ready Notification</p>
            <p className="text-[#005b50]/70 text-xs mt-1">We&apos;ll prepare your order when you&apos;re nearby.</p>
          </div>
        </div>
      )}

      {/* Delivery Address (conditional) */}
      {data.serviceType === 'delivery' && (
        <div className="space-y-6 relative">
          <div>
            <label className={LABEL_CLASS}>Delivery Address</label>
            <div className="relative">
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
                className={INPUT_CLASS}
              />
              <span className="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-[#006b5e]/40">
                {addressLoading ? 'progress_activity' : 'location_on'}
              </span>
            </div>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full bg-white rounded-[1rem] shadow-lg max-h-48 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.place_id}
                  onClick={() => handleSuggestionSelect(s)}
                  className={`w-full text-left px-6 py-3 text-sm hover:bg-[#cdfeed] transition-colors ${
                    i === selectedSuggestionIndex ? 'bg-[#cdfeed]' : ''
                  }`}
                >
                  <span className="material-symbols-outlined text-[#006b5e]/40 text-sm align-middle mr-2">
                    location_on
                  </span>
                  {s.display_name}
                </button>
              ))}
            </div>
          )}
          {data.address && (
            <div className="text-xs text-[#005b50] flex items-center gap-2 ml-4">
              <span className="material-symbols-outlined text-sm text-[#006b5e]">check_circle</span>
              {data.address}
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>Apartment / Landmark</label>
            <div className="relative">
              <input
                type="text"
                value={data.landmark}
                onChange={(e) => onChange({ landmark: e.target.value })}
                placeholder="Helps the rider find you"
                className={INPUT_CLASS}
              />
              <span className="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-[#006b5e]/40">
                apartment
              </span>
            </div>
          </div>
          {/* Delivery fee display */}
          {data.deliveryCoordinates && (
            <div className="bg-[#cdfeed] rounded-[1rem] p-6 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-full">
                  <span className="material-symbols-outlined text-[#006b5e]">local_shipping</span>
                </div>
                <span className="text-[#005b50] font-medium">Delivery Fee</span>
              </div>
              {deliveryFeeLoading ? (
                <span className="flex items-center gap-2 text-[#006b5e] font-medium">
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  Calculating...
                </span>
              ) : data.deliveryFee !== null ? (
                <span className="font-headline font-bold text-xl text-[#006b5e]">
                  ₱{data.deliveryFee}
                </span>
              ) : (
                <span className="text-[#ba1a1a] text-sm font-medium">Fee pending</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Special Instructions */}
      <div>
        <label className={LABEL_CLASS}>Special Instructions</label>
        <div className="relative">
          <textarea
            value={data.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Any allergies or extra requests?"
            rows={3}
            className="w-full bg-[#bceddc] border-none rounded-[1rem] p-6 focus:ring-2 focus:ring-[#006b5e]/20 focus:bg-white transition-all placeholder:text-[#bec9c5] font-medium resize-none"
          />
          <span className="material-symbols-outlined absolute right-6 top-6 text-[#006b5e]/40">
            edit_note
          </span>
        </div>
      </div>

      {/* Confirm Details */}
      <button
        onClick={handleContinue}
        disabled={!isValid}
        className={`w-full rounded-full font-headline font-bold text-lg py-5 transition-all active:scale-95 flex items-center justify-center gap-2 ${
          isValid
            ? 'bg-[#006b5e] text-[#e6fff5] shadow-lg shadow-[#006b5e]/20'
            : 'bg-[#bceddc] text-[#bec9c5] cursor-not-allowed'
        }`}
      >
        Confirm Details
        <span className="material-symbols-outlined text-xl">check_circle</span>
      </button>
    </div>
  );
}
