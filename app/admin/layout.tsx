import { requireAdmin } from '@/lib/admin-guard';
import { Sidebar } from '@/components/admin/Sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { adminType } = await requireAdmin();

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex">
      <Sidebar adminType={adminType} />
      <main className="flex-1 lg:ml-60 min-h-screen">
        {children}
      </main>
    </div>
  );
}
