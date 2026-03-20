'use client';

import { useState, useCallback } from 'react';
import {
  MessageSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Bot,
  Search,
} from 'lucide-react';
import { useAiLogs } from '@/hooks/useAiLogs';
import AiLogDetail from './AiLogDetail';

const INTENT_BADGE_STYLES: Record<string, string> = {
  order: 'bg-emerald-100 text-emerald-700',
  browse: 'bg-blue-100 text-blue-700',
  info: 'bg-stone-100 text-stone-600',
  faq: 'bg-amber-100 text-amber-700',
  greeting: 'bg-violet-100 text-violet-700',
  error: 'bg-red-100 text-red-700',
};

function getIntentBadgeStyle(intent: string): string {
  const key = intent.toLowerCase();
  for (const [k, v] of Object.entries(INTENT_BADGE_STYLES)) {
    if (key.includes(k)) return v;
  }
  return 'bg-stone-100 text-stone-600';
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return '--';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export default function AiLogsTab() {
  const {
    sessions,
    stats,
    loading,
    page,
    setPage,
    total,
    filters,
    setFilters,
    fetchMessages,
  } = useAiLogs();

  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Record<string, any[]>>({});
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleRowClick = useCallback(
    async (sessionId: string) => {
      if (expandedSession === sessionId) {
        setExpandedSession(null);
        return;
      }

      setExpandedSession(sessionId);

      // Only fetch if we haven't loaded this session's messages yet
      if (!sessionMessages[sessionId]) {
        setLoadingMessages(sessionId);
        const messages = await fetchMessages(sessionId);
        setSessionMessages((prev) => ({ ...prev, [sessionId]: messages }));
        setLoadingMessages(null);
      }
    },
    [expandedSession, sessionMessages, fetchMessages]
  );

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      setFilters((prev: Record<string, string | undefined>) => ({
        ...prev,
        [key]: value || undefined,
      }));
      setPage(0);
      setExpandedSession(null);
      setSessionMessages({});
    },
    [setFilters, setPage]
  );

  // Skeleton rows
  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="animate-pulse">
      <td className="px-4 py-3.5">
        <div className="h-4 w-40 bg-[#E8E3DA] rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-20 bg-[#E8E3DA]/60 rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-5 w-14 bg-[#E8E3DA]/40 rounded-full" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-6 bg-[#E8E3DA]/60 rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-16 bg-[#E8E3DA]/60 rounded" />
      </td>
    </tr>
  ));

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] p-5">
        <div className="flex flex-wrap items-center gap-6">
          {/* Today's conversations */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E0F7F4] flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-[#3D8A80]" />
            </div>
            <div>
              <p className="text-xs font-nunito font-medium text-stone-400 uppercase tracking-wide">
                Today&apos;s Conversations
              </p>
              <p className="text-xl font-playfair font-semibold text-stone-900">
                {stats?.todayConversations ?? '--'}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-10 bg-[#E8E3DA]" />

          {/* Intent breakdown badges */}
          <div className="flex-1">
            <p className="text-xs font-nunito font-medium text-stone-400 uppercase tracking-wide mb-2">
              Intent Breakdown (Today)
            </p>
            <div className="flex flex-wrap gap-2">
              {stats?.intentBreakdown &&
              Object.keys(stats.intentBreakdown).length > 0 ? (
                Object.entries(stats.intentBreakdown)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([intent, count]) => (
                    <span
                      key={intent}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-nunito font-semibold ${getIntentBadgeStyle(
                        intent
                      )}`}
                    >
                      {intent}
                      <span className="opacity-70">{count as number}</span>
                    </span>
                  ))
              ) : (
                <span className="text-xs font-nunito text-stone-400">
                  No data yet today
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Intent filter */}
          <div className="relative">
            <select
              value={filters.intent || ''}
              onChange={(e) => handleFilterChange('intent', e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white cursor-pointer transition-all duration-200"
            >
              <option value="">All Intents</option>
              <option value="order">Order</option>
              <option value="browse">Browse</option>
              <option value="info">Info</option>
              <option value="faq">FAQ</option>
              <option value="greeting">Greeting</option>
              <option value="error">Error</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
          </div>

          {/* Date from */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-nunito font-medium text-stone-500">
              From
            </label>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="px-3 py-2 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white transition-all duration-200"
            />
          </div>

          {/* Date to */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-nunito font-medium text-stone-500">
              To
            </label>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="px-3 py-2 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white transition-all duration-200"
            />
          </div>

          {/* Clear filters */}
          {(filters.intent || filters.dateFrom || filters.dateTo) && (
            <button
              onClick={() => {
                setFilters({});
                setPage(0);
                setExpandedSession(null);
                setSessionMessages({});
              }}
              className="px-3 py-2 text-xs font-nunito font-medium text-stone-500 hover:text-stone-700 hover:bg-[#F2EEE8] rounded-[10px] transition-all duration-200"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E3DA] bg-[#FAFAF8]">
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  First Message
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  PSID
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Intent
                </th>
                <th className="text-center px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Messages
                </th>
                <th className="text-right px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Time
                </th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E3DA]">
              {loading && sessions.length === 0 ? (
                skeletonRows
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Bot className="h-12 w-12 text-[#E8E3DA] mx-auto mb-3" />
                    <p className="text-sm font-nunito text-stone-400">
                      {filters.intent || filters.dateFrom || filters.dateTo
                        ? 'No conversations match your filters'
                        : 'No AI conversations yet'}
                    </p>
                  </td>
                </tr>
              ) : (
                sessions.map((session) => {
                  const isExpanded = expandedSession === session.session_id;
                  const isLoadingDetail =
                    loadingMessages === session.session_id;

                  return (
                    <tr key={session.session_id} className="group">
                      <td colSpan={6} className="p-0">
                        {/* Clickable row */}
                        <button
                          onClick={() => handleRowClick(session.session_id)}
                          className={`w-full text-left transition-colors duration-150 ${
                            isExpanded
                              ? 'bg-[#FAFAF8]'
                              : 'hover:bg-[#FAFAF8]/60'
                          }`}
                        >
                          <div className="flex items-center">
                            <div className="flex-1 px-4 py-3.5 min-w-0">
                              <p className="text-sm font-nunito font-medium text-stone-800 truncate">
                                {truncateText(session.first_message, 60)}
                              </p>
                            </div>
                            <div className="px-4 py-3.5 w-28 flex-shrink-0">
                              <p className="text-xs font-nunito text-stone-500 font-mono truncate">
                                {session.psid
                                  ? session.psid.slice(0, 10) + '...'
                                  : '--'}
                              </p>
                            </div>
                            <div className="px-4 py-3.5 w-24 flex-shrink-0">
                              {session.latest_intent ? (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-nunito font-semibold ${getIntentBadgeStyle(
                                    session.latest_intent
                                  )}`}
                                >
                                  {session.latest_intent}
                                </span>
                              ) : (
                                <span className="text-xs font-nunito text-stone-300">
                                  --
                                </span>
                              )}
                            </div>
                            <div className="px-4 py-3.5 w-20 flex-shrink-0 text-center">
                              <span className="text-sm font-nunito font-medium text-stone-600">
                                {session.message_count}
                              </span>
                            </div>
                            <div className="px-4 py-3.5 w-28 flex-shrink-0 text-right">
                              <span className="text-xs font-nunito text-stone-400">
                                {formatDateTime(session.latest_at)}
                              </span>
                            </div>
                            <div className="px-2 py-3.5 w-10 flex-shrink-0 flex items-center justify-center">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-stone-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-stone-400" />
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Expanded conversation detail */}
                        {isExpanded && (
                          <div className="border-t border-[#E8E3DA] bg-[#FAFAF8] px-4 pb-4">
                            {isLoadingDetail ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 text-[#3D8A80] animate-spin" />
                                <span className="ml-2 text-sm font-nunito text-stone-400">
                                  Loading conversation...
                                </span>
                              </div>
                            ) : (
                              <AiLogDetail
                                messages={
                                  sessionMessages[session.session_id] || []
                                }
                              />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3DA]"
            aria-live="polite"
          >
            <span className="text-xs font-nunito text-stone-500">
              Showing {page * PAGE_SIZE + 1}--
              {Math.min((page + 1) * PAGE_SIZE, total)} of {total} sessions
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  setExpandedSession(null);
                }}
                disabled={page <= 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:bg-[#F2EEE8] disabled:text-stone-300 disabled:hover:bg-transparent transition-colors duration-200"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-nunito font-medium text-stone-600">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => {
                  setPage((p) => Math.min(totalPages - 1, p + 1));
                  setExpandedSession(null);
                }}
                disabled={page >= totalPages - 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:bg-[#F2EEE8] disabled:text-stone-300 disabled:hover:bg-transparent transition-colors duration-200"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
