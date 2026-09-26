// =============================================================================
// Login  -  choose a user, enter a PIN.
// =============================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/auth.jsx';
import { usePanel } from '../lib/usePanel.js';
import { Panel } from '../components/PanelStates.jsx';
import { Spinner, Field } from '../components/ui.jsx';
import { initials } from '../lib/format.js';

export default function LoginPage() {
  const { login, user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const users = usePanel((signal) => api.loginUsers({ signal }).then((r) => r.data), []);

  // Send an already-signed-in user where they were heading.
  useEffect(() => {
    if (user) navigate(location.state?.from || '/board', { replace: true });
  }, [user, navigate, location.state]);

  async function submit(e) {
    e.preventDefault();
    if (!selected) { setError('Choose who you are first'); return; }
    setBusy(true);
    setError('');
    try {
      await login(selected.id, pin);
      navigate(location.state?.from || '/board', { replace: true });
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <header className="login-head">
          <img className="login-logo" src="/saka-logo.png" alt="SAKA" />
          <h1>Project To-Do Tracker</h1>
          <p>Choose your name and enter your PIN.</p>
        </header>

        <Panel state={users}>
          {(list) => (
            <form onSubmit={submit}>
              <div className="user-picker">
                {list.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={'user-tile' + (selected?.id === u.id ? ' user-tile-active' : '')}
                    onClick={() => { setSelected(u); setError(''); }}
                    aria-pressed={selected?.id === u.id}
                  >
                    <span className="avatar">{initials(u.name)}</span>
                    <span className="user-name">{u.name}</span>
                    <span className={'role-badge role-' + u.role.toLowerCase()}>{u.role}</span>
                  </button>
                ))}
              </div>

              <Field label="PIN">
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  className="input pin-input"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                  placeholder="****"
                  disabled={!selected || busy}
                />
              </Field>

              {error && <p className="form-error" role="alert">{error}</p>}

              <button type="submit" className="btn btn-primary btn-block" disabled={!selected || !pin || busy}>
                {busy ? <><Spinner small /> Signing in...</> : 'Sign in'}
              </button>

              <p className="login-hint">Demo PIN for every account: <strong>1234</strong></p>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
