import { Suspense } from 'react';
import { requireAdmin } from '@/lib/admin-guard';
import AiHubTabs from '@/components/admin/AiHubTabs';

export default async function AiManagementPage() {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Suspense>
        <AiHubTabs />
      </Suspense>
    </div>
  );
}
