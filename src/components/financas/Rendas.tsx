import React, { useEffect, useState } from 'react';
import { financeService } from '../../services/financeService';

interface RendasProps {
  mesAno: string;
  onClose: () => void;
  onSave: () => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
}

export const RendasPage: React.FC<RendasProps> = ({ mesAno, onClose, onSave, toast }) => {
  const [salario, setSalario] = useState('');
  const [decimo, setDecimo] = useState('');
  const [premio, setPremio] = useState('');
  const [outros, setOutros] = useState('');
  const [chequeEspecial, setChequeEspecial] = useState('');
  const [vaTotal, setVaTotal] = useState('');
  const [vaGasto, setVaGasto] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRendas = async () => {
      const data = await financeService.getRendas(mesAno);
      if (data) {
        setSalario(String(data.salario || ''));
        setDecimo(String(data.decimo || ''));
        setPremio(String(data.premio || ''));
        setOutros(String(data.outros || ''));
        setChequeEspecial(String(data.cheque_especial || ''));
        setVaTotal(String(data.va_total || ''));
        setVaGasto(String(data.va_gasto || ''));
      }
    };
    fetchRendas();
  }, [mesAno]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await financeService.atualizarRendas(mesAno, {
      salario: parseFloat(salario) || 0,
      decimo: parseFloat(decimo) || 0,
      premio: parseFloat(premio) || 0,
      outros: parseFloat(outros) || 0,
      cheque_especial: parseFloat(chequeEspecial) || 0,
      va_total: parseFloat(vaTotal) || 0,
      va_gasto: parseFloat(vaGasto) || 0,
    });

    setLoading(false);
    if (res.ok) {
      toast('Rendas salvas com sucesso!');
      onSave();
      onClose();
    } else {
      toast(res.erro || 'Erro ao salvar rendas.', 'erro');
    }
  };

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>←</button>
        <h3>Rendas & Vales</h3>
      </div>
      <form onSubmit={handleSubmit} className="page-content">
        <div className="input-group">
          <label>Salário Bruto</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={salario}
            onChange={(e) => setSalario(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="input-group">
          <label>Décimo Terceiro</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={decimo}
            onChange={(e) => setDecimo(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="input-group">
          <label>Premiação / Bônus</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={premio}
            onChange={(e) => setPremio(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="input-group">
          <label>Outros Valores</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={outros}
            onChange={(e) => setOutros(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="input-group">
          <label>Cheque Especial</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={chequeEspecial}
            onChange={(e) => setChequeEspecial(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="input-group">
          <label>Vale Alimentação Total</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={vaTotal}
            onChange={(e) => setVaTotal(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="input-group">
          <label>Vale Alimentação Já Gasto (R$)</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={vaGasto}
            onChange={(e) => setVaGasto(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="hint-text">O vale alimentação restante será calculado automaticamente.</div>
        
        <button type="submit" disabled={loading} className="save-btn">
          {loading ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </form>
    </div>
  );
};
