import React, { useState } from 'react';
import { financeService } from '../../services/financeService';

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mesAnoToLabel(mesAno: string): string {
  const [ano, mes] = mesAno.split('-').map(Number);
  if (!mes || !ano || mes < 1 || mes > 12) return mesAno;
  return `${MESES_ABREV[mes - 1]} ${String(ano).slice(-2)}`;
}

interface GerenciarMesProps {
  mesAtual: string;
  mesOpcoes: { val: string; label: string }[];
  onClose: () => void;
  onMesAdicionado: (mesAno: string) => void;
  onMesApagado: (mesAno: string) => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (msg: string, onSim: () => void) => void;
}

export const GerenciarMes: React.FC<GerenciarMesProps> = ({
  mesAtual,
  mesOpcoes,
  onClose,
  onMesAdicionado,
  onMesApagado,
  toast,
  confirmar,
}) => {
  const [mesLimpar, setMesLimpar] = useState(mesAtual);
  const [mesApagar, setMesApagar] = useState(mesAtual);
  // 'adicionar' | 'limpar' | 'apagar' | null — controla qual botão mostra loading
  const [operacao, setOperacao] = useState<'adicionar' | 'limpar' | 'apagar' | null>(null);

  // Identifica o último mês existente na lista
  const ultimoMes = mesOpcoes.length > 0 ? mesOpcoes[mesOpcoes.length - 1] : null;

  // Próximo mês consecutivo
  const proximoMesVal = (() => {
    if (!ultimoMes) {
      const hoje = new Date();
      return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    }
    const [ultimoAno, ultimoNumMes] = ultimoMes.val.split('-').map(Number);
    // Date(ano, mesIndex): passando ultimoNumMes (1-12) como mesIndex já dá o mês seguinte com virada de ano automática
    const proxData = new Date(ultimoAno, ultimoNumMes);
    return `${proxData.getFullYear()}-${String(proxData.getMonth() + 1).padStart(2, '0')}`;
  })();

  const proximoMesLabel = mesAnoToLabel(proximoMesVal);

  const handleAdicionarProximoMes = async () => {
    if (operacao) return;

    setOperacao('adicionar');
    const resultado = await financeService.garantirRendaMes(proximoMesVal);
    setOperacao(null);

    if (resultado) {
      toast(`${proximoMesLabel} adicionado com sucesso!`);
      onMesAdicionado(proximoMesVal);
    } else {
      toast('Erro ao adicionar mês.', 'erro');
    }
  };

  const handleLimparMes = () => {
    if (operacao) return;
    confirmar(
      `Limpar ${mesAnoToLabel(mesLimpar)}?\n\nTodos os lançamentos (cartão, fixos, outros gastos) serão apagados. O mês continuará visível na lista com valores zerados.`,
      async () => {
        setOperacao('limpar');
        const r = await financeService.limparMes(mesLimpar);
        setOperacao(null);
        if (r.ok) {
          toast(`${mesAnoToLabel(mesLimpar)} limpo com sucesso!`);
        } else {
          toast('Erro ao limpar mês.', 'erro');
        }
      }
    );
  };

  const handleApagarMes = () => {
    if (operacao) return;
    confirmar(
      `Apagar ${mesAnoToLabel(mesApagar)} permanentemente?\n\nTodos os dados do mês serão removidos do sistema. Esta ação não pode ser desfeita.`,
      async () => {
        setOperacao('apagar');
        const r = await financeService.apagarMes(mesApagar);
        setOperacao(null);
        if (r.ok) {
          toast(`${mesAnoToLabel(mesApagar)} apagado com sucesso!`);
          onMesApagado(mesApagar);
        } else {
          toast('Erro ao apagar mês.', 'erro');
        }
      }
    );
  };

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>←</button>
        <h3>Gerenciar Meses</h3>
      </div>

      <div className="page-content">
        {/* ── ➕ ADICIONAR MÊS ───────────────────────────── */}
        <div className="finance-section-card card">
          <div className="section-title-row">
            <span>➕ Adicionar próximo mês</span>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '14px' }}>
            Último mês cadastrado: <strong>{ultimoMes?.label || 'Nenhum'}</strong>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--surface-soft)', borderRadius: 'var(--radius-sm)', marginBottom: '14px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Próximo mês consecutivo:</span>
            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)' }}>{proximoMesLabel}</span>
          </div>
          <button
            className="save-btn"
            onClick={handleAdicionarProximoMes}
            disabled={operacao !== null}
            style={{ opacity: operacao !== null ? 0.5 : 1, cursor: operacao !== null ? 'not-allowed' : 'pointer', width: '100%' }}
          >
            {operacao === 'adicionar' ? 'Adicionando...' : `Adicionar ${proximoMesLabel}`}
          </button>
        </div>

        {/* ── 🧹 LIMPAR MÊS ──────────────────────────────── */}
        <div className="finance-section-card card">
          <div className="section-title-row">
            <span>🧹 Limpar mês</span>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '14px' }}>
            Apaga todos os lançamentos (cartão, fixos, outros gastos) sem remover o mês da lista. Os valores ficam zerados.
          </p>
          <div className="input-group">
            <label>Mês a limpar</label>
            <select value={mesLimpar} onChange={(e) => setMesLimpar(e.target.value)}>
              {mesOpcoes.map((m) => (
                <option key={m.val} value={m.val}>{m.label}</option>
              ))}
            </select>
          </div>
          <button
            className="save-btn"
            onClick={handleLimparMes}
            disabled={operacao !== null}
            style={{ background: '#f59e0b', boxShadow: 'none', opacity: operacao !== null ? 0.5 : 1, cursor: operacao !== null ? 'not-allowed' : 'pointer' }}
          >
            {operacao === 'limpar' ? 'Limpando...' : 'Limpar mês'}
          </button>
        </div>

        {/* ── 🗑️ APAGAR MÊS ──────────────────────────────── */}
        <div className="finance-section-card card">
          <div className="section-title-row">
            <span>🗑️ Apagar mês</span>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '14px' }}>
            Remove o mês completamente do sistema, incluindo todos os lançamentos. <strong>Ação irreversível.</strong>
          </p>
          <div className="input-group">
            <label>Mês a apagar</label>
            <select value={mesApagar} onChange={(e) => setMesApagar(e.target.value)}>
              {mesOpcoes.map((m) => (
                <option key={m.val} value={m.val}>{m.label}</option>
              ))}
            </select>
          </div>
          <button
            className="save-btn"
            onClick={handleApagarMes}
            disabled={operacao !== null}
            style={{ background: 'var(--danger)', boxShadow: 'none', opacity: operacao !== null ? 0.5 : 1, cursor: operacao !== null ? 'not-allowed' : 'pointer' }}
          >
            {operacao === 'apagar' ? 'Apagando...' : 'Apagar mês permanentemente'}
          </button>
        </div>
      </div>
    </div>
  );
};
