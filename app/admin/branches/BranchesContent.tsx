'use client';

import { useState, useTransition } from 'react';
import { Plus, Edit2, Trash2, MapPin, Phone, AlertTriangle } from 'lucide-react';
import type { Branch } from '@/types';
import { deleteBranch } from '@/actions/branches';
import BranchForm from '@/components/admin/BranchForm';

interface BranchesContentProps {
  branches: Branch[];
}

export default function BranchesContent({ branches }: BranchesContentProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingBranch(null);
  };

  const handleDelete = (id: string) => {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteBranch(id);
      if (!result.success) {
        setDeleteError(result.error || 'Failed to delete branch');
      }
      setConfirmDelete(null);
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Page header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-playfair text-2xl font-semibold text-stone-900">
              Branches
            </h1>
            <p className="font-nunito text-sm text-stone-500 mt-1">
              Manage your store locations
            </p>
          </div>
          <button
            onClick={() => {
              setEditingBranch(null);
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
            Add Branch
          </button>
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

        {/* Branch cards */}
        {branches.map((branch) => (
          <div
            key={branch.id}
            className="
              bg-white rounded-xl border border-[#E8E3DA] p-5
              flex justify-between items-start gap-4
              group hover:border-[#7BBFB5]/30 transition-all duration-200
            "
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-nunito font-semibold text-stone-900 truncate">
                  {branch.name}
                </h3>
                {branch.is_main && (
                  <span className="inline-flex px-2 py-0.5 text-xs font-nunito font-medium bg-[#7BBFB5]/10 text-[#3D8A80] rounded-full">
                    Main
                  </span>
                )}
                {branch.is_active ? (
                  <span className="inline-flex px-2 py-0.5 text-xs font-nunito font-medium bg-emerald-50 text-emerald-700 rounded-full">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-0.5 text-xs font-nunito font-medium bg-stone-100 text-stone-500 rounded-full">
                    Inactive
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-nunito text-stone-500 flex items-center gap-2">
                  <MapPin className="h-4 w-4 flex-shrink-0 text-stone-400" />
                  <span className="truncate">{branch.address}</span>
                </p>
                <p className="text-sm font-nunito text-stone-500 flex items-center gap-2">
                  <Phone className="h-4 w-4 flex-shrink-0 text-stone-400" />
                  {branch.phone}
                </p>
              </div>
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
              <button
                onClick={() => handleEdit(branch)}
                className="
                  p-2.5 rounded-lg text-stone-400
                  hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10
                  transition-all duration-200
                "
                title="Edit branch"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setConfirmDelete(branch.id)}
                className="
                  p-2.5 rounded-lg text-stone-400
                  hover:text-red-500 hover:bg-red-50
                  transition-all duration-200
                "
                title="Delete branch"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Empty state */}
        {branches.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-[#E8E3DA]">
            <MapPin className="h-10 w-10 text-stone-300 mx-auto mb-4" />
            <h3 className="font-playfair text-lg font-semibold text-stone-700 mb-1">
              No branches yet
            </h3>
            <p className="font-nunito text-sm text-stone-400 mb-6">
              Add your first branch to get started.
            </p>
            <button
              onClick={() => {
                setEditingBranch(null);
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
              Add Branch
            </button>
          </div>
        )}
      </div>

      {/* Branch Form modal */}
      {showForm && (
        <BranchForm
          branch={editingBranch}
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
              Delete Branch
            </h3>
            <p className="font-nunito text-sm text-stone-500 mb-6">
              Are you sure you want to delete this branch? This action cannot be undone.
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
