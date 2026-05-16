import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useDebounce } from '../hooks/useDebounce';
import ShareModal from './ShareModal';
import { reviseText } from '../services/aiService';

const btnStyle = {
  background: 'none', border: '1px solid #ddd', borderRadius: '3px',
  cursor: 'pointer', fontSize: '11px', padding: '1px 6px', color: '#555',
};

const toolbarBtnStyle = {
  background: 'none', border: '1px solid #e0e0e0', borderRadius: '3px',
  cursor: 'pointer', fontSize: '12px', padding: '2px 7px', color: '#444',
  fontFamily: 'inherit',
};

const aiBtnStyle = {
  background: 'transparent', border: 'none', borderRadius: '4px',
  cursor: 'pointer', fontSize: '12px', padding: '3px 9px', color: '#fff',
  fontFamily: 'inherit', fontWeight: 500,
};

function CodeBlock({ className, children }) {
  const language = /language-(\w+)/.exec(className || '')?.[1] ?? 'text';
  return (
    <SyntaxHighlighter style={oneLight} language={language} PreTag="div">
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  );
}

function AIToolbar({ pos, loading, onAction, onDismiss }) {
  const actions = [
    { key: 'improve', label: 'Improve' },
    { key: 'shorter', label: 'Shorter' },
    { key: 'longer', label: 'Longer' },
    { key: 'grammar', label: 'Grammar' },
  ];

  return (
    <div
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#1e1e2e',
        borderRadius: '8px',
        padding: '4px 6px',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
        pointerEvents: 'all',
      }}
    >
      {loading ? (
        <span style={{ color: '#aaa', fontSize: '12px', padding: '3px 8px' }}>AI thinking…</span>
      ) : (
        <>
          <span style={{ color: '#666', fontSize: '11px', padding: '0 6px 0 2px', borderRight: '1px solid #333' }}>
            ✦ AI
          </span>
          {actions.map(({ key, label }) => (
            <button key={key} style={aiBtnStyle} onClick={() => onAction(key)}>
              {label}
            </button>
          ))}
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={onDismiss}
            style={{ ...aiBtnStyle, color: '#777', marginLeft: '2px', borderLeft: '1px solid #333', paddingLeft: '8px' }}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

function GrammarPanel({ errorsState, onApply, onDismiss, onClear }) {
  const { errors } = errorsState;

  if (errors.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 12px', background: '#f0faf0',
        borderTop: '1px solid #c3e6c3', fontSize: '12px', color: '#2a7a2a',
      }}>
        <span>✓ No grammar or spelling errors found.</span>
        <button
          style={{ ...btnStyle, marginLeft: 'auto', color: '#888', border: 'none' }}
          onClick={onClear}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff8f8', borderTop: '1px solid #fddede',
      padding: '8px 12px', fontSize: '13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', gap: '6px' }}>
        <span style={{ fontWeight: 600, color: '#b00', fontSize: '12px' }}>
          {errors.length} {errors.length === 1 ? 'issue' : 'issues'} found
        </span>
        <button
          style={{ ...btnStyle, marginLeft: 'auto', fontSize: '11px' }}
          onClick={onClear}
        >
          Clear all
        </button>
      </div>
      {errors.map((err, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            padding: '5px 0', borderTop: i > 0 ? '1px solid #fde8e8' : 'none',
          }}
        >
          <div style={{ flex: 1, lineHeight: '1.5' }}>
            <span style={{ color: '#c00', textDecoration: 'line-through' }}>{err.original}</span>
            {' → '}
            <span style={{ color: '#1a6e1a', fontWeight: 500 }}>{err.correction}</span>
            <span style={{ color: '#888', fontSize: '11px', marginLeft: '6px' }}>
              {err.explanation}
            </span>
          </div>
          <button
            style={{ ...btnStyle, background: '#1a6e1a', color: '#fff', border: 'none', flexShrink: 0 }}
            onClick={() => onApply(err)}
          >
            Apply
          </button>
          <button
            style={{ ...btnStyle, flexShrink: 0 }}
            onClick={() => onDismiss(err)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function PageBlock({ noteId, page, pageNumber, totalPages, onUpdate, onInsertAfter, onDelete, onShare, autoFocus }) {
  const [body, setBody] = useState(page.body);
  const [preview, setPreview] = useState(false);
  const debouncedBody = useDebounce(body, 500);
  const textareaRef = useRef(null);

  // AI state
  const [aiSelection, setAiSelection] = useState(null); // { start, end, text }
  const [aiToolbarPos, setAiToolbarPos] = useState({ top: 0, left: 0 });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErrors, setAiErrors] = useState(null); // { errors: [], selectionStart, selectionEnd }

  useEffect(() => { setBody(page.body); }, [page.id]);

  useEffect(() => {
    if (debouncedBody !== page.body) {
      onUpdate(page.id, debouncedBody);
    }
  }, [debouncedBody]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoFocus && !preview && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus, preview]);

  const insertMarkdown = (before, after = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end);
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    setBody(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length + selected.length);
    }, 0);
  };

  const handleTextareaSelect = useCallback((e) => {
    const el = e.target;
    if (el.selectionStart !== el.selectionEnd) {
      const rect = el.getBoundingClientRect();
      setAiToolbarPos({
        top: rect.top - 44,
        left: rect.left + rect.width / 2,
      });
      setAiSelection({
        start: el.selectionStart,
        end: el.selectionEnd,
        text: el.value.slice(el.selectionStart, el.selectionEnd),
      });
    } else {
      setAiSelection(null);
    }
  }, []);

  const handleAiAction = async (action) => {
    if (!aiSelection) return;
    const { start, end, text } = aiSelection;
    setAiLoading(true);
    setAiErrors(null);
    try {
      const result = await reviseText(noteId, page.id, action, text);
      if (action === 'grammar') {
        setAiErrors({ errors: result.errors, selectionStart: start, selectionEnd: end });
      } else {
        setBody(prev => prev.slice(0, start) + result.result + prev.slice(end));
      }
    } catch {
      // silently ignore — no API key or network error
    } finally {
      setAiLoading(false);
      setAiSelection(null);
    }
  };

  const applyGrammarCorrection = (error) => {
    if (!aiErrors) return;
    // Search within the original selection range for precision
    const selText = body.slice(aiErrors.selectionStart, aiErrors.selectionEnd);
    const localIdx = selText.indexOf(error.original);
    if (localIdx === -1) return;
    const globalIdx = aiErrors.selectionStart + localIdx;
    const newBody =
      body.slice(0, globalIdx) + error.correction + body.slice(globalIdx + error.original.length);
    setBody(newBody);
    const delta = error.correction.length - error.original.length;
    setAiErrors(prev => ({
      ...prev,
      errors: prev.errors.filter(e => e !== error),
      selectionEnd: prev.selectionEnd + delta,
    }));
  };

  const dismissGrammarError = (error) => {
    setAiErrors(prev => ({ ...prev, errors: prev.errors.filter(e => e !== error) }));
  };

  const dividerStyle = {
    display: 'flex', alignItems: 'center', gap: '8px',
    margin: '4px 0', color: '#bbb', fontSize: '11px',
  };

  return (
    <div>
      {/* page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderTop: pageNumber > 1 ? '1px dashed #e0e0e0' : 'none' }}>
        <span style={{ fontSize: '11px', color: '#aaa', flex: 1 }}>Page {pageNumber}</span>
        <button style={btnStyle} onClick={() => onShare(page.id)} title="Share this page">
          Share
        </button>
        <button
          style={{ ...btnStyle, color: '#c00' }}
          onClick={() => onDelete(page.id)}
          disabled={totalPages <= 1}
          title={totalPages <= 1 ? 'Cannot delete the last page' : 'Delete page'}
        >
          Delete page
        </button>
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderBottom: '1px solid #f5f5f5', flexWrap: 'wrap' }}>
        <button style={{ ...toolbarBtnStyle, fontWeight: 700 }} onClick={() => insertMarkdown('**', '**')} title="Bold">B</button>
        <button style={{ ...toolbarBtnStyle, fontStyle: 'italic' }} onClick={() => insertMarkdown('*', '*')} title="Italic">I</button>
        <button style={toolbarBtnStyle} onClick={() => insertMarkdown('# ')} title="Heading 1">H1</button>
        <button style={toolbarBtnStyle} onClick={() => insertMarkdown('## ')} title="Heading 2">H2</button>
        <button style={toolbarBtnStyle} onClick={() => insertMarkdown('### ')} title="Heading 3">H3</button>
        <button style={{ ...toolbarBtnStyle, fontFamily: 'monospace' }} onClick={() => insertMarkdown('`', '`')} title="Inline code">{'<>'}</button>
        <button style={{ ...toolbarBtnStyle, fontFamily: 'monospace' }} onClick={() => insertMarkdown('```\n', '\n```')} title="Code block">{'{ }'}</button>
        <button style={toolbarBtnStyle} onClick={() => insertMarkdown('- ')} title="Bullet list">• List</button>
        <button style={toolbarBtnStyle} onClick={() => insertMarkdown('> ')} title="Blockquote">" Quote</button>
        <div style={{ flex: 1 }} />
        <button
          style={{ ...toolbarBtnStyle, color: preview ? '#1a73e8' : '#444', borderColor: preview ? '#1a73e8' : '#e0e0e0' }}
          onClick={() => setPreview(v => !v)}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {/* editor or preview */}
      {preview ? (
        <div style={{
          padding: '8px 16px', minHeight: '160px', fontSize: '14px',
          lineHeight: '1.7', fontFamily: 'inherit',
        }}>
          {body.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ code: ({ className, children }) => <CodeBlock className={className}>{children}</CodeBlock> }}
            >
              {body}
            </ReactMarkdown>
          ) : (
            <span style={{ color: '#bbb' }}>Nothing to preview.</span>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onMouseUp={handleTextareaSelect}
          onKeyUp={handleTextareaSelect}
          placeholder={`Page ${pageNumber} content… (supports Markdown)`}
          style={{
            display: 'block', width: '100%', minHeight: '160px',
            resize: 'vertical', border: 'none', outline: 'none',
            fontSize: '14px', lineHeight: '1.6', fontFamily: 'inherit',
            padding: '8px 12px', boxSizing: 'border-box', background: 'transparent',
          }}
        />
      )}

      {/* floating AI toolbar — shown when text is selected in edit mode */}
      {aiSelection && !preview && (
        <AIToolbar
          pos={aiToolbarPos}
          loading={aiLoading}
          onAction={handleAiAction}
          onDismiss={() => setAiSelection(null)}
        />
      )}

      {/* grammar / spelling error panel */}
      {aiErrors && (
        <GrammarPanel
          errorsState={aiErrors}
          onApply={applyGrammarCorrection}
          onDismiss={dismissGrammarError}
          onClear={() => setAiErrors(null)}
        />
      )}

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
  const [sharingPageId, setSharingPageId] = useState(null);

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
            noteId={note.id}
            page={page}
            pageNumber={idx + 1}
            totalPages={pages.length}
            onUpdate={onPageUpdate}
            onInsertAfter={onInsertPage}
            onDelete={onDeletePage}
            onShare={setSharingPageId}
            autoFocus={idx === 0}
          />
        ))
      )}
      {sharingPageId && (
        <ShareModal
          noteId={note.id}
          pageId={sharingPageId}
          onClose={() => setSharingPageId(null)}
        />
      )}
    </div>
  );
}
