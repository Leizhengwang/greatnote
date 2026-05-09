import { useState, useEffect } from 'react';
import { useDebounce } from '../hooks/useDebounce';

function PageBlock({ page, pageNumber, totalPages, noteId, onUpdate, onInsertAfter, onDelete }) {
  const [body, setBody] = useState(page.body);
  const debouncedBody = useDebounce(body, 500);

  // Sync local state if the page prop changes from outside (e.g. newly created page)
  useEffect(() => { setBody(page.body); }, [page.id]);

  useEffect(() => {
    if (debouncedBody !== page.body) {
      onUpdate(page.id, debouncedBody);
    }
  }, [debouncedBody]); // eslint-disable-line react-hooks/exhaustive-deps

  const dividerStyle = {
    display: 'flex', alignItems: 'center', gap: '8px',
    margin: '4px 0', color: '#bbb', fontSize: '11px',
  };
  const btnStyle = {
    background: 'none', border: '1px solid #ddd', borderRadius: '3px',
    cursor: 'pointer', fontSize: '11px', padding: '1px 6px', color: '#666',
  };

  return (
    <div>
      {/* page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderTop: pageNumber > 1 ? '1px dashed #e0e0e0' : 'none' }}>
        <span style={{ fontSize: '11px', color: '#aaa', flex: 1 }}>Page {pageNumber}</span>
        <button
          style={{ ...btnStyle, color: '#c00' }}
          onClick={() => onDelete(page.id)}
          disabled={totalPages <= 1}
          title={totalPages <= 1 ? 'Cannot delete the last page' : 'Delete page'}
        >
          Delete page
        </button>
      </div>

      {/* page body */}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={`Page ${pageNumber} content…`}
        style={{
          display: 'block', width: '100%', minHeight: '160px',
          resize: 'vertical', border: 'none', outline: 'none',
          fontSize: '14px', lineHeight: '1.6', fontFamily: 'inherit',
          padding: '8px 12px', boxSizing: 'border-box', background: 'transparent',
        }}
      />

      {/* word / char count */}
      <div style={{ padding: '2px 12px 6px', fontSize: '11px', color: '#bbb', textAlign: 'right' }}>
        {body.trim() ? body.trim().split(/\s+/).length : 0} words · {body.length.toLocaleString()} chars
      </div>

      {/* insert-page-below button */}
      <div style={dividerStyle}>
        <div style={{ flex: 1, height: '1px', background: '#f0f0f0' }} />
        <button style={btnStyle} onClick={() => onInsertAfter(page.id)}>
          + Insert page below
        </button>
        <div style={{ flex: 1, height: '1px', background: '#f0f0f0' }} />
      </div>
    </div>
  );
}

export default function NoteEditor({ note, pages, onTitleChange, onPageUpdate, onInsertPage, onDeletePage, isSaving }) {
  if (!note) {
    return (
      <div style={{ padding: '24px', color: '#aaa', textAlign: 'center', marginTop: '60px' }}>
        Select a note or create one.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 12px 8px', borderBottom: '1px solid #eee' }}>
        <input
          type="text"
          placeholder="Title"
          value={note.title}
          onChange={e => onTitleChange(e.target.value)}
          style={{ flex: 1, fontSize: '18px', fontWeight: 600, border: 'none', outline: 'none', padding: '4px 0' }}
        />
        {isSaving && <span style={{ fontSize: '11px', color: '#999' }}>Saving…</span>}
      </div>

      {/* pages */}
      {pages.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <button onClick={() => onInsertPage(null)} style={{ padding: '6px 14px' }}>
            + Add first page
          </button>
        </div>
      ) : (
        pages.map((page, idx) => (
          <PageBlock
            key={page.id}
            page={page}
            pageNumber={idx + 1}
            totalPages={pages.length}
            noteId={note.id}
            onUpdate={onPageUpdate}
            onInsertAfter={onInsertPage}
            onDelete={onDeletePage}
          />
        ))
      )}
    </div>
  );
}
