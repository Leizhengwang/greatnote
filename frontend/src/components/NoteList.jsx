export default function NoteList({ notes, selectedNoteId, onSelectNote, onDeleteNote, onCreateNote, onToggleFavorite }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px' }}>
        <button onClick={onCreateNote} style={{ width: '100%', padding: '6px' }}>
          + New Note
        </button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notes.length === 0 && (
          <p style={{ padding: '8px', color: '#999', fontSize: '13px' }}>No notes yet.</p>
        )}
        {notes.map(note => (
          <div
            key={note.id}
            onClick={() => onSelectNote(note.id)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              background: note.id === selectedNoteId ? '#e8f0fe' : 'transparent',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {note.title || <em style={{ color: '#aaa' }}>Untitled</em>}
              </div>
              <div style={{ fontSize: '11px', color: '#999' }}>
                {new Date(note.updated_at).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); onToggleFavorite(note.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: note.is_favorite ? '#f5a623' : '#ccc', padding: '0 2px' }}
                title={note.is_favorite ? 'Unfavorite' : 'Favorite'}
              >
                ★
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDeleteNote(note.id); }}
                style={{ color: '#c00', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '0 2px' }}
                title="Delete"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
