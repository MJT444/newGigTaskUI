// Table that turns into stacked cards on phones (see .table-responsive in CSS:
// each cell shows its column label from data-label).
//
// columns: [{ key, header, render?: (row) => node, align?: 'right' }]

export function DataTable({ columns, rows, rowKey = 'id', onRowClick, selectedKey, caption, dimmed = false }) {
  return (
    <div className={`table-wrap ${dimmed ? 'is-dimmed' : ''}`}>
      <table className="table table-responsive">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'right' ? 'num' : ''}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = typeof rowKey === 'function' ? rowKey(row) : row[rowKey];
            const clickable = Boolean(onRowClick);
            return (
              <tr
                key={key}
                className={`${clickable ? 'row-clickable' : ''} ${selectedKey === key ? 'row-selected' : ''}`}
                onClick={clickable ? () => onRowClick(row) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} data-label={c.header} className={c.align === 'right' ? 'num' : ''}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage, isFetching }) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Previous
      </button>
      <span className="pagination-info">
        Page {page.toLocaleString('en-IN')} of {totalPages.toLocaleString('en-IN')}
        {typeof total === 'number' && <span className="muted"> · {total.toLocaleString('en-IN')} records</span>}
        {isFetching && <span className="spinner spinner-inline" aria-label="Loading" />}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next →
      </button>
    </nav>
  );
}
