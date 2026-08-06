import { useState } from 'react'

export default function DataTable({ rows, columns, rowKey = 'id', onRowClick, emptyMessage = 'Nothing to show.' }) {
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const toggle = (key) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }

  const sorted = sortCol
    ? [...rows].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol]
        if (av == null) return 1
        if (bv == null) return -1
        const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    : rows

  if (!rows.length) {
    return (
      <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
        <p className="text-slate">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-mist bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-mist">
            {columns.map(col => (
              <th
                key={col.key}
                onClick={col.sortable ? () => toggle(col.key) : undefined}
                className={`text-left px-4 py-3 text-xs uppercase tracking-widest text-slate font-medium ${col.sortable ? 'cursor-pointer select-none hover:text-ink' : ''}`}
              >
                {col.header}
                {sortCol === col.key && (
                  <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-mist last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-teal/5' : ''}`}
            >
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-ink">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
