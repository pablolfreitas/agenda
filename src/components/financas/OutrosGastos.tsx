import React, { useEffect, useState, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import type { OutroGasto } from '../../services/financeService';
import { Trash2, Calendar } from 'lucide-react';

interface OutrosGastosProps {
  mesAno: string;
  onClose: () => void;
  onUpdate: () => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (msg: string, onSim: () => void) => void;
}

export const OutrosGastos: React.FC<OutrosGastosProps> = ({
  mesAno,
  onClose,
  onUpdate,
  toast,
  confirmar,
}) => {
  const [gastos, setGastos] = useState<OutroGasto[]>([]);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchGastos = useCallback(async () => {
    const list = await financeService.getOutrosGastos(mesAno);
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
    const res = await financeService.adicionarOutroGasto(descricao, parseFloat(valor), mesAno);
    setLoading(false);

    if (res.ok) {
      toast('Gasto adicionado!');
      setDescricao('');
      setValor('');
      fetchGastos();
      onUpdate();
    } else {
      toast(res.erro || 'Erro ao cadastrar.', 'erro');
    }
  };

  const handleRemove = (id: string, desc: string) => {
    confirmar(`Deseja realmente excluir o gasto "${desc}"?`, async () => {
      const res = await financeService.removerOutroGasto(id);
      if (res.ok) {
        toast('Gasto excluído.');
        fetchGastos();
        onUpdate();
      } else {
        toast(res.erro || 'Erro ao excluir.', 'erro');
      }
    });
  };

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>←</button>
        <h3>Outros Gastos</h3>
      </div>

      <div className="page-content">
        <form onSubmit={handleAdd} className="finance-section-card card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Cadastrar Gasto Avulso</span>
          <div className="input-group">
            <label>Descrição</label>
            <input
              type="text"
              required
              placeholder="Ex: Presente de aniversário"
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
          <button type="submit" disabled={loading} className="save-btn" style={{ margin: 0 }}>
            Adicionar Gasto
          </button>
        </form>

        <div className="finance-section-card card">
          <span style={{ fontSize: '0.88rem', fontWeight: 700, display: 'block', marginBottom: '12px' }}>
            Lista de Lançamentos
          </span>
          {gastos.length === 0 ? (
            <div className="empty-msg">Nenhum gasto avulso cadastrado neste mês.</div>
          ) : (
            gastos.map((g) => (
              <div
                key={g.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{g.descricao}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Calendar size={11} /> {new Date(g.criado_em).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>
                    R$ {Number(g.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <button
                    onClick={() => handleRemove(g.id, g.descricao)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
