-- ============================================================
-- MIGRAÇÃO v3 — Vínculo entre Gastos Fixos e Agenda
-- ============================================================
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- Todas as alterações são ADITIVAS (apenas ADD COLUMN, com
-- valores opcionais/nulos por padrão). Nenhuma linha existente
-- em `gastos_fixos` ou `tarefas` é apagada, alterada ou perde
-- funcionalidade. Pode ser executado com segurança em produção.
-- ============================================================

-- 1. Novo campo em gastos_fixos: dia do vencimento (opcional).
--    Quando preenchido (1 a 31), o app passa a gerar automaticamente
--    uma tarefa na agenda nesse dia do mês correspondente.
ALTER TABLE gastos_fixos
  ADD COLUMN IF NOT EXISTS dia_vencimento SMALLINT
    CHECK (dia_vencimento IS NULL OR (dia_vencimento BETWEEN 1 AND 31));

-- 2. Novo campo em gastos_fixos: referência à tarefa gerada na agenda.
--    Fica NULL enquanto o gasto não tiver dia de vencimento definido.
--    ON DELETE SET NULL: se a tarefa for apagada diretamente na agenda,
--    o gasto fixo continua existindo normalmente, apenas perde o vínculo.
ALTER TABLE gastos_fixos
  ADD COLUMN IF NOT EXISTS tarefa_id UUID REFERENCES tarefas(id) ON DELETE SET NULL;

-- 3. Novo campo em tarefas: referência ao gasto fixo de origem.
--    Fica NULL para todas as tarefas criadas manualmente (comportamento
--    atual, 100% preservado). ON DELETE SET NULL: se o gasto fixo for
--    apagado, a tarefa não é apagada — apenas deixa de estar vinculada.
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS gasto_fixo_id UUID REFERENCES gastos_fixos(id) ON DELETE SET NULL;

-- 4. Índices para consultas de sincronização (buscar tarefa pelo gasto e
--    vice-versa) sem custo de performance extra no restante do app.
CREATE INDEX IF NOT EXISTS idx_gastos_fixos_tarefa   ON gastos_fixos(tarefa_id)   WHERE tarefa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_gasto_fixo     ON tarefas(gasto_fixo_id)    WHERE gasto_fixo_id IS NOT NULL;

-- ============================================================
-- Nenhuma alteração de RLS é necessária: as políticas existentes
-- em `gastos_fixos` e `tarefas` já isolam os dados por usuário
-- (auth.uid() = user_id / usuario_id), e essas novas colunas são
-- apenas referências entre registros que já pertencem ao mesmo
-- usuário — a aplicação (financeService) sempre grava o vínculo
-- entre um gasto e uma tarefa do mesmo dono.
-- ============================================================

-- 5. Atualiza a RPC de cópia de gastos fixos do mês anterior para também
--    copiar o dia_vencimento (assim o vínculo com a agenda continua
--    funcionando mês a mês, sem precisar redefinir o dia toda vez).
--    Importante: tarefa_id NUNCA é copiado — cada mês deve gerar sua
--    própria tarefa na agenda (o app cuida disso automaticamente ao
--    salvar), evitando que dois meses apontem para a mesma tarefa.
CREATE OR REPLACE FUNCTION copiar_gastos_fixos_mes_anterior(p_mes_ano TEXT)
RETURNS VOID AS $$
DECLARE
  v_mes_anterior TEXT;
BEGIN
  v_mes_anterior := to_char((to_date(p_mes_ano || '-01', 'YYYY-MM-DD') - INTERVAL '1 month'), 'YYYY-MM');

  INSERT INTO gastos_fixos (user_id, descricao, valor, mes_ano, pago, ativo, dia_vencimento)
  SELECT auth.uid(), descricao, valor, p_mes_ano, false, true, dia_vencimento
  FROM gastos_fixos
  WHERE user_id = auth.uid() AND mes_ano = v_mes_anterior AND ativo = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
