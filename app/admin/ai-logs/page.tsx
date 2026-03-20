import { requireAdmin } from '@/lib/admin-guard';
import AiLogsTab from '@/components/admin/AiLogsTab';

export default async function AiLogsPage() {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">
          AI Chat Logs
        </h1>
        <p className="font-nunito text-sm text-stone-500 mt-1">
          View AI chatbot conversations and performance
        </p>
      </div>
      <div className="p-6">
        <AiLogsTab />
      </div>
    </div>
  );
}
