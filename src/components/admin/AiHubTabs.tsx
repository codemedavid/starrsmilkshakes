'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Loader2 } from 'lucide-react';
import { updateSiteSettings } from '@/actions/settings';
import AiLogsTab from './AiLogsTab';
import KnowledgeTab from './KnowledgeTab';
import FaqTab from './FaqTab';
import TriggerTab from './TriggerTab';

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'knowledge' | 'faqs' | 'triggers' | 'logs';

const TABS: { id: TabId; label: string }[] = [
  { id: 'knowledge', label: 'Knowledge Base' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'logs', label: 'Logs' },
];

// ─── Toggle switch ────────────────────────────────────────────────────────────

interface AiToggleProps {
  enabled: boolean;
  loading: boolean;
  onToggle: (val: boolean) => void;
}

function AiToggle({ enabled, loading, onToggle }: AiToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      disabled={loading}
      className={`
        relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${enabled ? 'bg-[#7BBFB5]' : 'bg-stone-200'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0
          transition-transform duration-200 ease-in-out
          ${enabled ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AiHubTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab') as TabId | null;
  const activeTab: TabId =
    rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : 'knowledge';

  // AI toggle state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Load current AI toggle state on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/admin/settings/ai-status');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setAiEnabled(Boolean(json.enabled));
      } catch {
        // Silently ignore — toggle defaults to off
      } finally {
        if (!cancelled) setToggleLoading(false);
      }
    }

    fetchStatus();
    return () => { cancelled = true; };
  }, []);

  function handleTabChange(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`);
  }

  function handleToggle(newVal: boolean) {
    setAiEnabled(newVal);

    startTransition(async () => {
      try {
        await updateSiteSettings({ ai_faq_enabled: String(newVal) });
      } catch {
        // Revert optimistic update on failure
        setAiEnabled(!newVal);
      }
    });
  }

  const isToggleBusy = toggleLoading || isPending;

  return (
    <>
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E0F7F4] flex items-center justify-center flex-shrink-0">
              <Bot className="h-5 w-5 text-[#3D8A80]" />
            </div>
            <div>
              <h1 className="font-playfair text-2xl font-semibold text-stone-900">
                AI Management
              </h1>
              <p className="font-nunito text-sm text-stone-500 mt-0.5">
                Manage knowledge, FAQs, triggers, and conversation logs for your AI bot
              </p>
            </div>
          </div>

          {/* AI toggle */}
          <div className="flex items-center gap-3">
            {isToggleBusy && !toggleLoading && (
              <Loader2 className="h-4 w-4 text-[#3D8A80] animate-spin" />
            )}
            <span className="font-nunito text-sm font-medium text-stone-600">
              AI Chatbot
            </span>
            <AiToggle
              enabled={aiEnabled}
              loading={isToggleBusy}
              onToggle={handleToggle}
            />
            <span
              className={`font-nunito text-xs font-semibold ${
                aiEnabled ? 'text-[#3D8A80]' : 'text-stone-400'
              }`}
            >
              {toggleLoading ? '—' : aiEnabled ? 'On' : 'Off'}
            </span>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mt-5 -mb-px">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`
                  px-4 py-2 font-nunito text-sm font-medium rounded-t-lg
                  border-b-2 transition-all duration-150
                  ${
                    isActive
                      ? 'border-[#7BBFB5] text-[#3D8A80] bg-[#FAFAF8]'
                      : 'border-transparent text-stone-400 hover:text-stone-600 hover:bg-[#F2EEE8]'
                  }
                `}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="p-6">
        {activeTab === 'knowledge' && <KnowledgeTab />}
        {activeTab === 'faqs' && <FaqTab />}
        {activeTab === 'triggers' && <TriggerTab />}
        {activeTab === 'logs' && <AiLogsTab />}
      </div>
    </>
  );
}
