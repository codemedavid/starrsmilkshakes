'use client';

import { useState, useTransition } from 'react';
import { Plus, Edit2, Trash2, CreditCard, AlertTriangle, Loader2, QrCode } from 'lucide-react';
import type { AdminPaymentMethod as PaymentMethod, Branch } from '@/types';
import {
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from '@/actions/payments';
import PaymentReorderList from '@/components/admin/PaymentReorderList';
import ImageUpload from '@/components/ImageUpload';

interface PaymentsContentProps {
  paymentMethods: PaymentMethod[];
  branches: Branch[];
}

// ─── Modal form state ─────────────────────────────────────────────────────────

interface FormData {
  id: string;
  name: string;
  account_name: string;
  account_number: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  branch_id: string | null;
}

const emptyForm = (): FormData => ({
  id: '',
  name: '',
  account_name: '',
  account_number: '',
  qr_code_url: '',
  active: true,
  sort_order: 0,
  branch_id: null,
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentsContent({ paymentMethods, branches }: PaymentsContentProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showReorder, setShowReorder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  // ── Open add/edit modal ───────────────────────────────────────────────────

  const openAdd = () => {
    setEditingMethod(null);
    setFormData({
      ...emptyForm(),
      sort_order: paymentMethods.length + 1,
    });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (method: PaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      id: method.id,
      name: method.name,
      account_name: method.account_name,
      account_number: method.account_number,
      qr_code_url: method.qr_code_url,
      active: method.active,
      sort_order: method.sort_order,
      branch_id: method.branch_id ?? null,
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingMethod(null);
    setFormData(emptyForm());
    setFormError(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const result = editingMethod
        ? await updatePaymentMethod(editingMethod.id, formData)
        : await addPaymentMethod(formData);

      if (!result.success) {
        setFormError(result.error || 'Something went wrong');
        return;
      }

      closeForm();
    } catch {
      setFormError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = (id: string) => {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deletePaymentMethod(id);
      if (!result.success) {
        setDeleteError(result.error || 'Failed to delete payment method');
      }
      setConfirmDelete(null);
    });
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Page header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-playfair text-2xl font-semibold text-stone-900">
              Payment Methods
            </h1>
            <p className="font-nunito text-sm text-stone-500 mt-1">
              Manage payment options shown to customers at checkout
            </p>
          </div>
          <div className="flex items-center gap-2">
            {paymentMethods.length > 1 && (
              <button
                onClick={() => setShowReorder((v) => !v)}
                className="
                  inline-flex items-center gap-2 px-4 py-2.5
                  border border-[#E8E3DA] text-stone-600 font-nunito font-semibold text-sm
                  rounded-[10px] bg-white
                  hover:bg-[#F2EEE8] hover:border-[#7BBFB5]/40
                  focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
                  transition-all duration-200
                "
              >
                {showReorder ? 'Done Reordering' : 'Reorder'}
              </button>
            )}
            <button
              onClick={openAdd}
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
              Add Payment Method
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
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

        {/* Reorder mode */}
        {showReorder && paymentMethods.length > 0 && (
          <div className="bg-[#F2EEE8] rounded-xl border border-[#E8E3DA] p-4">
            <p className="font-nunito text-sm font-semibold text-stone-700 mb-3">
              Drag order — use arrows to reorder payment methods
            </p>
            <PaymentReorderList paymentMethods={paymentMethods} />
          </div>
        )}

        {/* Payment method cards */}
        {!showReorder && paymentMethods.map((method) => (
          <div
            key={method.id}
            className="
              bg-white rounded-xl border border-[#E8E3DA] p-5
              flex justify-between items-start gap-4
              group hover:border-[#7BBFB5]/30 transition-all duration-200
            "
          >
            <div className="flex items-start gap-4 min-w-0 flex-1">
              {/* QR code thumbnail */}
              {method.qr_code_url ? (
                <img
                  src={method.qr_code_url}
                  alt={`${method.name} QR code`}
                  className="h-14 w-14 rounded-lg object-cover border border-[#E8E3DA] flex-shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-[#F2EEE8] border border-[#E8E3DA] flex items-center justify-center flex-shrink-0">
                  <QrCode className="h-6 w-6 text-stone-400" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-nunito font-semibold text-stone-900 truncate">
                    {method.name}
                  </h3>
                  {method.active ? (
                    <span className="inline-flex px-2 py-0.5 text-xs font-nunito font-medium bg-emerald-50 text-emerald-700 rounded-full">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 text-xs font-nunito font-medium bg-stone-100 text-stone-500 rounded-full">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-sm font-nunito text-stone-500 truncate">
                  {method.account_name}
                </p>
                <p className="text-sm font-nunito text-stone-400 font-mono truncate">
                  {method.account_number}
                </p>
                {method.branch_id ? (
                  <p className="text-xs font-nunito text-[#7BBFB5] mt-0.5">
                    {branches.find((b) => b.id === method.branch_id)?.name ?? 'Unknown branch'}
                  </p>
                ) : (
                  <p className="text-xs font-nunito text-stone-400 mt-0.5">All branches</p>
                )}
              </div>
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
              <button
                onClick={() => openEdit(method)}
                className="
                  p-2.5 rounded-lg text-stone-400
                  hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10
                  transition-all duration-200
                "
                title="Edit payment method"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setConfirmDelete(method.id)}
                className="
                  p-2.5 rounded-lg text-stone-400
                  hover:text-red-500 hover:bg-red-50
                  transition-all duration-200
                "
                title="Delete payment method"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Empty state */}
        {paymentMethods.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-[#E8E3DA]">
            <CreditCard className="h-10 w-10 text-stone-300 mx-auto mb-4" />
            <h3 className="font-playfair text-lg font-semibold text-stone-700 mb-1">
              No payment methods yet
            </h3>
            <p className="font-nunito text-sm text-stone-400 mb-6">
              Add your first payment method to start accepting orders.
            </p>
            <button
              onClick={openAdd}
              className="
                inline-flex items-center gap-2 px-5 py-2.5
                bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
                rounded-[10px] shadow-sm
                hover:bg-[#3D8A80] active:bg-[#2C6E65]
                transition-all duration-200
              "
            >
              <Plus className="h-4 w-4" />
              Add Payment Method
            </button>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeForm}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4 bg-white rounded-xl shadow-xl border border-[#E8E3DA]">
            <div className="px-6 py-5 border-b border-[#E8E3DA]">
              <h2 className="font-playfair text-xl font-semibold text-stone-900">
                {editingMethod ? 'Edit Payment Method' : 'Add Payment Method'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {formError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-[10px] text-sm font-nunito text-red-700">
                  {formError}
                </div>
              )}

              {/* ID (slug) — only for new methods */}
              {!editingMethod && (
                <div>
                  <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                    Method ID <span className="text-stone-400 font-normal">(slug, e.g. gcash)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value.trim() })}
                    className="
                      w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                      font-nunito text-sm text-stone-900 placeholder:text-stone-400
                      focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                      transition-all duration-200
                    "
                    placeholder="e.g. gcash, maya, bdo"
                  />
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Display Name
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
                  placeholder="e.g. GCash, Maya, BDO Bank Transfer"
                />
              </div>

              {/* Branch */}
              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Branch <span className="text-stone-400 font-normal">(leave empty for all branches)</span>
                </label>
                <select
                  value={formData.branch_id ?? ''}
                  onChange={(e) => setFormData({ ...formData, branch_id: e.target.value || null })}
                  className="
                    w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                    font-nunito text-sm text-stone-900
                    focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                    transition-all duration-200 bg-white
                  "
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Account Name */}
              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  className="
                    w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                    font-nunito text-sm text-stone-900 placeholder:text-stone-400
                    focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                    transition-all duration-200
                  "
                  placeholder="e.g. Starr Famous Shakes"
                />
              </div>

              {/* Account Number */}
              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Account Number / Phone
                </label>
                <input
                  type="text"
                  required
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  className="
                    w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                    font-nunito text-sm text-stone-900 placeholder:text-stone-400
                    focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                    transition-all duration-200
                  "
                  placeholder="e.g. 0917 123 4567"
                />
              </div>

              {/* QR Code Image Upload */}
              <div>
                <ImageUpload
                  currentImage={formData.qr_code_url || undefined}
                  onImageChange={(url) => setFormData({ ...formData, qr_code_url: url || '' })}
                />
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
                />
                <span className="text-sm font-nunito text-stone-700">Active (visible to customers)</span>
              </label>

              {/* Sort order */}
              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Sort Order
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="
                    w-24 px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
                    font-nunito text-sm text-stone-900
                    focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
                    transition-all duration-200
                  "
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-[#E8E3DA]">
                <button
                  type="button"
                  onClick={closeForm}
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
                  {editingMethod ? 'Update Method' : 'Add Method'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ─────────────────────────────────────────────── */}
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
              Delete Payment Method
            </h3>
            <p className="font-nunito text-sm text-stone-500 mb-6">
              Are you sure you want to delete this payment method? This action cannot be undone.
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
