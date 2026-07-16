import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import './InstallPrompt.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  // Lazy initializer: computed once at mount, without a useEffect setState
  const [isIOS] = useState<boolean>(() => {
    const ua = navigator.userAgent;
    const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
    return /iphone|ipad|ipod/i.test(ua) && !standalone;
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Detecta se já está instalado como PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    // Já instalado → não exibe nada
    if (isStandalone) return;

    // Banner iOS: aparece só uma vez por sessão
    const iosDismissed = sessionStorage.getItem('pwa-ios-dismissed');
    if (isIOS && !iosDismissed) {
      const t = setTimeout(() => setShowBanner(true), 0);
      return () => clearTimeout(t);
    }

    // Android/Chrome: escuta o evento de instalação
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isIOS]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowBanner(false);
    if (isIOS) sessionStorage.setItem('pwa-ios-dismissed', '1');
  };

  if (!showBanner || dismissed) return null;

  return (
    <div className="install-banner" role="alert" aria-live="polite">
      <div className="install-banner-icon">🌸</div>
      <div className="install-banner-text">
        <strong>Instalar Minha Agenda</strong>
        {isIOS ? (
          <span>Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</span>
        ) : (
          <span>Adicione à tela inicial para acessar mais rápido, mesmo sem internet.</span>
        )}
      </div>
      <div className="install-banner-actions">
        {!isIOS && (
          <button
            id="btn-pwa-install"
            className="install-btn-primary"
            onClick={handleInstall}
          >
            <Download size={15} />
            Instalar
          </button>
        )}
        <button
          id="btn-pwa-dismiss"
          className="install-btn-dismiss"
          onClick={handleDismiss}
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
