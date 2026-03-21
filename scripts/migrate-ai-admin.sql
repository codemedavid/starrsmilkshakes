-- scripts/migrate-ai-admin.sql
-- AI Admin Dashboard: knowledge entries, documents, chunks, triggers

-- 1. knowledge_entries
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_entries_active_idx
  ON knowledge_entries (is_active);
CREATE INDEX IF NOT EXISTS knowledge_entries_category_idx
  ON knowledge_entries (category);

ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON knowledge_entries
  FOR ALL USING (auth.role() = 'service_role');

-- 2. knowledge_documents
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INT NOT NULL,
  chunk_count INT DEFAULT 0,
  status TEXT DEFAULT 'processing',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx
  ON knowledge_documents (status);

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON knowledge_documents
  FOR ALL USING (auth.role() = 'service_role');

-- 3. knowledge_chunks
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  section_header TEXT,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx
  ON knowledge_chunks (document_id, chunk_index);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON knowledge_chunks
  FOR ALL USING (auth.role() = 'service_role');

-- 4. chat_triggers
CREATE TABLE IF NOT EXISTS chat_triggers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  patterns TEXT[] NOT NULL,
  match_type TEXT DEFAULT 'contains',
  response TEXT NOT NULL,
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_triggers_active_priority_idx
  ON chat_triggers (is_active, priority DESC);

ALTER TABLE chat_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON chat_triggers
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Migrate existing faq_entries keywords into chat_triggers
-- For each FAQ with non-empty keywords, create a trigger
INSERT INTO chat_triggers (name, patterns, match_type, response, priority, is_active)
SELECT
  'FAQ: ' || LEFT(question, 50) AS name,
  string_to_array(keywords, ',') AS patterns,
  'contains' AS match_type,
  answer AS response,
  0 AS priority,
  is_active
FROM faq_entries
WHERE keywords IS NOT NULL AND keywords != ''
ON CONFLICT DO NOTHING;
