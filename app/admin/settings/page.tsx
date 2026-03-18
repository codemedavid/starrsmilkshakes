import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { mapSiteSettingsRows } from '@/lib/site-settings';
import SettingsForm from '@/components/admin/SettingsForm';

export default async function SettingsPage() {
  await requireAdmin();

  const { data, error } = await (supabaseServer
    .from('site_settings') as any)
    .select('*')
    .order('id');

  if (error) {
    // Throwing here lets the nearest error.tsx boundary catch it
    throw new Error('Failed to load site settings');
  }

  const settings = mapSiteSettingsRows(data as any[]);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Page header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div>
          <h1 className="font-playfair text-2xl font-semibold text-stone-900">
            Site Settings
          </h1>
          <p className="font-nunito text-sm text-stone-500 mt-1">
            Configure global settings for your storefront
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="p-6 max-w-3xl">
        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
