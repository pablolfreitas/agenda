import React, { useState, useEffect, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import { supabase } from '../../services/supabaseClient';
import { Key, Download, Trash2, UserPlus } from 'lucide-react';

interface MinhaContaProps {
  onClose: () => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (msg: string, onSim: () => void) => void;
}

interface Conexao {
  id: string;
  solicitante_id: string;
  solicitante_email: string;
  receptor_email: string;
  receptor_id: string | null;
  status: 'pendente' | 'aceito' | 'bloqueado';
  criado_em: string;
}

export const MinhaConta: React.FC<MinhaContaProps> = ({ onClose, toast, confirmar }) => {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [conexoes, setConexoes] = useState<Conexao[]>([]);
  const [novoEmail, setNovoEmail] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');

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

  const fetchConexoes = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUserEmail(session.user.email || '');
      setUserId(session.user.id);
    }
    const list = await financeService.getConexoes();
    setConexoes(list as Conexao[]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchConexoes();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchConexoes]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoEmail.trim()) return;

    setLoading(true);
    const res = await financeService.enviarConvite(novoEmail);
    setLoading(false);

    if (res.ok) {
      toast('Convite de conexão enviado com sucesso!');
      setNovoEmail('');
      fetchConexoes();
    } else {
      toast(res.erro || 'Erro ao enviar convite.', 'erro');
    }
  };

  const handleAcceptInvite = async (id: string) => {
    setLoading(true);
    const res = await financeService.responderConvite(id, 'aceito');
    setLoading(false);

    if (res.ok) {
      toast('Conexão aceita! Agora vocês compartilham agendas.');
      fetchConexoes();
    } else {
      toast(res.erro || 'Erro ao aceitar conexão.', 'erro');
    }
  };

  const handleRejectInvite = async (id: string) => {
    setLoading(true);
    const res = await financeService.responderConvite(id, 'recusado');
    setLoading(false);

    if (res.ok) {
      toast('Solicitação recusada/cancelada.');
      fetchConexoes();
    } else {
      toast(res.erro || 'Erro ao responder solicitação.', 'erro');
    }
  };

  const handleRemoveConnection = (id: string, email: string) => {
    confirmar(`Deseja realmente remover a conexão com ${email}? Vocês não poderão mais ver ou enviar recados um para o outro.`, async () => {
      setLoading(true);
      const res = await financeService.removerConexao(id);
      setLoading(false);

      if (res.ok) {
        toast('Conexão removida.');
        fetchConexoes();
      } else {
        toast(res.erro || 'Erro ao remover conexão.', 'erro');
      }
    });
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

  const incomingInvites = conexoes.filter(
    (c) => c.receptor_email.toLowerCase() === userEmail.toLowerCase() && c.status === 'pendente'
  );
  const outgoingInvites = conexoes.filter(
    (c) => c.solicitante_id === userId && c.status === 'pendente'
  );
  const activeConnections = conexoes.filter((c) => c.status === 'aceito');

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

        {/* COMPARTILHAMENTO DE AGENDA */}
        <div className="finance-section-card card">
          <span style={{ fontSize: '0.88rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            Compartilhar Agenda
          </span>
          <p className="hint-text" style={{ marginTop: 0, marginBottom: '12px', fontSize: '0.78rem', lineHeight: '1.4' }}>
            Conecte-se com amigos pelo e-mail para enviar recados diretamente na agenda uns dos outros (limite de 3 recados enviados por dia).
          </p>

          <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <input
              type="email"
              placeholder="E-mail da pessoa"
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.86rem',
                background: 'var(--surface-soft)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="submit"
              disabled={loading}
              className="save-btn"
              style={{
                margin: 0,
                width: '100%',
                padding: '10px 16px',
                fontSize: '0.86rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxSizing: 'border-box'
              }}
            >
              <UserPlus size={16} /> Enviar Convite de Conexão
            </button>
          </form>

          {/* Solicitações Pendentes (Recebidas) */}
          {incomingInvites.length > 0 && (
            <div style={{ marginBottom: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', display: 'block', marginBottom: '8px' }}>
                ✉️ Convites Recebidos
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {incomingInvites.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-soft)', padding: '8px 10px', borderRadius: '4px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {c.solicitante_email}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleAcceptInvite(c.id)}
                        disabled={loading}
                        style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Aceitar
                      </button>
                      <button
                        onClick={() => handleRejectInvite(c.id)}
                        disabled={loading}
                        style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conexões Ativas */}
          {activeConnections.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                👥 Conexões Ativas
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeConnections.map((c) => {
                  const amISol = c.solicitante_id === userId;
                  const friendEmail = amISol ? c.receptor_email : c.solicitante_email;
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                        {friendEmail}
                      </span>
                      <button
                        onClick={() => handleRemoveConnection(c.id, friendEmail)}
                        disabled={loading}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', padding: '4px', fontWeight: 600 }}
                        title="Desconectar"
                      >
                        Desconectar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Convites Enviados (Aguardando) */}
          {outgoingInvites.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                ⏳ Convites Enviados (Aguardando)
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {outgoingInvites.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {c.receptor_email}
                    </span>
                    <button
                      onClick={() => handleRejectInvite(c.id)}
                      disabled={loading}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.74rem', cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
