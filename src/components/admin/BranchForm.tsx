'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Branch } from '@/types';
import { addBranch, updateBranch } from '@/actions/branches';
import LocationPicker from '@/components/LocationPicker';

interface BranchFormProps {
  branch?: Branch | null;
  onClose: () => void;
}

export default function BranchForm({ branch, onClose }: BranchFormProps) {
  const isEditing = Boolean(branch);

  const [formData, setFormData] = useState({
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
    latitude: branch?.latitude ?? '',
    longitude: branch?.longitude ?? '',
    is_main: branch?.is_main ?? false,
    is_active: branch?.is_active ?? true,
    messenger_username: branch?.messenger_username ?? '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        messenger_username: formData.messenger_username || null,
      };

      const result = isEditing
        ? await updateBranch(branch!.id, payload)
        : await addBranch(payload);

      if (!result.success) {
        setError(result.error || 'Something went wrong');
        return;
      }

      onClose();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 bg-white rounded-xl shadow-xl border border-[#E8E3DA]">
        <div className="px-6 py-5 border-b border-[#E8E3DA]">
          <h2 className="font-playfair text-xl font-semibold text-stone-900">
            {isEditing ? 'Edit Branch' : 'Add Branch'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-[10px] text-sm font-nunito text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Branch Name */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Branch Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="
                  w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                  font-nunito text-sm text-stone-900 placeholder:text-stone-400
                  focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                  transition-all duration-200
                "
                placeholder="e.g. Makati Branch"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Phone Number
              </label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="
                  w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                  font-nunito text-sm text-stone-900 placeholder:text-stone-400
                  focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                  transition-all duration-200
                "
                placeholder="+63 9XX XXX XXXX"
              />
            </div>

            {/* Address */}
            <div className="md:col-span-2">
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Address
              </label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="
                  w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                  font-nunito text-sm text-stone-900 placeholder:text-stone-400
                  focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                  transition-all duration-200
                "
                placeholder="Full address for delivery pickup"
              />
            </div>

            {/* Location Picker */}
            <div className="md:col-span-2">
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Branch Location
              </label>
              <LocationPicker
                initialLat={formData.latitude ? parseFloat(formData.latitude) : undefined}
                initialLng={formData.longitude ? parseFloat(formData.longitude) : undefined}
                onLocationSelect={(lat, lng, address) => {
                  setFormData((prev) => ({
                    ...prev,
                    latitude: lat.toString(),
                    longitude: lng.toString(),
                    address: address || prev.address,
                  }));
                }}
              />
              <div className="grid grid-cols-2 gap-4 mt-2">
                <input
                  type="text"
                  readOnly
                  value={formData.latitude}
                  className="
                    w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                    bg-[#FAFAF8] font-nunito text-sm text-stone-500
                  "
                  placeholder="Latitude"
                />
                <input
                  type="text"
                  readOnly
                  value={formData.longitude}
                  className="
                    w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                    bg-[#FAFAF8] font-nunito text-sm text-stone-500
                  "
                  placeholder="Longitude"
                />
              </div>
            </div>

            {/* Messenger Username */}
            <div className="md:col-span-2">
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Facebook Page Username (for Messenger)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-nunito text-stone-500">m.me/</span>
                <input
                  type="text"
                  value={formData.messenger_username}
                  onChange={(e) => setFormData({ ...formData, messenger_username: e.target.value })}
                  className="
                    flex-1 px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                    font-nunito text-sm text-stone-900 placeholder:text-stone-400
                    focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                    transition-all duration-200
                  "
                  placeholder="e.g. StarrsFamousShakesMakati"
                />
              </div>
              <p className="text-xs font-nunito text-stone-400 mt-1">
                Leave empty to use the default Facebook page
              </p>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_main}
                onChange={(e) => setFormData({ ...formData, is_main: e.target.checked })}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito text-stone-700">Main Branch</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito text-stone-700">Active</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-[#E8E3DA]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="
                px-5 py-2.5 rounded-[10px] font-nunito font-semibold text-sm
                text-stone-600 hover:bg-[#F2EEE8]
                transition-all duration-200 disabled:opacity-50
              "
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="
                inline-flex items-center gap-2 px-5 py-2.5
                bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
                rounded-[10px] shadow-sm
                hover:bg-[#3D8A80] active:bg-[#2C6E65]
                focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
                transition-all duration-200 disabled:opacity-50
              "
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? 'Update Branch' : 'Create Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
