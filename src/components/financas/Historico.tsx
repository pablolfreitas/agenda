import React, { useEffect, useState, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import type { CompraParcelada } from '../../services/financeService';
import { TrendingUp, TrendingDown, CalendarClock, CreditCard, AlertTriangle } from 'lucide-react';

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

interface MesVA {
  mesAno: string;
  label: string;
  vaTotal: number;
  vaGasto: number;
  vaRestante: number;
}

const formatCurrency = (val: number) =>
  `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPct = (val: number) => `${Math.round(val)}%`;

const taxaColor = (pct: number) =>
  pct < 70 ? 'var(--success, #16a34a)' : pct < 90 ? '#f59e0b' : 'var(--danger)';

// Mini colored square legend dot
const Dot = ({ color }: { color: string }) => (
  <span style={{ width: '8px', height: '8px', background: color, borderRadius: '2px', display: 'inline-block', flexShrink: 0 }} />
);

export const Historico: React.FC<HistoricoProps> = ({ onClose }) => {
  const [meses, setMeses] = useState<MesHistorico[]>([]);
  const [parcelas, setParcelas] = useState<MesParcela[]>([]);
  const [comprasParceladas, setComprasParceladas] = useState<CompraParcelada[]>([]);
  const [vaHistorico, setVaHistorico] = useState<MesVA[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDados = useCallback(async () => {
    setLoading(true);
    const [historico, futuras, compras, va] = await Promise.all([
      financeService.getHistoricoMeses(6),
      financeService.getParcelasFuturas(),
      financeService.getComprasParceladas(),
      financeService.getHistoricoVA(6),
    ]);
    setMeses(historico);
    setParcelas(futuras);
    setComprasParceladas(compras);
    setVaHistorico(va);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchDados(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchDados]);

  // ── KPI derivados ────────────────────────────────────────────────
  const mesesComDados = meses.filter((m) => m.rendaTotal > 0 || m.gastosTotais > 0);

  const mediaGastos = mesesComDados.length > 0
    ? mesesComDados.reduce((s, m) => s + m.gastosTotais, 0) / mesesComDados.length
    : 0;

  const mediaSaldo = mesesComDados.length > 0
    ? mesesComDados.reduce((s, m) => s + m.saldo, 0) / mesesComDados.length
    : 0;

  const melhorMes = mesesComDados.length > 0
    ? mesesComDados.reduce((best, m) => (m.saldo > best.saldo ? m : best), mesesComDados[0])
    : null;

  // Tendência: mês atual vs mês anterior (últimos dois meses do array)
  const tendencia =
    meses.length >= 2 && meses[meses.length - 2].gastosTotais > 0
      ? ((meses[meses.length - 1].gastosTotais - meses[meses.length - 2].gastosTotais) /
          meses[meses.length - 2].gastosTotais) *
        100
      : null;

  const maiorGasto = Math.max(1, ...meses.map((m) => m.gastosTotais));
  const totalComprometido = parcelas.reduce((s, p) => s + p.total, 0);
  const maiorParcela = Math.max(1, ...parcelas.map((p) => p.total));
  const mesesNegativos = mesesComDados.filter((m) => m.saldo < 0);
  const temVA = vaHistorico.some((v) => v.vaTotal > 0);

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
            {/* ── 🎯 KPI RESUMO ──────────────────────────────────── */}
            {mesesComDados.length > 0 && (
              <div className="finance-section-card card">
                <div className="section-title-row">
                  <span>🎯 Resumo do Período</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                  {/* Média de gastos */}
                  <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.04))', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '3px' }}>Média de Gastos/mês</div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>{formatCurrency(mediaGastos)}</div>
                  </div>

                  {/* Saldo médio */}
                  <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.04))', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '3px' }}>Saldo Médio/mês</div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: mediaSaldo >= 0 ? 'var(--success, #16a34a)' : 'var(--danger)' }}>
                      {formatCurrency(mediaSaldo)}
                    </div>
                  </div>

                  {/* Melhor mês */}
                  {melhorMes && (
                    <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.04))', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '3px' }}>🏆 Melhor Mês</div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>{melhorMes.label}</div>
                      <div style={{ fontSize: '0.63rem', color: 'var(--success, #16a34a)' }}>
                        saldo {formatCurrency(melhorMes.saldo)}
                      </div>
                    </div>
                  )}

                  {/* Tendência */}
                  {tendencia !== null && (
                    <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.04))', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '3px' }}>Tendência</div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', color: tendencia <= 0 ? 'var(--success, #16a34a)' : 'var(--danger)' }}>
                        {tendencia <= 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                        {Math.abs(tendencia).toFixed(1)}%
                      </div>
                      <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>
                        {tendencia <= 0 ? 'menos que mês anterior' : 'mais que mês anterior'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Alerta de meses negativos */}
                {mesesNegativos.length > 0 && (
                  <div style={{ marginTop: '10px', background: 'rgba(220,38,38,0.08)', borderRadius: '8px', padding: '10px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>
                      Saldo negativo em{' '}
                      {mesesNegativos.length === 1 ? '1 mês' : `${mesesNegativos.length} meses`}:{' '}
                      {mesesNegativos.map((m) => m.label).join(', ')}.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── 📊 HISTÓRICO 6 MESES ───────────────────────────── */}
            <div className="finance-section-card card">
              <div className="section-title-row">
                <span>📊 Últimos 6 meses</span>
              </div>

              {mesesComDados.length === 0 ? (
                <div className="empty-msg">Ainda não há dados suficientes para montar o histórico.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '4px' }}>
                  {meses.map((m, i) => {
                    const positivo = m.saldo >= 0;
                    const taxa = m.rendaTotal > 0 ? (m.gastosTotais / m.rendaTotal) * 100 : 0;

                    // Barras empilhadas proporcionais
                    const barTotal = Math.min(100, Math.round((m.gastosTotais / maiorGasto) * 100));
                    const totalCat = m.gastosCartoes + m.gastosFixos + m.gastosOutros;
                    const pCartao = totalCat > 0 ? (m.gastosCartoes / totalCat) * barTotal : 0;
                    const pFixo   = totalCat > 0 ? (m.gastosFixos   / totalCat) * barTotal : 0;
                    const pOutros = totalCat > 0 ? (m.gastosOutros  / totalCat) * barTotal : 0;

                    // Delta mês a mês
                    const prev = i > 0 ? meses[i - 1] : null;
                    const delta = prev && prev.gastosTotais > 0
                      ? ((m.gastosTotais - prev.gastosTotais) / prev.gastosTotais) * 100
                      : null;

                    return (
                      <div key={m.mesAno}>
                        {/* Cabeçalho: mês + delta + saldo */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{m.label}</span>
                            {delta !== null && (
                              <span style={{ fontSize: '0.68rem', color: delta <= 0 ? 'var(--success, #16a34a)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                {delta <= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                                {Math.abs(delta).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: positivo ? 'var(--success, #16a34a)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            {positivo ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {formatCurrency(m.saldo)}
                          </span>
                        </div>

                        {/* Barra empilhada cartão / fixos / outros */}
                        <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--border, #e2e8f0)' }}>
                          {pCartao > 0 && <div style={{ width: `${pCartao}%`, background: '#6366f1' }} />}
                          {pFixo > 0   && <div style={{ width: `${pFixo}%`,   background: '#f59e0b' }} />}
                          {pOutros > 0 && <div style={{ width: `${pOutros}%`, background: '#10b981' }} />}
                        </div>

                        {/* Renda vs Gastos */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            Renda: {formatCurrency(m.rendaTotal)}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            Gastos: {formatCurrency(m.gastosTotais)}
                          </span>
                        </div>

                        {/* Detalhamento por categoria + taxa de comprometimento */}
                        {m.gastosTotais > 0 && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {m.gastosCartoes > 0 && (
                              <span style={{ fontSize: '0.63rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Dot color="#6366f1" /> {formatCurrency(m.gastosCartoes)}
                              </span>
                            )}
                            {m.gastosFixos > 0 && (
                              <span style={{ fontSize: '0.63rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Dot color="#f59e0b" /> {formatCurrency(m.gastosFixos)}
                              </span>
                            )}
                            {m.gastosOutros > 0 && (
                              <span style={{ fontSize: '0.63rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Dot color="#10b981" /> {formatCurrency(m.gastosOutros)}
                              </span>
                            )}
                            {m.rendaTotal > 0 && (
                              <span style={{ fontSize: '0.63rem', color: taxaColor(taxa), marginLeft: 'auto' }}>
                                {formatPct(taxa)} da renda
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Legenda */}
                  <div style={{ display: 'flex', gap: '14px', paddingTop: '6px', borderTop: '1px solid var(--border, #e2e8f0)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.65rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '10px', height: '6px', background: '#6366f1', borderRadius: '2px' }} /> Cartão
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '10px', height: '6px', background: '#f59e0b', borderRadius: '2px' }} /> Fixos
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '10px', height: '6px', background: '#10b981', borderRadius: '2px' }} /> Outros
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── 💳 COMPRAS PARCELADAS ──────────────────────────── */}
            <div className="finance-section-card card">
              <div className="section-title-row">
                <span>
                  <CreditCard size={15} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                  Compras Parceladas em Andamento
                </span>
              </div>

              {comprasParceladas.length === 0 ? (
                <div className="empty-msg">Nenhuma compra parcelada ativa.</div>
              ) : (
                <>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '12px' }}>
                    Progresso de cada parcelamento e quanto ainda está comprometido.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {comprasParceladas.map((c) => {
                      const pct = Math.round((c.parcelasPagas / c.totalParcelas) * 100);
                      const valorRestante = c.valorParcela * c.parcelasFaltam;
                      return (
                        <div key={c.grupoId}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{c.descricao}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                                <span style={{ width: '8px', height: '8px', background: c.cor, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.cartao}</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>· até {c.labelFim}</span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{c.parcelasPagas}/{c.totalParcelas}</div>
                              <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>{formatCurrency(c.valorParcela)}/mês</div>
                            </div>
                          </div>
                          <div className="progress-track" style={{ height: '6px' }}>
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>{pct}% quitado</span>
                            <span style={{ fontSize: '0.63rem', color: 'var(--danger)' }}>
                              falta {c.parcelasFaltam}x · {formatCurrency(valorRestante)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="total-line">
                    <span>Total restante parcelado</span>
                    <span>{formatCurrency(comprasParceladas.reduce((s, c) => s + c.valorParcela * c.parcelasFaltam, 0))}</span>
                  </div>
                </>
              )}
            </div>

            {/* ── 📅 PARCELAS COMPROMETIDAS POR MÊS ─────────────── */}
            <div className="finance-section-card card">
              <div className="section-title-row">
                <span>
                  <CalendarClock size={15} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                  Parcelas comprometidas por mês
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
                            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{p.label}</span>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{formatCurrency(p.total)}</span>
                          </div>
                          <div className="progress-track" style={{ height: '6px' }}>
                            <div className="progress-fill" style={{ width: `${barPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="total-line">
                    <span>Total comprometido</span>
                    <span>{formatCurrency(totalComprometido)}</span>
                  </div>
                </>
              )}
            </div>

            {/* ── 🥗 VALE ALIMENTAÇÃO ────────────────────────────── */}
            {temVA && (
              <div className="finance-section-card card">
                <div className="section-title-row">
                  <span>🥗 Vale Alimentação</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
                  {vaHistorico
                    .filter((v) => v.vaTotal > 0)
                    .map((v) => {
                      const pctGasto = Math.min(100, Math.round((v.vaGasto / v.vaTotal) * 100));
                      const color = taxaColor(pctGasto);
                      return (
                        <div key={v.mesAno}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{v.label}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{formatPct(pctGasto)} usado</span>
                          </div>
                          <div className="progress-track" style={{ height: '6px' }}>
                            <div className="progress-fill" style={{ width: `${pctGasto}%`, background: color }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>Total: {formatCurrency(v.vaTotal)}</span>
                            <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>Restante: {formatCurrency(v.vaRestante)}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
