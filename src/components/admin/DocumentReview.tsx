'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  FileText,
} from 'lucide-react';
import { updateChunks, approveDocument, deleteDocument } from '@/actions/ai';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentReviewProps {
  document: any; // KnowledgeDocument from DB
  initialChunks: any[]; // KnowledgeChunk[] from DB
}

interface ChunkState {
  id: string;
  content: string;
  is_approved: boolean;
  section_header?: string | null;
  chunk_index?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getFileTypeBadge(fileType: string) {
  const type = (fileType || '').toLowerCase().replace('.', '');
  const map: Record<string, { label: string; className: string }> = {
    pdf: { label: 'PDF', className: 'bg-red-100 text-red-700' },
    txt: { label: 'TXT', className: 'bg-stone-100 text-stone-600' },
    md: { label: 'MD', className: 'bg-purple-100 text-purple-700' },
  };
  return map[type] || { label: type.toUpperCase() || 'FILE', className: 'bg-stone-100 text-stone-600' };
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return { label: 'Approved', className: 'bg-emerald-100 text-emerald-700' };
    case 'processing':
      return { label: 'Processing', className: 'bg-blue-100 text-blue-700' };
    case 'error':
      return { label: 'Error', className: 'bg-red-100 text-red-700' };
    case 'review':
      return { label: 'Needs Review', className: 'bg-amber-100 text-amber-700' };
    default:
      return { label: status, className: 'bg-stone-100 text-stone-500' };
  }
}

// ─── Shared classes ───────────────────────────────────────────────────────────

const primaryBtn = `
  inline-flex items-center gap-2 px-5 py-2.5
  bg-[#7BBFB5] text-white font-nunito font-semibold text-sm
  rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65]
  focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40
  transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
`;

const outlineBtn = `
  inline-flex items-center gap-2 px-4 py-2.5
  border border-[#E8E3DA] text-stone-600 font-nunito text-sm
  rounded-[10px] hover:bg-[#F2EEE8] transition-all duration-200
  disabled:opacity-50 disabled:cursor-not-allowed
`;

const dangerBtn = `
  inline-flex items-center gap-2 px-4 py-2.5
  border border-red-200 text-red-600 font-nunito text-sm
  rounded-[10px] hover:bg-red-50 transition-all duration-200
  disabled:opacity-50 disabled:cursor-not-allowed
`;

const textareaClass = `
  w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
  font-nunito text-sm text-stone-900 placeholder:text-stone-400
  bg-white focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
  transition-all duration-200 resize-y
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentReview({ document, initialChunks }: DocumentReviewProps) {
  const router = useRouter();
  const [chunks, setChunks] = useState<ChunkState[]>(initialChunks.map((c) => ({ ...c })));
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const fileTypeBadge = getFileTypeBadge(document.file_type || '');
  const statusBadge = getStatusBadge(document.status);
  const approvedCount = chunks.filter((c) => c.is_approved).length;
  const totalCount = chunks.length;

  // ── Chunk helpers ──────────────────────────────────────────────────────────

  const updateChunkContent = (id: string, content: string) => {
    setChunks((prev) => prev.map((c) => (c.id === id ? { ...c, content } : c)));
  };

  const toggleChunkApproval = (id: string) => {
    setChunks((prev) => prev.map((c) => (c.id === id ? { ...c, is_approved: !c.is_approved } : c)));
  };

  const approveAll = () => {
    setChunks((prev) => prev.map((c) => ({ ...c, is_approved: true })));
  };

  const removeChunk = (id: string) => {
    setChunks((prev) => prev.filter((c) => c.id !== id));
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSaveAndEmbed = () => {
    setSuccessMsg(null);
    setErrorMsg(null);

    startSave(async () => {
      try {
        const updateResult = await updateChunks(
          document.id,
          chunks.map((c) => ({ id: c.id, content: c.content, is_approved: c.is_approved }))
        );

        if (!updateResult.success) {
          setErrorMsg(updateResult.error || 'Failed to save chunks');
          return;
        }

        const approveResult = await approveDocument(document.id);

        if (!approveResult.success) {
          setErrorMsg(approveResult.error || 'Failed to approve document');
          return;
        }

        setSuccessMsg('Document approved and embedding started. Redirecting…');
        setTimeout(() => router.push('/admin/ai?tab=knowledge'), 1500);
      } catch {
        setErrorMsg('An unexpected error occurred');
      }
    });
  };

  const handleDelete = () => {
    if (!confirm('Delete this document and all its chunks? This cannot be undone.')) return;

    startDelete(async () => {
      try {
        await deleteDocument(document.id);
        router.push('/admin/ai?tab=knowledge');
      } catch {
        setErrorMsg('Failed to delete document');
      }
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Back link */}
      <Link
        href="/admin/ai?tab=knowledge"
        className="inline-flex items-center gap-1.5 text-sm font-nunito text-stone-500 hover:text-stone-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Knowledge Base
      </Link>

      {/* Document header card */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-[#F2EEE8] rounded-[10px] flex items-center justify-center">
            <FileText className="h-5 w-5 text-[#7BBFB5]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-playfair text-xl font-semibold text-stone-900 truncate">
                {document.filename || 'Untitled Document'}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-nunito font-semibold ${fileTypeBadge.className}`}
              >
                {fileTypeBadge.label}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-nunito font-semibold ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-nunito text-stone-400 mt-1">
              {document.file_size && (
                <span>{formatBytes(document.file_size)}</span>
              )}
              {document.created_at && (
                <span>Uploaded {formatDate(document.created_at)}</span>
              )}
              <span>
                {totalCount} chunk{totalCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback banners */}
      {successMsg && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          <p className="font-nunito text-sm text-emerald-700">{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="font-nunito text-sm text-red-700 flex-1">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-red-600 text-sm font-nunito"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Status-specific content ─────────────────────────────────────────── */}

      {/* Error state */}
      {document.status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-nunito font-semibold text-sm text-red-800 mb-1">
                Processing failed
              </p>
              <p className="font-nunito text-sm text-red-700">
                {document.error_message || 'An unknown error occurred while processing this document.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className={dangerBtn}
          >
            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
            <Trash2 className="h-4 w-4" />
            {isDeleting ? 'Deleting…' : 'Delete & Re-upload'}
          </button>
        </div>
      )}

      {/* Processing state */}
      {document.status === 'processing' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
          <p className="font-nunito text-sm text-blue-700">
            Processing document… This may take a moment. Refresh the page to check progress.
          </p>
        </div>
      )}

      {/* Approved state */}
      {document.status === 'approved' && (
        <>
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
            <p className="font-nunito text-sm text-emerald-700">
              Document approved and embedded — chunks are live in the knowledge base.
            </p>
          </div>

          {/* Read-only chunks */}
          {chunks.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-playfair text-base font-semibold text-stone-800">
                Chunks ({totalCount})
              </h2>
              {chunks.map((chunk, idx) => (
                <div
                  key={chunk.id}
                  className="bg-white rounded-xl border border-[#E8E3DA] p-4"
                >
                  {chunk.section_header && (
                    <p className="text-[10px] font-nunito font-semibold uppercase tracking-widest text-stone-400 mb-2">
                      {chunk.section_header}
                    </p>
                  )}
                  <p className="font-nunito text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
                    {chunk.content}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F0EBE4]">
                    <span className="text-xs font-nunito text-stone-400">
                      Chunk {idx + 1}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-nunito font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approved
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Review state */}
      {document.status === 'review' && (
        <>
          {/* Bulk actions bar */}
          <div className="bg-white rounded-xl border border-[#E8E3DA] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-nunito text-sm text-stone-600">
                  <span className="font-semibold text-stone-900">{approvedCount}</span> of{' '}
                  <span className="font-semibold text-stone-900">{totalCount}</span> chunks approved
                </span>
                <button
                  type="button"
                  onClick={approveAll}
                  disabled={isSaving}
                  className={outlineBtn}
                >
                  Approve All
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveAndEmbed}
                disabled={isSaving || approvedCount === 0}
                className={primaryBtn}
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSaving ? 'Saving…' : 'Save & Embed'}
              </button>
            </div>
          </div>

          {/* Chunk list */}
          {chunks.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E8E3DA] p-10 text-center">
              <p className="font-nunito text-sm text-stone-400">
                All chunks have been removed. Upload a new document to start over.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {chunks.map((chunk, idx) => (
                <div
                  key={chunk.id}
                  className={`bg-white rounded-xl border transition-all duration-150 p-4 ${
                    chunk.is_approved
                      ? 'border-[#7BBFB5]/50 ring-1 ring-[#7BBFB5]/20'
                      : 'border-[#E8E3DA]'
                  }`}
                >
                  {/* Section header */}
                  {chunk.section_header && (
                    <p className="text-[10px] font-nunito font-semibold uppercase tracking-widest text-stone-400 mb-2">
                      {chunk.section_header}
                    </p>
                  )}

                  {/* Editable content */}
                  <textarea
                    value={chunk.content}
                    onChange={(e) => updateChunkContent(chunk.id, e.target.value)}
                    rows={4}
                    className={textareaClass}
                    placeholder="Chunk content…"
                  />

                  {/* Footer row */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F0EBE4]">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-nunito text-stone-400">
                        Chunk {idx + 1}
                      </span>
                      {/* Approve toggle */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={chunk.is_approved}
                          onChange={() => toggleChunkApproval(chunk.id)}
                          className="w-4 h-4 rounded border-stone-300 text-[#3D8A80] focus:ring-[#3D8A80] cursor-pointer"
                        />
                        <span className="text-sm font-nunito font-medium text-stone-600">
                          Approved
                        </span>
                      </label>
                    </div>

                    {/* Delete chunk */}
                    <button
                      type="button"
                      onClick={() => removeChunk(chunk.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150"
                      aria-label="Remove chunk"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom save bar (sticky convenience) */}
          {chunks.length > 0 && (
            <div className="flex items-center justify-between pt-2 pb-6">
              <span className="font-nunito text-sm text-stone-500">
                {approvedCount} of {totalCount} chunks approved
              </span>
              <button
                type="button"
                onClick={handleSaveAndEmbed}
                disabled={isSaving || approvedCount === 0}
                className={primaryBtn}
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSaving ? 'Saving…' : 'Save & Embed'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
