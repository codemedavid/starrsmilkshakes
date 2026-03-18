'use client';

import { useState, useTransition } from 'react';
import { Plus, Edit2, Trash2, LayoutList, AlertTriangle } from 'lucide-react';
import { addCategory, updateCategory, deleteCategory } from '@/actions/categories';
import CategoryReorderList from '@/components/admin/CategoryReorderList';
import type { Category } from '@/hooks/useCategories';

interface CategoriesContentProps {
  categories: Category[];
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

interface CategoryFormProps {
  category: Category | null;
  onClose: () => void;
}

function CategoryForm({ category, onClose }: CategoryFormProps) {
  const isEdit = Boolean(category);
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateCategory(category!.id, { name, icon })
        : await addCategory({ name, icon });

      if (!result.success) {
        setFormError(result.error || 'Something went wrong');
        return;
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm mx-4 bg-white rounded-xl shadow-xl border border-[#E8E3DA] p-6">
        <h3 className="font-playfair text-lg font-semibold text-stone-900 mb-5">
          {isEdit ? 'Edit Category' : 'Add Category'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="font-nunito text-sm text-red-700">{formError}</p>
            </div>
          )}

          <div>
            <label className="block font-nunito text-sm font-semibold text-stone-700 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Milkshakes"
              required
              maxLength={100}
              className="
                w-full px-3 py-2.5 rounded-lg border border-[#E8E3DA] bg-white
                font-nunito text-sm text-stone-900 placeholder-stone-400
                focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]
                transition-colors duration-200
              "
            />
          </div>

          <div>
            <label className="block font-nunito text-sm font-semibold text-stone-700 mb-1.5">
              Icon <span className="font-normal text-stone-400">(emoji or short text)</span>
            </label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g. 🥤"
              maxLength={10}
              className="
                w-full px-3 py-2.5 rounded-lg border border-[#E8E3DA] bg-white
                font-nunito text-sm text-stone-900 placeholder-stone-400
                focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]
                transition-colors duration-200
              "
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="
                flex-1 px-4 py-2.5 rounded-[10px] font-nunito font-semibold text-sm
                text-stone-600 hover:bg-[#F2EEE8] border border-[#E8E3DA]
                transition-all duration-200 disabled:opacity-50
              "
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="
                flex-1 px-4 py-2.5 rounded-[10px] font-nunito font-semibold text-sm
                bg-[#7BBFB5] text-[#F0EBE0] shadow-sm
                hover:bg-[#3D8A80] active:bg-[#2C6E65]
                transition-all duration-200 disabled:opacity-50
              "
            >
              {isPending ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save Changes' : 'Add Category')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page content ────────────────────────────────────────────────────────

type Tab = 'list' | 'reorder';

export default function CategoriesContent({ categories }: CategoriesContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingCategory(null);
  };

  const handleDelete = (id: string) => {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (!result.success) {
        setDeleteError(result.error || 'Failed to delete category');
      }
      setConfirmDelete(null);
    });
  };

  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Page header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-playfair text-2xl font-semibold text-stone-900">
              Categories
            </h1>
            <p className="font-nunito text-sm text-stone-500 mt-1">
              Manage menu categories and their display order
            </p>
          </div>
          <button
            onClick={() => {
              setEditingCategory(null);
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
            Add Category
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {(['list', 'reorder'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                font-nunito text-sm font-medium transition-all duration-200
                ${activeTab === tab
                  ? 'bg-[#7BBFB5]/10 text-[#3D8A80]'
                  : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'}
              `}
            >
              {tab === 'reorder' && <LayoutList className="h-3.5 w-3.5" />}
              {tab === 'list' ? 'All Categories' : 'Reorder'}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="p-6 space-y-4">
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

        {/* Reorder tab */}
        {activeTab === 'reorder' && (
          <>
            <p className="font-nunito text-sm text-stone-500">
              Use the arrows to change the display order of categories.
            </p>
            <CategoryReorderList categories={sortedCategories} />
          </>
        )}

        {/* List tab */}
        {activeTab === 'list' && (
          <>
            {sortedCategories.map((category) => (
              <div
                key={category.id}
                className="
                  bg-white rounded-xl border border-[#E8E3DA] p-5
                  flex items-center justify-between gap-4
                  group hover:border-[#7BBFB5]/30 transition-all duration-200
                "
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className="
                      flex-shrink-0 w-10 h-10 rounded-lg bg-[#F2EEE8]
                      flex items-center justify-center text-xl
                    "
                  >
                    {category.icon || '📂'}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-nunito font-semibold text-stone-900 truncate">
                      {category.name}
                    </h3>
                    <p className="font-nunito text-xs text-stone-400 mt-0.5">
                      Sort #{category.sort_order} &middot;{' '}
                      {category.active ? (
                        <span className="text-emerald-600">Active</span>
                      ) : (
                        <span className="text-stone-400">Inactive</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(category)}
                    className="
                      p-2.5 rounded-lg text-stone-400
                      hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10
                      transition-all duration-200
                    "
                    title="Edit category"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(category.id)}
                    className="
                      p-2.5 rounded-lg text-stone-400
                      hover:text-red-500 hover:bg-red-50
                      transition-all duration-200
                    "
                    title="Delete category"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Empty state */}
            {categories.length === 0 && (
              <div className="text-center py-16 bg-white rounded-xl border border-dashed border-[#E8E3DA]">
                <span className="text-5xl block mb-4">📂</span>
                <h3 className="font-playfair text-lg font-semibold text-stone-700 mb-1">
                  No categories yet
                </h3>
                <p className="font-nunito text-sm text-stone-400 mb-6">
                  Add your first category to organise the menu.
                </p>
                <button
                  onClick={() => {
                    setEditingCategory(null);
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
                  Add Category
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <CategoryForm
          category={editingCategory}
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
              Delete Category
            </h3>
            <p className="font-nunito text-sm text-stone-500 mb-6">
              Are you sure? This cannot be undone. Categories with menu items cannot be deleted.
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
