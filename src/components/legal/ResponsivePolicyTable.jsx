// @ts-check
// ResponsivePolicyTable — desktop renders a styled <table>; viewports
// ≤640px swap to a card-stack so phones don't have to horizontally
// scroll. Used by every policy section that surfaces tabular data
// (Data Retention §4, Access Control §4, future sections that grow
// tables). The shared inline <style> block scopes the breakpoint to
// rendered tables only — no global CSS leakage.
//
// Rows are objects with a `key` property (used for React keys + the
// card-stack title) plus one entry per column. Column definitions tell
// the component which property to read out of each row and which label
// to render — both as the table <th> on desktop and as the <dt> on
// mobile.

/**
 * @template T
 * @typedef {Object} ColumnDef
 * @property {string} label
 * @property {keyof T} field
 * @property {boolean=} primary  - if true, the value gets bolded on desktop
 *                                 and lifted into the card-stack title.
 */

/**
 * @template {{ key: string }} T
 * @param {{ columns: ColumnDef<T>[]; rows: T[] }} props
 */
export default function ResponsivePolicyTable({ columns, rows }) {
  const primary = columns.find(c => c.primary) || columns[0];
  const otherCols = columns.filter(c => c.field !== primary.field);

  return (
    <>
      <style>{`
        .fr-policy-table-wrap { margin: 14px 0; }
        .fr-policy-table {
          width: 100%; border-collapse: collapse; font-size: 13px;
          font-family: 'Inter', sans-serif;
          border: 0.5px solid rgba(58,58,58,0.15);
        }
        .fr-policy-table th {
          text-align: left; padding: 10px 12px;
          background: #3A3A3A; color: #F5F0E8;
          font-weight: 600; letter-spacing: 0.04em;
          font-size: 11px; text-transform: uppercase;
          border-bottom: 0.5px solid rgba(58,58,58,0.15);
        }
        .fr-policy-table td {
          padding: 10px 12px; border-bottom: 0.5px solid rgba(58,58,58,0.08);
          vertical-align: top; color: #3A3A3A;
        }
        .fr-policy-table td.is-primary { font-weight: 600; }
        .fr-policy-cards { display: none; }
        @media (max-width: 640px) {
          .fr-policy-table { display: none; }
          .fr-policy-cards { display: flex; flex-direction: column; gap: 10px; }
          .fr-policy-card {
            background: #fff; border: 0.5px solid rgba(58,58,58,0.15);
            border-radius: 8px; padding: 14px 16px;
          }
          .fr-policy-card-title {
            font-weight: 600; color: #3A3A3A; margin-bottom: 8px;
            font-size: 14px;
          }
          .fr-policy-card dl {
            margin: 0; display: grid;
            grid-template-columns: max-content 1fr;
            column-gap: 10px; row-gap: 6px;
            font-size: 12.5px; line-height: 1.5;
          }
          .fr-policy-card dt {
            color: rgba(58,58,58,0.55);
            font-size: 10px; letter-spacing: 0.06em;
            text-transform: uppercase;
            padding-top: 2px;
          }
          .fr-policy-card dd { margin: 0; color: #3A3A3A; }
        }
      `}</style>

      <div className="fr-policy-table-wrap">
        <table className="fr-policy-table">
          <thead>
            <tr>
              {columns.map(col => <th key={String(col.field)}>{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                {columns.map(col => (
                  <td
                    key={String(col.field)}
                    className={col.primary ? 'is-primary' : undefined}
                  >
                    {/** @type {any} */ (row)[col.field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="fr-policy-cards">
          {rows.map(row => (
            <div key={row.key} className="fr-policy-card">
              <div className="fr-policy-card-title">
                {/** @type {any} */ (row)[primary.field]}
              </div>
              <dl>
                {otherCols.map(col => (
                  <div key={String(col.field)} style={{ display: 'contents' }}>
                    <dt>{col.label}</dt>
                    <dd>{/** @type {any} */ (row)[col.field]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
