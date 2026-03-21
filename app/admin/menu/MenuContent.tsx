'use client';

import { useState, useTransition } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  UtensilsCrossed,
  MessageCircle,
  Star,
  Eye,
  EyeOff,
  Upload,
} from 'lucide-react';
import type { MenuItem, Category } from '@/types';
import { deleteMenuItem, bulkUpdateMessengerVisibility } from '@/actions/menu';
import MenuItemForm from '@/components/admin/MenuItemForm';
import BulkCostImport from '@/components/admin/BulkCostImport';

interface MenuContentProps {
  menuItems: MenuItem[];
  categories: Category[];
}

export default function MenuContent({ menuItems, categories }: MenuContentProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [bulkPending, startBulkTransition] = useTransition();
  const [showBulkImport, setShowBulkImport] = useState(false);

  // ── Group items by category ─────────────────────────────────────────────

  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const categoryNames = sortedCategories.map((c) => c.name);

  const grouped = new Map<string, MenuItem[]>();
  for (const cat of categoryNames) {
    grouped.set(cat, []);
  }
  // Catch items in unknown categories
  for (const item of menuItems) {
    const key = item.category || 'Uncategorised';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  const handleDelete = (id: string) => {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteMenuItem(id);
      if (!result.success) {
        setDeleteError(result.error || 'Failed to delete menu item');
      }
      setConfirmDelete(null);
    });
  };

  const handleBulkMessenger = (show: boolean) => {
    startBulkTransition(async () => {
      await bulkUpdateMessengerVisibility({ ids: 'all', show_in_messenger: show });
    });
  };

  // ── Category lookup helper ──────────────────────────────────────────────

  const categoryIcon = (name: string): string => {
    const cat = categories.find((c) => c.name === name);
    return cat?.icon || '';
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Page header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-playfair text-2xl font-semibold text-stone-900">
              Menu
            </h1>
            <p className="font-nunito text-sm text-stone-500 mt-1">
              Manage menu items, variations and add-ons
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Bulk messenger toggles */}
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              <button
                onClick={() => handleBulkMessenger(true)}
                disabled={bulkPending}
                className="
                  inline-flex items-center gap-1.5 px-3 py-2
                  text-xs font-nunito font-semibold text-stone-600
                  border border-[#E8E3DA] rounded-lg
                  hover:bg-[#F2EEE8] transition-all duration-200
                  disabled:opacity-50
                "
                title="Show all in Messenger"
              >
                <Eye className="h-3.5 w-3.5" />
                All Messenger
              </button>
              <button
                onClick={() => handleBulkMessenger(false)}
                disabled={bulkPending}
                className="
                  inline-flex items-center gap-1.5 px-3 py-2
                  text-xs font-nunito font-semibold text-stone-600
                  border border-[#E8E3DA] rounded-lg
                  hover:bg-[#F2EEE8] transition-all duration-200
                  disabled:opacity-50
                "
                title="Hide all from Messenger"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Hide Messenger
              </button>
            </div>

            <button
              onClick={() => setShowBulkImport(true)}
              className="
                inline-flex items-center gap-2 px-4 py-2.5
                text-sm font-nunito font-semibold text-stone-600
                border border-[#E8E3DA] rounded-[10px]
                hover:bg-[#F2EEE8] transition-all duration-200
              "
            >
              <Upload className="h-4 w-4" />
              Import Costs
            </button>

            <button
              onClick={() => {
                setEditingItem(null);
                setShowForm(true);
              }}
              className="
                inline-flex items-center gap-2 px-5 py-2.5
                bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
                rounded-[10px] shadow-sm
                hover:bg-[#3D8A80] active:bg-[#2C6E65]
                focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
                transition-all duration-200
              "
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-8">
        {/* Delete error banner */}
        {deleteError && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
            <p className="font-nunito text-sm text-red-700">{deleteError}</p>
            <button
              onClick={() => setDeleteError(null)}
              className="ml-auto text-red-400 hover:text-red-600 text-sm font-nunito"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Category groups */}
        {Array.from(grouped.entries()).map(([categoryName, items]) => {
          if (items.length === 0) return null;

          return (
            <div key={categoryName}>
              {/* Category heading */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">{categoryIcon(categoryName)}</span>
                <h2 className="font-playfair text-lg font-semibold text-stone-800">
                  {categoryName}
                </h2>
                <span className="inline-flex px-2 py-0.5 text-xs font-nunito font-medium bg-[#F2EEE8] text-stone-500 rounded-full">
                  {items.length}
                </span>
              </div>

              {/* Item cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="
                      bg-white rounded-xl border border-[#E8E3DA] overflow-hidden
                      group hover:border-[#7BBFB5]/30 transition-all duration-200
                    "
                  >
                    {/* Image */}
                    {item.image && (
                      <div className="h-36 bg-[#F2EEE8] overflow-hidden">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="p-4">
                      {/* Name + badges */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-nunito font-semibold text-stone-900 truncate">
                            {item.name}
                          </h3>
                          {item.description && (
                            <p className="font-nunito text-xs text-stone-400 mt-0.5 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                          <button
                            onClick={() => handleEdit(item)}
                            className="
                              p-2 rounded-lg text-stone-400
                              hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10
                              transition-all duration-200
                            "
                            title="Edit item"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(item.id)}
                            className="
                              p-2 rounded-lg text-stone-400
                              hover:text-red-500 hover:bg-red-50
                              transition-all duration-200
                            "
                            title="Delete item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="flex items-center gap-2 mb-3">
                        {item.isOnDiscount && item.discountPrice ? (
                          <>
                            <span className="font-nunito font-bold text-sm text-[#3D8A80]">
                              P{item.effectivePrice?.toFixed(2)}
                            </span>
                            <span className="font-nunito text-xs text-stone-400 line-through">
                              P{item.basePrice.toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <span className="font-nunito font-bold text-sm text-stone-800">
                            P{item.basePrice.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Cost & Margin */}
                      {item.costPrice != null && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-nunito text-xs text-stone-400">
                            Cost: P{Number(item.costPrice).toFixed(2)}
                          </span>
                          <span className="text-stone-300">|</span>
                          {(() => {
                            const sell = item.effectivePrice ?? item.basePrice;
                            const cost = Number(item.costPrice);
                            const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
                            const color =
                              margin > 60
                                ? 'text-green-600 bg-green-50'
                                : margin > 40
                                  ? 'text-amber-600 bg-amber-50'
                                  : 'text-red-600 bg-red-50';
                            return (
                              <span
                                className={`inline-flex px-1.5 py-0.5 text-[10px] font-nunito font-medium rounded-full ${color}`}
                              >
                                {margin.toFixed(0)}% margin
                              </span>
                            );
                          })()}
                        </div>
                      )}

                      {/* Status badges */}
                      <div className="flex flex-wrap gap-1.5">
                        {item.available === false && (
                          <span className="inline-flex px-2 py-0.5 text-[10px] font-nunito font-medium bg-red-50 text-red-600 rounded-full">
                            Unavailable
                          </span>
                        )}
                        {item.popular && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-nunito font-medium bg-amber-50 text-amber-600 rounded-full">
                            <Star className="h-2.5 w-2.5" />
                            Popular
                          </span>
                        )}
                        {item.show_in_messenger && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-nunito font-medium bg-blue-50 text-blue-600 rounded-full">
                            <MessageCircle className="h-2.5 w-2.5" />
                            Messenger
                          </span>
                        )}
                        {(item.variations?.length ?? 0) > 0 && (
                          <span className="inline-flex px-2 py-0.5 text-[10px] font-nunito font-medium bg-[#7BBFB5]/10 text-[#3D8A80] rounded-full">
                            {item.variations!.length} var.
                          </span>
                        )}
                        {(item.addOns?.length ?? 0) > 0 && (
                          <span className="inline-flex px-2 py-0.5 text-[10px] font-nunito font-medium bg-[#F2EEE8] text-stone-500 rounded-full">
                            {item.addOns!.length} add-on{item.addOns!.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {menuItems.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-[#E8E3DA]">
            <UtensilsCrossed className="h-10 w-10 text-stone-300 mx-auto mb-4" />
            <h3 className="font-playfair text-lg font-semibold text-stone-700 mb-1">
              No menu items yet
            </h3>
            <p className="font-nunito text-sm text-stone-400 mb-6">
              Add your first menu item to get started.
            </p>
            <button
              onClick={() => {
                setEditingItem(null);
                setShowForm(true);
              }}
              className="
                inline-flex items-center gap-2 px-5 py-2.5
                bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
                rounded-[10px] shadow-sm
                hover:bg-[#3D8A80] active:bg-[#2C6E65]
                transition-all duration-200
              "
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>
        )}
      </div>

      {/* Bulk Cost Import modal */}
      {showBulkImport && <BulkCostImport onClose={() => setShowBulkImport(false)} />}

      {/* Menu Item Form modal */}
      {showForm && (
        <MenuItemForm
          item={editingItem}
          categories={categories}
          onClose={handleCloseForm}
        />
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm mx-4 bg-white rounded-xl shadow-xl border border-[#E8E3DA] p-6 text-center">
            <div className="mx-auto w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="font-playfair text-lg font-semibold text-stone-900 mb-2">
              Delete Menu Item
            </h3>
            <p className="font-nunito text-sm text-stone-500 mb-6">
              Are you sure you want to delete this item? This will also remove its variations and add-ons.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={isPending}
                className="
                  px-5 py-2.5 rounded-[10px] font-nunito font-semibold text-sm
                  text-stone-600 hover:bg-[#F2EEE8]
                  transition-all duration-200 disabled:opacity-50
                "
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={isPending}
                className="
                  px-5 py-2.5 rounded-[10px] font-nunito font-semibold text-sm
                  bg-red-500 text-white shadow-sm
                  hover:bg-red-600 active:bg-red-700
                  transition-all duration-200 disabled:opacity-50
                "
              >
                {isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
