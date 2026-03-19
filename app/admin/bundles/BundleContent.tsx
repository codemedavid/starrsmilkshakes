'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Bundle } from '@/types/bundle';
import type { MenuItem, Category } from '@/types';
import BundleList from '@/components/admin/BundleList';
import BundleForm from '@/components/admin/BundleForm';

interface Props {
  bundles: Bundle[];
  categories: Category[];
  menuItems: MenuItem[];
}

export default function BundleContent({ bundles, categories, menuItems }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-playfair text-2xl font-semibold text-stone-900">Bundles</h1>
            <p className="font-nunito text-sm text-stone-500 mt-1">Create combo deals with customizable slots</p>
          </div>
          <button
            onClick={() => { setEditingBundle(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm rounded-[10px] shadow-sm hover:bg-[#3D8A80] transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
            Create Bundle
          </button>
        </div>
      </div>
      <div className="p-6">
        <BundleList
          bundles={bundles}
          onEdit={(b) => { setEditingBundle(b); setShowForm(true); }}
        />
      </div>
      {showForm && (
        <BundleForm
          bundle={editingBundle}
          categories={categories}
          menuItems={menuItems}
          onClose={() => { setShowForm(false); setEditingBundle(null); }}
        />
      )}
    </div>
  );
}
