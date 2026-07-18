/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { supabase } from './supabaseClient';

export interface Perfil {
  id: string;
  email: string;
  telefone: string;
  status: 'pendente' | 'aprovado' | 'bloqueado';
  is_admin: boolean;
  criado_em: string;
}

export interface Cartao {
  id: string;
  user_id: string;
  nome: string;
  cor: string;
  ativo: boolean;
  criado_em: string;
  dia_vencimento?: number | null;
}

export interface Rendas {
  id: string;
  user_id: string;
  mes_ano: string;
  salario: number;
  decimo: number;
  premio: number;
  outros: number;
  cheque_especial: number;
  va_total: number;
  va_gasto: number;
  va_restante: number;
  atualizado_em: string;
}

export interface Transacao {
  id: string;
  user_id: string;
  grupo_id: string;
  cartao_id: string;
  descricao: string;
  valor: number;
  valor_total: number;
  parcela_atual: number;
  total_parcelas: number;
  mes_ano: string;
  criado_em: string;
  cartoes?: {
    nome: string;
    cor: string;
  };
}

export interface OutroGasto {
  id: string;
  user_id: string;
  descricao: string;
  valor: number;
  mes_ano: string;
  criado_em: string;
}

export interface GastoFixo {
  id: string;
  user_id: string;
  descricao: string;
  valor: number;
  mes_ano: string;
  pago: boolean;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
  dia_vencimento?: number | null;
  tarefa_id?: string | null;
}

export interface TotaisFinanceiros {
  rendaTotal: number;
  chequeEspecial: number;
  restante: number;
  gastosTotais: number;
  gastosCartoes: number;
  vaTotal: number;
  vaGasto: number;
  vaRestante: number;
  gastosOutros: number;
  gastosFixosTot: number;
  porCartao: {
    id: string;
    cartao: string;
    cor: string;
    pago: boolean;
    total: number;
  }[];
}

class FinanceService {
  async getSessao() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  async getPerfil(): Promise<Perfil | null> {
    const sessao = await this.getSessao();
    if (!sessao) return null;
    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', sessao.user.id)
      .single();
    if (error) return null;
    return data;
  }

  async getUsuariosPendentesCount(): Promise<number> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return 0;
      const { data, error } = await supabase.rpc('admin_listar_perfis');
      if (error) throw error;
      const list = (data as Perfil[]) || [];
      return list.filter(u => u.status === 'pendente' && !u.is_admin).length;
    } catch (e) {
      console.error('[FinanceService] getUsuariosPendentesCount:', e);
      return 0;
    }
  }

  async getCartoes(): Promise<Cartao[]> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return [];
      const { data, error } = await supabase
        .from('cartoes')
        .select('*')
        .eq('user_id', sessao.user.id)
        .eq('ativo', true)
        .order('criado_em');
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[FinanceService] getCartoes:', e);
      return [];
    }
  }

  async adicionarCartao(nome: string, cor: string = '#1e293b'): Promise<{ ok: boolean; data?: Cartao; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão ativa' };
      const { data, error } = await supabase
        .from('cartoes')
        .insert({ nome: nome.trim(), cor, user_id: sessao.user.id })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, data };
    } catch (e: any) {
      console.error('[FinanceService] adicionarCartao:', e);
      return { ok: false, erro: e.message };
    }
  }

  async editarCartao(id: string, diaVencimento: number | null): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };

      const { data: cartao, error } = await supabase
        .from('cartoes')
        .update({ dia_vencimento: diaVencimento })
        .eq('id', id)
        .eq('user_id', sessao.user.id)
        .select('id, nome, dia_vencimento')
        .single();
      if (error) throw error;

      // Sincroniza a tarefa do mês atual imediatamente, para o usuário
      // ver o lembrete na agenda sem precisar trocar de mês na tela.
      if (cartao?.dia_vencimento) {
        const hoje = new Date();
        const mesAno = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        const totais = await this.calcularTotais(mesAno);
        const totalCartao = totais?.porCartao.find((pc) => pc.id === id);
        await this.sincronizarVencimentoCartao(cartao, mesAno, totalCartao?.total ?? 0, totalCartao?.pago ?? false);
      }

      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] editarCartao:', e);
      return { ok: false, erro: e.message };
    }
  }

  async removerCartao(id: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      const { error } = await supabase
        .from('cartoes')
        .update({ ativo: false })
        .eq('id', id)
        .eq('user_id', sessao.user.id);
      if (error) throw error;

      // Remove apenas os lembretes de vencimento futuros (a partir de hoje);
      // tarefas de meses passados permanecem como histórico na agenda.
      const hoje = new Date();
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
      await supabase
        .from('tarefas')
        .delete()
        .eq('cartao_id', id)
        .eq('usuario_id', sessao.user.id)
        .gte('data_agendamento', `${mesAtual}-01`);

      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] removerCartao:', e);
      return { ok: false, erro: e.message };
    }
  }

  async getCartoesPagos(mesAno: string): Promise<string[]> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return [];

      const { data, error } = await supabase
        .from('cartoes_pagos')
        .select('cartao_id')
        .eq('user_id', sessao.user.id)
        .eq('mes_ano', mesAno);

      if (error) {
        throw error;
      }
      return (data || []).map(d => d.cartao_id);
    } catch (e) {
      console.error('[FinanceService] getCartoesPagos database error:', e);
      // Fallback to localStorage
      try {
        const localData = localStorage.getItem(`financas_cartoes_pagos_${mesAno}`);
        return localData ? JSON.parse(localData) : [];
      } catch (err) {
        return [];
      }
    }
  }

  async setCartaoPago(cartaoId: string, mesAno: string, pago: boolean): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };

      if (pago) {
        const { error } = await supabase
          .from('cartoes_pagos')
          .upsert({
            user_id: sessao.user.id,
            cartao_id: cartaoId,
            mes_ano: mesAno
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cartoes_pagos')
          .delete()
          .eq('user_id', sessao.user.id)
          .eq('cartao_id', cartaoId)
          .eq('mes_ano', mesAno);
        if (error) throw error;
      }

      // Sincroniza com a tarefa de vencimento vinculada na agenda, se houver.
      const { data: vinculo } = await supabase
        .from('cartoes_vencimento_tarefas')
        .select('tarefa_id')
        .eq('user_id', sessao.user.id)
        .eq('cartao_id', cartaoId)
        .eq('mes_ano', mesAno)
        .maybeSingle();

      if (vinculo?.tarefa_id) {
        await supabase
          .from('tarefas')
          .update({ concluida: pago })
          .eq('id', vinculo.tarefa_id)
          .eq('usuario_id', sessao.user.id);
      }

      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] setCartaoPago database error:', e);
      // Fallback to localStorage
      try {
        const localKey = `financas_cartoes_pagos_${mesAno}`;
        const localData = localStorage.getItem(localKey);
        let pagos = localData ? JSON.parse(localData) : [];
        if (pago) {
          if (!pagos.includes(cartaoId)) pagos.push(cartaoId);
        } else {
          pagos = pagos.filter((id: string) => id !== cartaoId);
        }
        localStorage.setItem(localKey, JSON.stringify(pagos));
        return { ok: true };
      } catch (err: any) {
        return { ok: false, erro: err.message };
      }
    }
  }

  async garantirRendaMes(mesAno: string): Promise<Rendas | null> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return null;

      const { data: existe, error: erroBusca } = await supabase
        .from('rendas')
        .select('*')
        .eq('mes_ano', mesAno)
        .eq('user_id', sessao.user.id)
        .maybeSingle();

      if (erroBusca) throw erroBusca;
      if (existe) return existe;

      // Copia do mês anterior se houver
      const { data: anterior } = await supabase
        .from('rendas')
        .select('*')
        .eq('user_id', sessao.user.id)
        .lt('mes_ano', mesAno)
        .order('mes_ano', { ascending: false })
        .limit(1)
        .maybeSingle();

      const base = anterior
        ? {
            salario: anterior.salario,
            decimo: 0,
            premio: 0,
            outros: 0,
            cheque_especial: anterior.cheque_especial || 0,
            va_total: anterior.va_total,
            va_gasto: 0,
            va_restante: anterior.va_total
          }
        : {
            salario: 0,
            decimo: 0,
            premio: 0,
            outros: 0,
            cheque_especial: 0,
            va_total: 0,
            va_gasto: 0,
            va_restante: 0
          };

      const { data: novo, error } = await supabase
        .from('rendas')
        .insert({ mes_ano: mesAno, user_id: sessao.user.id, ...base })
        .select()
        .single();
      if (error) throw error;
      return novo;
    } catch (e) {
      console.error('[FinanceService] garantirRendaMes:', e);
      return null;
    }
  }

  async getRendas(mesAno: string): Promise<Rendas | null> {
    return this.garantirRendaMes(mesAno);
  }

  async atualizarRendas(mesAno: string, r: Partial<Rendas>): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };

      const vaRestante = (r.va_total ?? 0) - (r.va_gasto ?? 0);

      const { error } = await supabase
        .from('rendas')
        .upsert({
          mes_ano: mesAno,
          user_id: sessao.user.id,
          salario: r.salario ?? 0,
          decimo: r.decimo ?? 0,
          premio: r.premio ?? 0,
          outros: r.outros ?? 0,
          cheque_especial: r.cheque_especial ?? 0,
          va_total: r.va_total ?? 0,
          va_gasto: r.va_gasto ?? 0,
          va_restante: vaRestante,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'user_id,mes_ano' });
      if (error) throw error;
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] atualizarRendas:', e);
      return { ok: false, erro: e.message };
    }
  }

  async getTransacoesPorMes(mesAno: string): Promise<Transacao[]> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return [];
      const { data, error } = await supabase
        .from('transacoes')
        .select('*, cartoes(nome, cor)')
        .eq('mes_ano', mesAno)
        .eq('user_id', sessao.user.id)
        .order('criado_em');
      if (error) throw error;
      return (data as any) || [];
    } catch (e) {
      console.error('[FinanceService] getTransacoesPorMes:', e);
      return [];
    }
  }

  async adicionarCompra(
    cartaoId: string,
    descricao: string,
    valorParcela: number,
    parcelas: number,
    mesAnoInicial: string
  ): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };

      const grupoId = crypto.randomUUID();
      const valor = parseFloat(valorParcela.toFixed(2));
      const [ano, mes] = mesAnoInicial.split('-').map(Number);

      const linhas = [];
      for (let i = 0; i < parcelas; i++) {
        const d = new Date(ano, mes - 1 + i);
        const mesAno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        await this.garantirRendaMes(mesAno);
        linhas.push({
          id: crypto.randomUUID(),
          grupo_id: grupoId,
          cartao_id: cartaoId,
          user_id: sessao.user.id,
          descricao: descricao.trim(),
          valor: valor,
          valor_total: valor * parcelas,
          parcela_atual: i + 1,
          total_parcelas: parcelas,
          mes_ano: mesAno,
        });
      }

      const { error } = await supabase.from('transacoes').insert(linhas);
      if (error) throw error;
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] adicionarCompra:', e);
      return { ok: false, erro: e.message };
    }
  }

  async removerTransacao(id: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      const { error } = await supabase
        .from('transacoes')
        .delete()
        .eq('id', id)
        .eq('user_id', sessao.user.id);
      if (error) throw error;
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] removerTransacao:', e);
      return { ok: false, erro: e.message };
    }
  }

  async removerCompraInteira(grupoId: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      const { error } = await supabase
        .from('transacoes')
        .delete()
        .eq('grupo_id', grupoId)
        .eq('user_id', sessao.user.id);
      if (error) throw error;
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] removerCompraInteira:', e);
      return { ok: false, erro: e.message };
    }
  }

  async getOutrosGastos(mesAno: string): Promise<OutroGasto[]> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return [];
      const { data, error } = await supabase
        .from('outros_gastos')
        .select('*')
        .eq('mes_ano', mesAno)
        .eq('user_id', sessao.user.id)
        .order('criado_em', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[FinanceService] getOutrosGastos:', e);
      return [];
    }
  }

  async adicionarOutroGasto(descricao: string, valor: number, mesAno: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      await this.garantirRendaMes(mesAno);
      const { error } = await supabase.from('outros_gastos').insert({
        id: crypto.randomUUID(),
        descricao: descricao.trim(),
        valor: valor,
        mes_ano: mesAno,
        user_id: sessao.user.id,
      });
      if (error) throw error;
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] adicionarOutroGasto:', e);
      return { ok: false, erro: e.message };
    }
  }

  async removerOutroGasto(id: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      const { error } = await supabase
        .from('outros_gastos')
        .delete()
        .eq('id', id)
        .eq('user_id', sessao.user.id);
      if (error) throw error;
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] removerOutroGasto:', e);
      return { ok: false, erro: e.message };
    }
  }

  /** Monta a data (YYYY-MM-DD) do vencimento a partir de mes_ano + dia_vencimento. */
  private montarDataVencimento(mesAno: string, diaVencimento: number): string {
    const [ano, mes] = mesAno.split('-').map(Number);
    // Garante um dia válido mesmo em meses curtos (ex: dia 31 em fevereiro cai no último dia do mês)
    const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
    const dia = Math.min(diaVencimento, ultimoDiaDoMes);
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  /**
   * Cria, atualiza ou remove a tarefa vinculada de um gasto fixo na agenda,
   * de acordo com o dia_vencimento informado. Retorna o id da tarefa vinculada
   * (ou null se o vínculo foi removido). Nunca lança erro para quem chama —
   * uma falha aqui não deve impedir o salvamento do gasto fixo em si.
   */
  private async sincronizarTarefaDoGasto(
    gastoId: string,
    descricao: string,
    valor: number,
    mesAno: string,
    diaVencimento: number | null | undefined,
    tarefaIdAtual: string | null | undefined,
    pago: boolean
  ): Promise<string | null> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return tarefaIdAtual ?? null;

      // Sem dia de vencimento: remove a tarefa vinculada, se existir, e encerra.
      if (!diaVencimento) {
        if (tarefaIdAtual) {
          await supabase.from('tarefas').delete().eq('id', tarefaIdAtual).eq('usuario_id', sessao.user.id);
        }
        return null;
      }

      const dataAgendamento = this.montarDataVencimento(mesAno, diaVencimento);
      const titulo = `💰 ${descricao}`;
      const descricaoTarefa = `Vencimento: R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      if (tarefaIdAtual) {
        const { error } = await supabase
          .from('tarefas')
          .update({
            titulo,
            descricao: descricaoTarefa,
            data_agendamento: dataAgendamento,
            concluida: pago,
            categoria: 'financeiro',
            gasto_fixo_id: gastoId,
          })
          .eq('id', tarefaIdAtual)
          .eq('usuario_id', sessao.user.id);
        if (!error) return tarefaIdAtual;
        // Se a atualização falhar (ex: tarefa foi apagada manualmente), cai para criar uma nova abaixo.
      }

      const { data: novaTarefa, error: erroInsert } = await supabase
        .from('tarefas')
        .insert({
          usuario_id: sessao.user.id,
          data_agendamento: dataAgendamento,
          bloco_inicio_id: 0,
          quantidade_blocos: 1,
          titulo,
          descricao: descricaoTarefa,
          concluida: pago,
          categoria: 'financeiro',
          gasto_fixo_id: gastoId,
        })
        .select('id')
        .single();

      if (erroInsert) throw erroInsert;
      return novaTarefa?.id ?? null;
    } catch (e) {
      console.error('[FinanceService] sincronizarTarefaDoGasto:', e);
      return tarefaIdAtual ?? null;
    }
  }

  /**
   * Chamada pela agenda ao concluir/reabrir uma tarefa vinculada a um gasto fixo
   * (task.gasto_fixo_id). Atualiza o campo `pago` do gasto correspondente.
   * Não faz nada se a tarefa não tiver vínculo — seguro de chamar sempre.
   */
  async sincronizarGastoFixoDaTarefa(gastoFixoId: string, concluida: boolean): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      const { error } = await supabase
        .from('gastos_fixos')
        .update({ pago: concluida })
        .eq('id', gastoFixoId)
        .eq('user_id', sessao.user.id);
      if (error) throw error;
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] sincronizarGastoFixoDaTarefa:', e);
      return { ok: false, erro: e.message };
    }
  }

  /**
   * Garante que exista, para o mês informado, uma tarefa na agenda lembrando
   * do vencimento do cartão (quando ele tiver dia_vencimento definido).
   * Cria ou atualiza a tarefa e o vínculo em cartoes_vencimento_tarefas.
   * Não faz nada (e não lança erro) se o cartão não tiver dia_vencimento.
   * Seguro de chamar sempre — é idempotente por mês/cartão.
   */
  async sincronizarVencimentoCartao(
    cartao: { id: string; nome: string; dia_vencimento?: number | null },
    mesAno: string,
    valorFatura: number,
    pago: boolean
  ): Promise<void> {
    try {
      if (!cartao.dia_vencimento) return;
      const sessao = await this.getSessao();
      if (!sessao) return;

      const { data: vinculo } = await supabase
        .from('cartoes_vencimento_tarefas')
        .select('tarefa_id')
        .eq('user_id', sessao.user.id)
        .eq('cartao_id', cartao.id)
        .eq('mes_ano', mesAno)
        .maybeSingle();

      const dataAgendamento = this.montarDataVencimento(mesAno, cartao.dia_vencimento);
      const titulo = `💳 Fatura ${cartao.nome}`;
      const descricaoTarefa = `Vencimento: R$ ${valorFatura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      if (vinculo?.tarefa_id) {
        await supabase
          .from('tarefas')
          .update({
            titulo,
            descricao: descricaoTarefa,
            data_agendamento: dataAgendamento,
            concluida: pago,
            categoria: 'financeiro',
            cartao_id: cartao.id,
          })
          .eq('id', vinculo.tarefa_id)
          .eq('usuario_id', sessao.user.id);
        return;
      }

      const { data: novaTarefa, error: erroInsert } = await supabase
        .from('tarefas')
        .insert({
          usuario_id: sessao.user.id,
          data_agendamento: dataAgendamento,
          bloco_inicio_id: 0,
          quantidade_blocos: 1,
          titulo,
          descricao: descricaoTarefa,
          concluida: pago,
          categoria: 'financeiro',
          cartao_id: cartao.id,
        })
        .select('id')
        .single();

      if (erroInsert) throw erroInsert;
      if (novaTarefa?.id) {
        await supabase.from('cartoes_vencimento_tarefas').insert({
          user_id: sessao.user.id,
          cartao_id: cartao.id,
          mes_ano: mesAno,
          tarefa_id: novaTarefa.id,
        });
      }
    } catch (e) {
      console.error('[FinanceService] sincronizarVencimentoCartao:', e);
    }
  }

  /**
   * Chamada pela agenda ao concluir/reabrir uma tarefa de vencimento de
   * cartão (task.cartao_id). Atualiza o status "pago" desse cartão no mês
   * em que a tarefa está agendada. Seguro de chamar sempre.
   */
  async sincronizarCartaoPagoDaTarefa(cartaoId: string, dataAgendamento: string, concluida: boolean): Promise<{ ok: boolean; erro?: string }> {
    const mesAno = dataAgendamento.slice(0, 7);
    return this.setCartaoPago(cartaoId, mesAno, concluida);
  }

  async getGastosFixos(mesAno: string): Promise<GastoFixo[]> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return [];
      const { data, error } = await supabase
        .from('gastos_fixos')
        .select('*')
        .eq('mes_ano', mesAno)
        .eq('user_id', sessao.user.id)
        .eq('ativo', true)
        .order('criado_em');
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[FinanceService] getGastosFixos:', e);
      return [];
    }
  }

  async setGastoFixoPago(id: string, pago: boolean): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };

      const { error } = await supabase
        .from('gastos_fixos')
        .update({ pago })
        .eq('id', id)
        .eq('user_id', sessao.user.id);

      if (error) throw error;

      // Sincroniza com a tarefa vinculada na agenda, se houver.
      const { data: atual } = await supabase
        .from('gastos_fixos')
        .select('tarefa_id')
        .eq('id', id)
        .eq('user_id', sessao.user.id)
        .maybeSingle();

      if (atual?.tarefa_id) {
        await supabase
          .from('tarefas')
          .update({ concluida: pago })
          .eq('id', atual.tarefa_id)
          .eq('usuario_id', sessao.user.id);
      }

      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] setGastoFixoPago error:', e);
      return { ok: false, erro: e.message };
    }
  }

  async adicionarGastoFixo(
    descricao: string,
    valor: number,
    mesAno: string,
    diaVencimento?: number | null
  ): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      const id = crypto.randomUUID();
      const { error } = await supabase.from('gastos_fixos').insert({
        id,
        descricao: descricao.trim(),
        valor: valor,
        mes_ano: mesAno,
        user_id: sessao.user.id,
        ativo: true,
        dia_vencimento: diaVencimento ?? null,
      });
      if (error) throw error;

      if (diaVencimento) {
        const tarefaId = await this.sincronizarTarefaDoGasto(
          id, descricao.trim(), valor, mesAno, diaVencimento, null, false
        );
        if (tarefaId) {
          await supabase.from('gastos_fixos').update({ tarefa_id: tarefaId }).eq('id', id);
        }
      }

      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] adicionarGastoFixo:', e);
      return { ok: false, erro: e.message };
    }
  }

  async editarGastoFixo(
    id: string,
    descricao: string,
    valor: number,
    diaVencimento?: number | null
  ): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };

      const { data: atual, error: erroBusca } = await supabase
        .from('gastos_fixos')
        .select('mes_ano, tarefa_id, pago, dia_vencimento')
        .eq('id', id)
        .eq('user_id', sessao.user.id)
        .single();
      if (erroBusca) throw erroBusca;

      // Se o campo não foi informado, preserva o valor atual (mantém compatibilidade
      // com chamadas antigas que só passam descrição/valor).
      const diaFinal = diaVencimento !== undefined ? diaVencimento : atual?.dia_vencimento ?? null;

      const { error } = await supabase
        .from('gastos_fixos')
        .update({
          descricao: descricao.trim(),
          valor: valor,
          dia_vencimento: diaFinal,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', sessao.user.id);
      if (error) throw error;

      const tarefaId = await this.sincronizarTarefaDoGasto(
        id, descricao.trim(), valor, atual.mes_ano, diaFinal, atual?.tarefa_id, atual?.pago ?? false
      );
      if (tarefaId !== atual?.tarefa_id) {
        await supabase.from('gastos_fixos').update({ tarefa_id: tarefaId }).eq('id', id);
      }

      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] editarGastoFixo:', e);
      return { ok: false, erro: e.message };
    }
  }

  async removerGastoFixo(id: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };

      const { data: atual } = await supabase
        .from('gastos_fixos')
        .select('tarefa_id')
        .eq('id', id)
        .eq('user_id', sessao.user.id)
        .maybeSingle();

      const { error } = await supabase
        .from('gastos_fixos')
        .update({ ativo: false, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', sessao.user.id);
      if (error) throw error;

      if (atual?.tarefa_id) {
        await supabase.from('tarefas').delete().eq('id', atual.tarefa_id).eq('usuario_id', sessao.user.id);
      }

      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] removerGastoFixo:', e);
      return { ok: false, erro: e.message };
    }
  }

  async copiarGastosFixosMesAnterior(mesAno: string): Promise<{ ok: boolean; copiados?: number; erro?: string }> {
    try {
      const { data, error } = await supabase.rpc('copiar_gastos_fixos_mes_anterior', {
        p_mes_ano: mesAno,
      });
      if (error) throw error;

      // Gera as tarefas na agenda para os gastos recém-copiados que já têm
      // dia_vencimento definido (a RPC copia o dia, mas nunca o tarefa_id).
      const sessao = await this.getSessao();
      if (sessao) {
        const { data: novos } = await supabase
          .from('gastos_fixos')
          .select('id, descricao, valor, dia_vencimento, pago, tarefa_id')
          .eq('user_id', sessao.user.id)
          .eq('mes_ano', mesAno)
          .not('dia_vencimento', 'is', null)
          .is('tarefa_id', null);

        for (const g of novos || []) {
          const tarefaId = await this.sincronizarTarefaDoGasto(
            g.id, g.descricao, Number(g.valor), mesAno, g.dia_vencimento, null, g.pago
          );
          if (tarefaId) {
            await supabase.from('gastos_fixos').update({ tarefa_id: tarefaId }).eq('id', g.id);
          }
        }
      }

      return { ok: true, copiados: data || 0 };
    } catch (e: any) {
      console.error('[FinanceService] copiarGastosFixosMesAnterior:', e);
      return { ok: false, erro: e.message };
    }
  }

  async calcularTotais(mesAno: string): Promise<TotaisFinanceiros | null> {
    try {
      const [rendas, cartoes, transacoes, outrosGastos, gastosFixos, cartoesPagos] = await Promise.all([
        this.getRendas(mesAno),
        this.getCartoes(),
        this.getTransacoesPorMes(mesAno),
        this.getOutrosGastos(mesAno),
        this.getGastosFixos(mesAno),
        this.getCartoesPagos(mesAno),
      ]);

      const gastosCartoes = transacoes.reduce((a, t) => a + Number(t.valor), 0);
      const gastosOutros = outrosGastos.reduce((a, g) => a + Number(g.valor), 0);
      const gastosFixosTot = gastosFixos.reduce((a, g) => a + Number(g.valor), 0);
      const gastosTotais = gastosCartoes + gastosOutros + gastosFixosTot;
      const chequeEspecial = rendas ? Number(rendas.cheque_especial || 0) : 0;
      const rendaTotal = rendas
        ? Number(rendas.salario) + Number(rendas.decimo) + Number(rendas.premio) + Number(rendas.outros)
        : 0;

      return {
        rendaTotal,
        chequeEspecial,
        restante: rendaTotal - gastosTotais - chequeEspecial,
        gastosTotais,
        gastosCartoes,
        vaTotal: rendas ? Number(rendas.va_total) : 0,
        vaGasto: rendas ? Number(rendas.va_gasto) : 0,
        vaRestante: rendas ? Number(rendas.va_restante) : 0,
        gastosOutros,
        gastosFixosTot,
        porCartao: cartoes.map(c => ({
          id: c.id,
          cartao: c.nome,
          cor: c.cor,
          pago: cartoesPagos.includes(c.id),
          total: transacoes
            .filter(t => t.cartao_id === c.id)
            .reduce((s, t) => s + Number(t.valor), 0),
        })),
      };
    } catch (e) {
      console.error('[FinanceService] calcularTotais:', e);
      return null;
    }
  }

  async getMaxMesAno(): Promise<string | null> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return null;
      const { data } = await supabase
        .from('rendas')
        .select('mes_ano')
        .eq('user_id', sessao.user.id)
        .order('mes_ano', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? data.mes_ano : null;
    } catch (e) {
      return null;
    }
  }

  assinarRealtime(onMudanca: () => void) {
    let debounce: any = null;
    const cb = () => {
      clearTimeout(debounce);
      debounce = setTimeout(onMudanca, 300);
    };
    
    const channel = supabase
      .channel('financas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rendas' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transacoes' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outros_gastos' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartoes' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_fixos' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartoes_pagos' }, cb)
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }

  async exportarDados() {
    const { data, error } = await supabase.rpc('exportar_meus_dados');
    if (error) return { ok: false, erro: error.message };
    return { ok: true, dados: data };
  }

  async excluirConta() {
    const { error } = await supabase.rpc('excluir_minha_conta');
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  }

  async getConexoes() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];

    const { data, error } = await supabase
      .from('conexoes')
      .select('*');
    
    if (error) return [];
    return data;
  }

  async enviarConvite(receptorEmail: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { ok: false, erro: 'Sessão expirada.' };

    const emailLimpo = receptorEmail.trim().toLowerCase();
    if (emailLimpo === session.user.email?.toLowerCase()) {
      return { ok: false, erro: 'Você não pode enviar um convite para si mesmo.' };
    }

    const { data, error } = await supabase
      .from('conexoes')
      .insert({
        solicitante_id: session.user.id,
        solicitante_email: session.user.email || '',
        receptor_email: emailLimpo,
        status: 'pendente'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { ok: false, erro: 'Já existe uma solicitação ou conexão com este e-mail.' };
      }
      return { ok: false, erro: error.message };
    }
    return { ok: true, conexao: data };
  }

  async responderConvite(conexaoId: string, status: 'aceito' | 'bloqueado' | 'recusado') {
    if (status === 'recusado') {
      const { error } = await supabase
        .from('conexoes')
        .delete()
        .eq('id', conexaoId);
      if (error) return { ok: false, erro: error.message };
      return { ok: true };
    }

    const { error } = await supabase
      .from('conexoes')
      .update({ status })
      .eq('id', conexaoId);

    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  }

  async removerConexao(conexaoId: string) {
    const { error } = await supabase
      .from('conexoes')
      .delete()
      .eq('id', conexaoId);

    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  }

  /**
   * Retorna um retrospecto mensal (somente leitura) dos últimos `quantidadeMeses`,
   * incluindo o mês atual. Não cria nem altera nenhum registro no banco —
   * diferente de calcularTotais/garantirRendaMes, que gravam uma linha de
   * renda caso o mês ainda não exista.
   */
  async getHistoricoMeses(quantidadeMeses: number = 6): Promise<{
    mesAno: string;
    label: string;
    rendaTotal: number;
    gastosCartoes: number;
    gastosFixos: number;
    gastosOutros: number;
    gastosTotais: number;
    saldo: number;
  }[]> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return [];

      const hoje = new Date();
      const meses: string[] = [];
      for (let i = quantidadeMeses - 1; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const mesMaisAntigo = meses[0];

      const [rendasRes, transacoesRes, gastosFixosRes, outrosGastosRes] = await Promise.all([
        supabase
          .from('rendas')
          .select('mes_ano, salario, decimo, premio, outros')
          .eq('user_id', sessao.user.id)
          .gte('mes_ano', mesMaisAntigo),
        supabase
          .from('transacoes')
          .select('mes_ano, valor')
          .eq('user_id', sessao.user.id)
          .gte('mes_ano', mesMaisAntigo),
        supabase
          .from('gastos_fixos')
          .select('mes_ano, valor')
          .eq('user_id', sessao.user.id)
          .gte('mes_ano', mesMaisAntigo),
        supabase
          .from('outros_gastos')
          .select('mes_ano, valor')
          .eq('user_id', sessao.user.id)
          .gte('mes_ano', mesMaisAntigo),
      ]);

      const rendas = rendasRes.data || [];
      const transacoes = transacoesRes.data || [];
      const gastosFixos = gastosFixosRes.data || [];
      const outrosGastos = outrosGastosRes.data || [];

      return meses.map((mesAno) => {
        const renda = rendas.find((r) => r.mes_ano === mesAno);
        const rendaTotal = renda
          ? Number(renda.salario || 0) + Number(renda.decimo || 0) + Number(renda.premio || 0) + Number(renda.outros || 0)
          : 0;

        const gastosCartoes = transacoes
          .filter((t) => t.mes_ano === mesAno)
          .reduce((s, t) => s + Number(t.valor), 0);
        const gastosFixosTot = gastosFixos
          .filter((g) => g.mes_ano === mesAno)
          .reduce((s, g) => s + Number(g.valor), 0);
        const gastosOutrosTot = outrosGastos
          .filter((g) => g.mes_ano === mesAno)
          .reduce((s, g) => s + Number(g.valor), 0);

        const gastosTotais = gastosCartoes + gastosFixosTot + gastosOutrosTot;
        const [ano, mes] = mesAno.split('-').map(Number);
        const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

        return {
          mesAno,
          label,
          rendaTotal,
          gastosCartoes,
          gastosFixos: gastosFixosTot,
          gastosOutros: gastosOutrosTot,
          gastosTotais,
          saldo: rendaTotal - gastosTotais,
        };
      });
    } catch (e) {
      console.error('[FinanceService] getHistoricoMeses:', e);
      return [];
    }
  }

  /**
   * Soma, por mês futuro, o valor das parcelas de cartão já lançadas
   * (comprometidas) a partir do mês atual (inclusive). Somente leitura.
   */
  async getParcelasFuturas(): Promise<{
    mesAno: string;
    label: string;
    total: number;
  }[]> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return [];

      const hoje = new Date();
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('transacoes')
        .select('mes_ano, valor')
        .eq('user_id', sessao.user.id)
        .gte('mes_ano', mesAtual)
        .order('mes_ano', { ascending: true });

      if (error) throw error;

      const porMes = new Map<string, number>();
      (data || []).forEach((t) => {
        porMes.set(t.mes_ano, (porMes.get(t.mes_ano) || 0) + Number(t.valor));
      });

      return Array.from(porMes.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mesAno, total]) => {
          const [ano, mes] = mesAno.split('-').map(Number);
          const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
          return { mesAno, label, total };
        });
    } catch (e) {
      console.error('[FinanceService] getParcelasFuturas:', e);
      return [];
    }
  }

  async criarTarefaCompartilhada(
    receptorId: string,
    data: string,
    blocoInicioId: number,
    quantidadeBlocos: number,
    titulo: string,
    descricao: string,
    categoria: string
  ) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { ok: false, erro: 'Sessão expirada.' };

    const { data: resData, error } = await supabase.rpc('criar_tarefa_compartilhada', {
      p_receptor_id: receptorId,
      p_data: data,
      p_bloco_inicio_id: blocoInicioId,
      p_quantidade_blocos: quantidadeBlocos,
      p_titulo: titulo,
      p_descricao: descricao,
      p_categoria: categoria,
      p_remetente_email: session.user.email
    });

    if (error) return { ok: false, erro: error.message };
    
    const result = resData as { ok: boolean; erro?: string; id?: string };
    if (!result.ok) return { ok: false, erro: result.erro };
    return { ok: true, id: result.id };
  }
}

export const financeService = new FinanceService();
