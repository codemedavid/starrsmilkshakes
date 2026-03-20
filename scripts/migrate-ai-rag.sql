-- AI RAG Chatbot Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → paste and run)

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. RAG embeddings table
CREATE TABLE IF NOT EXISTS rag_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  content_hash TEXT,
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_table, source_id)
);

CREATE INDEX IF NOT EXISTS rag_embeddings_hnsw_idx
  ON rag_embeddings USING hnsw (embedding vector_cosine_ops);

-- 3. AI conversations table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  psid TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_psid_idx
  ON ai_conversations (psid, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_conversations_session_idx
  ON ai_conversations (session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ai_conversations_created_idx
  ON ai_conversations (created_at);
CREATE INDEX IF NOT EXISTS ai_conversations_intent_idx
  ON ai_conversations (intent);

-- 4. AI rate limits table
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  psid TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. AI FAQ toggle in site_settings
INSERT INTO site_settings (id, value)
VALUES ('ai_faq_enabled', 'false')
ON CONFLICT (id) DO NOTHING;

-- 6. RLS policies
ALTER TABLE rag_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON rag_embeddings
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ai_conversations
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ai_rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- 7. pgvector search function
CREATE OR REPLACE FUNCTION match_rag_embeddings(
  query_embedding VECTOR(1024),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    rag_embeddings.content,
    rag_embeddings.metadata,
    1 - (rag_embeddings.embedding <=> query_embedding) AS similarity
  FROM rag_embeddings
  WHERE 1 - (rag_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY rag_embeddings.embedding <=> query_embedding
  LIMIT match_count;
$$;
