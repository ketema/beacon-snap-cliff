import { jsPDF } from 'jspdf'
import type { SourceEntry } from '../sources'
import { actionSteps, sourceIdsForView, VIEW_CONTENT } from '../viewContent'
import {
  PERSONA_LENSES,
  type CoordinatedActionBrief,
  type TractRecord,
} from '../wizard/alignmentWizard'
import { rateText, type CutValues } from '../wizard/gapRules'

type PdfInput = {
  brief: CoordinatedActionBrief
  tracts: readonly TractRecord[]
  sources: readonly SourceEntry[]
  createdAt: Date
  cut: CutValues
  minPopulation: number
}

const colors = {
  ink: '#1E343F',
  muted: '#526570',
  line: '#DCE3E6',
  paper: '#F3F6F7',
  orange: '#F79122',
  orangeTint: '#FFF3E3',
  green: '#388D58',
}
const number = new Intl.NumberFormat('en-US')
const width = 612
const height = 792
const margin = 42
const contentWidth = width - margin * 2

// jsPDF's standard fonts cover this document's Latin text. Normalize source punctuation.
const plain = (text: string) =>
  text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/\u00a0/g, ' ')

export function planFilename(brief: CoordinatedActionBrief) {
  const selection = brief.title
    .replace(/^Action plan:\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return `beacon-action-plan-${brief.personaId}-${selection || 'results'}.pdf`
}

export function createPlanPdf({ brief, tracts, sources, createdAt, cut, minPopulation }: PdfInput) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const view = VIEW_CONTENT[brief.personaId]
  const viewLabel = PERSONA_LENSES.find((lens) => lens.id === brief.personaId)!.label
  const steps = actionSteps(tracts)
  const needsAssessment = brief.dataCheckTractCount === brief.targetTractCount
  const selection = brief.title.replace(/^Action plan:\s*/i, '')
  let y = margin

  doc.setProperties({
    title: brief.title,
    subject: `${viewLabel} action plan for Central Florida`,
    author: "Beacon, with data from DataKind's Beacon",
    creator: 'Beacon action plan PDF export',
  })

  function text(
    value: string,
    x: number,
    top: number,
    size = 10,
    bold = false,
    color = colors.ink,
  ) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(color)
    doc.text(plain(value), x, top, { baseline: 'top' })
  }

  function lines(value: string, maxWidth = contentWidth, size = 10) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    return doc.splitTextToSize(plain(value), maxWidth) as string[]
  }

  function room(space: number) {
    if (y + space > height - 66) {
      doc.addPage()
      y = margin
      text('BEACON / ACTION PLAN', margin, y, 9, true, colors.muted)
      y += 28
    }
  }

  function paragraph(value: string, size = 10, color = colors.ink, inset = 0) {
    for (const line of lines(value, contentWidth - inset, size)) {
      room(size * 1.45)
      text(line, margin + inset, y, size, false, color)
      y += size * 1.45
    }
    y += 7
  }

  function heading(value: string) {
    room(48)
    y += 11
    text(value, margin, y, 12, true)
    y += 23
  }

  function bullets(items: readonly string[]) {
    for (const item of items) {
      const rows = lines(item, contentWidth - 18)
      room(rows.length * 14.5 + 9)
      doc.setFillColor(colors.orange)
      doc.circle(margin + 3, y + 5, 2, 'F')
      paragraph(item, 10, colors.ink, 16)
    }
  }

  function stat(x: number, boxWidth: number, label: string, value: string, note?: string) {
    doc.setFillColor(colors.paper)
    doc.roundedRect(x, y, boxWidth, 73, 5, 5, 'F')
    text(label, x + 14, y + 11, 8.5, true, colors.muted)
    text(value, x + 14, y + 27, 23, true)
    if (note) text(note, x + 14, y + 56, 8, false, colors.muted)
  }

  doc.setFillColor(colors.orange)
  doc.circle(margin + 4, y + 6, 4, 'F')
  text('BEACON', margin + 18, y, 11, true)
  text('OPPORTUNITIES TO SERVE', margin + 89, y + 1, 8, false, colors.muted)
  const date = createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  text(date, width - margin - 70, y + 1, 8, false, colors.muted)
  y += 34
  text('Your action plan', margin, y, 28, true)
  y += 39
  text(`${viewLabel}  /  Central Florida`, margin, y, 10, true, colors.muted)
  y += 24
  paragraph(selection, 13)
  const counties = [...new Set(tracts.map((tract) => tract.county))].sort()
  paragraph(`Counties in this selection: ${counties.join(', ') || 'None'}.`, 9, colors.muted)
  y += 6

  room(86)

  const gap = 10
  const boxWidth = (contentWidth - gap * 2) / 3
  stat(
    margin,
    boxWidth,
    'NEIGHBORHOODS',
    number.format(brief.targetTractCount),
    'Selected for this plan',
  )
  stat(
    margin + boxWidth + gap,
    boxWidth,
    '2020 POPULATION',
    number.format(brief.totalResidentsCovered),
    'Residents in the selection',
  )
  stat(
    margin + (boxWidth + gap) * 2,
    boxWidth,
    'NEED DATA CHECKS',
    number.format(brief.dataCheckTractCount),
    'Check before choosing help',
  )
  y += 86

  if (view.pantry) {
    heading(view.lending ? '01  For your pantry' : '01  Next steps')
    bullets(steps.pantry)
  }
  if (view.lending) {
    heading(view.pantry ? '02  For lending partners' : '01  Next steps')
    bullets(steps.lending)
  }

  heading('Selection details')
  if (view.pantry)
    paragraph(
      `Many with no car: ${needsAssessment ? 'Not assessed' : number.format(brief.mobilePriorityTractCount)}.`,
      9.5,
    )
  if (view.lending)
    paragraph(
      `Few business loans: ${needsAssessment ? 'Not assessed' : number.format(brief.dualGapTractCount)}.`,
      9.5,
    )

  if (view.pantry && view.lending) {
    heading('If both partners act')
    room(118)
    const scenarioY = y
    doc.setFillColor(colors.orangeTint)
    doc.roundedRect(margin, scenarioY, contentWidth, 98, 5, 5, 'F')
    text('ASSUMPTION / OUTCOMES NOT MEASURED', margin + 14, scenarioY + 11, 8, true, colors.muted)
    const scenarioWidth = (contentWidth - 28) / 3
    for (const [index, label, value, color] of [
      [0, 'Today', `${brief.withoutCoordinationGapPct}%`, colors.ink],
      [1, 'If both partners act', `${brief.withJointDeploymentGapPct}%`, colors.green],
      [2, 'Percentage points lower', String(brief.percentagePointReduction), colors.green],
    ] as const) {
      const x = margin + 14 + index * scenarioWidth
      text(label, x, scenarioY + 31, 8.5, true, colors.muted)
      text(value, x, scenarioY + 49, 25, true, color)
    }
    text(
      'Share with no listed site today; share without a site or proposed service in the scenario.',
      margin + 14,
      scenarioY + 81,
      7.5,
      false,
      colors.muted,
    )
    y = scenarioY + 109
    paragraph(
      'These figures assume all planned services happen. Results have not been measured.',
      9,
      colors.muted,
    )
    if (brief.percentagePointReduction === 0)
      paragraph('This plan does not reach these neighborhoods.', 10)
  }

  doc.addPage()
  y = margin
  text('BEACON / PLAN DETAILS', margin, y, 9, true, colors.muted)
  y += 30
  text('Basis, assumptions & sources', margin, y, 22, true)
  y += 35

  heading('Rules used for this plan')
  paragraph(
    `Food desert: poverty at or above ${rateText(cut.poverty)}% and the USDA low-income, low-access driving-distance flag.`,
    9,
  )
  if (view.pantry)
    paragraph(
      `Many with no car: at least ${rateText(cut.no_vehicle)}% of households have no vehicle.`,
      9,
    )
  if (view.lending)
    paragraph(
      `Few business loans: a food desert with at least ${number.format(minPopulation)} residents and at most ${cut.sba_rate_per_1000.toFixed(4)} SBA loans per 1,000 residents.`,
      9,
    )

  if (view.pantry) {
    heading('Food bank detail')
    paragraph(brief.foodBankAction)
  }
  if (view.lending) {
    heading('Lending partner detail')
    paragraph(brief.sbaOfficerAction)
  }
  if (view.pantry && view.lending) {
    heading('Scenario basis')
    paragraph(brief.narrativeSummary, 9)
  }

  heading('Read these limits with the result')
  paragraph(
    'Values come from saved source snapshots, not a live feed. Dates differ by source. Population is from the 2020 Census. Survey rates are estimates. Missing values are not measured zeros.',
    9,
  )
  if (view.pantry) {
    const siteSource = sources.find((source) => source.id === 'DS-X12')
    if (siteSource) paragraph(siteSource.limits, 9)
    paragraph(
      'A site inside a neighborhood does not prove that residents can use it. Check hours, access and capacity before planning service.',
      9,
    )
  }
  if (view.lending) {
    const loanSource = sources.find((source) => source.id === 'DS-X5')
    if (loanSource) paragraph(loanSource.limits, 9)
  }

  heading('Sources for this view')
  const ids = sourceIdsForView(brief.sourcesCited, brief.personaId)
  for (const id of ids) {
    const source = sources.find((entry) => entry.id === id)
    if (!source) {
      paragraph(`${id}: source not registered.`, 9)
      continue
    }
    const publisherLines = lines(source.publisher, contentWidth - 85, 8)
    const periodLines = lines(source.period, contentWidth, 8)
    room(22 + (publisherLines.length + periodLines.length) * 11 + 10)
    doc.setDrawColor(colors.line)
    doc.line(margin, y, width - margin, y)
    y += 9
    text(`${source.id}  ${source.label}`, margin, y, 9, true)
    if (/^https?:\/\//i.test(source.url)) {
      doc.setTextColor(colors.ink)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.textWithLink('Open source', width - margin - 47, y + 7, { url: source.url })
    }
    y += 16
    for (const line of publisherLines) {
      text(line, margin, y, 8, false, colors.muted)
      y += 11
    }
    for (const line of periodLines) {
      text(line, margin, y, 8, false, colors.muted)
      y += 11
    }
    y += 8
  }

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setDrawColor(colors.line)
    doc.line(margin, height - 47, width - margin, height - 47)
    text("Data from DataKind's Beacon. CC BY 4.0.", margin, height - 36, 7.5, false, colors.muted)
    doc.setTextColor(colors.muted)
    doc.setFontSize(7.5)
    doc.textWithLink('DataKind and Beacon (www.datakind.org)', margin, height - 17, {
      url: 'https://www.datakind.org',
    })
    text(`${page} / ${pageCount}`, width - margin - 25, height - 32, 8, false, colors.muted)
  }
  return doc
}
