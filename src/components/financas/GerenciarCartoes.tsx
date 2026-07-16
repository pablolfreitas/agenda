import React, { useEffect, useState, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import type { Cartao } from '../../services/financeService';
import { BANCOS } from '../../utils/bancos';
import { Trash2, Plus } from 'lucide-react';

interface GerenciarCartoesProps {
  onClose: () => void;
  onUpdate: () => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (msg: string, onSim: () => void) => void;
}

export const GerenciarCartoes: React.FC<GerenciarCartoesProps> = ({
  onClose,
  onUpdate,
  toast,
  confirmar,
}) => {
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [nomePersonalizado, setNomePersonalizado] = useState('');
  const [corPersonalizada, setCorPersonalizada] = useState('#6366f1');
  const [loading, setLoading] = useState(false);

  const fetchCartoes = useCallback(async () => {
    const list = await financeService.getCartoes();
    setCartoes(list);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCartoes();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchCartoes]);

  const handleAddPreset = async (nome: string, cor: string) => {
    setLoading(true);
    const res = await financeService.adicionarCartao(nome, cor);
    setLoading(false);

    if (res.ok) {
      toast(`Cartão ${nome} adicionado!`);
      fetchCartoes();
      onUpdate();
    } else {
      toast(res.erro || 'Erro ao adicionar cartão.', 'erro');
    }
  };

  const handleAddPersonalizado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomePersonalizado.trim()) return;

    setLoading(true);
    const res = await financeService.adicionarCartao(nomePersonalizado, corPersonalizada);
    setLoading(false);

    if (res.ok) {
      toast(`Cartão ${nomePersonalizado} adicionado!`);
      setNomePersonalizado('');
      fetchCartoes();
      onUpdate();
    } else {
      toast(res.erro || 'Erro ao adicionar cartão.', 'erro');
    }
  };

  const handleRemoverCartao = (id: string, nome: string) => {
    confirmar(`Deseja realmente remover o cartão "${nome}"? As compras já cadastradas continuarão salvas, mas você não poderá fazer novos lançamentos nele.`, async () => {
      const res = await financeService.removerCartao(id);
      if (res.ok) {
        toast('Cartão removido.');
        fetchCartoes();
        onUpdate();
      } else {
        toast(res.erro || 'Erro ao remover cartão.', 'erro');
      }
    });
  };

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>←</button>
        <h3>Gerenciar Cartões</h3>
      </div>

      <div className="page-content">
        <div className="finance-section-card card">
          <span style={{ fontSize: '0.88rem', fontWeight: 700, display: 'block', marginBottom: '12px' }}>
            Adicionar Banco
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {BANCOS.slice(0, 9).map((b) => (
              <button
                key={b.nome}
                disabled={loading}
                onClick={() => handleAddPreset(b.nome, b.cor)}
                style={{
                  background: b.cor,
                  color: b.textCor || '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <span style={{
                  background: 'rgba(255,255,255,0.2)',
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6rem',
                }}>
                  {b.sigla}
                </span>
                {b.nome}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleAddPersonalizado} className="finance-section-card card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>
            Cartão Personalizado
          </span>
          <div className="input-group">
            <label>Nome do Cartão</label>
            <input
              type="text"
              required
              placeholder="Ex: Cartão da Loja"
              value={nomePersonalizado}
              onChange={(e) => setNomePersonalizado(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Cor do Cartão</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="color"
                value={corPersonalizada}
                onChange={(e) => setCorPersonalizada(e.target.value)}
                style={{ padding: 0, width: '46px', height: '36px', border: 'none', cursor: 'pointer', background: 'none' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{corPersonalizada}</span>
            </div>
          </div>
          <button type="submit" disabled={loading} className="save-btn" style={{ margin: 0 }}>
            <Plus size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Criar Cartão
          </button>
        </form>

        <div className="finance-section-card card">
          <span style={{ fontSize: '0.88rem', fontWeight: 700, display: 'block', marginBottom: '12px' }}>
            Meus Cartões Ativos
          </span>
          {cartoes.length === 0 ? (
            <div className="empty-msg">Nenhum cartão cadastrado.</div>
          ) : (
            cartoes.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: c.cor,
                    }}
                  />
                  <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{c.nome}</span>
                </div>
                <button
                  onClick={() => handleRemoverCartao(c.id, c.nome)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
