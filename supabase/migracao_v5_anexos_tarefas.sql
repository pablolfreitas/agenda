-- ============================================================
-- Migração v5 · Anexos e Fotos nas Tarefas
-- Cole e execute no SQL Editor do Supabase
-- ============================================================

-- 1. Cria as colunas para foto e anexo na tabela de tarefas
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS anexo_url text,
  ADD COLUMN IF NOT EXISTS anexo_nome text,
  ADD COLUMN IF NOT EXISTS anexo_tipo text;

-- 2. Cria o bucket de armazenamento para as fotos
INSERT INTO storage.buckets (id, name, public)
VALUES ('tarefas-anexos', 'tarefas-anexos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Libera permissão de envio (upload) para usuários logados
DROP POLICY IF EXISTS "permitir_upload_autenticado" ON storage.objects;
CREATE POLICY "permitir_upload_autenticado"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'tarefas-anexos');

-- 4. Libera visualização pública das fotos no aplicativo
DROP POLICY IF EXISTS "permitir_leitura_publica" ON storage.objects;
CREATE POLICY "permitir_leitura_publica"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tarefas-anexos');

-- 5. Libera exclusão de anexos para usuários logados
DROP POLICY IF EXISTS "permitir_exclusao_autenticado" ON storage.objects;
CREATE POLICY "permitir_exclusao_autenticado"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'tarefas-anexos');
