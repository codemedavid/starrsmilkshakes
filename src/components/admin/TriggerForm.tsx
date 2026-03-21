'use client';

import { useState, useTransition } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { addTrigger, updateTrigger } from '@/actions/ai';
import type { ChatTrigger } from '@/types';

// ─── Shared tokens ──────────────────────────────────────────────────────────

const inputClass = `
  w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
  font-nunito text-sm text-stone-900 placeholder:text-stone-400
  bg-white focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
  transition-all duration-200
`;

const labelClass = 'block text-sm font-nunito font-medium text-stone-700 mb-1.5';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TriggerFormProps {
  trigger?: ChatTrigger | null;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TriggerForm({ trigger, onClose, onSaved }: TriggerFormProps) {
  const isEdit = Boolean(trigger);
  const [name, setName] = useState(trigger?.name ?? '');
  const [patterns, setPatterns] = useState<string[]>(trigger?.patterns ?? []);
  const [patternInput, setPatternInput] = useState('');
  const [matchType, setMatchType] = useState<'exact' | 'contains' | 'regex'>(
    trigger?.match_type ?? 'contains'
  );
  const [response, setResponse] = useState(trigger?.response ?? '');
  const [priority, setPriority] = useState(trigger?.priority ?? 0);
  const [isActive, setIsActive] = useState(trigger?.is_active ?? true);
  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handlePatternKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = patternInput.trim();
      if (value && !patterns.includes(value)) {
        setPatterns((prev) => [...prev, value]);
        setPatternInput('');
      }
    }
  }

  function removePattern(index: number) {
    setPatterns((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    if (patterns.length === 0) {
      setErrorMsg('At least one pattern is required');
      return;
    }

    startTransition(async () => {
      try {
        const input = {
          name,
          patterns,
          match_type: matchType,
          response,
          priority,
          is_active: isActive,
        };

        const result = isEdit
          ? await updateTrigger(trigger!.id, input)
          : await addTrigger(input);

        if (!result.success) {
          setErrorMsg(result.error || 'Something went wrong');
          return;
        }

        setSuccessMsg(isEdit ? 'Trigger updated successfully' : 'Trigger added successfully');
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
            {isEdit ? 'Edit Trigger' : 'Add Trigger'}
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

          {/* Name */}
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Trigger name"
              required
            />
          </div>

          {/* Patterns (tag input) */}
          <div>
            <label className={labelClass}>Patterns</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {patterns.map((pattern, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-[#F2EEE8] border border-[#E8E3DA] rounded-full text-sm font-nunito text-stone-700"
                >
                  {pattern}
                  <button
                    type="button"
                    onClick={() => removePattern(idx)}
                    className="ml-0.5 text-stone-400 hover:text-stone-600 transition-colors"
                    aria-label={`Remove pattern "${pattern}"`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={patternInput}
              onChange={(e) => setPatternInput(e.target.value)}
              onKeyDown={handlePatternKeyDown}
              className={inputClass}
              placeholder="Type a pattern and press Enter"
            />
            <p className="text-xs font-nunito text-stone-400 mt-1">
              Press Enter to add each pattern
            </p>
          </div>

          {/* Match Type */}
          <div>
            <label className={labelClass}>Match Type</label>
            <div className="flex items-center gap-4">
              {(['exact', 'contains', 'regex'] as const).map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="match_type"
                    value={type}
                    checked={matchType === type}
                    onChange={() => setMatchType(type)}
                    className="w-4 h-4 text-[#3D8A80] border-stone-300 focus:ring-[#3D8A80]"
                  />
                  <span className="font-nunito text-sm text-stone-700 capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Response */}
          <div>
            <label className={labelClass}>Response</label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={3}
              className={`${inputClass} resize-y`}
              placeholder="Bot response when trigger matches..."
              required
            />
          </div>

          {/* Priority */}
          <div>
            <label className={labelClass}>Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              min={0}
              max={1000}
              className={inputClass}
              placeholder="0"
            />
            <p className="text-xs font-nunito text-stone-400 mt-1">
              Higher priority triggers are checked first
            </p>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-5 h-5 rounded border-stone-300 text-[#3D8A80] focus:ring-[#3D8A80]"
            />
            <span className="font-nunito text-sm font-medium text-stone-700">Active</span>
          </label>

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
              {isPending ? 'Saving...' : isEdit ? 'Update Trigger' : 'Add Trigger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
