import React, { useEffect, useState, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import { TrendingUp, TrendingDown, CalendarClock } from 'lucide-react';

interface HistoricoProps {
  onClose: () => void;
}

interface MesHistorico {
  mesAno: string;
  label: string;
  rendaTotal: number;
  gastosCartoes: number;
  gastosFixos: number;
  gastosOutros: number;
  gastosTotais: number;
  saldo: number;
}

interface MesParcela {
  mesAno: string;
  label: string;
  total: number;
}

const formatCurrency = (val: number) =>
  `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Historico: React.FC<HistoricoProps> = ({ onClose }) => {
  const [meses, setMeses] = useState<MesHistorico[]>([]);
  const [parcelas, setParcelas] = useState<MesParcela[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDados = useCallback(async () => {
    setLoading(true);
    const [historico, futuras] = await Promise.all([
      financeService.getHistoricoMeses(6),
      financeService.getParcelasFuturas(),
    ]);
    setMeses(historico);
    setParcelas(futuras);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDados();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDados]);

  const maiorGasto = Math.max(1, ...meses.map((m) => m.gastosTotais));
  const totalComprometido = parcelas.reduce((s, p) => s + p.total, 0);
  const maiorParcela = Math.max(1, ...parcelas.map((p) => p.total));

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>←</button>
        <h3>Histórico e Projeções</h3>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="empty-msg">Carregando histórico...</div>
        ) : (
          <>
            {/* --- RETROSPECTO MENSAL --- */}
            <div className="finance-section-card card">
              <div className="section-title-row">
                <span>📊 Últimos 6 meses</span>
              </div>

              {meses.every((m) => m.rendaTotal === 0 && m.gastosTotais === 0) ? (
                <div className="empty-msg">Ainda não há dados suficientes para montar o histórico.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
                  {meses.map((m) => {
                    const barPct = Math.min(100, Math.round((m.gastosTotais / maiorGasto) * 100));
                    const positivo = m.saldo >= 0;
                    return (
                      <div key={m.mesAno}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize' }}>{m.label}</span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: positivo ? 'var(--success, #16a34a)' : 'var(--danger)',
                            }}
                          >
                            {positivo ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            {formatCurrency(m.saldo)}
                          </span>
                        </div>
                        <div className="progress-track" style={{ height: '8px' }}>
                          <div
                            className="progress-fill"
                            style={{ width: `${barPct}%`, background: positivo ? 'var(--accent)' : 'var(--danger)' }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                            Renda: {formatCurrency(m.rendaTotal)}
                          </span>
                          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                            Gastos: {formatCurrency(m.gastosTotais)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* --- PARCELAS FUTURAS --- */}
            <div className="finance-section-card card">
              <div className="section-title-row">
                <span>
                  <CalendarClock size={15} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                  Parcelas comprometidas
                </span>
              </div>

              {parcelas.length === 0 ? (
                <div className="empty-msg">Nenhuma parcela de cartão pendente a partir deste mês.</div>
              ) : (
                <>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '12px' }}>
                    Soma de todas as parcelas de cartão já lançadas, mês a mês, a partir de hoje.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {parcelas.map((p) => {
                      const barPct = Math.min(100, Math.round((p.total / maiorParcela) * 100));
                      return (
                        <div key={p.mesAno}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'capitalize' }}>{p.label}</span>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{formatCurrency(p.total)}</span>
                          </div>
                          <div className="progress-track" style={{ height: '6px' }}>
                            <div className="progress-fill" style={{ width: `${barPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="total-line">
                <span>Total comprometido</span>
                <span>{formatCurrency(totalComprometido)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
