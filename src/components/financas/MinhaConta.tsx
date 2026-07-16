import React, { useState } from 'react';
import { financeService } from '../../services/financeService';
import { supabase } from '../../services/supabaseClient';
import { Key, Download, Trash2 } from 'lucide-react';

interface MinhaContaProps {
  onClose: () => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (msg: string, onSim: () => void) => void;
}

export const MinhaConta: React.FC<MinhaContaProps> = ({ onClose, toast, confirmar }) => {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaSenha || novaSenha.length < 6) {
      toast('A senha deve ter pelo menos 6 caracteres.', 'erro');
      return;
    }
    if (novaSenha !== confirmaSenha) {
      toast('As senhas não coincidem.', 'erro');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setLoading(false);

    if (error) {
      toast('Erro ao trocar de senha.', 'erro');
    } else {
      toast('Senha alterada com sucesso!');
      setNovaSenha('');
      setConfirmaSenha('');
      setShowPasswordForm(false);
    }
  };

  const handleExportData = async () => {
    setLoading(true);
    try {
      const res = await financeService.exportarDados();
      if (!res.ok) {
        toast(res.erro || 'Erro ao exportar dados.', 'erro');
        return;
      }
      const blob = new Blob([JSON.stringify(res.dados, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-dados-nectar-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('Erro de conexão.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    confirmar(
      '⚠️ ATENÇÃO: Todos os seus dados serão excluídos permanentemente. Essa ação NÃO pode ser desfeita. Deseja continuar?',
      () => {
        confirmar('Última chance! Confirme para excluir permanentemente todos os seus dados e conta.', async () => {
          setLoading(true);
          try {
            const res = await financeService.excluirConta();
            if (res.ok) {
              toast('Conta excluída. Redirecionando...');
              setTimeout(() => {
                supabase.auth.signOut();
              }, 1500);
            } else {
              toast(res.erro || 'Erro ao excluir conta.', 'erro');
              setLoading(false);
            }
          } catch {
            toast('Erro de conexão.', 'erro');
            setLoading(false);
          }
        });
      }
    );
  };

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>←</button>
        <h3>Minha Conta</h3>
      </div>

      <div className="page-content">
        {showPasswordForm ? (
          <form onSubmit={handleChangePassword} className="finance-section-card card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Alterar Senha</span>
            <div className="input-group">
              <label>Nova Senha</label>
              <input
                type="password"
                required
                placeholder="Mínimo 6 caracteres"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Confirmar Nova Senha</label>
              <input
                type="password"
                required
                placeholder="Repita a senha"
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowPasswordForm(false)}
                style={{ flex: 1 }}
              >
                Voltar
              </button>
              <button type="submit" disabled={loading} className="save-btn" style={{ flex: 1, margin: 0 }}>
                Salvar Senha
              </button>
            </div>
          </form>
        ) : (
          <button className="btn-add-compra" onClick={() => setShowPasswordForm(true)} style={{ borderStyle: 'solid', color: 'var(--text-primary)' }}>
            <Key size={16} /> Alterar minha senha
          </button>
        )}

        <div className="finance-section-card card">
          <span style={{ fontSize: '0.88rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            Meus Dados (LGPD)
          </span>
          <p className="hint-text" style={{ marginTop: 0, marginBottom: '14px' }}>
            Conforme a Lei Geral de Proteção de Dados (LGPD), você pode exportar ou excluir seus dados a qualquer momento.
          </p>
          <button
            className="save-btn"
            disabled={loading}
            onClick={handleExportData}
            style={{ background: '#166534', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', margin: '0 0 16px 0' }}
          >
            <Download size={16} /> Exportar meus dados (JSON)
          </button>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--danger)', display: 'block', marginBottom: '8px' }}>
              Zona de Perigo
            </span>
            <p className="hint-text" style={{ marginTop: 0, marginBottom: '14px' }}>
              Ao excluir sua conta, todos os seus dados de tarefas da agenda e transações financeiras serão removidos permanentemente.
            </p>
            <button
              className="save-btn"
              disabled={loading}
              onClick={handleDeleteAccount}
              style={{ background: '#ef4444', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', margin: 0 }}
            >
              <Trash2 size={16} /> Excluir minha conta permanentemente
            </button>
          </div>
        </div>

        <a
          href="https://seusite.com/privacidade"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            textAlign: 'center',
            color: 'var(--accent)',
            fontSize: '0.8rem',
            fontWeight: 600,
            textDecoration: 'none',
            marginTop: '8px',
          }}
        >
          🔒 Política de Privacidade
        </a>
      </div>
    </div>
  );
};
