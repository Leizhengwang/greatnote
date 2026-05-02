export default function FilterPanel({ filters, onFiltersChange, visible }) {
  if (!visible) return null;

  const handleChange = (key, value) =>
    onFiltersChange({ ...filters, [key]: value });

  const clear = () =>
    onFiltersChange({ createdAfter: '', createdBefore: '', modifiedAfter: '', modifiedBefore: '' });

  const labelStyle = { display: 'block', fontSize: '12px', marginBottom: '2px', color: '#555' };
  const inputStyle = { width: '100%', padding: '4px', boxSizing: 'border-box', marginBottom: '8px' };

  return (
    <div style={{ padding: '8px', borderTop: '1px solid #ddd', background: '#fafafa' }}>
      <label style={labelStyle}>Created after</label>
      <input type="date" style={inputStyle} value={filters.createdAfter}
        onChange={e => handleChange('createdAfter', e.target.value)} />

      <label style={labelStyle}>Created before</label>
      <input type="date" style={inputStyle} value={filters.createdBefore}
        onChange={e => handleChange('createdBefore', e.target.value)} />

      <label style={labelStyle}>Modified after</label>
      <input type="date" style={inputStyle} value={filters.modifiedAfter}
        onChange={e => handleChange('modifiedAfter', e.target.value)} />

      <label style={labelStyle}>Modified before</label>
      <input type="date" style={inputStyle} value={filters.modifiedBefore}
        onChange={e => handleChange('modifiedBefore', e.target.value)} />

      <button onClick={clear} style={{ fontSize: '12px' }}>Clear filters</button>
    </div>
  );
}
