import { useEffect, useState } from 'react'
import type { AnalysisResult, Finding } from '../lib/api'

const GLYPH = { error: '✕', warning: '!', suggestion: '~' } as const
const identity = (finding: Finding) => JSON.stringify([
  finding.rule, [...finding.node_ids].sort(), [...finding.edge_ids].sort(),
])

/** Linter output for the board. Clicking a finding highlights its nodes on
 *  the canvas; clicking again clears. Re-runs arrive debounced from above. */
export function FindingsPanel({
  analysis,
  onHighlight,
}: {
  analysis: AnalysisResult | null
  onHighlight: (nodeIds: string[], edgeIds: string[]) => void
}) {
  const [selection, setSelection] = useState<{ id: string; analysis: AnalysisResult } | null>(null)
  const selected = selection?.id
  const active = analysis?.findings.find((finding) => identity(finding) === selected)
  if (selection && analysis !== selection.analysis) {
    setSelection(active && analysis ? { id: selection.id, analysis } : null)
  }
  useEffect(() => {
    onHighlight(active?.node_ids ?? [], active?.edge_ids ?? [])
  }, [active, onHighlight])

  if (!analysis) {
    return (
      <aside className="findings">
        <h2 className="findings__heading">Analysis</h2>
        <p className="findings__empty">waiting for first run…</p>
      </aside>
    )
  }

  const findings: Finding[] = analysis.findings
  const counts = { error: 0, warning: 0, suggestion: 0 }
  findings.forEach((finding) => counts[finding.severity]++)

  function toggle(finding: Finding) {
    const id = identity(finding)
    if (analysis) setSelection((current) => current?.id === id ? null : { id, analysis })
  }

  return (
    <aside className="findings">
      <h2 className="findings__heading">Analysis</h2>
      <p className="findings__subtitle">A second pair of eyes.</p>
      <div className="findings__summary" aria-label="Finding counts">
        {(['error', 'warning', 'suggestion'] as const).map((severity) => (
          <span key={severity} className={`severity-chip severity-chip--${severity}`}>
            <strong>{counts[severity]}</strong> {severity}{counts[severity] === 1 ? '' : 's'}
          </span>
        ))}
      </div>
      {findings.length === 0 ? (
        <div className="findings__clear" role="status">
          <span aria-hidden="true">✓</span>
          <h3>Looking good.</h3>
          <p>No structural issues spotted. Keep exploring — a great design is all about the tradeoffs.</p>
        </div>
      ) : (
        findings.map((finding) => (
          <button
            key={identity(finding)}
            type="button"
            className={`finding finding--${finding.severity} ${
              selected === identity(finding) ? 'is-open' : ''
            }`}
            onClick={() => toggle(finding)}
          >
            <span className="finding__head">
              <span className="finding__glyph">{GLYPH[finding.severity]}</span>
              <span className="finding__rule">{finding.rule}</span>
            </span>
            <span className="finding__message">{finding.message}</span>
            {selected === identity(finding) && (
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
