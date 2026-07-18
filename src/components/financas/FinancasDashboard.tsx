import React, { useEffect, useState, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import type { TotaisFinanceiros } from '../../services/financeService';
import { RendasPage } from './Rendas';
import { CartaoDetalhe } from './CartaoDetalhe';
import { GerenciarCartoes } from './GerenciarCartoes';
import { GastosFixos } from './GastosFixos';
import { OutrosGastos } from './OutrosGastos';
import { MinhaConta } from './MinhaConta';
import { Historico } from './Historico';
import { Eye, EyeOff, Settings, Lock, Sun, Moon, LineChart } from 'lucide-react';
import './FinancasDashboard.css';

interface FinancasDashboardProps {
  openCreateTrigger?: number;
}

export const FinancasDashboard: React.FC<FinancasDashboardProps> = ({ openCreateTrigger }) => {
  const [mesAno, setMesAno] = useState(() => new Date().toISOString().slice(0, 7));
  const [totais, setTotais] = useState<TotaisFinanceiros | null>(null);
  const [hideValues, setHideValues] = useState(() => localStorage.getItem('hideValues') === '1');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  // Subpages overlays
  const [subPage, setSubPage] = useState<'rendas' | 'card-detalhe' | 'gerenciar-cartoes' | 'gastos-fixos' | 'outros-gastos' | 'minha-conta' | 'historico' | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedCardNome, setSelectedCardNome] = useState('');

  // Toast & Custom Confirm
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastTipo, setToastTipo] = useState<'ok' | 'erro'>('ok');
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(null);

  const triggerToast = (msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToastMsg(msg);
    setToastTipo(tipo);
    setTimeout(() => {
      setToastMsg(null);
    }, 2800);
  };

  const triggerConfirm = (msg: string, onSim: () => void) => {
    setConfirmMsg(msg);
    setConfirmCallback(() => () => {
      onSim();
      setConfirmMsg(null);
    });
  };

  const popularMeses = () => {
    const list = [];
    const inicio = new Date(2026, 0); // Jan 2026
    const hoje = new Date();
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 6);

    let cur = new Date(inicio);
    while (cur <= fim) {
      const val = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
      const label = cur.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      list.push({ val, label });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1);
    }
    return list;
  };

  const mesOpcoes = popularMeses();

  const fetchDados = useCallback(async () => {
    const t = await financeService.calcularTotais(mesAno);
    setTotais(t);
    return t;
  }, [mesAno]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDados();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDados]);

  useEffect(() => {
    // Realtime changes
    const unsub = financeService.assinarRealtime(() => {
      fetchDados();
    });
    return () => unsub();
  }, [fetchDados]);

  // Sincroniza os lembretes de vencimento de cartão na agenda apenas quando
  // o mês selecionado muda — evita reescrever a tarefa a cada atualização
  // em tempo real (ex: cada compra nova no cartão).
  useEffect(() => {
    const timer = setTimeout(async () => {
      const cartoes = await financeService.getCartoes();
      const comVencimento = cartoes.filter((c) => c.dia_vencimento);
      if (comVencimento.length === 0) return;

      const t = await financeService.calcularTotais(mesAno);
      if (!t) return;

      for (const c of comVencimento) {
        const totalCartao = t.porCartao.find((pc) => pc.id === c.id);
        await financeService.sincronizarVencimentoCartao(
          c,
          mesAno,
          totalCartao?.total ?? 0,
          totalCartao?.pago ?? false
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mesAno]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Handle outside plus button click to open quick additions
  useEffect(() => {
    if (openCreateTrigger && openCreateTrigger > 0) {
      const timer = setTimeout(() => {
        setSubPage('outros-gastos');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [openCreateTrigger]);

  const toggleHideValues = () => {
    const newVal = !hideValues;
    setHideValues(newVal);
    localStorage.setItem('hideValues', newVal ? '1' : '0');
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const formatCurrency = (val: number) => {
    if (hideValues) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleOpenCard = (id: string, nome: string) => {
    setSelectedCardId(id);
    setSelectedCardNome(nome);
    setSubPage('card-detalhe');
  };

  return (
    <div className="financas-container">
      {/* Toast popup */}
      {toastMsg && (
        <div className={`toast toast-${toastTipo} toast-show`} style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000 }}>
          {toastMsg}
        </div>
      )}

      {/* Confirm modal popup */}
      {confirmMsg && (
        <div className="confirm-overlay active" style={{ zIndex: 2100 }}>
          <div className="confirm-box">
            <p className="confirm-msg">{confirmMsg}</p>
            <div className="confirm-btns">
              <button className="confirm-btn-cancel" onClick={() => setConfirmMsg(null)}>Cancelar</button>
              <button className="confirm-btn-danger" onClick={() => confirmCallback?.()}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <header className="financas-header">
        <h2>💰 Finanças</h2>
        <div className="header-actions">
          <select
            className="month-selector"
            value={mesAno}
            onChange={(e) => setMesAno(e.target.value)}
          >
            {mesOpcoes.map((m) => (
              <option key={m.val} value={m.val}>
                {m.label}
              </option>
            ))}
          </select>
          <button className="btn-icon" onClick={() => setSubPage('historico')} title="Histórico e Projeções">
            <LineChart size={16} />
          </button>
          <button className="btn-icon" onClick={toggleTheme} title="Alterar Tema">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="btn-icon" onClick={() => setSubPage('minha-conta')} title="Minha Conta">
            <Lock size={16} />
          </button>
        </div>
      </header>

      {/* --- SUMMARY CARD --- */}
      <div className="finance-summary-card">
        <button className="btn-settings" onClick={() => setSubPage('rendas')} title="Editar rendas">
          <Settings size={18} />
        </button>

        <div className="card-header-row">
          <div>
            <div className="card-title">
              <span>Salário Total</span>
              <button className="btn-hide-values" onClick={toggleHideValues} title="Ocultar valores">
                {hideValues ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="card-value">{formatCurrency(totais?.rendaTotal || 0)}</div>
          </div>
          <div className="cheque-summary">
            <div className="mini-label">Cheque Especial</div>
            <div className="mini-number negative">{formatCurrency(totais?.chequeEspecial || 0)}</div>
          </div>
        </div>

        <div className="divider-light" />

        <div className="row-duo">
          <div className="mini-block">
            <div className="mini-label">Salário Restante</div>
            <div
              className="mini-number"
              style={{ color: (totais?.restante || 0) < 0 && !hideValues ? 'var(--danger)' : 'var(--text-primary)' }}
            >
              {formatCurrency(totais?.restante || 0)}
            </div>
          </div>
          <div className="mini-block">
            <div className="mini-label">Gastos Totais</div>
            <div className="mini-number">{formatCurrency(totais?.gastosTotais || 0)}</div>
          </div>
        </div>

        <div className="divider-light" />

        <div className="va-section">
          <div className="va-item">
            <span className="mini-label">Vale Alimentação Total</span>
            <span className="mini-number">{formatCurrency(totais?.vaTotal || 0)}</span>
          </div>
          <div className="va-item">
            <span className="mini-label">Vale Alimentação Restante</span>
            <span
              className="mini-number"
              style={{ color: (totais?.vaRestante || 0) < 0 && !hideValues ? 'var(--danger)' : 'var(--text-primary)' }}
            >
              {formatCurrency(totais?.vaRestante || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* --- CREDIT CARDS CARD --- */}
      <div className="finance-section-card card">
        <div className="section-title-row">
          <span>💳 Cartões de Crédito</span>
          <button className="btn-manage" onClick={() => setSubPage('gerenciar-cartoes')}>
            + Gerenciar
          </button>
        </div>

        <div className="cards-list">
          {totais?.porCartao.length === 0 ? (
            <div className="empty-msg">Nenhum cartão ativo. Clique em Gerenciar para adicionar.</div>
          ) : (
            totais?.porCartao.map((c) => (
              <div key={c.id} className="cartao-row" onClick={() => handleOpenCard(c.id, c.cartao)}>
                <div className="cartao-row-left">
                  <div className="cartao-badge-logo" style={{ background: c.cor }}>
                    {c.cartao.slice(0, 2)}
                  </div>
                  <span className="cartao-name">{c.cartao}</span>
                </div>
                <div className="cartao-row-right">
                  <span className="cartao-value">{formatCurrency(c.total)}</span>
                  {c.pago && <span className="cartao-pay-status">✓ Pago</span>}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="total-line">
          <span>Valor total faturado</span>
          <span>{formatCurrency(totais?.gastosCartoes || 0)}</span>
        </div>
      </div>

      {/* --- FIXED EXPENSES CARD --- */}
      <div className="finance-section-card card clickable" onClick={() => setSubPage('gastos-fixos')}>
        <div className="section-title-row">
          <span>📌 Gastos Fixos</span>
        </div>
        <div className="gastos-list">
          {totais?.gastosFixosTot === 0 ? (
            <div className="empty-msg">Nenhum gasto fixo lançado. Clique para adicionar.</div>
          ) : (
            <div>
              <span className="hint-text" style={{ display: 'block', marginBottom: '8px' }}>
                Clique para gerenciar ou marcar como pago.
              </span>
            </div>
          )}
        </div>
        <div className="total-line">
          <span>Valor total fixo</span>
          <span>{formatCurrency(totais?.gastosFixosTot || 0)}</span>
        </div>
      </div>

      {/* --- OTHER EXPENSES CARD --- */}
      <div className="finance-section-card card clickable" onClick={() => setSubPage('outros-gastos')}>
        <div className="section-title-row">
          <span>📋 Outros Gastos</span>
        </div>
        <div className="gastos-list">
          {totais?.gastosOutros === 0 ? (
            <div className="empty-msg">Nenhum gasto avulso lançado. Clique para adicionar.</div>
          ) : (
            <div>
              <span className="hint-text" style={{ display: 'block', marginBottom: '8px' }}>
                Clique para ver a lista de lançamentos avulsos.
              </span>
            </div>
          )}
        </div>
        <div className="total-line">
          <span>Valor total avulso</span>
          <span>{formatCurrency(totais?.gastosOutros || 0)}</span>
        </div>
      </div>

      {/* --- SUBPAGES INJECTION OVERLAYS --- */}
      {subPage === 'rendas' && (
        <RendasPage
          mesAno={mesAno}
          onClose={() => setSubPage(null)}
          onSave={fetchDados}
          toast={triggerToast}
        />
      )}

      {subPage === 'card-detalhe' && selectedCardId && (
        <CartaoDetalhe
          cartaoId={selectedCardId}
          nomeCartao={selectedCardNome}
          mesAno={mesAno}
          onClose={() => {
            setSubPage(null);
            setSelectedCardId(null);
          }}
          onUpdate={fetchDados}
          toast={triggerToast}
          confirmar={triggerConfirm}
        />
      )}

      {subPage === 'gerenciar-cartoes' && (
        <GerenciarCartoes
          onClose={() => setSubPage(null)}
          onUpdate={fetchDados}
          toast={triggerToast}
          confirmar={triggerConfirm}
        />
      )}

      {subPage === 'gastos-fixos' && (
        <GastosFixos
          mesAno={mesAno}
          onClose={() => setSubPage(null)}
          onUpdate={fetchDados}
          toast={triggerToast}
          confirmar={triggerConfirm}
        />
      )}

      {subPage === 'outros-gastos' && (
        <OutrosGastos
          mesAno={mesAno}
          onClose={() => setSubPage(null)}
          onUpdate={fetchDados}
          toast={triggerToast}
          confirmar={triggerConfirm}
        />
      )}

      {subPage === 'minha-conta' && (
        <MinhaConta
          onClose={() => setSubPage(null)}
          toast={triggerToast}
          confirmar={triggerConfirm}
        />
      )}

      {subPage === 'historico' && (
        <Historico onClose={() => setSubPage(null)} />
      )}
    </div>
  );
};
