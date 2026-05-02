export default function SearchBar({ query, onQueryChange }) {
  return (
    <div style={{ padding: '8px' }}>
      <input
        type="text"
        placeholder="Search notes…"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
      />
    </div>
  );
}
