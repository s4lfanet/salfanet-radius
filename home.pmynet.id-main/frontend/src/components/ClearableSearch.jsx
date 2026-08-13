export default function ClearableSearch({ value, onChange, placeholder = 'Cari...', style = {}, className = 'search-input' }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <input
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{ paddingRight: value ? '2rem' : '0.75rem', ...style }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          style={{
            position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
            color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '4px',
          }}
          title="Hapus pencarian"
        >✕</button>
      )}
    </div>
  )
}
