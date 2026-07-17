-- ============================================================
-- NÉCTAR — SETUP UNIFICADO DO SUPABASE (AGENDA & FINANÇAS)
-- Execute este arquivo no SQL Editor do seu projeto Supabase.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. perfis
CREATE TABLE IF NOT EXISTS perfis (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  telefone    TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente', 'aprovado', 'bloqueado')),
  is_admin    BOOLEAN NOT NULL DEFAULT false,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. cartoes
CREATE TABLE IF NOT EXISTS cartoes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  cor       TEXT NOT NULL DEFAULT '#1e293b',
  ativo     BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cartoes_user_nome_unico
  ON cartoes (user_id, lower(nome)) WHERE ativo = true;

-- 3. rendas
CREATE TABLE IF NOT EXISTS rendas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes_ano         TEXT NOT NULL,               -- formato 'YYYY-MM'
  salario         NUMERIC(12,2) NOT NULL DEFAULT 0,
  decimo          NUMERIC(12,2) NOT NULL DEFAULT 0,
  premio          NUMERIC(12,2) NOT NULL DEFAULT 0,
  outros          NUMERIC(12,2) NOT NULL DEFAULT 0,
  cheque_especial NUMERIC(12,2) NOT NULL DEFAULT 0,
  va_total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  va_gasto        NUMERIC(12,2) NOT NULL DEFAULT 0,
  va_restante     NUMERIC(12,2) NOT NULL DEFAULT 0,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rendas_user_mes_unico ON rendas (user_id, mes_ano);

-- 4. transacoes
CREATE TABLE IF NOT EXISTS transacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grupo_id        UUID NOT NULL,
  cartao_id       UUID NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  valor           NUMERIC(12,2) NOT NULL,
  valor_total     NUMERIC(12,2) NOT NULL,
  parcela_atual   INTEGER NOT NULL DEFAULT 1,
  total_parcelas  INTEGER NOT NULL DEFAULT 1,
  mes_ano         TEXT NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transacoes_mes_ano_idx ON transacoes (mes_ano);
CREATE INDEX IF NOT EXISTS transacoes_cartao_idx  ON transacoes (cartao_id);
CREATE INDEX IF NOT EXISTS transacoes_grupo_idx   ON transacoes (grupo_id);
CREATE INDEX IF NOT EXISTS transacoes_user_idx    ON transacoes (user_id);

-- 5. outros_gastos
CREATE TABLE IF NOT EXISTS outros_gastos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao   TEXT NOT NULL,
  valor       NUMERIC(12,2) NOT NULL,
  mes_ano     TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outros_gastos_mes_ano_idx ON outros_gastos (mes_ano);
CREATE INDEX IF NOT EXISTS outros_gastos_user_idx    ON outros_gastos (user_id);

-- 6. gastos_fixos
CREATE TABLE IF NOT EXISTS gastos_fixos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao     TEXT NOT NULL,
  valor         NUMERIC(12,2) NOT NULL,
  mes_ano       TEXT NOT NULL,
  pago          BOOLEAN NOT NULL DEFAULT false,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gastos_fixos_mes_ano_idx ON gastos_fixos (mes_ano);
CREATE INDEX IF NOT EXISTS gastos_fixos_user_idx    ON gastos_fixos (user_id);

-- 7. cartoes_pagos
CREATE TABLE IF NOT EXISTS cartoes_pagos (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartao_id UUID NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  mes_ano   TEXT NOT NULL,
  PRIMARY KEY (user_id, cartao_id, mes_ano)
);

-- 8. tarefas (Agenda)
CREATE TABLE IF NOT EXISTS tarefas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_agendamento  TEXT NOT NULL, -- formato YYYY-MM-DD
  bloco_inicio_id   INTEGER NOT NULL,
  quantidade_blocos INTEGER NOT NULL,
  titulo            TEXT NOT NULL,
  descricao         TEXT,
  concluida         BOOLEAN NOT NULL DEFAULT false,
  categoria         TEXT NOT NULL DEFAULT 'pessoal',
  serie_id          UUID,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_usuario ON tarefas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_data ON tarefas(data_agendamento);
CREATE INDEX IF NOT EXISTS idx_tarefas_serie ON tarefas(serie_id) WHERE serie_id IS NOT NULL;


-- ============================================================
-- FUNÇÕES & TRIGGERS
-- ============================================================

-- Trigger para criar perfil de usuário pendente automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, email, telefone, status, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'telefone', ''),
    'pendente',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- RPC: Copiar gastos fixos do mês anterior
CREATE OR REPLACE FUNCTION copiar_gastos_fixos_mes_anterior(p_mes_ano TEXT)
RETURNS VOID AS $$
DECLARE
  v_mes_anterior TEXT;
BEGIN
  -- Calcula o mês anterior com base no formato YYYY-MM
  v_mes_anterior := to_char((to_date(p_mes_ano || '-01', 'YYYY-MM-DD') - INTERVAL '1 month'), 'YYYY-MM');

  INSERT INTO gastos_fixos (user_id, descricao, valor, mes_ano, pago, ativo)
  SELECT auth.uid(), descricao, valor, p_mes_ano, false, true
  FROM gastos_fixos
  WHERE user_id = auth.uid() AND mes_ano = v_mes_anterior AND ativo = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: Verificar email e telefone para redefinir senha
CREATE OR REPLACE FUNCTION verificar_email_telefone(p_email TEXT, p_telefone TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM perfis
    WHERE lower(email) = lower(p_email) AND replace(telefone, ' ', '') = replace(p_telefone, ' ', '')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: Resetar senha do usuário
CREATE OR REPLACE FUNCTION resetar_senha(p_email TEXT, p_telefone TEXT, p_nova_senha TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM perfis
  WHERE lower(email) = lower(p_email) AND replace(telefone, ' ', '') = replace(p_telefone, ' ', '');

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt(p_nova_senha, gen_salt('bf'))
    WHERE id = v_user_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC Admin: Listar perfis
CREATE OR REPLACE FUNCTION admin_listar_perfis()
RETURNS SETOF perfis AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perfis WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é administrador';
  END IF;

  RETURN QUERY SELECT * FROM perfis ORDER BY criado_em DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC Admin: Atualizar status do usuário
CREATE OR REPLACE FUNCTION admin_atualizar_status(p_user_id UUID, p_status TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perfis WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é administrador';
  END IF;

  UPDATE perfis SET status = p_status WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC Admin: Apagar usuário e todos os dados
CREATE OR REPLACE FUNCTION admin_apagar_usuario(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perfis WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é administrador';
  END IF;

  DELETE FROM tarefas WHERE usuario_id = p_user_id;
  DELETE FROM outros_gastos WHERE user_id = p_user_id;
  DELETE FROM transacoes WHERE user_id = p_user_id;
  DELETE FROM cartoes WHERE user_id = p_user_id;
  DELETE FROM rendas WHERE user_id = p_user_id;
  DELETE FROM gastos_fixos WHERE user_id = p_user_id;
  DELETE FROM cartoes_pagos WHERE user_id = p_user_id;
  DELETE FROM perfis WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC LGPD: Exportar todos os dados do usuário
CREATE OR REPLACE FUNCTION exportar_meus_dados()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'perfil', (SELECT row_to_json(p) FROM perfis p WHERE p.id = auth.uid()),
    'tarefas', (SELECT json_agg(t) FROM tarefas t WHERE t.usuario_id = auth.uid()),
    'cartoes', (SELECT json_agg(c) FROM cartoes c WHERE c.user_id = auth.uid()),
    'rendas', (SELECT json_agg(r) FROM rendas r WHERE r.user_id = auth.uid()),
    'transacoes', (SELECT json_agg(tr) FROM transacoes tr WHERE tr.user_id = auth.uid()),
    'outros_gastos', (SELECT json_agg(og) FROM outros_gastos og WHERE og.user_id = auth.uid()),
    'gastos_fixos', (SELECT json_agg(gf) FROM gastos_fixos gf WHERE gf.user_id = auth.uid()),
    'cartoes_pagos', (SELECT json_agg(cp) FROM cartoes_pagos cp WHERE cp.user_id = auth.uid())
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC LGPD: Excluir conta pelo próprio usuário
CREATE OR REPLACE FUNCTION excluir_minha_conta()
RETURNS VOID AS $$
BEGIN
  DELETE FROM tarefas WHERE usuario_id = auth.uid();
  DELETE FROM outros_gastos WHERE user_id = auth.uid();
  DELETE FROM transacoes WHERE user_id = auth.uid();
  DELETE FROM cartoes WHERE user_id = auth.uid();
  DELETE FROM rendas WHERE user_id = auth.uid();
  DELETE FROM gastos_fixos WHERE user_id = auth.uid();
  DELETE FROM cartoes_pagos WHERE user_id = auth.uid();
  DELETE FROM perfis WHERE id = auth.uid();
  -- A deleção na perfis remove o usuário no auth.users por efeito cascata indireto se deletarmos via triggers ou direto.
  -- Para remover da auth.users, podemos usar a deleção da perfis que possui ON DELETE CASCADE na FK do auth.users?
  -- Nota: a FK referencia auth.users.id, o ON DELETE CASCADE é na FK da perfis (se deletar do auth.users, deleta da perfis).
  -- Para deletar do auth.users a partir de RPC, precisaríamos de privilégios elevados. Mas para limpar dados de usuário, isso já resolve.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- ATIVANDO ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seu perfil" ON perfis FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuário atualiza seu perfil" ON perfis FOR UPDATE USING (auth.uid() = id);

ALTER TABLE cartoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus cartões" ON cartoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário insere seus cartões" ON cartoes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuário atualiza seus cartões" ON cartoes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuário remove seus cartões" ON cartoes FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE rendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê suas rendas" ON rendas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário insere suas rendas" ON rendas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuário atualiza suas rendas" ON rendas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuário remove suas rendas" ON rendas FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê suas transações" ON transacoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário insere suas transações" ON transacoes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuário atualiza suas transações" ON transacoes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuário remove suas transações" ON transacoes FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE outros_gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus outros gastos" ON outros_gastos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário insere seus outros gastos" ON outros_gastos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuário atualiza seus outros gastos" ON outros_gastos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuário remove seus outros gastos" ON outros_gastos FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE gastos_fixos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus gastos fixos" ON gastos_fixos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário insere seus gastos fixos" ON gastos_fixos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuário atualiza seus gastos fixos" ON gastos_fixos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuário remove seus gastos fixos" ON gastos_fixos FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE cartoes_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus cartões pagos" ON cartoes_pagos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário insere seus cartões pagos" ON cartoes_pagos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuário remove seus cartões pagos" ON cartoes_pagos FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê suas tarefas" ON tarefas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Usuário insere suas tarefas" ON tarefas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Usuário atualiza suas tarefas" ON tarefas FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Usuário remove suas tarefas" ON tarefas FOR DELETE USING (auth.uid() = usuario_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE rendas;
ALTER PUBLICATION supabase_realtime ADD TABLE transacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE outros_gastos;
ALTER PUBLICATION supabase_realtime ADD TABLE cartoes;
ALTER PUBLICATION supabase_realtime ADD TABLE gastos_fixos;
ALTER PUBLICATION supabase_realtime ADD TABLE cartoes_pagos;
ALTER PUBLICATION supabase_realtime ADD TABLE perfis;
ALTER PUBLICATION supabase_realtime ADD TABLE tarefas;

-- ==========================================
-- Compartilhamento de Agenda e Conexões
-- ==========================================

CREATE TABLE IF NOT EXISTS public.conexoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitante_email TEXT NOT NULL,
  receptor_email    TEXT NOT NULL,
  receptor_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito', 'bloqueado')),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(solicitante_id, receptor_email)
);

-- Gatilho para preencher receptor_id caso o usuário já exista (ou se cadastre no futuro)
CREATE OR REPLACE FUNCTION public.vincular_receptor_conexao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.receptor_id := (SELECT id FROM auth.users WHERE email = NEW.receptor_email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER tg_vincular_receptor_conexao
BEFORE INSERT OR UPDATE ON public.conexoes
FOR EACH ROW EXECUTE FUNCTION public.vincular_receptor_conexao();

-- Adiciona informações do remetente nas tarefas para sabermos quem enviou o recado
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS criado_por_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS criado_por_email TEXT;

-- RLS para conexões
ALTER TABLE public.conexoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê suas conexões" ON public.conexoes
  FOR SELECT USING (auth.uid() = solicitante_id OR auth.uid() = receptor_id);

CREATE POLICY "Usuário cria conexões" ON public.conexoes
  FOR INSERT WITH CHECK (auth.uid() = solicitante_id);

CREATE POLICY "Usuário atualiza conexões" ON public.conexoes
  FOR UPDATE USING (auth.uid() = receptor_id);

CREATE POLICY "Usuário deleta conexões" ON public.conexoes
  FOR DELETE USING (auth.uid() = solicitante_id OR auth.uid() = receptor_id);

-- RPC para criar tarefa compartilhada com limite de 3 por dia
CREATE OR REPLACE FUNCTION public.criar_tarefa_compartilhada(
  p_receptor_id UUID,
  p_data TEXT,
  p_bloco_inicio_id INTEGER,
  p_quantidade_blocos INTEGER,
  p_titulo TEXT,
  p_descricao TEXT,
  p_categoria TEXT,
  p_remetente_email TEXT
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

  -- 3. Insere a tarefa na agenda do destinatário
  INSERT INTO public.tarefas (
    usuario_id,
    data_agendamento,
    bloco_inicio_id,
    quantidade_blocos,
    titulo,
    descricao,
    categoria,
    criado_por_id,
    criado_por_email
  ) VALUES (
    p_receptor_id,
    p_data::date,
    p_bloco_inicio_id,
    p_quantidade_blocos,
    p_titulo,
    p_descricao,
    p_categoria,
    auth.uid(),
    p_remetente_email
  ) RETURNING id INTO v_new_id;

  RETURN json_build_object('ok', true, 'id', v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Realtime para conexões
ALTER PUBLICATION supabase_realtime ADD TABLE conexoes;

