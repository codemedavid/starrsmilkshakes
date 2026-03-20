import { supabaseServer } from '@/lib/supabase-server';
import { generateEmbedding } from '@/lib/nvidia-client';
import { createHash } from 'crypto';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function syncEmbedding(
  sourceTable: string,
  sourceId: string,
  content: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const contentHash = hashContent(content);

  // Check if content is unchanged
  const { data: existing } = await supabaseServer
    .from('rag_embeddings')
    .select('content_hash')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .single();

  if (existing?.content_hash === contentHash) return; // No change

  const embedding = await generateEmbedding(content);

  await supabaseServer.from('rag_embeddings').upsert(
    {
      source_table: sourceTable,
      source_id: sourceId,
      content,
      embedding: JSON.stringify(embedding),
      content_hash: contentHash,
      metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'source_table,source_id' }
  );
}

export async function removeEmbedding(
  sourceTable: string,
  sourceId: string
): Promise<void> {
  await supabaseServer
    .from('rag_embeddings')
    .delete()
    .match({ source_table: sourceTable, source_id: sourceId });
}

// ─── Content builders for each source ────────────────────────────────────────

export function buildMenuItemContent(item: {
  name: string;
  description?: string;
  base_price: number;
  discount_price?: number | null;
  discount_active?: boolean;
}): string {
  const price = item.discount_active && item.discount_price
    ? `₱${item.discount_price} (was ₱${item.base_price})`
    : `₱${item.base_price}`;
  return `${item.name} - ${item.description || 'No description'} - ${price}`;
}

export function buildBundleContent(bundle: {
  name: string;
  description?: string;
  price: number;
}): string {
  return `${bundle.name} Bundle - ${bundle.description || ''} - ₱${bundle.price}`;
}

export function buildBranchContent(branch: {
  name: string;
  address: string;
  phone: string;
  hours?: string;
}): string {
  const parts = [branch.name, branch.address, branch.phone];
  if (branch.hours) parts.push(`Hours: ${branch.hours}`);
  return parts.join(' - ');
}

export function buildFaqContent(faq: {
  question: string;
  answer: string;
}): string {
  return `Q: ${faq.question}\nA: ${faq.answer}`;
}

export function buildCategoryContent(cat: {
  name: string;
  description?: string;
}): string {
  return cat.description ? `Category: ${cat.name} - ${cat.description}` : `Category: ${cat.name}`;
}

export function buildAddOnContent(addOn: {
  name: string;
  price: number;
}): string {
  return `Add-on: ${addOn.name} - ₱${addOn.price}`;
}

export function buildLoyaltyContent(config: Record<string, unknown>, goals: { name: string; description: string }[]): string {
  const goalsText = goals.map((g) => `${g.name}: ${g.description}`).join('. ');
  return `Loyalty program: ${JSON.stringify(config)}. Rewards: ${goalsText}`;
}

export function buildPaymentMethodsContent(methods: { name: string; account_name: string; account_number: string }[]): string {
  return `Payment methods: ${methods.map((m) => `${m.name}: ${m.account_name} (${m.account_number})`).join('. ')}`;
}
