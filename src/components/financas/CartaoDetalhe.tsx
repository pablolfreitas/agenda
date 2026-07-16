import React, { useEffect, useState, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import type { Transacao } from '../../services/financeService';
import { Trash2, Plus, Calendar, CheckCircle, Circle } from 'lucide-react';
import './CartaoDetalhe.css';

interface CartaoDetalheProps {
  cartaoId: string;
  nomeCartao: string;
  mesAno: string;
  onClose: () => void;
  onUpdate: () => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (msg: string, onSim: () => void) => void;
}

export const CartaoDetalhe: React.FC<CartaoDetalheProps> = ({
  cartaoId,
  nomeCartao,
  mesAno,
  onClose,
  onUpdate,
  toast,
  confirmar,
}) => {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [pago, setPago] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form fields for new purchase
  const [descricao, setDescricao] = useState('');
  const [valorParcela, setValorParcela] = useState('');
  const [parcelas, setParcelas] = useState('1');
  const [mesInicial, setMesInicial] = useState(mesAno);
  const [formOpen, setFormOpen] = useState(false);

  const fetchDetalhes = useCallback(async () => {
    const [allTrans, pagos] = await Promise.all([
      financeService.getTransacoesPorMes(mesAno),
      financeService.getCartoesPagos(mesAno),
    ]);

    const filtered = allTrans.filter((t) => t.cartao_id === cartaoId);
    setTransacoes(filtered);
    setPago(pagos.includes(cartaoId));
  }, [cartaoId, mesAno]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDetalhes();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDetalhes]);

  const handleTogglePago = async () => {
    const novoEstado = !pago;
    setPago(novoEstado);
    const res = await financeService.setCartaoPago(cartaoId, mesAno, novoEstado);
    if (res.ok) {
      toast(novoEstado ? 'Fatura marcada como paga!' : 'Fatura marcada como pendente.');
      onUpdate();
    } else {
      setPago(!novoEstado); // rollback
      toast(res.erro || 'Erro ao alterar status.', 'erro');
    }
  };

  const handleAddCompra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim() || !valorParcela) return;

    setLoading(true);
    const res = await financeService.adicionarCompra(
      cartaoId,
      descricao,
      parseFloat(valorParcela),
      parseInt(parcelas) || 1,
      mesInicial
    );

    setLoading(false);
    if (res.ok) {
      toast('Compra adicionada!');
      setDescricao('');
      setValorParcela('');
      setParcelas('1');
      setFormOpen(false);
      fetchDetalhes();
      onUpdate();
    } else {
      toast(res.erro || 'Erro ao adicionar compra.', 'erro');
    }
  };

  const handleDeleteParcela = (id: string, desc: string) => {
    confirmar(`Deseja excluir a parcela desta compra ("${desc}")?`, async () => {
      const res = await financeService.removerTransacao(id);
      if (res.ok) {
        toast('Parcela excluída.');
        fetchDetalhes();
        onUpdate();
      } else {
        toast(res.erro || 'Erro ao excluir.', 'erro');
      }
    });
  };

  const handleDeleteCompraInteira = (grupoId: string, desc: string) => {
    confirmar(`Esta compra possui parcelas. Deseja excluir TODAS as parcelas de "${desc}"?`, async () => {
      const res = await financeService.removerCompraInteira(grupoId);
      if (res.ok) {
        toast('Compra inteira excluída.');
        fetchDetalhes();
        onUpdate();
      } else {
        toast(res.erro || 'Erro ao excluir.', 'erro');
      }
    });
  };

  const totalCard = transacoes.reduce((sum, t) => sum + Number(t.valor), 0);

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>←</button>
        <h3>Fatura: {nomeCartao}</h3>
      </div>

      <div className="card-detail-summary card">
        <div className="detail-total-row">
          <div>
            <div className="detail-label">Total no mês</div>
            <div className="detail-value">
              R$ {totalCard.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <button
            className={`btn-pay-status ${pago ? 'paid' : 'pending'}`}
            onClick={handleTogglePago}
          >
            {pago ? <CheckCircle size={15} /> : <Circle size={15} />}
            {pago ? 'Fatura Paga' : 'Faturado'}
          </button>
        </div>
      </div>

      {formOpen ? (
        <form onSubmit={handleAddCompra} className="card-detail-form card">
          <h4>Nova Compra</h4>
          <div className="input-group">
            <label>Descrição</label>
            <input
              type="text"
              required
              placeholder="Ex: Supermercado"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="row-duo">
            <div className="input-group" style={{ flex: 2 }}>
              <label>Valor da Parcela (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={valorParcela}
                onChange={(e) => setValorParcela(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label>Parcelas</label>
              <input
                type="number"
                min="1"
                max="72"
                required
                value={parcelas}
                onChange={(e) => setParcelas(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="input-group">
            <label>Mês Inicial</label>
            <input
              type="month"
              required
              value={mesInicial}
              onChange={(e) => setMesInicial(e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-cancel"
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="btn-add-submit">
              {loading ? 'Salvando...' : 'Salvar Compra'}
            </button>
          </div>
        </form>
      ) : (
        <button className="btn-add-compra" onClick={() => setFormOpen(true)}>
          <Plus size={16} /> Nova Compra
        </button>
      )}

      <div className="purchases-list">
        <h4>Compras Lançadas</h4>
        {transacoes.length === 0 ? (
          <div className="empty-msg">Nenhuma compra lançada nesta fatura.</div>
        ) : (
          transacoes.map((t) => (
            <div key={t.id} className="purchase-item card">
              <div className="purchase-info">
                <span className="purchase-desc">{t.descricao}</span>
                <span className="purchase-meta">
                  {t.total_parcelas > 1 ? (
                    <span className="badge-parcela">Parcela {t.parcela_atual}/{t.total_parcelas}</span>
                  ) : null}
                  <span className="purchase-date">
                    <Calendar size={11} /> {new Date(t.criado_em).toLocaleDateString('pt-BR')}
                  </span>
                </span>
              </div>
              <div className="purchase-right">
                <span className="purchase-val">
                  R$ {Number(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                
                <div className="purchase-actions">
                  <button
                    className="action-btn-danger"
                    title="Excluir esta parcela"
                    onClick={() => handleDeleteParcela(t.id, t.descricao)}
                  >
                    <Trash2 size={14} />
                  </button>
                  {t.total_parcelas > 1 && (
                    <button
                      className="action-btn-danger-all"
                      title="Excluir todas as parcelas desta compra"
                      onClick={() => handleDeleteCompraInteira(t.grupo_id, t.descricao)}
                    >
                      Excluir Compra
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
