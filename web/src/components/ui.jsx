// The small reusable component set used on every screen. Styling lives in
// styles/global.css under the same class names, so screens stay consistent.
import { formatMoney } from '../lib/format.js';
import { statusLabel } from '../lib/contractStatus.js';

export function Button({ variant = 'primary', size, loading = false, children, className = '', ...props }) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} {...props} disabled={loading || props.disabled} aria-busy={loading || undefined}>
      {loading && <span className="spinner spinner-inline" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Money({ value, signed = false, action }) {
  // action = 'DEBIT' | 'CREDIT' for audit rows
  const n = Number(value);
  const negative = action === 'DEBIT' || (signed && n < 0);
  const text = formatMoney(Math.abs(n));
  return (
    <span className={`money ${negative ? 'money-neg' : action === 'CREDIT' || (signed && n > 0) ? 'money-pos' : ''}`}>
      {negative ? '−' : action === 'CREDIT' || (signed && n > 0) ? '+' : ''}
      {text}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${String(status).toLowerCase()}`}>{statusLabel(status)}</span>;
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`tab ${value === t.value ? 'tab-active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Alert({ tone = 'info', title, children }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title && <strong className="alert-title">{title}</strong>}
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}

/** Labelled key/value list for detail views. */
export function DetailList({ items }) {
  return (
    <dl className="detail-list">
      {items.map(([k, v]) => (
        <div key={k} className="detail-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
