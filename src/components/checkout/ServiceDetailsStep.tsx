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

const SERVICE_TYPES: { value: ServiceType; label: string; icon: string; color: string }[] = [
  { value: 'dine-in', label: 'Dine In', icon: '🪑', color: 'bg-amber-500' },
  { value: 'pickup', label: 'Pickup', icon: '🚶', color: 'bg-blue-500' },
  { value: 'delivery', label: 'Delivery', icon: '🛵', color: 'bg-violet-500' },
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
      <div className="flex gap-2.5">
        {SERVICE_TYPES.map((st) => {
          const isActive = data.serviceType === st.value;
          return (
            <button
              key={st.value}
              onClick={() => onChange({ serviceType: st.value })}
              className={`flex-1 py-3 px-2 rounded-2xl text-center transition-all active:scale-[0.96] border-2 ${
                isActive
                  ? `${st.color} text-white border-transparent shadow-lg`
                  : 'bg-white text-[#5A6B62] border-[#E8E4DE] hover:border-[#C4BDB4]'
              }`}
            >
              <div className="text-[22px] mb-1">{st.icon}</div>
              <div className={`text-[12px] font-bold ${isActive ? 'text-white' : ''}`}>{st.label}</div>
            </button>
          );
        })}
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
              className="w-full px-3.5 py-3 border border-[#E8E4DE] rounded-xl text-[14px] bg-white focus:outline-none focus:border-[#8FB8A8] focus:ring-2 focus:ring-[#8FB8A8]/10 transition-all"
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
              className="w-full px-3.5 py-3 border border-[#E8E4DE] rounded-xl text-[14px] bg-white focus:outline-none focus:border-[#8FB8A8] focus:ring-2 focus:ring-[#8FB8A8]/10 transition-all"
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
            className="w-full px-3.5 py-3 border border-[#E8E4DE] rounded-xl text-[14px] bg-white focus:outline-none focus:border-[#8FB8A8] focus:ring-2 focus:ring-[#8FB8A8]/10 transition-all"
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
            className="w-full px-3.5 py-3 border border-[#E8E4DE] rounded-xl text-[14px] bg-white focus:outline-none focus:border-[#8FB8A8] focus:ring-2 focus:ring-[#8FB8A8]/10 transition-all"
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
        className={`w-full py-3.5 rounded-2xl text-[15px] font-bold transition-all active:scale-[0.98] ${
          isValid
            ? 'bg-[#2A5A4A] text-[#FFF8E7] shadow-lg shadow-[#2A5A4A]/20'
            : 'bg-[#E8E4DE] text-[#B8B2A9] cursor-not-allowed'
        }`}
      >
        Continue
      </button>
    </div>
  );
}
