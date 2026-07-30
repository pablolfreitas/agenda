import React, { useEffect, useState, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import type { GastoFixo } from '../../services/financeService';
import { Trash2, Edit2, CheckCircle, Circle, Copy, Calendar } from 'lucide-react';

interface GastosFixosProps {
  mesAno: string;
  onClose: () => void;
  onUpdate: () => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (msg: string, onSim: () => void) => void;
}

export const GastosFixos: React.FC<GastosFixosProps> = ({
  mesAno,
  onClose,
  onUpdate,
  toast,
  confirmar,
}) => {
  const [gastos, setGastos] = useState<GastoFixo[]>([]);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('');
  const [loading, setLoading] = useState(false);

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editValor, setEditValor] = useState('');
  const [editDiaVencimento, setEditDiaVencimento] = useState('');

  const fetchGastos = useCallback(async () => {
    const list = await financeService.getGastosFixos(mesAno);
    setGastos(list);
  }, [mesAno]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGastos();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchGastos]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim() || !valor) return;

    setLoading(true);
    const dia = diaVencimento ? parseInt(diaVencimento, 10) : null;
    const res = await financeService.adicionarGastoFixo(descricao, parseFloat(valor), mesAno, dia);
    setLoading(false);

    if (res.ok) {
      toast('Gasto fixo cadastrado!');
      setDescricao('');
      setValor('');
      setDiaVencimento('');
      fetchGastos();
      onUpdate();
    } else {
      toast(res.erro || 'Erro ao cadastrar.', 'erro');
    }
  };

  const handleTogglePago = async (id: string, pagoAtual: boolean) => {
    const res = await financeService.setGastoFixoPago(id, !pagoAtual);
    if (res.ok) {
      toast(!pagoAtual ? 'Gasto fixo pago!' : 'Gasto fixo pendente.');
      fetchGastos();
      onUpdate();
    } else {
      toast(res.erro || 'Erro ao alterar status.', 'erro');
    }
  };

  const handleRemove = (id: string, desc: string) => {
    confirmar(`Deseja realmente excluir o gasto fixo "${desc}"?`, async () => {
      const res = await financeService.removerGastoFixo(id);
      if (res.ok) {
        toast('Gasto fixo excluído.');
        fetchGastos();
        onUpdate();
      } else {
        toast(res.erro || 'Erro ao excluir.', 'erro');
      }
    });
  };

  const handleCopiar = async () => {
    const res = await financeService.copiarGastosFixosMesAnterior(mesAno);
    if (res.ok) {
      if (res.copiados && res.copiados > 0) {
        toast(`${res.copiados} gastos fixos copiados do mês anterior!`);
        fetchGastos();
        onUpdate();
      } else {
        toast('Nenhum gasto fixo para copiar ou o mês atual já possui lançamentos.');
      }
    } else {
      toast(res.erro || 'Erro ao copiar gastos.', 'erro');
    }
  };

  const handleStartEdit = (g: GastoFixo) => {
    setEditingId(g.id);
    setEditDesc(g.descricao);
    setEditValor(String(g.valor));
    setEditDiaVencimento(g.dia_vencimento ? String(g.dia_vencimento) : '');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editDesc.trim() || !editValor) return;
    const dia = editDiaVencimento ? parseInt(editDiaVencimento, 10) : null;
    const res = await financeService.editarGastoFixo(id, editDesc, parseFloat(editValor), dia);
    if (res.ok) {
      toast('Gasto fixo atualizado.');
      setEditingId(null);
      fetchGastos();
      onUpdate();
    } else {
      toast(res.erro || 'Erro ao editar.', 'erro');
    }
  };

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>←</button>
        <h3>Gastos Fixos</h3>
      </div>

      <div className="page-content">
        {gastos.length === 0 && (
          <button className="btn-add-compra" onClick={handleCopiar}>
            <Copy size={16} /> Copiar do mês anterior
          </button>
        )}

        <form onSubmit={handleAdd} className="finance-section-card card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Cadastrar Gasto Fixo</span>
          <div className="input-group">
            <label>Descrição</label>
            <input
              type="text"
              required
              placeholder="Ex: Conta de Luz"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="input-group">
            <label>Dia do vencimento (opcional)</label>
            <input
              type="number"
              min={1}
              max={31}
              placeholder="Ex: 10"
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              inputMode="numeric"
            />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Se preenchido, cria automaticamente um lembrete na agenda todo mês.
            </span>
          </div>
          <button type="submit" disabled={loading} className="save-btn" style={{ margin: 0 }}>
            Adicionar Gasto Fixo
          </button>
        </form>

        <div className="finance-section-card card">
          <span style={{ fontSize: '0.88rem', fontWeight: 700, display: 'block', marginBottom: '12px' }}>
            Lista de Gastos Fixos
          </span>
          {gastos.length === 0 ? (
            <div className="empty-msg">Nenhum gasto fixo cadastrado neste mês.</div>
          ) : (
            gastos.map((g) => (
              <div
                key={g.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {editingId === g.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                    <input
                      type="text"
                      className="input-inline"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      style={{ padding: '6px', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: '6px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={editValor}
                        onChange={(e) => setEditValor(e.target.value)}
                        style={{ padding: '6px', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: '6px', flex: 1 }}
                      />
                      <input
                        type="number"
                        min={1}
                        max={31}
                        placeholder="Dia venc."
                        value={editDiaVencimento}
                        onChange={(e) => setEditDiaVencimento(e.target.value)}
                        style={{ padding: '6px', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: '6px', width: '90px' }}
                      />
                      <button
                        className="btn-manage"
                        onClick={() => handleSaveEdit(g.id)}
                        style={{ background: 'var(--success)', color: '#fff' }}
                      >
                        Salvar
                      </button>
                      <button
                        className="btn-manage"
                        onClick={() => setEditingId(null)}
                        style={{ background: 'var(--border-strong)', color: 'var(--text-primary)' }}
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        style={{ background: 'none', border: 'none', color: g.pago ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                        onClick={() => handleTogglePago(g.id, g.pago)}
                      >
                        {g.pago ? <CheckCircle size={18} /> : <Circle size={18} />}
                      </button>
                      <span
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          textDecoration: g.pago ? 'line-through' : 'none',
                          color: g.pago ? 'var(--text-muted)' : 'var(--text-primary)',
                        }}
                      >
                        {g.descricao}
                      </span>
                      {g.dia_vencimento && (
                        <span
                          title={`Vence todo dia ${g.dia_vencimento} · lembrete na agenda`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                            background: 'var(--surface-soft)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          <Calendar size={10} /> dia {g.dia_vencimento}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          textDecoration: g.pago ? 'line-through' : 'none',
                          color: g.pago ? 'var(--text-muted)' : 'var(--text-primary)',
                        }}
                      >
                        R$ {Number(g.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      
                      <button
                        onClick={() => handleStartEdit(g)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                      >
                        <Edit2 size={14} />
                      </button>
                      
                      <button
                        onClick={() => handleRemove(g.id, g.descricao)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
