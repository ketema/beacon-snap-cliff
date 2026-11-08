/**
 * The answer block and its citation chips, as a food pantry owner sees them (2026-11-08 UX pass).
 * - A warehouse citation whose publisher or as-of date is "not recorded" falls back to the bundle's
 *   source register; one that resolves to nothing collapses into the neutral register chip. The
 *   words "not recorded" never render (REQ-29, REQ-40).
 * - An answer that resolves to a set of neighborhoods lists the top three with one reason each.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CitationChips, REGISTER_CHIP_TEXT } from './AiAnswer'
import type { AskCitation } from './askClient'
import { MatchSummary } from './MatchSummary'
import { SourcesContext, type SourceEntry } from '../sources'
import type { TractRecord } from '../wizard/alignmentWizard'

const REGISTER: readonly SourceEntry[] = [
  {
    id: 'DS-X12',
    label: 'Second Harvest sites',
    publisher: 'Second Harvest Food Bank of Central Florida',
    period: 'Food Finder snapshot retrieved November 7, 2026',
    url: 'https://feedhopenow.org/find-help/food-finder/',
    method: '',
    limits: '',
  },
]

const citation = (over: Partial<AskCitation>): AskCitation => ({
  table_name: 'second_harvest_sites',
  dataset_id: 'DS-X12',
  origin_url: 'not recorded',
  publisher: 'not recorded',
  as_of: 'not recorded',
  applied_filter: 'none',
  ...over,
})

function chips(citations: readonly AskCitation[]) {
  return render(
    <SourcesContext.Provider value={REGISTER}>
      <CitationChips citations={citations} />
    </SourcesContext.Provider>,
  )
}

describe('citation chips never read "not recorded"', () => {
  it('resolves an unrecorded publisher and date from the source register', () => {
    chips([citation({})])
    const chip = screen.getByTestId('citation-chip-second_harvest_sites')
    expect(chip).toHaveTextContent('DS-X12 Second Harvest sites')
    expect(chip).toHaveTextContent('Food Finder snapshot retrieved November 7, 2026')
    expect(chip).not.toHaveTextContent(/not recorded/i)
    expect(within(chip).queryByRole('link')).toBeNull()
  })

  it('keeps a recorded publisher, date and link as they are', () => {
    chips([
      citation({
        table_name: 'sba_loans',
        dataset_id: 'DS-X5',
        origin_url: 'https://data.sba.gov/dataset/7a-504-foia',
        publisher: 'U.S. Small Business Administration',
        as_of: '2026-09-30',
      }),
    ])
    const chip = screen.getByTestId('citation-chip-sba_loans')
    expect(chip).toHaveTextContent('DS-X5 U.S. Small Business Administration · as of 2026-09-30')
    expect(within(chip).getByRole('link')).toHaveAttribute(
      'href',
      'https://data.sba.gov/dataset/7a-504-foia',
    )
  })

  it('collapses citations that resolve to nothing into one neutral register chip', () => {
    chips([
      citation({ table_name: 'docs_taxonomy', dataset_id: 'REPO-DOC' }),
      citation({ table_name: 'docs_data_sources', dataset_id: 'REPO-DOC' }),
      citation({}),
    ])
    const list = screen.getByRole('list', { name: 'Sources for this answer' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByTestId('citation-chip-register')).toHaveTextContent(REGISTER_CHIP_TEXT)
    expect(list).not.toHaveTextContent(/not recorded/i)
    expect(screen.queryByTestId('citation-chip-docs_taxonomy')).toBeNull()
  })
})

const tract = (over: Partial<TractRecord>): TractRecord =>
  ({
    geoid: '12095016510',
    name: 'Census Tract 165.10',
    county: 'Orange',
    tract_class: 'Classic Food Desert',
    drawn: true,
    pct_poverty: 58.1,
    pct_no_vehicle: 16.5,
    sites_in_tract: 0,
    is_dual_gap: false,
    is_transport_gap: true,
    is_triple_gap: false,
    pop2020: 1000,
    sba_loans_total: 0,
    ...over,
  }) as TractRecord

describe('the answer lead', () => {
  it('shows the count, the top three with a reason each, and selects a neighborhood on click', () => {
    const onSelect = vi.fn()
    const tracts = [
      tract({}),
      tract({ geoid: '2', name: 'Census Tract 2', is_transport_gap: false, sites_in_tract: 0 }),
      tract({
        geoid: '3',
        name: 'Census Tract 3',
        is_transport_gap: false,
        sites_in_tract: 2,
        is_dual_gap: true,
      }),
      tract({ geoid: '4', name: 'Census Tract 4' }),
    ]
    render(
      <MatchSummary
        count={4}
        prose="Here are the places."
        tracts={tracts}
        view={{ pantry: true, lending: true }}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByText('4 neighborhoods match.')).toBeInTheDocument()
    expect(screen.getByText('Here are the places.')).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'Top neighborhoods' })).getAllByRole(
      'listitem',
    )
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent(
      'Census Tract 165.10, Orange County · 58.1% poverty · 16.5% no car · many homes with no car',
    )
    expect(items[1]).toHaveTextContent('no Second Harvest site inside')
    expect(items[2]).toHaveTextContent('few SBA loans for its population')
    fireEvent.click(within(items[0]!).getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith('12095016510')
  })

  it('keeps the other topic out of a single-topic view', () => {
    render(
      <MatchSummary
        count={1}
        tracts={[tract({ is_dual_gap: true })]}
        view={{ pantry: false, lending: true }}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('1 neighborhood matches.')).toBeInTheDocument()
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('few SBA loans')
    expect(item.textContent).not.toMatch(/no car|Second Harvest/)
  })
})
