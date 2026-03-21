import { requireAdmin } from '@/lib/admin-guard';
import { getDocumentWithChunks } from '@/actions/ai';
import DocumentReview from '@/components/admin/DocumentReview';
import { redirect } from 'next/navigation';

export default async function DocumentReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const result = await getDocumentWithChunks(id);

  if (!result.success || !result.data) {
    redirect('/admin/ai?tab=knowledge');
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <DocumentReview
        document={result.data.document}
        initialChunks={result.data.chunks}
      />
    </div>
  );
}
