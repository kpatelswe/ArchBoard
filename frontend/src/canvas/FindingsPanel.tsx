import { useState } from 'react'
import type { AnalysisResult, Finding } from '../lib/api'

const GLYPH = { error: '✕', warning: '!', suggestion: '~' } as const

/** Linter output for the board. Clicking a finding highlights its nodes on
 *  the canvas; clicking again clears. Re-runs arrive debounced from above. */
export function FindingsPanel({
  analysis,
  onHighlight,
}: {
  analysis: AnalysisResult | null
  onHighlight: (nodeIds: string[], edgeIds: string[]) => void
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (!analysis) {
    return (
      <aside className="findings">
        <h2 className="findings__heading">Analysis</h2>
        <p className="findings__empty">waiting for first run…</p>
      </aside>
    )
  }

  const findings: Finding[] = analysis.findings

  function toggle(index: number, finding: Finding) {
    if (openIndex === index) {
      setOpenIndex(null)
      onHighlight([], [])
    } else {
      setOpenIndex(index)
      onHighlight(finding.node_ids, finding.edge_ids)
    }
  }

  return (
    <aside className="findings">
      <h2 className="findings__heading">Analysis</h2>
      {findings.length === 0 ? (
        <p className="findings__empty">no findings — clean board</p>
      ) : (
        findings.map((finding, index) => (
          <button
            key={`${finding.rule}-${index}`}
            type="button"
            className={`finding finding--${finding.severity} ${
              openIndex === index ? 'is-open' : ''
            }`}
            onClick={() => toggle(index, finding)}
          >
            <span className="finding__head">
              <span className="finding__glyph">{GLYPH[finding.severity]}</span>
              <span className="finding__rule">{finding.rule}</span>
            </span>
            <span className="finding__message">{finding.message}</span>
            {openIndex === index && (
              <span className="finding__detail">
                <span>{finding.why}</span>
                <span>
                  <strong>Fix:</strong> {finding.mitigation}
                </span>
                <span>
                  <strong>Fine when:</strong> {finding.when_its_fine}
                </span>
              </span>
            )}
          </button>
        ))
      )}
    </aside>
  )
}
