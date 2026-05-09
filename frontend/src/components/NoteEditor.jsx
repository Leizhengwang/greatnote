import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useDebounce } from '../hooks/useDebounce';
import ShareModal from './ShareModal';

const btnStyle = {
  background: 'none', border: '1px solid #ddd', borderRadius: '3px',
  cursor: 'pointer', fontSize: '11px', padding: '1px 6px', color: '#555',
};

const toolbarBtnStyle = {
  background: 'none', border: '1px solid #e0e0e0', borderRadius: '3px',
  cursor: 'pointer', fontSize: '12px', padding: '2px 7px', color: '#444',
  fontFamily: 'inherit',
};

function CodeBlock({ className, children }) {
  const language = /language-(\w+)/.exec(className || '')?.[1] ?? 'text';
  return (
    <SyntaxHighlighter style={oneLight} language={language} PreTag="div">
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  );
}

function PageBlock({ page, pageNumber, totalPages, onUpdate, onInsertAfter, onDelete, onShare, autoFocus }) {
  const [body, setBody] = useState(page.body);
  const [preview, setPreview] = useState(false);
  const debouncedBody = useDebounce(body, 500);
  const textareaRef = useRef(null);

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
          placeholder={`Page ${pageNumber} content… (supports Markdown)`}
          style={{
            display: 'block', width: '100%', minHeight: '160px',
            resize: 'vertical', border: 'none', outline: 'none',
            fontSize: '14px', lineHeight: '1.6', fontFamily: 'inherit',
            padding: '8px 12px', boxSizing: 'border-box', background: 'transparent',
          }}
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
