/**
 * The lead of an answer that resolves to a set of neighborhoods: the count, any prose the service
 * returned beyond the count, and the top matches with one reason each. Every value comes from the
 * tract records already in the client (the Build's flags and shares), never from the model, so the
 * AI path and the built-in fallback show the same block.
 */
import { CLASS_HIGH_NEED, CLASS_INSUFFICIENT, type TractRecord } from '../wizard/alignmentWizard'

export const TOP_MATCHES = 3

const nf = new Intl.NumberFormat('en-US')
const pct = (v: number | null) => (v === null ? 'No data' : `${v.toFixed(1)}%`)

export interface ViewTopics {
  readonly pantry: boolean
  readonly lending: boolean
}

/** One short reason from the gap flags, limited to the topics of the current view. */
function matchReason(t: TractRecord, view: ViewTopics): string {
  if (view.pantry && view.lending && t.is_triple_gap) return 'all three gaps'
  if (view.pantry && t.is_transport_gap) return 'many homes with no car'
  if (view.lending && t.is_dual_gap) return 'few SBA loans for its population'
  if (view.pantry && t.sites_in_tract === 0) return 'no Second Harvest site inside'
  if (t.tract_class === CLASS_HIGH_NEED) return 'food desert'
  if (t.tract_class === CLASS_INSUFFICIENT) return 'needs a data check'
  return 'no gap flagged'
}

function countLine(count: number): string {
  if (count === 0) return 'No neighborhoods match. Try another county or fewer words.'
  return `${nf.format(count)} ${count === 1 ? 'neighborhood matches' : 'neighborhoods match'}.`
}

export function MatchSummary({
  count,
  prose,
  tracts,
  view,
  onSelect,
}: {
  readonly count: number
  /** The service's answer text, shown when it says more than the count line. */
  readonly prose?: string | null
  /** The matched neighborhoods in shortlist order (most poverty first). */
  readonly tracts: readonly TractRecord[]
  readonly view: ViewTopics
  readonly onSelect: (geoid: string) => void
}) {
  const line = countLine(count)
  const text = prose?.trim() ?? ''
  // Prose that already opens with the count ("12 neighborhoods match, with ...") stands alone.
  const proseHasCount = text !== '' && text.startsWith(line.replace(/\.$/, ''))
  const top = tracts.slice(0, TOP_MATCHES)
  return (
    <>
      {!proseHasCount && <p className="answer-count">{line}</p>}
      {text !== '' && text !== line && <p>{text}</p>}
      {top.length > 0 && (
        <ol className="answer-top" aria-label="Top neighborhoods">
          {top.map((t) => (
            <li key={t.geoid}>
              <button
                type="button"
                className="linklike"
                data-testid={`answer-top-${t.geoid}`}
                onClick={() => onSelect(t.geoid)}
              >
                {t.name}, {t.county} County
              </button>
              <span className="answer-top-facts">
                {' · '}
                {pct(t.pct_poverty)} poverty
                {view.pantry && <> · {pct(t.pct_no_vehicle)} no car</>}
              </span>
              <span className="answer-reason"> · {matchReason(t, view)}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
