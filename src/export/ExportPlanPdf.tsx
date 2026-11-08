import { useContext, useState } from 'react'
import { SourcesContext } from '../sources'
import type { CoordinatedActionBrief, TractRecord } from '../wizard/alignmentWizard'
import type { CutValues } from '../wizard/gapRules'
import './exportPdf.css'

export function ExportPlanPdf({
  brief,
  tracts,
  cut,
  minPopulation,
}: {
  brief: CoordinatedActionBrief
  tracts: readonly TractRecord[]
  cut: CutValues
  minPopulation: number
}) {
  const sources = useContext(SourcesContext)
  const [state, setState] = useState<'idle' | 'exporting' | 'error'>('idle')

  async function exportPdf() {
    setState('exporting')
    try {
      const { createPlanPdf, planFilename } = await import('./planPdf')
      const doc = createPlanPdf({
        brief,
        tracts,
        sources,
        cut,
        minPopulation,
        createdAt: new Date(),
      })
      await doc.save(planFilename(brief), { returnPromise: true })
      setState('idle')
    } catch (error) {
      console.error('Action plan PDF export failed.', error)
      setState('error')
    }
  }

  return (
    <div className="pdf-export-row">
      <button
        type="button"
        className="pdf-export-button"
        onClick={exportPdf}
        disabled={state === 'exporting'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5" />
        </svg>
        {state === 'exporting' ? 'Preparing PDF...' : 'Export to PDF'}
      </button>
      {state === 'error' && (
        <p className="pdf-export-error" role="alert">
          The PDF could not be created. Try again.
        </p>
      )}
    </div>
  )
}
