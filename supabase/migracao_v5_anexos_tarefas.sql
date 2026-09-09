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

-- 6. Atualiza a função de tarefas compartilhadas para repassar fotos/anexos para amigos
CREATE OR REPLACE FUNCTION public.criar_tarefa_compartilhada(
  p_receptor_id UUID,
  p_data TEXT,
  p_bloco_inicio_id INTEGER,
  p_quantidade_blocos INTEGER,
  p_titulo TEXT,
  p_descricao TEXT,
  p_categoria TEXT,
  p_remetente_email TEXT,
  p_anexo_url TEXT DEFAULT NULL,
  p_anexo_nome TEXT DEFAULT NULL,
  p_anexo_tipo TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_conexao_existe BOOLEAN;
  v_enviados_hoje INTEGER;
  v_new_id UUID;
BEGIN
  -- 1. Verifica se há uma conexão aceita ativa
  SELECT EXISTS (
    SELECT 1 FROM public.conexoes
    WHERE (
      (solicitante_id = auth.uid() AND receptor_id = p_receptor_id)
      OR
      (solicitante_id = p_receptor_id AND receptor_id = auth.uid())
    ) AND status = 'aceito'
  ) INTO v_conexao_existe;

  IF NOT v_conexao_existe THEN
    RETURN json_build_object('ok', false, 'erro', 'Você precisa ter uma conexão aceita com este usuário para enviar lembretes.');
  END IF;

  -- 2. Verifica se o limite de 3 enviados hoje foi atingido
  SELECT count(*) FROM public.tarefas
  WHERE criado_por_id = auth.uid()
    AND usuario_id != auth.uid()
    AND criado_em::date = now()::date
  INTO v_enviados_hoje;

  IF v_enviados_hoje >= 3 THEN
    RETURN json_build_object('ok', false, 'erro', 'Limite de 3 lembretes enviados por dia atingido.');
  END IF;

  -- 3. Insere a tarefa na agenda do destinatário incluindo o anexo
  INSERT INTO public.tarefas (
    usuario_id,
    data_agendamento,
    bloco_inicio_id,
    quantidade_blocos,
    titulo,
    descricao,
    categoria,
    criado_por_id,
    criado_por_email,
    anexo_url,
    anexo_nome,
    anexo_tipo
  ) VALUES (
    p_receptor_id,
    p_data::date,
    p_bloco_inicio_id,
    p_quantidade_blocos,
    p_titulo,
    p_descricao,
    p_categoria,
    auth.uid(),
    p_remetente_email,
    p_anexo_url,
    p_anexo_nome,
    p_anexo_tipo
  ) RETURNING id INTO v_new_id;

  RETURN json_build_object('ok', true, 'id', v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
