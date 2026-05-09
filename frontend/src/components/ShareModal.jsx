import { useState, useEffect } from 'react';
import {
  getPublicShare,
  createPublicShare,
  revokePublicShare,
  listUserShares,
  shareWithUser,
  revokeUserShare,
} from '../services/shareService';

const PUBLIC_BASE = 'http://localhost:8000/api/shared';

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modal = {
  background: '#fff', borderRadius: '8px', padding: '24px', width: '420px',
  maxWidth: '90vw', boxShadow: '0 4px 24px rgba(0,0,0,0.18)', position: 'relative',
};

const tabBtn = (active) => ({
  padding: '6px 18px', border: 'none', borderBottom: active ? '2px solid #333' : '2px solid transparent',
  background: 'none', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: '14px',
});

const inputStyle = {
  border: '1px solid #ddd', borderRadius: '4px', padding: '6px 10px',
  fontSize: '13px', width: '100%', boxSizing: 'border-box',
};

const btn = (variant = 'default') => ({
  padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px',
  background: variant === 'danger' ? '#fee2e2' : variant === 'primary' ? '#1a1a1a' : '#f3f4f6',
  color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#b91c1c' : '#333',
});

export default function ShareModal({ noteId, pageId, onClose }) {
  const [tab, setTab] = useState('public');

  const [publicShare, setPublicShare] = useState(null);
  const [publicLoading, setPublicLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [userShares, setUserShares] = useState([]);
  const [usernameInput, setUsernameInput] = useState('');
  const [userError, setUserError] = useState('');
  const [userLoading, setUserLoading] = useState(false);

  useEffect(() => {
    getPublicShare(noteId, pageId).then(setPublicShare).catch(() => {});
    listUserShares(noteId, pageId).then(setUserShares).catch(() => {});
  }, [noteId, pageId]);

  const handleGenerateLink = async () => {
    setPublicLoading(true);
    try {
      const share = await createPublicShare(noteId, pageId);
      setPublicShare(share);
    } finally {
      setPublicLoading(false);
    }
  };

  const handleRevokeLink = async () => {
    setPublicLoading(true);
    try {
      await revokePublicShare(noteId, pageId);
      setPublicShare(prev => prev ? { ...prev, is_active: false } : prev);
    } finally {
      setPublicLoading(false);
    }
  };

  const handleCopy = () => {
    if (!publicShare?.token) return;
    navigator.clipboard.writeText(`${PUBLIC_BASE}/${publicShare.token}/`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setUserError('');
    if (!usernameInput.trim()) return;
    setUserLoading(true);
    try {
      const share = await shareWithUser(noteId, pageId, usernameInput.trim());
      setUserShares(prev => [...prev, share]);
      setUsernameInput('');
    } catch (err) {
      setUserError(err.response?.data?.error || 'Failed to add user');
    } finally {
      setUserLoading(false);
    }
  };

  const handleRevokeUser = async (sharedUserId) => {
    await revokeUserShare(noteId, pageId, sharedUserId);
    setUserShares(prev => prev.filter(s => s.shared_with_id !== sharedUserId));
  };

  const publicUrl = publicShare?.token ? `${PUBLIC_BASE}/${publicShare.token}/` : null;
  const linkActive = publicShare?.is_active && publicUrl;

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}
        >
          ×
        </button>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Share page</h3>

        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
          <button style={tabBtn(tab === 'public')} onClick={() => setTab('public')}>Public link</button>
          <button style={tabBtn(tab === 'users')} onClick={() => setTab('users')}>Specific users</button>
        </div>

        {tab === 'public' && (
          <div>
            {linkActive ? (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input readOnly value={publicUrl} style={{ ...inputStyle, color: '#555', background: '#f9f9f9' }} />
                  <button style={btn('primary')} onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
                </div>
                <button style={btn('danger')} onClick={handleRevokeLink} disabled={publicLoading}>
                  Revoke link
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#555' }}>
                  Anyone with the link can read this page without logging in.
                </p>
                <button style={btn('primary')} onClick={handleGenerateLink} disabled={publicLoading}>
                  {publicLoading ? 'Generating…' : 'Generate public link'}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div>
            <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <input
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder="Username"
                style={inputStyle}
              />
              <button type="submit" style={btn('primary')} disabled={userLoading}>Add</button>
            </form>
            {userError && <p style={{ color: '#b91c1c', fontSize: '12px', margin: '0 0 10px' }}>{userError}</p>}
            {userShares.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No users have access yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {userShares.map(share => (
                  <li key={share.shared_with_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: '13px' }}>{share.username}</span>
                    <button style={btn('danger')} onClick={() => handleRevokeUser(share.shared_with_id)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
