import { requireAdmin } from '@/lib/admin-guard';
import { getCachedSiteSettings } from '@/lib/cached-queries';
import SettingsForm from '@/components/admin/SettingsForm';

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getCachedSiteSettings();

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
