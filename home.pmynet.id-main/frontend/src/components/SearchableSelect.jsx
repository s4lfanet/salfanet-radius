import { useState } from 'react'

const SearchableSelect = ({ options, value, onSelect, placeholder, disabled }) => {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.kode === value)
  const filtered = options.filter(o => o.nama.toLowerCase().includes(search.toLowerCase())).slice(0, 80)
  return (
    <div style={{ position: 'relative' }}>
      <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
        disabled={disabled}
        placeholder={disabled ? '— pilih level sebelumnya —' : placeholder}
        value={open ? search : (selected?.nama || '')}
        onFocus={() => { setOpen(true); setSearch('') }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setSearch(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      {open && !disabled && filtered.length > 0 && (
        <div
          onMouseDown={e => e.preventDefault()}
          style={{ position: 'absolute', zIndex: 1050, top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', marginTop: '2px' }}>
          {filtered.map(o => (
            <div key={o.kode} style={{ padding: '0.45rem 1rem', cursor: 'pointer', fontSize: '0.82rem', borderBottom: '1px solid var(--border-color)' }}
              onClick={() => { onSelect(o.kode, o.nama); setOpen(false); setSearch('') }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              {o.nama}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SearchableSelect
