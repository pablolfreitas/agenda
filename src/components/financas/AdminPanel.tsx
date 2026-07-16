/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import type { Perfil } from '../../services/financeService';
import { UserMinus, UserCheck, ShieldAlert, ArrowLeft, Search } from 'lucide-react';

interface AdminPanelProps {
  onClose: () => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (msg: string, onSim: () => void) => void;
  onStatusUpdated?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, toast, confirmar, onStatusUpdated }) => {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState<'pendente' | 'aprovado' | 'bloqueado'>('pendente');
  const [busca, setBusca] = useState('');

  const fetchPerfis = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_listar_perfis');
      if (error) throw error;
      setPerfis((data as Perfil[]) || []);
    } catch (e: any) {
      toast(e.message || 'Erro ao carregar perfis.', 'erro');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPerfis();
    }, 0);

    // Listen to changes in perfis realtime
    const channel = supabase
      .channel('admin-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfis' }, () => {
        fetchPerfis();
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchPerfis]);

  const handleUpdateStatus = async (userId: string, status: 'pendente' | 'aprovado' | 'bloqueado') => {
    const res = await supabase.rpc('admin_atualizar_status', {
      p_user_id: userId,
      p_status: status,
    });
    if (res.error) {
      toast(res.error.message, 'erro');
    } else {
      toast(`Usuário atualizado com sucesso!`);
      fetchPerfis();
      if (onStatusUpdated) onStatusUpdated();
    }
  };

  const handleApagarUsuario = (userId: string, email: string) => {
    confirmar(`⚠️ ATENÇÃO: Deseja realmente excluir permanentemente a conta de "${email}" e todos os seus dados de agenda e finanças? Esta ação não pode ser desfeita.`, async () => {
      const res = await supabase.rpc('admin_apagar_usuario', { p_user_id: userId });
      if (res.error) {
        toast(res.error.message, 'erro');
      } else {
        toast('Usuário e dados deletados permanentemente.');
        fetchPerfis();
        if (onStatusUpdated) onStatusUpdated();
      }
    });
  };

  const perfisFiltrados = perfis.filter((p) => {
    const matchesAba = p.status === aba;
    const searchStr = (p.email + p.telefone).toLowerCase();
    const matchesBusca = busca.trim() === '' || searchStr.includes(busca.toLowerCase());
    return matchesAba && matchesBusca;
  });

  return (
    <div className="secondary-page">
      <div className="page-header">
        <button className="back-btn" onClick={onClose}>
          <ArrowLeft size={18} />
        </button>
        <h3>Painel Admin</h3>
      </div>

      <div className="page-content">
        {/* Search */}
        <div className="input-with-icon" style={{ marginBottom: '16px' }}>
          <Search size={16} />
          <input
            type="text"
            placeholder="Pesquisar por email ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {(['pendente', 'aprovado', 'bloqueado'] as const).map((a) => {
            const count = perfis.filter((p) => p.status === a && !p.is_admin).length;
            return (
              <button
                key={a}
                onClick={() => setAba(a)}
                className={`btn-manage ${aba === a ? 'active' : ''}`}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: aba === a ? 'var(--accent)' : 'var(--surface)',
                  color: aba === a ? '#fff' : 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>
                  {a === 'pendente' ? 'Pendentes' : a === 'aprovado' ? 'Aprovados' : 'Bloqueados'}
                </span>
                {count > 0 && (
                  <span
                    style={{
                      background: aba === a ? 'rgba(255,255,255,0.25)' : 'var(--accent-soft)',
                      color: aba === a ? '#fff' : 'var(--accent)',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      fontSize: '0.62rem',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* User list */}
        <div className="finance-section-card card">
          {loading ? (
            <div className="empty-msg">Carregando usuários...</div>
          ) : perfisFiltrados.length === 0 ? (
            <div className="empty-msg">Nenhum usuário nesta lista.</div>
          ) : (
            perfisFiltrados
              .filter((p) => !p.is_admin) // Admin cannot edit themselves
              .map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)', display: 'block' }}>
                      {p.email}
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      📞 {p.telefone || 'Sem telefone'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                    {p.status !== 'aprovado' && (
                      <button
                        onClick={() => handleUpdateStatus(p.id, 'aprovado')}
                        className="btn-manage"
                        style={{ background: 'var(--success-soft)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <UserCheck size={12} /> Aprovar
                      </button>
                    )}
                    {p.status !== 'bloqueado' && (
                      <button
                        onClick={() => handleUpdateStatus(p.id, 'bloqueado')}
                        className="btn-manage"
                        style={{ background: 'var(--danger-soft)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <ShieldAlert size={12} /> Bloquear
                      </button>
                    )}
                    {p.status !== 'pendente' && (
                      <button
                        onClick={() => handleUpdateStatus(p.id, 'pendente')}
                        className="btn-manage"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <UserMinus size={12} /> Suspender
                      </button>
                    )}
                    <button
                      onClick={() => handleApagarUsuario(p.id, p.email)}
                      className="btn-manage"
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}
                    >
                      Excluir
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
