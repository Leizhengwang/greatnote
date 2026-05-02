import { useState } from 'react';
import * as authService from '../services/authService';

export default function LoginRegister({ onAuthenticated }) {
  const [mode, setMode]         = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const action = mode === 'login' ? authService.login : authService.register;
    action(username, password)
      .then(({ username }) => onAuthenticated(username))
      .catch(err => setError(err.response?.data?.error || 'Something went wrong'))
      .finally(() => setSubmitting(false));
  };

  const isRegister = mode === 'register';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#fafafa' }}>
      <form onSubmit={handleSubmit} style={{ width: '320px', padding: '32px', background: '#fff', border: '1px solid #ddd', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>GreatNote</h1>
        <div style={{ fontSize: '14px', color: '#666' }}>
          {isRegister ? 'Create an account' : 'Sign in to continue'}
        </div>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
          required
          style={{ padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '3px' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '3px' }}
        />

        {error && (
          <div style={{ color: '#b00020', fontSize: '13px' }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{ padding: '8px', fontSize: '14px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '3px', cursor: submitting ? 'default' : 'pointer' }}
        >
          {submitting ? '…' : isRegister ? 'Create account' : 'Log in'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); }}
          style={{ padding: '4px', fontSize: '13px', background: 'none', color: '#1a73e8', border: 'none', cursor: 'pointer' }}
        >
          {isRegister ? 'Have an account? Log in' : "Don't have an account? Register"}
        </button>
      </form>
    </div>
  );
}
