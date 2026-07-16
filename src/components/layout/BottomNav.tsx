import React from 'react';
import { Calendar, Wallet, ShieldAlert } from 'lucide-react';
import './BottomNav.css';

interface BottomNavProps {
  activeTab: 'agenda' | 'financas' | 'admin';
  setActiveTab: (tab: 'agenda' | 'financas' | 'admin') => void;
  isAdmin: boolean;
  pendingCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  isAdmin,
  pendingCount = 0,
}) => {
  return (
    <footer className="bottom-nav">
      <button
        className={`bottom-nav-item ${activeTab === 'agenda' ? 'active' : ''}`}
        onClick={() => setActiveTab('agenda')}
        aria-label="Abrir Agenda"
      >
        <Calendar size={22} />
        <span>Agenda</span>
      </button>

      <button
        className={`bottom-nav-item ${activeTab === 'financas' ? 'active' : ''}`}
        onClick={() => setActiveTab('financas')}
        aria-label="Abrir Finanças"
      >
        <Wallet size={22} />
        <span>Finanças</span>
      </button>

      {isAdmin && (
        <button
          className={`bottom-nav-item admin-item ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => setActiveTab('admin')}
          aria-label="Abrir Painel Admin"
        >
          <div className="admin-icon-wrapper">
            <ShieldAlert size={22} />
            {pendingCount > 0 && <span className="pending-badge">{pendingCount}</span>}
          </div>
          <span>Admin</span>
        </button>
      )}
    </footer>
  );
};
