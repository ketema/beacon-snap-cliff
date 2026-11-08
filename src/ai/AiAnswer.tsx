import { useContext, type ReactNode } from 'react'

import { SourcesContext } from '../sources'
import {
  AI_UNAVAILABLE_NOTICE,
  SESSION_ENDED_NOTICE,
  SIGN_IN_PATH,
  SIGN_IN_TEXT,
  isLinkableUrl,
  tractColumn,
  type AskAnswer,
  type AskCell,
  type AskCitation,
  type AskResult,
} from './askClient'

const TABLE_ROWS_MAX = 8
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function cellText(cell: AskCell | undefined): string {
  if (cell === null || cell === undefined) return 'No data'
  if (typeof cell === 'number') return nf.format(cell)
  if (typeof cell === 'boolean') return cell ? 'Yes' : 'No'
  return cell
}

const ACRONYMS = new Set(['acs', 'fema', 'geoid', 'id', 'nri', 'sba', 'snap', 'usda'])

/** `few_sba_loans` -> "Few SBA loans". */
function heading(column: string): string {
  const words = column.split('_').map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w))
  const text = words.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const isNumberColumn = (result: AskResult, column: string) =>
  result.rows.some((row) => typeof row[column] === 'number') &&
  result.rows.every((row) => row[column] === null || typeof row[column] === 'number')

const NOT_RECORDED = 'not recorded'
export const REGISTER_CHIP_TEXT = 'Source: project data register'

/** A warehouse provenance field is stated only when it is not blank and not "not recorded" (REQ-29). */
const isStated = (value: string) => {
  const text = value.trim()
  return text !== '' && text.toLowerCase() !== NOT_RECORDED
}

/**
 * REQ-40, POST-APP-13: one chip per cited table, with its ID, publisher, as-of date and origin link.
 * A field the warehouse did not record falls back to the bundle's source register (REQ-61): the
 * plain-language source name and its period. A citation that resolves to neither (for example the
 * repository documents cited as REPO-DOC) collapses into one neutral register chip, so the words
 * "not recorded" never reach the screen.
 */
export function CitationChips({ citations }: { readonly citations: readonly AskCitation[] }) {
  const register = useContext(SourcesContext)
  const unique = citations.filter(
    (c, i) => citations.findIndex((d) => d.table_name === c.table_name) === i,
  )
  if (unique.length === 0) {
    return <p className="sources">No source was cited for this answer.</p>
  }
  const resolved = unique.flatMap((c) => {
    const entry = register.find((s) => s.id === c.dataset_id)
    const title = isStated(c.publisher) ? c.publisher : (entry?.label ?? null)
    if (title === null) return []
    const date = isStated(c.as_of)
      ? `as of ${c.as_of}`
      : entry && isStated(entry.period)
        ? entry.period
        : null
    return [{ c, title, date }]
  })
  const unresolved = resolved.length < unique.length
  return (
    <ul className="cite-chips" aria-label="Sources for this answer">
      {resolved.map(({ c, title, date }) => {
        const body = (
          <>
            <b>{c.dataset_id}</b> {title}
            {date && <span className="cite-date"> · {date}</span>}
          </>
        )
        const hint = `Table ${c.table_name}. Filter: ${c.applied_filter}.`
        return (
          <li key={c.table_name} data-testid={`citation-chip-${c.table_name}`}>
            {isLinkableUrl(c.origin_url) ? (
              <a
                className="cite-chip"
                href={c.origin_url}
                target="_blank"
                rel="noreferrer"
                title={hint}
              >
                {body}
              </a>
            ) : (
              <span className="cite-chip" title={hint}>
                {body}
              </span>
            )}
          </li>
        )
      })}
      {unresolved && (
        <li data-testid="citation-chip-register">
          <span
            className="cite-chip"
            title="Project documents and data files listed in docs/data-sources.md."
          >
            {REGISTER_CHIP_TEXT}
          </span>
        </li>
      )}
    </ul>
  )
}

function ResultTable({ result }: { readonly result: AskResult }) {
  const shown = result.rows.slice(0, TABLE_ROWS_MAX)
  const numeric = new Set(result.columns.filter((c) => isNumberColumn(result, c)))
  return (
    <div className="answer-table-wrap">
      <table className="answer-table">
        <thead>
          <tr>
            {result.columns.map((c) => (
              <th key={c} scope="col" className={numeric.has(c) ? 'num' : undefined}>
                {heading(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {result.columns.map((c) => (
                <td key={c} className={numeric.has(c) ? 'num' : undefined}>
                  {cellText(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(result.row_count > shown.length || result.truncated) && (
        <p className="answer-table-note">
          Showing {shown.length} of {nf.format(result.row_count)} rows
          {result.truncated ? '. The service stopped at its row limit.' : '.'}
        </p>
      )}
    </div>
  )
}

/** A reply from the QueryService. Tract lists go to the map and the shortlist, not a table. */
export function AiAnswerCard({
  answer,
  knownGeoids,
  lead,
  extra,
  onClear,
}: {
  readonly answer: AskAnswer
  readonly knownGeoids: ReadonlySet<string>
  /** Replaces the plain answer text, for a reply that resolves to a set of neighborhoods. */
  readonly lead?: ReactNode
  readonly extra?: ReactNode
  readonly onClear: () => void
}) {
  const tables = answer.results.filter((r) => r.rows.length > 0 && !tractColumn(r, knownGeoids))
  return (
    <div className="answer answer--ai" role="status" data-testid="ai-answer">
      {lead ?? <p>{answer.answer}</p>}
      {extra}
      {tables.map((r, i) => (
        <ResultTable key={i} result={r} />
      ))}
      <CitationChips citations={answer.citations} />
      <p className="answer-meta">
        Answered by {answer.model}.{' '}
        <button type="button" className="linklike" onClick={onClear}>
          Clear
        </button>
      </p>
    </div>
  )
}

/** REQ-39 / SEQ-9: shown with the built-in wizard's answer when the AI did not answer. */
export function AiUnavailableNotice() {
  return (
    <p className="ai-notice" data-testid="ai-notice">
      {AI_UNAVAILABLE_NOTICE}
    </p>
  )
}

/** REQ-66: shown with the built-in wizard's answer when the ask call gets a 401. */
export function SessionEndedNotice() {
  return (
    <p className="ai-notice" data-testid="ai-notice">
      {SESSION_ENDED_NOTICE} <a href={SIGN_IN_PATH}>{SIGN_IN_TEXT}</a>
    </p>
  )
}

export function AskPending() {
  return (
    <p className="answer-pending" role="status">
      Looking up the answer…
    </p>
  )
}
