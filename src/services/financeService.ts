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
        });
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
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] setGastoFixoPago error:', e);
      return { ok: false, erro: e.message };
    }
  }

  async adicionarGastoFixo(descricao: string, valor: number, mesAno: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      const { error } = await supabase.from('gastos_fixos').insert({
        id: crypto.randomUUID(),
        descricao: descricao.trim(),
        valor: valor,
        mes_ano: mesAno,
        user_id: sessao.user.id,
        ativo: true,
      });
      if (error) throw error;
      return { ok: true };
    } catch (e: any) {
      console.error('[FinanceService] adicionarGastoFixo:', e);
      return { ok: false, erro: e.message };
    }
  }

  async editarGastoFixo(id: string, descricao: string, valor: number): Promise<{ ok: boolean; erro?: string }> {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return { ok: false, erro: 'Sem sessão' };
      const { error } = await supabase
        .from('gastos_fixos')
        .update({
          descricao: descricao.trim(),
          valor: valor,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', sessao.user.id);
      if (error) throw error;
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
      const { error } = await supabase
        .from('gastos_fixos')
        .update({ ativo: false, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', sessao.user.id);
      if (error) throw error;
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
}

export const financeService = new FinanceService();
