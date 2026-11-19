import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Bot, Braces, Check, CheckCircle2, ChevronRight, CircleDashed, Clock3, Cpu, Database, GitBranch, Layers3, Lightbulb, Link2, MousePointer2, Network, Play, Plus, RotateCcw, ShieldCheck, Sparkles, Terminal, UserRound, Workflow, X, type LucideIcon } from 'lucide-react'
import { COMPONENTS, LESSONS, PROGRESS_KEY, checkArchitecture, connect, connectionId, readProgress, removeComponent, starterFor, type Architecture, type ComponentId } from './curriculum'
import './learning.css'

const COMPONENT_ICONS: Record<ComponentId, LucideIcon> = {
  user: UserRound, model: Cpu, agent: Bot, tools: Braces, knowledge: Layers3,
  memory: Database, guardrail: ShieldCheck, approval: UserRound, queue: GitBranch, telemetry: Network,
}

function loadProgress() {
  try { return readProgress(localStorage.getItem(PROGRESS_KEY)) } catch { return readProgress(null) }
}

function componentPosition(id: ComponentId, firstLesson: boolean) {
  if (firstLesson) return { x: id === 'user' ? 238 : 586, y: 226 }
  return COMPONENTS[id]
}

export function LearningPage() {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [progress, setProgress] = useState(loadProgress)
  const [source, setSource] = useState<ComponentId | null>(null)
  const [inspected, setInspected] = useState<ComponentId>('user')
  const [showHint, setShowHint] = useState(false)
  const [checked, setChecked] = useState(false)
  const [traceIndex, setTraceIndex] = useState<number | null>(null)
  const [storageFailed, setStorageFailed] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const lessonIndex = LESSONS.findIndex(l => l.id === progress.active)
  const lesson = LESSONS[lessonIndex]
  const graph = progress.graphs[lesson.id] ?? starterFor(lesson)
  const checks = checkArchitecture(lesson, graph)
  const passed = checks.every(check => check.passed)
  const completed = progress.completed.includes(lesson.id)
  const event = traceIndex === null ? null : lesson.trace[traceIndex]
  const traceFinished = traceIndex === lesson.trace.length - 1

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
    } catch { setStorageFailed(true) }
  }, [progress])

  function updateGraph(next: Architecture) {
    if (next === graph) return
    setProgress(current => ({ ...current, graphs: { ...current.graphs, [lesson.id]: next }, completed: current.completed.filter(id => id !== lesson.id) }))
    setChecked(false)
    setTraceIndex(null)
  }

  function toggleComponent(id: ComponentId) {
    const removing = graph.nodes.includes(id)
    updateGraph(removing ? removeComponent(graph, id) : { ...graph, nodes: [...graph.nodes, id] })
    setSource(null)
    setInspected(removing ? 'user' : id)
    setAnnouncement(`${COMPONENTS[id].name} ${removing ? 'removed' : 'added'}.`)
  }

  function selectLesson(index: number) {
    setProgress(current => ({ ...current, active: LESSONS[index].id }))
    setSource(null)
    setInspected('user')
    setShowHint(false)
    setChecked(false)
    setTraceIndex(null)
    setResetting(false)
    setAnnouncement(`Lesson ${index + 1}: ${LESSONS[index].title}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
    headingRef.current?.focus({ preventScroll: true })
  }

  function chooseNode(id: ComponentId) {
    setInspected(id)
    if (!source) {
      setSource(id)
      setAnnouncement(`${COMPONENTS[id].name} selected. Choose a destination, or select it again to cancel.`)
      return
    }
    if (source !== id) {
      const next = connect(graph, source, id)
      updateGraph(next)
      setAnnouncement(next === graph ? 'That connection already exists.' : `Connected ${COMPONENTS[source].name} to ${COMPONENTS[id].name}.`)
    }
    setSource(null)
  }

  function advanceTrace(index: number) {
    setTraceIndex(index)
    if (index === lesson.trace.length - 1) {
      setProgress(current => ({ ...current, graphs: { ...current.graphs, [lesson.id]: graph }, completed: [...new Set([...current.completed, lesson.id])] }))
    }
  }

  function runArchitecture() {
    setSource(null)
    setChecked(true)
    if (passed) {
      advanceTrace(0)
      setAnnouncement('Architecture checks passed. Step through the request trace below.')
    } else {
      setTraceIndex(null)
      setAnnouncement('Not quite yet. Review the unmet architecture checks below the canvas.')
    }
  }

  const InspectedIcon = COMPONENT_ICONS[inspected]

  return (
    <div className="learning">
      <header className="learning__nav">
        <Link to="/" className="learning__brand" aria-label="ArchBoard home">
          <span className="learning__brand-icon"><Workflow size={21} strokeWidth={1.7} /></span>
          ArchBoard<span className="learning__brand-divider">/</span><span className="learning__nav-label">WORKSHOP</span>
        </Link>
        <div className="learning__nav-status"><span className="learning__live-dot" /> Local playground <span className="learning__nav-status-divider">/</span> No API keys needed</div>
        <Link to="/" className="learning__back">Open whiteboard <ArrowRight size={15} /></Link>
      </header>

      <div className="learning__body">
        <aside className="learning__syllabus" aria-label="Learning path">
          <Link to="/" className="learning__rail-back"><ArrowLeft size={14} /> ALL WORKSPACES</Link>
          <div className="learning__course-icon"><Workflow size={25} strokeWidth={1.5} /><span>0 → 1</span></div>
          <div className="learning__eyebrow">INTERACTIVE FIELD GUIDE</div>
          <h1>Agent <br />architecture<span>.</span></h1>
          <p className="learning__intro">From your first model call<br />to a system you can reason about.</p>
          <div className="learning__course-meta"><span><BookOpen size={12} /> 6 labs</span><span><Clock3 size={12} /> 28 min</span></div>
          <div className="learning__progress-label"><span>YOUR PROGRESS</span><strong>{progress.completed.length}<span> / {LESSONS.length}</span></strong></div>
          <progress className="learning__progress" max={LESSONS.length} value={progress.completed.length} aria-label="Lessons completed" />
          <nav className="learning__lessons" aria-label="Lessons">
            {LESSONS.map((item, index) => (
              <button type="button" key={item.id} onClick={() => selectLesson(index)} className={`learning__lesson ${lesson.id === item.id ? 'is-active' : ''}`} aria-current={lesson.id === item.id ? 'step' : undefined}>
                <span className={`learning__lesson-number ${progress.completed.includes(item.id) ? 'is-done' : ''}`}>{progress.completed.includes(item.id) ? <Check size={13} aria-label="Completed" /> : String(index + 1).padStart(2, '0')}</span>
                <span><strong>{item.title}</strong><small>{item.minutes} MIN · {progress.completed.includes(item.id) ? 'COMPLETED' : lesson.id === item.id ? 'IN PROGRESS' : 'HANDS-ON LAB'}</small></span>
                {lesson.id === item.id && <ChevronRight size={14} />}
              </button>
            ))}
          </nav>
          <div className="learning__path-note"><Sparkles size={16} /><p>Less theory.<br /><strong>More connecting the dots.</strong></p></div>
          <p className="learning__save-note">{storageFailed ? 'Storage unavailable. Progress lasts for this visit.' : 'Saved on this device. Pick up where you left off.'}</p>
        </aside>

        <main className="learning__main">
          <div className="learning__breadcrumb">Workshop <ChevronRight size={12} /> Agent architecture <ChevronRight size={12} /><span>Lab {String(lessonIndex + 1).padStart(2, '0')}</span></div>
          <div className="learning__heading">
            <div>
              <div className="learning__eyebrow"><span className="learning__title-line" />{lesson.subtitle}</div>
              <h2 ref={headingRef} tabIndex={-1}>{lesson.title}</h2>
            </div>
            <div className="learning__heading-meta">
              <span className="learning__badge">{completed ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{completed ? 'Completed' : `${lesson.minutes} min lab`}</span>
              <span className="learning__lab-number">{String(lessonIndex + 1).padStart(2, '0')}<span>/06</span></span>
            </div>
          </div>

          <div className="learning__mobile-mission"><Workflow size={17} /><div><strong>Your mission</strong><p>{lesson.mission}</p></div></div>
          <div className="learning__lab-grid">
            <div className="learning__canvas-column">
              <section className="learning__workspace" aria-label="Interactive architecture builder">
                <div className="learning__workspace-bar">
                  <span className="learning__workspace-title"><Workflow size={16} /> Your architecture <span className="learning__workspace-count">{graph.nodes.length} nodes · {graph.edges.length} links</span></span>
                  <button type="button" className="learning__reset-button" onClick={() => setResetting(true)} aria-label="Reset lesson"><RotateCcw size={14} /><span>Reset</span></button>
                </div>
                {resetting && <div className="learning__reset" role="alert"><span>Reset this lesson’s diagram and completion? Other lessons stay saved.</span><button type="button" onClick={() => { updateGraph(starterFor(lesson)); setSource(null); setInspected('user'); setResetting(false) }}>Reset diagram</button><button type="button" onClick={() => setResetting(false)}>Cancel</button></div>}
                <div className="learning__canvas-scroll">
                  <div className={`learning__canvas ${source ? 'has-source' : ''}`} onKeyDown={e => { if (e.key === 'Escape') setSource(null) }}>
                    <div className="learning__canvas-caption"><span className="learning__live-dot" />{source ? `FROM ${COMPONENTS[source].name.toUpperCase()} → CHOOSE A TARGET` : 'CLICK A SOURCE, THEN A DESTINATION'}</div>
                    <svg className="learning__wires" viewBox="0 0 1000 530" aria-hidden="true">
                      <defs><marker id="learning-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
                      {graph.edges.map(connection => {
                        const a = componentPosition(connection.source, lessonIndex === 0)
                        const b = componentPosition(connection.target, lessonIndex === 0)
                        const dx = b.x - a.x
                        const dy = b.y - a.y
                        const horizontal = Math.abs(dx) > Math.abs(dy)
                        const x1 = a.x + (horizontal ? (dx > 0 ? 158 : 0) : 79)
                        const y1 = a.y + (horizontal ? 31 : (dy > 0 ? 62 : 0))
                        const x2 = b.x + (horizontal ? (dx > 0 ? 0 : 158) : 79)
                        const y2 = b.y + (horizontal ? 31 : (dy > 0 ? 0 : 62))
                        return <path key={connectionId(connection)} d={horizontal ? `M${x1},${y1} C${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}`} className={event && (event.node === connection.source || event.node === connection.target) ? 'is-tracing' : ''} markerEnd="url(#learning-arrow)" />
                      })}
                    </svg>
                    {graph.nodes.map(id => {
                      const component = COMPONENTS[id]
                      const position = componentPosition(id, lessonIndex === 0)
                      const Icon = COMPONENT_ICONS[id]
                      return (
                        <button type="button" key={id} data-kind={id} aria-label={`${component.name}${source === id ? ', selected as source' : ''}`} aria-pressed={source === id} onClick={() => chooseNode(id)} className={`learning__node ${source === id ? 'is-source' : ''} ${event?.node === id ? 'is-tracing' : ''}`} style={{ left: `${position.x / 10}%`, top: `${position.y / 5.3}%` }}>
                          <span className="learning__node-input" /><span className="learning__node-symbol"><Icon size={18} strokeWidth={1.6} /></span>
                          <span className="learning__node-copy"><strong>{component.name}</strong><small>{component.category}</small></span><span className="learning__node-port" />
                        </button>
                      )
                    })}
                    {graph.nodes.length === 1 && <button type="button" className="learning__empty-slot" aria-label="Place a language model" onClick={() => toggleComponent('model')}><span><Plus size={20} /></span><strong>Add a model</strong><small>Start with one connection</small></button>}
                    <span className="learning__canvas-legend"><MousePointer2 size={12} /> Click to connect <kbd>ESC</kbd> to cancel</span>
                    <span className="learning__canvas-scale"><span /> SIMULATED ENVIRONMENT</span>
                  </div>
                </div>
                <div className="learning__tray" aria-label="Component tray">
                  <div className="learning__tray-heading"><span>COMPONENT LIBRARY</span><small>Add to canvas</small></div>
                  <div className="learning__tray-items">
                    {lesson.nodes.filter(id => id !== 'user').map(id => {
                      const Icon = COMPONENT_ICONS[id]
                      const added = graph.nodes.includes(id)
                      return <button type="button" key={id} data-kind={id} aria-label={`${added ? 'Remove' : 'Add'} ${COMPONENTS[id].name}`} className={added ? 'is-added' : ''} onClick={() => toggleComponent(id)}><span className="learning__tray-icon"><Icon size={16} /></span><span>{COMPONENTS[id].name}<small>{COMPONENTS[id].category}</small></span>{added ? <Check size={13} className="learning__tray-status" /> : <Plus size={13} className="learning__tray-status" />}</button>
                    })}
                  </div>
                </div>
                <div className="learning__run-bar"><span><span className="learning__live-dot" />{completed ? 'Architecture complete' : 'Your canvas, your decisions.'}</span><button type="button" className="learning__primary" onClick={runArchitecture}><Play size={14} fill="currentColor" /> Check & run <span className="learning__button-arrow">↗</span></button></div>
              </section>

              <div className="learning__inspector"><span className="learning__inspector-icon" data-kind={inspected}><InspectedIcon size={20} /></span><div><span className="learning__eyebrow">UNDER THE HOOD · {COMPONENTS[inspected].name}</span><p>{COMPONENTS[inspected].description}</p></div></div>
              <details className="learning__connections"><summary><Link2 size={14} /> Connections <span>{graph.edges.length}</span><small>Edit wiring</small></summary><p>Arrows show a call or dependency; its response is implicit. Remove a connection to rewire it.</p><div>{graph.edges.length ? graph.edges.map(connection => <button key={connectionId(connection)} type="button" aria-label={`Remove connection ${COMPONENTS[connection.source].name} to ${COMPONENTS[connection.target].name}`} onClick={() => { updateGraph({ ...graph, edges: graph.edges.filter(e => connectionId(e) !== connectionId(connection)) }); setSource(null) }}>{COMPONENTS[connection.source].name}<ArrowRight size={11} />{COMPONENTS[connection.target].name}<X size={12} /></button>) : <small>No connections yet. Choose two cards to create one.</small>}</div></details>

              {event ? (
                <section className="learning__trace" aria-labelledby="trace-title">
                  <div className="learning__trace-heading"><span id="trace-title"><Terminal size={15} /> Request trace <span className="learning__trace-sim">SIMULATED</span></span><span>EVENT {traceIndex! + 1} / {lesson.trace.length}</span></div>
                  <div className="learning__trace-track" aria-label="Trace progress">{lesson.trace.map((step, index) => <span key={index} className={index === traceIndex ? 'is-current' : index < traceIndex! ? 'is-done' : ''} title={step.title} />)}</div>
                  <div className="learning__trace-content"><div className="learning__trace-step">{String(traceIndex! + 1).padStart(2, '0')}</div><div><span className="learning__eyebrow">{COMPONENTS[event.node].name}</span><h3>{event.title}</h3><p>{event.detail}</p></div></div>
                  <div className="learning__trace-controls"><button type="button" className="learning__text-button" disabled={traceIndex === 0} onClick={() => setTraceIndex(traceIndex! - 1)}><ArrowLeft size={13} /> Previous event</button>{traceFinished ? <span className="learning__trace-done"><CheckCircle2 size={14} /> Trace complete</span> : <button type="button" className="learning__primary" onClick={() => advanceTrace(traceIndex! + 1)}>Next event <ArrowRight size={14} /></button>}</div>
                </section>
              ) : (
                <div className="learning__trace-empty"><span className="learning__trace-empty-icon"><Terminal size={21} /></span><div><strong>What happens when a request arrives?</strong><p>Connect your architecture, then run it to follow the request.</p></div><span className="learning__trace-empty-label">TRACE WAITING</span></div>
              )}
              {(completed || traceFinished) && <section className="learning__takeaway"><span className="learning__eyebrow"><CheckCircle2 size={14} /> THE IDEA TO KEEP</span><p>{lesson.takeaway}</p>{progress.completed.length === LESSONS.length && <strong className="learning__all-done">Path complete. You have connected your first agent architecture.</strong>}</section>}
            </div>

            <aside className="learning__brief" aria-label="Lesson brief">
              <div className="learning__brief-header"><span>THE BRIEF</span><span>LAB {String(lessonIndex + 1).padStart(2, '0')}</span></div>
              <section className="learning__mission" aria-labelledby="mission-title"><div className="learning__mission-heading"><span className="learning__mission-mark"><Workflow size={18} /></span><h3 id="mission-title">Your mission</h3></div><p>{lesson.mission}</p></section>
              <div className="learning__concept"><span className="learning__eyebrow">THE CONCEPT</span><p>{lesson.concept}</p></div>
              <section className={`learning__checks ${checked && !passed ? 'has-errors' : ''}`} aria-label="Architecture checks">
                <div className="learning__check-heading"><h3>{checked ? passed ? 'Ready to run' : 'Keep connecting' : 'Design checklist'}</h3><span>{checks.filter(c => c.passed).length}/{checks.length}</span></div>
                {checks.map(check => <p key={check.label} className={check.passed ? 'is-passed' : checked ? 'is-missing' : 'is-pending'}>{check.passed ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}{check.label}</p>)}
                {checked && <small>Checks match this exercise’s teaching architecture, not every valid system design.</small>}
              </section>
              <button type="button" className="learning__hint-button" aria-expanded={showHint} onClick={() => setShowHint(!showHint)}><Lightbulb size={15} /><span>{showHint ? 'Hide the hint' : 'A little nudge?'}</span><Plus size={13} /></button>
              {showHint && <p className="learning__hint">{lesson.hint}</p>}
              <footer className="learning__footer">
                {lessonIndex < LESSONS.length - 1 ? <button type="button" className="learning__next" disabled={!completed} onClick={() => selectLesson(lessonIndex + 1)}>Next lesson <ArrowRight size={15} /></button> : <Link to="/" className="learning__next">Back to ArchBoard <ArrowRight size={15} /></Link>}
                <button type="button" className="learning__text-button" disabled={lessonIndex === 0} onClick={() => selectLesson(lessonIndex - 1)}><ArrowLeft size={13} /> Previous lesson</button>
              </footer>
              <p className="learning__brief-note"><ShieldCheck size={13} />A local learning sandbox. No real agents, API calls, or external actions.</p>
            </aside>
          </div>
          <div className="learning__sr-only" role="status" aria-live="polite">{announcement}</div>
        </main>
      </div>
    </div>
  )
}
