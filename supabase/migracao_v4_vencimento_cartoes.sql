-- ============================================================
-- MIGRAÇÃO v4 — Vencimento de Cartões vinculado à Agenda
-- ============================================================
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- Todas as alterações são ADITIVAS. Nenhuma linha existente em
-- `cartoes` ou `tarefas` é apagada, alterada ou perde
-- funcionalidade. Pode ser executado com segurança em produção.
-- ============================================================

-- 1. Novo campo em cartoes: dia do vencimento da fatura (opcional).
--    Quando preenchido (1 a 31), o app passa a gerar automaticamente,
--    todo mês, uma tarefa de lembrete na agenda nesse dia.
ALTER TABLE cartoes
  ADD COLUMN IF NOT EXISTS dia_vencimento SMALLINT
    CHECK (dia_vencimento IS NULL OR (dia_vencimento BETWEEN 1 AND 31));

-- 2. Nova tabela: guarda, por cartão e por mês, qual tarefa da agenda
--    representa o lembrete de vencimento daquele cartão naquele mês.
--    Diferente de `cartoes_pagos` (que só existe enquanto pago=true),
--    este vínculo precisa sobreviver independente do status de
--    pagamento, por isso é uma tabela própria.
CREATE TABLE IF NOT EXISTS cartoes_vencimento_tarefas (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartao_id UUID NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  mes_ano   TEXT NOT NULL,
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, cartao_id, mes_ano)
);

ALTER TABLE cartoes_vencimento_tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus vínculos de vencimento" ON cartoes_vencimento_tarefas
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário insere seus vínculos de vencimento" ON cartoes_vencimento_tarefas
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuário atualiza seus vínculos de vencimento" ON cartoes_vencimento_tarefas
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuário remove seus vínculos de vencimento" ON cartoes_vencimento_tarefas
  FOR DELETE USING (auth.uid() = user_id);

-- 3. Novo campo em tarefas: referência ao cartão de origem, quando a
--    tarefa é o lembrete de vencimento de fatura. Fica NULL para todas
--    as tarefas normais (comportamento atual, 100% preservado).
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS cartao_id UUID REFERENCES cartoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_cartao ON tarefas(cartao_id) WHERE cartao_id IS NOT NULL;

-- ============================================================
-- Nenhuma alteração é feita nas políticas de RLS de `cartoes` ou
-- `tarefas` — as regras existentes já isolam por usuário. A nova
-- tabela `cartoes_vencimento_tarefas` recebe suas próprias políticas
-- acima, seguindo o mesmo padrão do restante do banco.
-- ============================================================
