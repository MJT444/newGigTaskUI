// Searchable pickers for clients and freelancers. There are 1,000 clients and
// 2,000 freelancers, so both search on the server, 8 results at a time.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../api/client.js';
import { formatMoney } from '../lib/format.js';
import { useDebounced } from '../lib/useDebounced.js';
import { Badge } from './ui.jsx';

const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/**
 * Generic server-search combobox.
 *   endpoint   '/api/clients' | '/api/freelancers'
 *   extraQuery extra query params (e.g. { available: true })
 *   renderMeta (item) => node shown on the right of each option
 */
function SearchCombo({ id, value, onSelect, endpoint, extraQuery = {}, placeholder, emptyText, renderMeta, compact, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const search = useDebounced(text, 250);
  const boxRef = useRef(null);

  const q = useQuery({
    queryKey: [endpoint, 'picker', search, extraQuery],
    queryFn: () => api.get(`${endpoint}${qs({ search, pageSize: 8, ...extraQuery })}`),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className={`combo ${compact ? 'combo-compact' : ''}`} ref={boxRef}>
      <button
        id={id}
        type="button"
        className="combo-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="combo-avatar" aria-hidden="true">
          {value ? initials(value.name) : '?'}
        </span>
        <span className="combo-text">{value ? value.name : emptyText}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="combo-panel">
          <input
            autoFocus
            className="input"
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={placeholder}
          />
          <ul role="listbox" className="combo-list">
            {q.isPending && <li className="combo-note">Searching…</li>}
            {q.isError && <li className="combo-note">{q.error.message}</li>}
            {q.data && q.data.items.length === 0 && <li className="combo-note">No matches for “{search}”.</li>}
            {q.data?.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.id === item.id}
                  className="combo-option"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                    setText('');
                  }}
                >
                  <span>{item.name}</span>
                  <span className="muted">{renderMeta(item)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Client picker (the demo actor). onSelect receives { id, name, ... }. */
export function ClientSearch({ value, onSelect, compact = false }) {
  return (
    <SearchCombo
      value={value}
      onSelect={(c) => onSelect({ id: c.id, name: c.name })}
      endpoint="/api/clients"
      placeholder="Search clients…"
      emptyText="Choose a client"
      ariaLabel="Acting as client"
      compact={compact}
      renderMeta={(c) => formatMoney(c.escrow_balance)}
    />
  );
}

/** Freelancer picker. Shows availability and whether they already have a gig in progress. */
export function FreelancerSearch({ id, value, onSelect, availableOnly = false }) {
  return (
    <SearchCombo
      id={id}
      value={value}
      onSelect={onSelect}
      endpoint="/api/freelancers"
      extraQuery={availableOnly ? { available: true } : {}}
      placeholder="Search freelancers…"
      emptyText="Choose a freelancer"
      ariaLabel="Freelancer"
      renderMeta={(f) => <FreelancerState f={f} />}
    />
  );
}

export function FreelancerState({ f }) {
  if (f.in_progress_contract_id) return <Badge tone="busy">Gig in progress</Badge>;
  return f.is_available ? <Badge tone="available">Available</Badge> : <Badge tone="unavailable">Unavailable</Badge>;
}
