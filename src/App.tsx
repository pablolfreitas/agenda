import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabaseClient';
import { Auth } from './components/Auth/Auth';
import { Dashboard } from './components/Dashboard/Dashboard';
import { FinancasDashboard } from './components/financas/FinancasDashboard';
import { AdminPanel } from './components/financas/AdminPanel';
import { BottomNav } from './components/layout/BottomNav';
import { InstallPrompt } from './components/InstallPrompt/InstallPrompt';
import type { Perfil } from './services/financeService';
import { financeService } from './services/financeService';
import './styles/App.css';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<'agenda' | 'financas' | 'admin'>('agenda');
  const [openCreateTrigger, setOpenCreateTrigger] = useState(0);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);

  // Custom Toast and Confirm states for App level (used by AdminPanel from parent)
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

  const checkUserProfile = async (userSession: Session) => {
    const { data: profile } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', userSession.user.id)
      .single();

    const typedProfile = profile as Perfil | null;

    if (typedProfile && typedProfile.status === 'aprovado') {
      setPerfil(typedProfile);
      // If profile is admin, fetch pending users count
      if (typedProfile.is_admin) {
        const count = await financeService.getUsuariosPendentesCount();
        setPendingUsersCount(count);
      }
    } else {
      // Reject session
      await supabase.auth.signOut();
      setSession(null);
      setPerfil(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession) {
        checkUserProfile(currentSession).then(() => {
          setCheckingSession(false);
        });
      } else {
        setCheckingSession(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession);
      if (currentSession) {
        await checkUserProfile(currentSession);
      } else {
        setPerfil(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPerfil(null);
    setActiveTab('agenda');
  };

  const handlePlusClick = () => {
    // Increment trigger to communicate event to the active tab component
    setOpenCreateTrigger((prev) => prev + 1);
  };

  const handleAdminStatusUpdated = async () => {
    if (perfil?.is_admin) {
      const count = await financeService.getUsuariosPendentesCount();
      setPendingUsersCount(count);
    }
  };

  if (checkingSession) return null;

  return (
    <>
      {toastMsg && (
        <div className={`toast toast-${toastTipo} toast-show`} style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000 }}>
          {toastMsg}
        </div>
      )}

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

      {session && perfil ? (
        <div style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'agenda' && (
            <Dashboard onSignOut={handleSignOut} openCreateTrigger={openCreateTrigger} />
          )}

          {activeTab === 'financas' && (
            <FinancasDashboard openCreateTrigger={openCreateTrigger} />
          )}

          {activeTab === 'admin' && perfil.is_admin && (
            <AdminPanel
              onClose={() => setActiveTab('agenda')}
              toast={triggerToast}
              confirmar={triggerConfirm}
              onStatusUpdated={handleAdminStatusUpdated}
            />
          )}

          <BottomNav
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isAdmin={perfil.is_admin}
            onPlusClick={handlePlusClick}
            pendingCount={pendingUsersCount}
          />
        </div>
      ) : (
        <Auth />
      )}
      <InstallPrompt />
    </>
  );
}

export default App;
