'use client';

import { useState, useTransition } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { SiteSettings } from '@/types';
import { updateSiteSettings } from '@/actions/settings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsFormProps {
  settings: SiteSettings;
}

// ─── Shared input class ───────────────────────────────────────────────────────

const inputClass = `
  w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px]
  font-nunito text-sm text-stone-900 placeholder:text-stone-400
  bg-white focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none
  transition-all duration-200
`;

const labelClass = 'block text-sm font-nunito font-medium text-stone-700 mb-1.5';

const hintClass = 'text-xs font-nunito text-stone-400 mt-1';

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#F2EEE8] rounded-xl border border-[#E8E3DA] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E8E3DA] bg-white/60">
        <h2 className="font-playfair text-lg font-semibold text-stone-900">{title}</h2>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </section>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
  colSpan2,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  colSpan2?: boolean;
}) {
  return (
    <div className={colSpan2 ? 'md:col-span-2' : ''}>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsForm({ settings }: SettingsFormProps) {
  const [form, setForm] = useState<SiteSettings>({ ...settings });
  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const set = (key: keyof SiteSettings) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const result = await updateSiteSettings(form);
        if (!result.success) {
          setErrorMsg(result.error || 'Something went wrong');
          return;
        }
        setSuccessMsg('Settings saved successfully');
        // Auto-dismiss after 4 s
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch {
        setErrorMsg('An unexpected error occurred');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {/* ── General ──────────────────────────────────────────────────────────── */}
      <Section title="General">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Site Name" colSpan2>
            <input
              type="text"
              value={form.site_name}
              onChange={set('site_name')}
              className={inputClass}
              placeholder="Starr's Famous Shakes"
            />
          </Field>

          <Field label="Site Description" colSpan2>
            <textarea
              value={form.site_description}
              onChange={set('site_description')}
              rows={3}
              className={`${inputClass} resize-y`}
              placeholder="A short description for SEO and social sharing"
            />
          </Field>

          <Field label="Site Logo URL" colSpan2>
            <input
              type="url"
              value={form.site_logo}
              onChange={set('site_logo')}
              className={inputClass}
              placeholder="https://example.com/logo.png"
            />
          </Field>

          <Field label="Currency Symbol">
            <input
              type="text"
              value={form.currency}
              onChange={set('currency')}
              className={inputClass}
              placeholder="₱"
            />
          </Field>

          <Field label="Currency Code">
            <input
              type="text"
              value={form.currency_code}
              onChange={set('currency_code')}
              className={inputClass}
              placeholder="PHP"
            />
          </Field>
        </div>
      </Section>

      {/* ── Lalamove Delivery ─────────────────────────────────────────────────── */}
      <Section title="Lalamove Delivery">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Market">
            <input
              type="text"
              value={form.lalamove_market ?? ''}
              onChange={set('lalamove_market')}
              className={inputClass}
              placeholder="PH"
            />
          </Field>

          <Field label="Service Type">
            <input
              type="text"
              value={form.lalamove_service_type ?? ''}
              onChange={set('lalamove_service_type')}
              className={inputClass}
              placeholder="MOTORCYCLE"
            />
          </Field>

          <Field label="API Key">
            <input
              type="text"
              value={form.lalamove_api_key ?? ''}
              onChange={set('lalamove_api_key')}
              className={inputClass}
              placeholder="pk_..."
            />
          </Field>

          <Field label="API Secret">
            <input
              type="password"
              value={form.lalamove_api_secret ?? ''}
              onChange={set('lalamove_api_secret')}
              className={inputClass}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          <Field
            label="Sandbox Mode"
            hint="Set to 'true' to use the sandbox environment for testing"
            colSpan2
          >
            <select
              value={form.lalamove_sandbox ?? 'true'}
              onChange={set('lalamove_sandbox')}
              className={inputClass}
            >
              <option value="true">Enabled (sandbox)</option>
              <option value="false">Disabled (live)</option>
            </select>
          </Field>

          <Field label="Store Name" colSpan2>
            <input
              type="text"
              value={form.lalamove_store_name ?? ''}
              onChange={set('lalamove_store_name')}
              className={inputClass}
              placeholder="Starr's Famous Shakes"
            />
          </Field>

          <Field label="Store Phone">
            <input
              type="text"
              value={form.lalamove_store_phone ?? ''}
              onChange={set('lalamove_store_phone')}
              className={inputClass}
              placeholder="+63 9XX XXX XXXX"
            />
          </Field>

          <Field label="Store Address" colSpan2>
            <input
              type="text"
              value={form.lalamove_store_address ?? ''}
              onChange={set('lalamove_store_address')}
              className={inputClass}
              placeholder="Full pickup address"
            />
          </Field>

          <Field label="Store Latitude">
            <input
              type="text"
              value={form.lalamove_store_latitude ?? ''}
              onChange={set('lalamove_store_latitude')}
              className={inputClass}
              placeholder="14.5547"
            />
          </Field>

          <Field label="Store Longitude">
            <input
              type="text"
              value={form.lalamove_store_longitude ?? ''}
              onChange={set('lalamove_store_longitude')}
              className={inputClass}
              placeholder="121.0244"
            />
          </Field>
        </div>
      </Section>

      {/* ── Meta / Facebook Pixel ─────────────────────────────────────────────── */}
      <Section title="Meta / Facebook Pixel">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Pixel ID">
            <input
              type="text"
              value={form.meta_pixel_id ?? ''}
              onChange={set('meta_pixel_id')}
              className={inputClass}
              placeholder="1234567890"
            />
          </Field>

          <Field label="Test Event Code" hint="Leave blank in production">
            <input
              type="text"
              value={form.meta_test_event_code ?? ''}
              onChange={set('meta_test_event_code')}
              className={inputClass}
              placeholder="TEST12345"
            />
          </Field>

          <Field label="Access Token" hint="Conversions API token — stored securely" colSpan2>
            <input
              type="password"
              value={form.meta_access_token ?? ''}
              onChange={set('meta_access_token')}
              className={inputClass}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>
        </div>
      </Section>

      {/* ── Advanced ──────────────────────────────────────────────────────────── */}
      <Section title="Advanced">
        <Field
          label="Header Scripts"
          hint="Injected into <head> — use with caution. Accepts raw HTML / <script> tags."
        >
          <textarea
            value={form.header_scripts ?? ''}
            onChange={set('header_scripts')}
            rows={5}
            className={`${inputClass} font-mono text-xs resize-y`}
            placeholder={'<script>/* custom scripts */</script>'}
            spellCheck={false}
          />
        </Field>
      </Section>

      {/* ── AI Chatbot ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] p-6 mt-6">
        <h3 className="font-playfair text-lg font-semibold text-stone-900 mb-4">
          AI Chatbot
        </h3>
        <p className="font-nunito text-sm text-stone-500 mb-4">
          When enabled, the Messenger bot will use AI to answer questions that don&apos;t match any FAQ keywords.
        </p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.ai_faq_enabled === 'true'}
            onChange={(e) => setForm({ ...form, ai_faq_enabled: e.target.checked ? 'true' : 'false' })}
            className="w-5 h-5 rounded border-stone-300 text-[#3D8A80] focus:ring-[#3D8A80]"
          />
          <span className="font-nunito text-sm font-medium text-stone-700">
            Enable AI-powered FAQ responses
          </span>
        </label>
      </div>

      {/* ── Save ─────────────────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="
            inline-flex items-center gap-2 px-6 py-2.5
            bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
            rounded-[10px] shadow-sm
            hover:bg-[#3D8A80] active:bg-[#2C6E65]
            focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
            transition-all duration-200 disabled:opacity-50
          "
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}
