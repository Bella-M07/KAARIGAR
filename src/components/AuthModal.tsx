import React, { useState } from 'react';
import { loginUser, registerUser } from '../lib/api';
import type { AuthUser } from '../types';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'login' | 'register';
  initialRole?: 'customer' | 'kaarigar';
  promptMessage?: string;
  onClose: () => void;
  onAuthenticated: (user: AuthUser, isNewRegistration: boolean) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  initialMode = 'login',
  initialRole = 'customer',
  promptMessage,
  onClose,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [role, setRole] = useState<'customer' | 'kaarigar'>(initialRole);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await loginUser({ phone, pin });
        onAuthenticated(user, false);
      } else {
        const user = await registerUser({ name, phone, pin, role });
        onAuthenticated(user, true);
      }
    } catch (error: any) {
      setErr(error.message ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="ov on"
      role="dialog"
      aria-modal="true"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-top">
          <h3>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h3>
          <button className="x" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {promptMessage && <p style={{ fontWeight: 600, color: '#1F6F6B' }}>{promptMessage}</p>}

        <div className="chips" style={{ marginBottom: 4 }}>
          <button
            type="button"
            className="chip"
            aria-pressed={mode === 'login'}
            onClick={() => {
              setMode('login');
              setErr('');
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={mode === 'register'}
            onClick={() => {
              setMode('register');
              setErr('');
            }}
          >
            New account
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          {mode === 'register' && (
            <>
              <div className="opts">
                <label className="op">
                  <input
                    type="radio"
                    name="role"
                    checked={role === 'customer'}
                    onChange={() => setRole('customer')}
                  />
                  <span>🏡 Neighbour (Order local services)</span>
                </label>
                <label className="op">
                  <input
                    type="radio"
                    name="role"
                    checked={role === 'kaarigar'}
                    onChange={() => setRole('kaarigar')}
                  />
                  <span>✨ Kaarigar (Sell hunar from home)</span>
                </label>
              </div>

              <label>
                Your full name
                <input
                  type="text"
                  maxLength={60}
                  placeholder={role === 'kaarigar' ? 'Meena Patel' : 'Aarav Joshi'}
                  value={name}
                  onChange={(ev) => setName(ev.target.value)}
                  required
                />
              </label>
            </>
          )}

          <label>
            10-digit mobile number
            <input
              type="text"
              inputMode="numeric"
              placeholder="98765 40001"
              value={phone}
              onChange={(ev) => setPhone(ev.target.value)}
              required
            />
          </label>

          <label>
            {mode === 'login' ? 'Your PIN / password' : 'Set a 4 to 6 digit PIN'}
            <input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={(ev) => setPin(ev.target.value)}
              required
            />
          </label>

          {err && <div className="err">{err}</div>}

          <button className="btn alt" type="submit" disabled={loading}>
            {loading
              ? 'Signing in…'
              : mode === 'login'
                ? 'Log in securely'
                : role === 'kaarigar'
                  ? 'Create account & set up shop'
                  : 'Create neighbour account'}
          </button>
        </form>
      </div>
    </div>
  );
};
