'use client';

import { useState, useTransition } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { addFaqEntry, updateFaqEntry } from '@/actions/ai';
import type { FaqEntry } from '@/types';

// ─── Shared tokens ──────────────────────────────────────────────────────────

const inputClass = `
  w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
  font-nunito text-sm text-stone-900 placeholder:text-stone-400
  bg-white focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
  transition-all duration-200
`;

const labelClass = 'block text-sm font-nunito font-medium text-stone-700 mb-1.5';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FaqFormProps {
  faq?: FaqEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FaqForm({ faq, onClose, onSaved }: FaqFormProps) {
  const isEdit = Boolean(faq);
  const [question, setQuestion] = useState(faq?.question ?? '');
  const [answer, setAnswer] = useState(faq?.answer ?? '');
  const [category, setCategory] = useState(faq?.category ?? '');
  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const input = {
          question,
          answer,
          category: category || undefined,
        };

        const result = isEdit
          ? await updateFaqEntry(faq!.id, input)
          : await addFaqEntry(input);

        if (!result.success) {
          setErrorMsg(result.error || 'Something went wrong');
          return;
        }

        setSuccessMsg(isEdit ? 'FAQ updated successfully' : 'FAQ added successfully');
        setTimeout(() => {
          onSaved();
          onClose();
        }, 800);
      } catch {
        setErrorMsg('An unexpected error occurred');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-[#E8E3DA] shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E3DA]">
          <h2 className="font-playfair text-lg font-semibold text-stone-900">
            {isEdit ? 'Edit FAQ' : 'Add FAQ'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-stone-600 transition-colors duration-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Success banner */}
          {successMsg && (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <p className="font-nunito text-sm text-emerald-700">{successMsg}</p>
            </div>
          )}

          {/* Error banner */}
          {errorMsg && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="font-nunito text-sm text-red-700">{errorMsg}</p>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="ml-auto text-red-400 hover:text-red-600 text-sm font-nunito"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Question */}
          <div>
            <label className={labelClass}>Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className={inputClass}
              placeholder="What is your most popular shake?"
              required
            />
          </div>

          {/* Answer */}
          <div>
            <label className={labelClass}>Answer</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              className={`${inputClass} resize-y`}
              placeholder="Our most popular shake is..."
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className={labelClass}>Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
              placeholder="e.g. Menu, Hours, Delivery"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#E8E3DA] text-stone-600 font-nunito text-sm rounded-[10px] hover:bg-[#F2EEE8] transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#7BBFB5] text-white font-nunito font-semibold text-sm rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] transition-all duration-200 disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? 'Saving...' : isEdit ? 'Update FAQ' : 'Add FAQ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
