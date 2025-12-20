'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Save, Upload, X } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useImageUpload } from '../hooks/useImageUpload';
import { useAddressAutocomplete } from '../hooks/useAddressAutocomplete';
import type { AddressSuggestion } from '../types';

const SiteSettingsManager: React.FC = () => {
  const { siteSettings, loading, updateSiteSettings } = useSiteSettings();
  const { uploadImage, uploading } = useImageUpload();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    site_name: '',
    site_description: '',
    currency: '',
    currency_code: '',
    lalamove_market: '',
    lalamove_service_type: '',
    lalamove_sandbox: 'true',
    lalamove_api_key: '',
    lalamove_api_secret: '',
    lalamove_store_name: '',
    lalamove_store_phone: '',
    lalamove_store_address: '',
    lalamove_store_latitude: '',
    lalamove_store_longitude: '',
    meta_pixel_id: ''
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [storeAddressQuery, setStoreAddressQuery] = useState('');
  const [showStoreSuggestions, setShowStoreSuggestions] = useState(false);
  const [selectedStoreSuggestionIndex, setSelectedStoreSuggestionIndex] = useState(-1);
  const storeAddressInputRef = useRef<HTMLInputElement>(null);
  const storeSuggestionsRef = useRef<HTMLDivElement>(null);
  const { suggestions: storeSuggestions, loading: storeAddressLoading, error: storeAddressError } = useAddressAutocomplete(
    isEditing ? storeAddressQuery : ''
  );

  React.useEffect(() => {
    if (siteSettings) {
      setFormData({
        site_name: siteSettings.site_name,
        site_description: siteSettings.site_description,
        currency: siteSettings.currency,
        currency_code: siteSettings.currency_code,
        lalamove_market: siteSettings.lalamove_market || '',
        lalamove_service_type: siteSettings.lalamove_service_type || '',
        lalamove_sandbox: siteSettings.lalamove_sandbox || 'true',
        lalamove_api_key: siteSettings.lalamove_api_key || '',
        lalamove_api_secret: siteSettings.lalamove_api_secret || '',
        lalamove_store_name: siteSettings.lalamove_store_name || '',
        lalamove_store_phone: siteSettings.lalamove_store_phone || '',
        lalamove_store_address: siteSettings.lalamove_store_address || '',
        lalamove_store_latitude: siteSettings.lalamove_store_latitude || '',
        lalamove_store_longitude: siteSettings.lalamove_store_longitude || '',
        meta_pixel_id: siteSettings.meta_pixel_id || ''
      });
      setLogoPreview(siteSettings.site_logo);
      setStoreAddressQuery(siteSettings.lalamove_store_address || '');
      setShowStoreSuggestions(false);
      setSelectedStoreSuggestionIndex(-1);
    }
  }, [siteSettings]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        storeAddressInputRef.current &&
        !storeAddressInputRef.current.contains(event.target as Node) &&
        storeSuggestionsRef.current &&
        !storeSuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowStoreSuggestions(false);
        setSelectedStoreSuggestionIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setShowStoreSuggestions(false);
      setSelectedStoreSuggestionIndex(-1);
    }
  }, [isEditing]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStoreAddressInputChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      lalamove_store_address: value
    }));
    setStoreAddressQuery(value);
    setShowStoreSuggestions(true);
    setSelectedStoreSuggestionIndex(-1);
  };

  const handleStoreAddressSelect = (suggestion: AddressSuggestion) => {
    setFormData(prev => ({
      ...prev,
      lalamove_store_address: suggestion.display_name,
      lalamove_store_latitude: suggestion.lat,
      lalamove_store_longitude: suggestion.lon
    }));
    setStoreAddressQuery(suggestion.display_name);
    setShowStoreSuggestions(false);
    setSelectedStoreSuggestionIndex(-1);
  };

  const handleStoreAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showStoreSuggestions || storeSuggestions.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedStoreSuggestionIndex(prev =>
          prev < storeSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedStoreSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : -1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedStoreSuggestionIndex >= 0 && selectedStoreSuggestionIndex < storeSuggestions.length) {
          handleStoreAddressSelect(storeSuggestions[selectedStoreSuggestionIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowStoreSuggestions(false);
        setSelectedStoreSuggestionIndex(-1);
        break;
    }
  };

  const handleSave = async () => {
    try {
      let logoUrl = logoPreview;

      // Upload new logo if selected
      if (logoFile) {
        const uploadedUrl = await uploadImage(logoFile);
        logoUrl = uploadedUrl;
      }

      // Update all settings
      await updateSiteSettings({
        site_name: formData.site_name,
        site_description: formData.site_description,
        currency: formData.currency,
        currency_code: formData.currency_code,
        site_logo: logoUrl,
        lalamove_market: formData.lalamove_market,
        lalamove_service_type: formData.lalamove_service_type,
        lalamove_sandbox: formData.lalamove_sandbox,
        lalamove_api_key: formData.lalamove_api_key,
        lalamove_api_secret: formData.lalamove_api_secret,
        lalamove_store_name: formData.lalamove_store_name,
        lalamove_store_phone: formData.lalamove_store_phone,
        lalamove_store_address: formData.lalamove_store_address,
        lalamove_store_latitude: formData.lalamove_store_latitude,
        lalamove_store_longitude: formData.lalamove_store_longitude,
        meta_pixel_id: formData.meta_pixel_id
      });

      setIsEditing(false);
      setLogoFile(null);
    } catch (error) {
      console.error('Error saving site settings:', error);
    }
  };

  const handleCancel = () => {
    if (siteSettings) {
      setFormData({
        site_name: siteSettings.site_name,
        site_description: siteSettings.site_description,
        currency: siteSettings.currency,
        currency_code: siteSettings.currency_code,
        lalamove_market: siteSettings.lalamove_market || '',
        lalamove_service_type: siteSettings.lalamove_service_type || '',
        lalamove_sandbox: siteSettings.lalamove_sandbox || 'true',
        lalamove_api_key: siteSettings.lalamove_api_key || '',
        lalamove_api_secret: siteSettings.lalamove_api_secret || '',
        lalamove_store_name: siteSettings.lalamove_store_name || '',
        lalamove_store_phone: siteSettings.lalamove_store_phone || '',
        lalamove_store_address: siteSettings.lalamove_store_address || '',
        lalamove_store_latitude: siteSettings.lalamove_store_latitude || '',
        lalamove_store_longitude: siteSettings.lalamove_store_longitude || '',
        meta_pixel_id: siteSettings.meta_pixel_id || ''
      });
      setLogoPreview(siteSettings.site_logo);
      setStoreAddressQuery(siteSettings.lalamove_store_address || '');
    }
    setIsEditing(false);
    setLogoFile(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-noto font-semibold text-black">Site Settings</h2>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>Edit Settings</span>
          </button>
        ) : (
          <div className="flex space-x-2">
            <button
              onClick={handleCancel}
              className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors duration-200 flex items-center space-x-2"
            >
              <X className="h-4 w-4" />
              <span>Cancel</span>
            </button>
            <button
              onClick={handleSave}
              disabled={uploading}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center space-x-2 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{uploading ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Site Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Site Logo
          </label>
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Site Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-2xl text-gray-400">☕</div>
              )}
            </div>
            {isEditing && (
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                  id="logo-upload"
                />
                <label
                  htmlFor="logo-upload"
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors duration-200 flex items-center space-x-2 cursor-pointer"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload Logo</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Site Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Site Name
          </label>
          {isEditing ? (
            <input
              type="text"
              name="site_name"
              value={formData.site_name}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Enter site name"
            />
          ) : (
            <p className="text-lg font-medium text-black">{siteSettings?.site_name}</p>
          )}
        </div>

        {/* Site Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Site Description
          </label>
          {isEditing ? (
            <textarea
              name="site_description"
              value={formData.site_description}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Enter site description"
            />
          ) : (
            <p className="text-gray-600">{siteSettings?.site_description}</p>
          )}
        </div>

        {/* Currency Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Currency Symbol
            </label>
            {isEditing ? (
              <input
                type="text"
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., ₱, $, €"
              />
            ) : (
              <p className="text-lg font-medium text-black">{siteSettings?.currency}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Currency Code
            </label>
            {isEditing ? (
              <input
                type="text"
                name="currency_code"
                value={formData.currency_code}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., PHP, USD, EUR"
              />
            ) : (
              <p className="text-lg font-medium text-black">{siteSettings?.currency_code}</p>
            )}
          </div>
        </div>
        {/* Delivery / Lalamove Configuration */}
        <div className="border-t border-gray-100 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-black">Delivery / Lalamove</h3>
              <p className="text-sm text-gray-500">Set the Lalamove market, credentials, and store pickup location used by the delivery feature.</p>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Lalamove Market
                  <input
                    type="text"
                    name="lalamove_market"
                    value={formData.lalamove_market}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    placeholder="PH"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Service Type
                  <input
                    type="text"
                    name="lalamove_service_type"
                    value={formData.lalamove_service_type}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    placeholder="MOTORCYCLE"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Sandbox Mode
                  <select
                    name="lalamove_sandbox"
                    value={formData.lalamove_sandbox}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="true">Sandbox</option>
                    <option value="false">Production</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  API Key
                  <input
                    type="text"
                    name="lalamove_api_key"
                    value={formData.lalamove_api_key}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  API Secret
                  <input
                    type="password"
                    name="lalamove_api_secret"
                    value={formData.lalamove_api_secret}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Store Name
                  <input
                    type="text"
                    name="lalamove_store_name"
                    value={formData.lalamove_store_name}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Store Phone
                  <input
                    type="text"
                    name="lalamove_store_phone"
                    value={formData.lalamove_store_phone}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Store Address
                  <div className="relative">
                    <input
                      ref={storeAddressInputRef}
                      type="text"
                      name="lalamove_store_address"
                      value={formData.lalamove_store_address}
                      onChange={(e) => handleStoreAddressInputChange(e.target.value)}
                      onFocus={() => setShowStoreSuggestions(true)}
                      onKeyDown={handleStoreAddressKeyDown}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="Search store address..."
                    />
                    {storeAddressLoading && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <span className="text-xs text-gray-500">Loading...</span>
                      </div>
                    )}
                    {showStoreSuggestions && storeAddressQuery.trim().length >= 3 && (
                      <div
                        ref={storeSuggestionsRef}
                        className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                      >
                        {storeAddressError && (
                          <div className="p-3 text-xs text-red-600 border-b border-gray-100">
                            {storeAddressError}
                          </div>
                        )}
                        {!storeAddressError && storeSuggestions.length === 0 && !storeAddressLoading && (
                          <div className="p-3 text-xs text-gray-500">No addresses found.</div>
                        )}
                        {storeSuggestions.map((suggestion, index) => (
                          <button
                            key={suggestion.place_id}
                            type="button"
                            onClick={() => handleStoreAddressSelect(suggestion)}
                            className={`w-full text-left px-4 py-3 border-b border-gray-100 text-sm ${index === selectedStoreSuggestionIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
                              }`}
                          >
                            <p className="font-medium text-black">{suggestion.display_name.split(',')[0]}</p>
                            <p className="text-xs text-gray-500">
                              {suggestion.display_name}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Store Latitude
                  <input
                    type="number"
                    step="0.000001"
                    name="lalamove_store_latitude"
                    value={formData.lalamove_store_latitude}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Store Longitude
                  <input
                    type="number"
                    step="0.000001"
                    name="lalamove_store_longitude"
                    value={formData.lalamove_store_longitude}
                    onChange={handleInputChange}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 text-sm text-gray-600">
              <p>Market: {siteSettings?.lalamove_market || 'Not configured'}</p>
              <p>Service Type: {siteSettings?.lalamove_service_type || 'Not configured'}</p>
              <p>Sandbox Mode: {siteSettings?.lalamove_sandbox === 'false' ? 'Production' : 'Sandbox'}</p>
              <p>API Key: {siteSettings?.lalamove_api_key ? 'Configured' : 'Not set'}</p>
              <p>API Secret: {siteSettings?.lalamove_api_secret ? 'Configured' : 'Not set'}</p>
              <p>Store Name: {siteSettings?.lalamove_store_name || 'Not set'}</p>
              <p>Store Phone: {siteSettings?.lalamove_store_phone || 'Not set'}</p>
              <p>Store Address: {siteSettings?.lalamove_store_address || 'Not set'}</p>
              <p>Store Latitude: {siteSettings?.lalamove_store_latitude || 'Not set'}</p>
              <p>Store Longitude: {siteSettings?.lalamove_store_longitude || 'Not set'}</p>
            </div>
          )}
        </div>

        {/* Meta Pixel Configuration */}
        <div className="border-t border-gray-100 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-black">Meta Pixel (Facebook)</h3>
              <p className="text-sm text-gray-500">Configure Facebook Meta Pixel for tracking purchases and events.</p>
            </div>
          </div>

          {isEditing ? (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Meta Pixel ID
                <input
                  type="text"
                  name="meta_pixel_id"
                  value={formData.meta_pixel_id}
                  onChange={handleInputChange}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="e.g., 1205933524966708"
                />
              </label>
              <p className="mt-1 text-xs text-gray-500">Find your Pixel ID in the Facebook Events Manager.</p>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              <p>Pixel ID: {siteSettings?.meta_pixel_id || 'Not configured'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SiteSettingsManager;
