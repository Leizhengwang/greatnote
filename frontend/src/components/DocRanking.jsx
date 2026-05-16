import { useState, useEffect } from 'react';
import { listNotes } from '../services/noteService';
import { rankNotes } from '../services/docService';

export default function DocRanking() {
  const [phase, setPhase] = useState('select'); // 'select' | 'loading' | 'results'
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [criteria, setCriteria] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listNotes({})
      .then(data => { setNotes(data); setLoadingNotes(false); })
      .catch(() => { setError('Failed to load notes.'); setLoadingNotes(false); });
  }, []);

  const toggleNote = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleRank = () => {
    setError(null);
    setPhase('loading');
    rankNotes([...selectedIds], criteria)
      .then(data => { setResult(data); setPhase('results'); })
      .catch(() => { setError('Ranking failed. Please try again.'); setPhase('select'); });
  };

  const canSubmit = selectedIds.size > 0 && criteria.trim().length > 0;

  if (loadingNotes) return <div style={s.center}>Loading notes…</div>;
  if (phase === 'loading') return <div style={s.center}>Ranking notes…</div>;

  if (phase === 'results') {
    return (
      <div style={s.container}>
        <div style={s.row}>
          <h2 style={s.heading}>Ranking Results</h2>
          <button style={s.backBtn} onClick={() => setPhase('select')}>← Rank Again</button>
        </div>

        <p style={s.sub}>
          Criteria: <strong>"{criteria}"</strong>
          {result.query_terms.length > 0
            ? <span> — scored on: {result.query_terms.map(t => <span key={t} style={s.badge}>{t}</span>)}</span>
            : <span style={{ color: '#b45309' }}> — all terms were stopwords; scores are 0</span>
          }
        </p>

        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Note</th>
              <th style={s.th}>Score</th>
              <th style={s.th}>Matched keywords</th>
            </tr>
          </thead>
          <tbody>
            {result.ranked.map(row => (
              <tr key={row.note_id} style={{ background: row.rank === 1 ? '#f0fdf4' : 'white' }}>
                <td style={{ ...s.td, fontWeight: 700, color: row.rank === 1 ? '#059669' : '#374151' }}>
                  {row.rank}
                </td>
                <td style={s.td}>{row.title}</td>
                <td style={{ ...s.td, fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>
                  {row.score.toFixed(3)}
                </td>
                <td style={s.td}>
                  {row.matched_keywords.length > 0
                    ? row.matched_keywords.map(kw => <span key={kw} style={s.badge}>{kw}</span>)
                    : <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Phase: select
  return (
    <div style={s.container}>
      <h2 style={s.heading}>Rank Notes by Relevance</h2>
      <p style={s.sub}>Select notes to compare, then describe what you're looking for.</p>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.section}>
        <label style={s.label}>Criteria / keywords</label>
        <input
          style={s.input}
          type="text"
          placeholder="e.g. machine learning, project deadlines, cooking recipes…"
          value={criteria}
          onChange={e => setCriteria(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && canSubmit) handleRank(); }}
        />
      </div>

      <div style={s.section}>
        <div style={s.row}>
          <label style={s.label}>
            Select notes <span style={{ fontWeight: 400, color: '#6b7280' }}>({selectedIds.size} of {notes.length} selected)</span>
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={s.smallBtn} onClick={() => setSelectedIds(new Set(notes.map(n => n.id)))}>Select all</button>
            <button style={s.smallBtn} onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        </div>

        {notes.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: '13px' }}>No notes yet — create some first.</p>
          : (
            <div style={s.noteList}>
              {notes.map(note => (
                <label
                  key={note.id}
                  style={{ ...s.noteRow, background: selectedIds.has(note.id) ? '#eff6ff' : 'white' }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(note.id)}
                    onChange={() => toggleNote(note.id)}
                    style={{ marginRight: '10px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={s.noteTitle}>{note.title || '(Untitled)'}</span>
                </label>
              ))}
            </div>
          )
        }
      </div>

      <button
        style={{ ...s.rankBtn, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        onClick={handleRank}
        disabled={!canSubmit}
      >
        Rank {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}Notes
      </button>
    </div>
  );
}

const s = {
  container: { padding: '24px', maxWidth: '760px', margin: '0 auto', overflowY: 'auto', height: '100%', boxSizing: 'border-box' },
  center:    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontSize: '14px' },
  row:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' },
  heading:   { margin: 0, fontSize: '20px', fontWeight: 700 },
  sub:       { margin: '0 0 20px', color: '#555', fontSize: '13px' },
  error:     { marginBottom: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '13px' },
  section:   { marginBottom: '20px' },
  label:     { display: 'block', fontWeight: 600, fontSize: '13px', color: '#374151', marginBottom: '6px' },
  input:     { width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  smallBtn:  { fontSize: '12px', padding: '3px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' },
  noteList:  { border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '340px', overflowY: 'auto' },
  noteRow:   { display: 'flex', alignItems: 'center', padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' },
  noteTitle: { fontSize: '14px', color: '#1f2937' },
  rankBtn:   { padding: '10px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600 },
  backBtn:   { fontSize: '13px', padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' },
  table:     { width: '100%', borderCollapse: 'collapse' },
  th:        { textAlign: 'left', padding: '8px 12px', background: '#f8f9fa', borderBottom: '2px solid #dee2e6', fontSize: '12px', fontWeight: 700, color: '#495057', textTransform: 'uppercase', letterSpacing: '0.05em' },
  td:        { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top', fontSize: '14px' },
  badge:     { display: 'inline-block', margin: '2px 3px', padding: '2px 8px', background: '#e8f0fe', color: '#1a56db', borderRadius: '12px', fontSize: '12px' },
};
