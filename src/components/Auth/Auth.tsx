import React, { useState } from 'react';
import { Flower2, Phone, Mail, Lock } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import './Auth.css';

export const Auth: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consent, setConsent] = useState(false);

  // Loading & Messages
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reset password state
  const [resetStep, setResetStep] = useState(1); // 1: verify, 2: set new

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneNumber(e.target.value));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data?.user) {
        // Check profile status
        let { data: perfil, error: perfilErr } = await supabase
          .from('perfis')
          .select('status')
          .eq('id', data.user.id)
          .maybeSingle();

        if (!perfil && !perfilErr) {
          // Cria o perfil na hora para contas pré-existentes do Auth
          const { data: newPerfil, error: insertErr } = await supabase
            .from('perfis')
            .insert({
              id: data.user.id,
              email: data.user.email,
              telefone: data.user.user_metadata?.telefone || '',
              status: 'aprovado',
              is_admin: false
            })
            .select('status')
            .single();

          if (!insertErr) {
            perfil = newPerfil;
          } else {
            perfilErr = insertErr as any;
          }
        }

        if (perfilErr) {
          await supabase.auth.signOut();
          throw new Error('Erro ao verificar perfil. Tente novamente.');
        }

        if (perfil?.status === 'pendente') {
          await supabase.auth.signOut();
          throw new Error('Sua conta está aguardando aprovação do administrador.');
        }

        if (perfil?.status === 'bloqueado') {
          await supabase.auth.signOut();
          throw new Error('Sua conta foi bloqueada pelo administrador.');
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao entrar. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password !== confirmPassword) {
      setErrorMsg('As senhas não coincidem.');
      setLoading(false);
      return;
    }

    if (!consent) {
      setErrorMsg('Você precisa aceitar os termos de consentimento da LGPD.');
      setLoading(false);
      return;
    }

    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            telefone: cleanPhone,
          },
        },
      });

      if (error) throw error;

      setSuccessMsg('Cadastro realizado! Sua conta foi enviada para aprovação do administrador.');
      setIsSignUp(false);
      // Clean up fields
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao cadastrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanPhone = phone.replace(/\D/g, '');

    try {
      if (resetStep === 1) {
        const { data, error } = await supabase.rpc('verificar_email_telefone', {
          p_email: email,
          p_telefone: cleanPhone,
        });

        if (error) throw error;

        if (data) {
          setResetStep(2);
          setSuccessMsg('Dados confirmados. Digite sua nova senha.');
        } else {
          setErrorMsg('E-mail ou telefone celular não cadastrados.');
        }
      } else {
        if (password !== confirmPassword) {
          setErrorMsg('As senhas não coincidem.');
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.rpc('resetar_senha', {
          p_email: email,
          p_telefone: cleanPhone,
          p_nova_senha: password,
        });

        if (error) throw error;

        if (data) {
          setSuccessMsg('Senha alterada com sucesso! Entre agora.');
          setIsForgot(false);
          setResetStep(1);
          setPassword('');
          setConfirmPassword('');
        } else {
          setErrorMsg('Erro ao resetar senha. Tente novamente.');
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao processar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">
            <Flower2 size={32} />
          </div>
          <h1>Néctar</h1>
          <p className="subtitle">Agenda & Finanças organizada com carinho</p>
        </div>

        {isForgot ? (
          // --- RECUPERAR SENHA ---
          <form onSubmit={handlePasswordRecovery} className="auth-form">
            <h2>Recuperar Senha</h2>
            <p className="form-hint">Confirme seus dados cadastrados para redefinir sua senha.</p>
            
            <div className="form-group">
              <label htmlFor="recovery-email">E-mail</label>
              <div className="input-with-icon">
                <Mail size={16} />
                <input
                  id="recovery-email"
                  type="email"
                  required
                  disabled={resetStep === 2}
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="recovery-phone">Celular (com DDD)</label>
              <div className="input-with-icon">
                <Phone size={16} />
                <input
                  id="recovery-phone"
                  type="tel"
                  required
                  disabled={resetStep === 2}
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={handlePhoneChange}
                />
              </div>
            </div>

            {resetStep === 2 && (
              <>
                <div className="form-group">
                  <label htmlFor="new-password">Nova Senha</label>
                  <div className="input-with-icon">
                    <Lock size={16} />
                    <input
                      id="new-password"
                      type="password"
                      required
                      minLength={6}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="confirm-new-password">Confirmar Nova Senha</label>
                  <div className="input-with-icon">
                    <Lock size={16} />
                    <input
                      id="confirm-new-password"
                      type="password"
                      required
                      minLength={6}
                      placeholder="Repita a nova senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {errorMsg && <div className="message error">{errorMsg}</div>}
            {successMsg && <div className="message success">{successMsg}</div>}

            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? 'Processando...' : resetStep === 1 ? 'Confirmar dados' : 'Definir nova senha'}
            </button>

            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setIsForgot(false);
                setResetStep(1);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
            >
              Voltar para o Login
            </button>
          </form>
        ) : isSignUp ? (
          // --- CADASTRO ---
          <form onSubmit={handleSignUp} className="auth-form">
            <h2>Criar Conta</h2>
            
            <div className="form-group">
              <label htmlFor="signup-email">E-mail</label>
              <div className="input-with-icon">
                <Mail size={16} />
                <input
                  id="signup-email"
                  type="email"
                  required
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-phone">Celular (com DDD)</label>
              <div className="input-with-icon">
                <Phone size={16} />
                <input
                  id="signup-phone"
                  type="tel"
                  required
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={handlePhoneChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-password">Senha</label>
              <div className="input-with-icon">
                <Lock size={16} />
                <input
                  id="signup-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-confirm-password">Confirmar Senha</label>
              <div className="input-with-icon">
                <Lock size={16} />
                <input
                  id="signup-confirm-password"
                  type="password"
                  required
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="consent-checkbox">
              <input
                id="consent-check"
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <label htmlFor="consent-check">
                Estou ciente e dou consentimento para o tratamento dos meus dados conforme a LGPD para a organização da minha agenda e finanças.
              </label>
            </div>

            {errorMsg && <div className="message error">{errorMsg}</div>}
            {successMsg && <div className="message success">{successMsg}</div>}

            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? 'Criando conta...' : 'Cadastrar e enviar para aprovação'}
            </button>

            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setIsSignUp(false);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
            >
              Já tem conta? Entre aqui
            </button>
          </form>
        ) : (
          // --- LOGIN ---
          <form onSubmit={handleLogin} className="auth-form">
            <h2>Acessar Conta</h2>
            
            <div className="form-group">
              <label htmlFor="login-email">E-mail</label>
              <div className="input-with-icon">
                <Mail size={16} />
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Senha</label>
              <div className="input-with-icon">
                <Lock size={16} />
                <input
                  id="login-password"
                  type="password"
                  required
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {errorMsg && <div className="message error">{errorMsg}</div>}
            {successMsg && <div className="message success">{successMsg}</div>}

            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? 'Acessando...' : 'Entrar'}
            </button>

            <div className="auth-form-footer">
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setIsForgot(true);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
              >
                Esqueci a senha
              </button>
              
              <button
                type="button"
                className="btn-link btn-signup-toggle"
                onClick={() => {
                  setIsSignUp(true);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
              >
                Criar conta gratuita
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
