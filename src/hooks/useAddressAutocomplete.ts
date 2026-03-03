'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { AddressSuggestion } from '../types';

/**
 * Custom hook for address autocomplete using Nominatim API (OpenStreetMap)
 * 
 * Features:
 * - Debounced search to limit API calls
 * - Restricted to Philippines addresses only
 * - Handles rate limiting (1 request per second)
 * - Graceful error handling
 * 
 * Nominatim Usage Policy:
 * - Maximum 1 request per second
 * - Must include User-Agent header
 * - Free to use, no API key required
 */

export function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const searchAddresses = useCallback(async (searchQuery: string) => {
    // Clear previous suggestions if query is empty
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);

    try {
      // Use Nominatim (OpenStreetMap) directly from client
      // With proper headers and debouncing to respect rate limits
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(searchQuery)}&` +
        `countrycodes=ph&` +
        `format=json&` +
        `limit=10&` +
        `addressdetails=1`,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'WhitelabelDeliveryApp/1.0',
            'Accept': 'application/json'
          },
          signal: abortController.signal
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }

      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('Nominatim API returned non-array response:', data);
        setError('Invalid response from address service');
        setSuggestions([]);
        return;
      }

      // Transform Nominatim response to our AddressSuggestion format
      const formattedSuggestions: AddressSuggestion[] = data.map((item: any) => ({
        display_name: item.display_name,
        place_id: item.place_id,
        lat: item.lat,
        lon: item.lon,
        type: item.type || '',
        importance: item.importance,
        address: {
          road: item.address?.road,
          house_number: item.address?.house_number,
          suburb: item.address?.suburb,
          village: item.address?.village,
          barangay: item.address?.barangay || item.address?.suburb, // Barangay is often in suburb field
          city: item.address?.city,
          town: item.address?.town,
          municipality: item.address?.municipality,
          state: item.address?.state,
          province: item.address?.province || item.address?.state,
          postcode: item.address?.postcode,
          country: item.address?.country,
          neighbourhood: item.address?.neighbourhood,
          quarter: item.address?.quarter,
          // Landmarks and POIs
          amenity: item.address?.amenity, // e.g., restaurant, school, hospital
          shop: item.address?.shop, // e.g., supermarket, mall
          tourism: item.address?.tourism // e.g., hotel, attraction
        }
      }));

      // Sort by importance (higher importance = more relevant) and then by type
      // Prioritize addresses with house numbers, then roads, then landmarks
      formattedSuggestions.sort((a, b) => {
        // First sort by importance if available
        if (a.importance && b.importance) {
          return b.importance - a.importance;
        }
        // Prioritize addresses with house numbers
        const aHasHouseNumber = !!a.address.house_number;
        const bHasHouseNumber = !!b.address.house_number;
        if (aHasHouseNumber !== bHasHouseNumber) {
          return aHasHouseNumber ? -1 : 1;
        }
        // Then prioritize addresses with road names
        const aHasRoad = !!a.address.road;
        const bHasRoad = !!b.address.road;
        if (aHasRoad !== bHasRoad) {
          return aHasRoad ? -1 : 1;
        }
        return 0;
      });

      setSuggestions(formattedSuggestions);
    } catch (err) {
      // Don't set error if request was aborted (user is typing)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      console.error('Error fetching address suggestions:', err);

      // Check for network errors or CORS issues
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else if (err instanceof Error) {
        setError(`Failed to fetch address suggestions: ${err.message}. Please try again or enter address manually.`);
      } else {
        setError('Failed to fetch address suggestions. Please try again or enter address manually.');
      }

      setSuggestions([]);
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Don't search if query is too short (less than 3 characters)
    if (query.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // Debounce the search (500ms delay to respect Nominatim rate limits)
    debounceTimerRef.current = setTimeout(() => {
      searchAddresses(query);
    }, 500);

    // Cleanup function
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, searchAddresses]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    suggestions,
    loading,
    error,
    clearSuggestions: () => setSuggestions([])
  };
}

