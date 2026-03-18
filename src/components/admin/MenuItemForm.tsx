'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { MenuItem, Variation, AddOn } from '@/types';
import type { Category } from '@/types';
import { addMenuItem, updateMenuItem } from '@/actions/menu';
import ImageUpload from '@/components/ImageUpload';

interface MenuItemFormProps {
  item?: MenuItem | null;
  categories: Category[];
  onClose: () => void;
}

interface VariationDraft {
  id?: string;
  name: string;
  price: string;
  image?: string;
}

interface AddOnDraft {
  id?: string;
  name: string;
  price: string;
  category: string;
}

export default function MenuItemForm({ item, categories, onClose }: MenuItemFormProps) {
  const isEditing = Boolean(item);

  // ─── Basic fields ───────────────────────────────────────────────────────
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [basePrice, setBasePrice] = useState(item?.basePrice?.toString() ?? '');
  const [categoryId, setCategoryId] = useState(item?.category ?? (categories[0]?.name ?? ''));
  const [image, setImage] = useState<string | undefined>(item?.image);
  const [popular, setPopular] = useState(item?.popular ?? false);
  const [available, setAvailable] = useState(item?.available ?? true);
  const [showInMessenger, setShowInMessenger] = useState(item?.show_in_messenger ?? false);

  // ─── Discount fields ───────────────────────────────────────────────────
  const [discountActive, setDiscountActive] = useState(item?.discountActive ?? false);
  const [discountPrice, setDiscountPrice] = useState(item?.discountPrice?.toString() ?? '');
  const [discountStartDate, setDiscountStartDate] = useState(item?.discountStartDate ?? '');
  const [discountEndDate, setDiscountEndDate] = useState(item?.discountEndDate ?? '');

  // ─── Variations ─────────────────────────────────────────────────────────
  const [variations, setVariations] = useState<VariationDraft[]>(
    item?.variations?.map((v: Variation) => ({
      id: v.id,
      name: v.name,
      price: v.price.toString(),
      image: v.image,
    })) ?? [],
  );

  // ─── Add-ons ────────────────────────────────────────────────────────────
  const [addOns, setAddOns] = useState<AddOnDraft[]>(
    item?.addOns?.map((a: AddOn) => ({
      id: a.id,
      name: a.name,
      price: a.price.toString(),
      category: a.category,
    })) ?? [],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Variation helpers ──────────────────────────────────────────────────

  const addVariation = () => {
    setVariations((prev) => [...prev, { name: '', price: '' }]);
  };

  const updateVariation = (index: number, field: keyof VariationDraft, value: string) => {
    setVariations((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    );
  };

  const removeVariation = (index: number) => {
    setVariations((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Add-on helpers ─────────────────────────────────────────────────────

  const addAddOn = () => {
    setAddOns((prev) => [...prev, { name: '', price: '', category: '' }]);
  };

  const updateAddOn = (index: number, field: keyof AddOnDraft, value: string) => {
    setAddOns((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    );
  };

  const removeAddOn = (index: number) => {
    setAddOns((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name,
        basePrice: parseFloat(basePrice),
        category: categoryId,
        description,
        image: image || null,
        popular,
        available,
        show_in_messenger: showInMessenger,
        discountActive,
        discountPrice: discountPrice ? parseFloat(discountPrice) : null,
        discountStartDate: discountStartDate || null,
        discountEndDate: discountEndDate || null,
        variations: variations
          .filter((v) => v.name.trim())
          .map((v) => ({
            name: v.name.trim(),
            price: parseFloat(v.price) || 0,
            image: v.image || null,
          })),
        addOns: addOns
          .filter((a) => a.name.trim() && a.category.trim())
          .map((a) => ({
            name: a.name.trim(),
            price: parseFloat(a.price) || 0,
            category: a.category.trim(),
          })),
      };

      const result = isEditing
        ? await updateMenuItem(item!.id, payload)
        : await addMenuItem(payload);

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

  // ─── Shared input classes ───────────────────────────────────────────────

  const inputClass = `
    w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
    font-nunito text-sm text-stone-900 placeholder:text-stone-400
    focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
    transition-all duration-200
  `;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4 bg-white rounded-xl shadow-xl border border-[#E8E3DA]">
        <div className="px-6 py-5 border-b border-[#E8E3DA]">
          <h2 className="font-playfair text-xl font-semibold text-stone-900">
            {isEditing ? 'Edit Menu Item' : 'Add Menu Item'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-[10px] text-sm font-nunito text-red-700">
              {error}
            </div>
          )}

          {/* ── Basic Fields ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Classic Vanilla Shake"
              />
            </div>

            {/* Base Price */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Base Price <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Select a category
                </option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="A short description for this menu item"
              />
            </div>

            {/* Image Upload */}
            <div className="md:col-span-2">
              <ImageUpload
                currentImage={image}
                onImageChange={(url) => setImage(url)}
              />
            </div>
          </div>

          {/* ── Variations ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-nunito font-semibold text-stone-700">
                Variations
              </label>
              <button
                type="button"
                onClick={addVariation}
                className="
                  inline-flex items-center gap-1.5 px-3 py-1.5
                  text-xs font-nunito font-semibold text-[#3D8A80]
                  bg-[#7BBFB5]/10 rounded-lg
                  hover:bg-[#7BBFB5]/20 transition-all duration-200
                "
              >
                <Plus className="h-3.5 w-3.5" />
                Add Variation
              </button>
            </div>

            {variations.length === 0 && (
              <p className="text-xs font-nunito text-stone-400">
                No variations. Add different sizes or flavors.
              </p>
            )}

            <div className="space-y-3">
              {variations.map((variation, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={variation.name}
                      onChange={(e) => updateVariation(index, 'name', e.target.value)}
                      className={inputClass}
                      placeholder="e.g. Regular, Large"
                    />
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={variation.price}
                      onChange={(e) => updateVariation(index, 'price', e.target.value)}
                      className={inputClass}
                      placeholder="Price"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVariation(index)}
                    className="
                      p-2.5 rounded-lg text-stone-400
                      hover:text-red-500 hover:bg-red-50
                      transition-all duration-200 mt-0.5
                    "
                    title="Remove variation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Add-Ons ────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-nunito font-semibold text-stone-700">
                Add-Ons
              </label>
              <button
                type="button"
                onClick={addAddOn}
                className="
                  inline-flex items-center gap-1.5 px-3 py-1.5
                  text-xs font-nunito font-semibold text-[#3D8A80]
                  bg-[#7BBFB5]/10 rounded-lg
                  hover:bg-[#7BBFB5]/20 transition-all duration-200
                "
              >
                <Plus className="h-3.5 w-3.5" />
                Add Add-On
              </button>
            </div>

            {addOns.length === 0 && (
              <p className="text-xs font-nunito text-stone-400">
                No add-ons. Add extras like toppings or drizzles.
              </p>
            )}

            <div className="space-y-3">
              {addOns.map((addOn, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={addOn.name}
                      onChange={(e) => updateAddOn(index, 'name', e.target.value)}
                      className={inputClass}
                      placeholder="e.g. Whipped Cream"
                    />
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addOn.price}
                      onChange={(e) => updateAddOn(index, 'price', e.target.value)}
                      className={inputClass}
                      placeholder="Price"
                    />
                  </div>
                  <div className="w-32">
                    <input
                      type="text"
                      value={addOn.category}
                      onChange={(e) => updateAddOn(index, 'category', e.target.value)}
                      className={inputClass}
                      placeholder="Category"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAddOn(index)}
                    className="
                      p-2.5 rounded-lg text-stone-400
                      hover:text-red-500 hover:bg-red-50
                      transition-all duration-200 mt-0.5
                    "
                    title="Remove add-on"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Toggles ────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => setAvailable(e.target.checked)}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito text-stone-700">Available</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={popular}
                onChange={(e) => setPopular(e.target.checked)}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito text-stone-700">Popular</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showInMessenger}
                onChange={(e) => setShowInMessenger(e.target.checked)}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito text-stone-700">Show in Messenger</span>
            </label>
          </div>

          {/* ── Discount Section ───────────────────────────────────── */}
          <div className="border-t border-[#E8E3DA] pt-5">
            <label className="flex items-center gap-2.5 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={discountActive}
                onChange={(e) => setDiscountActive(e.target.checked)}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito font-semibold text-stone-700">Enable Discount</span>
            </label>

            {discountActive && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                    Discount Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountPrice}
                    onChange={(e) => setDiscountPrice(e.target.value)}
                    className={inputClass}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={discountStartDate}
                    onChange={(e) => setDiscountStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={discountEndDate}
                    onChange={(e) => setDiscountEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Actions ────────────────────────────────────────────── */}
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
              {isEditing ? 'Update Item' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
