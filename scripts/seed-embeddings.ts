// Run: NVIDIA_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-embeddings.ts

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!;
const BATCH_SIZE = 10;
const DELAY_MS = 1000;

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'nvidia/nv-embedqa-e5-v5', input: [text] }),
  });
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function upsertEmbedding(sourceTable: string, sourceId: string, content: string, metadata: any = {}) {
  const contentHash = hashContent(content);

  const { data: existing } = await supabase
    .from('rag_embeddings')
    .select('content_hash')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .single();

  if (existing?.content_hash === contentHash) {
    console.log(`  [skip] ${sourceTable}/${sourceId} — unchanged`);
    return;
  }

  const embedding = await embed(content);
  await supabase.from('rag_embeddings').upsert(
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
  console.log(`  [done] ${sourceTable}/${sourceId}`);
}

async function processBatch<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(fn));
    if (i + BATCH_SIZE < items.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
}

async function main() {
  console.log('=== Seeding RAG Embeddings ===\n');

  // 1. Menu items
  console.log('[menu_items]');
  const { data: items } = await supabase.from('menu_items').select('id, name, description, base_price, discount_price, discount_active, category').eq('available', true);
  await processBatch(items || [], async (item: any) => {
    const price = item.discount_active && item.discount_price ? `₱${item.discount_price} (was ₱${item.base_price})` : `₱${item.base_price}`;
    const content = `${item.name} - ${item.description || ''} - ${price}`;
    await upsertEmbedding('menu_items', item.id, content, { category: item.category, price: item.base_price });
  });

  // 2. Bundles
  console.log('\n[bundles]');
  const { data: bundles } = await supabase.from('bundles').select('id, name, description, price').eq('available', true);
  await processBatch(bundles || [], async (b: any) => {
    await upsertEmbedding('bundles', b.id, `${b.name} Bundle - ${b.description || ''} - ₱${b.price}`, { price: b.price });
  });

  // 3. Categories
  console.log('\n[categories]');
  const { data: categories } = await supabase.from('categories').select('id, name').eq('active', true);
  await processBatch(categories || [], async (c: any) => {
    await upsertEmbedding('categories', c.id, `Category: ${c.name}`, {});
  });

  // 4. Branches
  console.log('\n[branches]');
  const { data: branches } = await supabase.from('branches').select('id, name, address, phone').eq('active', true);
  await processBatch(branches || [], async (b: any) => {
    await upsertEmbedding('branches', b.id, `${b.name} - ${b.address} - ${b.phone}`, {});
  });

  // 5. FAQs
  console.log('\n[faq_entries]');
  const { data: faqs } = await supabase.from('faq_entries').select('id, question, answer, category').eq('is_active', true);
  await processBatch(faqs || [], async (f: any) => {
    await upsertEmbedding('faq_entries', f.id, `Q: ${f.question}\nA: ${f.answer}`, { category: f.category });
  });

  // 6. Add-ons
  console.log('\n[add_ons]');
  const { data: addOns } = await supabase.from('add_ons').select('id, name, price');
  await processBatch(addOns || [], async (a: any) => {
    await upsertEmbedding('add_ons', a.id, `Add-on: ${a.name} - ₱${a.price}`, { price: a.price });
  });

  // 7. Loyalty
  console.log('\n[loyalty]');
  const { data: loyaltyConfig } = await supabase.from('loyalty_config').select('*').single();
  if (loyaltyConfig) {
    await upsertEmbedding('loyalty_config', 'config', `Loyalty program: ${JSON.stringify(loyaltyConfig)}`, {});
  }
  const { data: goals } = await supabase.from('loyalty_goals').select('*');
  if (goals && goals.length > 0) {
    const goalsText = goals.map((g: any) => `${g.name}: ${g.description}`).join('. ');
    await upsertEmbedding('loyalty_goals', 'all', `Loyalty rewards: ${goalsText}`, {});
  }

  // 8. Payment methods
  console.log('\n[payment_methods]');
  const { data: payments } = await supabase.from('payment_methods').select('name, account_number, account_name').eq('active', true);
  if (payments && payments.length > 0) {
    const payText = payments.map((p: any) => `${p.name}: ${p.account_name} (${p.account_number})`).join('. ');
    await upsertEmbedding('site_settings', 'payment_methods', `Payment methods: ${payText}`, {});
  }

  console.log('\n=== Done! ===');

  const { count } = await supabase.from('rag_embeddings').select('*', { count: 'exact', head: true });
  console.log(`Total embeddings: ${count}`);
}

main().catch(console.error);
