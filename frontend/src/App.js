import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './hooks/useDebounce';
import * as noteService from './services/noteService';
import * as pageService from './services/pageService';
import * as authService from './services/authService';
import NoteList from './components/NoteList';
import NoteEditor from './components/NoteEditor';
import SearchBar from './components/SearchBar';
import FilterPanel from './components/FilterPanel';
import LoginRegister from './components/LoginRegister';
import DocRanking from './components/DocRanking';
import ProjectTracker from './components/ProjectTracker';

const EMPTY_FILTERS = { createdAfter: '', createdBefore: '', modifiedAfter: '', modifiedBefore: '' };

export default function App() {
  const [username, setUsername] = useState(authService.getUsername());

  if (!username) {
    return <LoginRegister onAuthenticated={setUsername} />;
  }

  return <NotesApp username={username} onLogout={() => setUsername(null)} />;
}

function NotesApp({ username, onLogout }) {
  const [notes, setNotes]                     = useState([]);
  const [selectedNoteId, setSelectedNoteId]   = useState(null);
  const [editorTitle, setEditorTitle]         = useState('');
  const [pages, setPages]                     = useState([]);
  const [query, setQuery]                     = useState('');
  const [filters, setFilters]                 = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters]         = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showDocRanking, setShowDocRanking]       = useState(false);
  const [showProjectTracker, setShowProjectTracker] = useState(false);
  const [isSaving, setIsSaving]               = useState(false);

  const debouncedTitle = useDebounce(editorTitle, 500);
  const debouncedQuery = useDebounce(query, 300);

  // Load / refresh note list
  const loadNotes = useCallback(() => {
    const hasDateFilter = Object.values(filters).some(v => v !== '');
    const params = debouncedQuery
      ? { q: debouncedQuery }
      : hasDateFilter
        ? { created_after: filters.createdAfter || undefined,
            created_before: filters.createdBefore || undefined,
            modified_after: filters.modifiedAfter || undefined,
            modified_before: filters.modifiedBefore || undefined }
        : showFavoritesOnly
          ? { favorites: 'true' }
          : {};
    noteService.listNotes(params).then(setNotes);
  }, [debouncedQuery, filters, showFavoritesOnly]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Sync editor + load pages when selection changes
  useEffect(() => {
    if (!selectedNoteId) {
      setPages([]);
      return;
    }
    const note = notes.find(n => n.id === selectedNoteId);
    if (note) setEditorTitle(note.title);
    pageService.listPages(selectedNoteId).then(loaded => {
      if (loaded.length === 0) {
        pageService.insertPage(selectedNoteId, null).then(newPage => setPages([newPage]));
      } else {
        setPages(loaded);
      }
    });
  }, [selectedNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave title
  useEffect(() => {
    if (!selectedNoteId) return;
    const current = notes.find(n => n.id === selectedNoteId);
    if (!current || debouncedTitle === current.title) return;

    setIsSaving(true);
    noteService.updateNote(selectedNoteId, { title: debouncedTitle })
      .then(updated => setNotes(prev => prev.map(n => n.id === updated.id ? updated : n)))
      .finally(() => setIsSaving(false));
  }, [debouncedTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    noteService.createNote().then(note => {
      setNotes(prev => [note, ...prev]);
      setSelectedNoteId(note.id);
    });
  };

  const handleImportNote = (title, body) => {
    noteService.createNote({ title }).then(note => {
      pageService.listPages(note.id).then(pages => {
        const firstPage = pages[0];
        if (firstPage && body) {
          pageService.updatePage(note.id, firstPage.id, body).then(() => {
            loadNotes();
            setSelectedNoteId(note.id);
          });
        } else {
          loadNotes();
          setSelectedNoteId(note.id);
        }
      });
    });
  };

  const handleDelete = (id) => {
    noteService.deleteNote(id).then(() => {
      setNotes(prev => prev.filter(n => n.id !== id));
      if (selectedNoteId === id) { setSelectedNoteId(null); setPages([]); }
    });
  };

  const handleToggleFavorite = (id) => {
    noteService.updateNote(id, { is_favorite: true })
      .then(updated => setNotes(prev => prev.map(n => n.id === updated.id ? updated : n)));
  };

  // Page handlers
  const handleInsertPage = (afterPageId) => {
    pageService.insertPage(selectedNoteId, afterPageId)
      .then(newPage => {
        setPages(prev => {
          if (afterPageId === null) return [...prev, newPage];
          const idx = prev.findIndex(p => p.id === afterPageId);
          const next = [...prev];
          next.splice(idx + 1, 0, newPage);
          return next;
        });
      });
  };

  const handleDeletePage = (pageId) => {
    pageService.deletePage(selectedNoteId, pageId).then(() =>
      setPages(prev => prev.filter(p => p.id !== pageId))
    );
  };

  const handlePageUpdate = (pageId, body) => {
    setIsSaving(true);
    pageService.updatePage(selectedNoteId, pageId, body)
      .then(updated => setPages(prev => prev.map(p => p.id === updated.id ? updated : p)))
      .finally(() => setIsSaving(false));
  };

  const selectedNote = selectedNoteId
    ? { ...notes.find(n => n.id === selectedNoteId), title: editorTitle }
    : null;

  const handleLogout = () => {
    authService.logout().finally(onLogout);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: '260px', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '12px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '16px', flex: 1 }}>GreatNote</span>
          <button
            onClick={() => setShowFavoritesOnly(v => !v)}
            style={{ fontSize: '12px', padding: '3px 6px', background: showFavoritesOnly ? '#fff3cd' : '#f0f0f0', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
          >
            ★ Favorites
          </button>
          <button
            onClick={() => setShowFilters(v => !v)}
            style={{ fontSize: '12px', padding: '3px 6px', background: showFilters ? '#e8f0fe' : '#f0f0f0', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
          >
            Filters
          </button>
          <button
            onClick={() => { setShowDocRanking(v => !v); setShowProjectTracker(false); }}
            style={{ fontSize: '12px', padding: '3px 6px', background: showDocRanking ? '#d1fae5' : '#f0f0f0', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
          >
            Docs
          </button>
          <button
            onClick={() => { setShowProjectTracker(v => !v); setShowDocRanking(false); }}
            style={{ fontSize: '12px', padding: '3px 6px', background: showProjectTracker ? '#ede9fe' : '#f0f0f0', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
          >
            Projects
          </button>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666' }}>
            <span style={{ flex: 1 }}>{username}</span>
            <button
              onClick={handleLogout}
              style={{ fontSize: '12px', padding: '3px 6px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
            >
              Log out
            </button>
          </div>
        </div>

        <SearchBar query={query} onQueryChange={setQuery} />
        <FilterPanel filters={filters} onFiltersChange={setFilters} visible={showFilters} />

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <NoteList
            notes={notes}
            selectedNoteId={selectedNoteId}
            onSelectNote={setSelectedNoteId}
            onDeleteNote={handleDelete}
            onCreateNote={handleCreate}
            onToggleFavorite={handleToggleFavorite}
          />
        </div>
      </div>

      {/* Editor / Doc Ranking / Project Tracker */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {showProjectTracker ? (
          <ProjectTracker onBack={() => setShowProjectTracker(false)} />
        ) : showDocRanking ? (
          <DocRanking onBack={() => setShowDocRanking(false)} />
        ) : (
          <NoteEditor
            note={selectedNote}
            pages={pages}
            onTitleChange={setEditorTitle}
            onPageUpdate={handlePageUpdate}
            onInsertPage={handleInsertPage}
            onDeletePage={handleDeletePage}
            onImportNote={handleImportNote}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}
