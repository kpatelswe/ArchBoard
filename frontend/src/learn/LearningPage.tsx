import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Lightbulb, Link2, MousePointer2, Play, Plus, RotateCcw, Terminal, X } from 'lucide-react'
import { COMPONENTS, LESSONS, PROGRESS_KEY, checkArchitecture, connect, connectionId, readProgress, removeComponent, starterFor, type Architecture, type ComponentId } from './curriculum'
import './learning.css'

function loadProgress() {
  try { return readProgress(localStorage.getItem(PROGRESS_KEY)) } catch { return readProgress(null) }
}

function componentPosition(id: ComponentId, firstLesson: boolean) {
  if (firstLesson) return { x: id === 'user' ? 238 : 586, y: 226 }
  return COMPONENTS[id]
}

export function LearningPage() {
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

  function selectLesson(index: number) {
    setProgress(current => ({ ...current, active: LESSONS[index].id }))
    setSource(null)
    setInspected('user')
    setShowHint(false)
    setChecked(false)
    setTraceIndex(null)
    setResetting(false)
    setAnnouncement(`Lesson ${index + 1}: ${LESSONS[index].title}`)
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

  return (
    <div className="learning">
      <header className="learning__nav">
        <Link to="/" className="learning__brand" aria-label="ArchBoard home"><span className="learning__brand-icon"><BookOpen size={17} /></span> ARCH<span>/</span>BOARD</Link>
        <span className="learning__nav-divider" />
        <span className="learning__nav-label">LEARNING LAB</span>
        <Link to="/" className="learning__back"><ArrowLeft size={14} /> Back to boards</Link>
      </header>

      <div className="learning__body">
        <aside className="learning__syllabus" aria-label="Learning path">
          <div className="learning__eyebrow">THE ZERO → ONE SERIES</div>
          <h1>Build your<br />first agent.</h1>
          <p className="learning__intro">Understand the architecture.<br />Connect the pieces. See it work.</p>
          <div className="learning__progress-label"><span>Your progress</span><strong>{progress.completed.length} / {LESSONS.length}</strong></div>
          <progress className="learning__progress" max={LESSONS.length} value={progress.completed.length} aria-label="Lessons completed" />
          <nav className="learning__lessons" aria-label="Lessons">
            {LESSONS.map((item, index) => (
              <button type="button" key={item.id} onClick={() => selectLesson(index)} className={`learning__lesson ${lesson.id === item.id ? 'is-active' : ''}`} aria-current={lesson.id === item.id ? 'step' : undefined}>
                <span className={`learning__lesson-number ${progress.completed.includes(item.id) ? 'is-done' : ''}`}>{progress.completed.includes(item.id) ? <Check size={14} aria-label="Completed" /> : String(index + 1).padStart(2, '0')}</span>
                <span><strong>{item.title}</strong><small>{item.minutes} min · {item.subtitle}</small></span>
                {lesson.id === item.id && <ChevronRight size={14} />}
              </button>
            ))}
          </nav>
          <div className="learning__path-note"><BookOpen size={17} /><p>No setup. No API keys.<br />Just you and the architecture.</p></div>
          <p className="learning__save-note">{storageFailed ? 'Browser storage is unavailable. Progress lasts for this visit only.' : 'Progress is saved in this browser. Explore lessons in any order.'}</p>
        </aside>

        <main className="learning__main">
          <div className="learning__breadcrumb">Agent architecture <ChevronRight size={12} /> <span>Lesson {String(lessonIndex + 1).padStart(2, '0')}</span></div>
          <div className="learning__heading">
            <div><div className="learning__eyebrow">{lesson.subtitle}</div><h2>{lesson.title}</h2></div>
            <span className="learning__badge">{completed ? <CheckCircle2 size={14} /> : <BookOpen size={14} />}{completed ? 'Lesson complete' : `${lesson.minutes} MIN · HANDS-ON`}</span>
          </div>
          <p className="learning__concept">{lesson.concept}</p>
          <section className="learning__mission" aria-labelledby="mission-title"><span className="learning__mission-mark">↳</span><div><h3 id="mission-title">YOUR CHALLENGE</h3><p>{lesson.mission}</p></div></section>

          <section className="learning__workspace" aria-label="Interactive architecture builder">
            <div className="learning__workspace-bar"><span><span className="learning__live-dot" /> ARCHITECTURE CANVAS</span><button type="button" className="learning__text-button" onClick={() => setResetting(true)}><RotateCcw size={13} /> Reset lesson</button></div>
            {resetting && <div className="learning__reset" role="alert"><span>Reset this lesson’s diagram and completion? Other lessons stay saved.</span><button type="button" onClick={() => { updateGraph(starterFor(lesson)); setSource(null); setInspected('user'); setResetting(false) }}>Reset diagram</button><button type="button" onClick={() => setResetting(false)}>Cancel</button></div>}
            <div className="learning__canvas-scroll">
              <div className="learning__canvas" onKeyDown={e => { if (e.key === 'Escape') setSource(null) }}>
                <span className="learning__canvas-caption">{source ? `CONNECTING FROM ${COMPONENTS[source].name.toUpperCase()}` : 'CLICK A CARD → CLICK A DESTINATION'}</span>
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
                  return <button type="button" key={id} aria-label={`${component.name}${source === id ? ', selected as source' : ''}`} aria-pressed={source === id} onClick={() => chooseNode(id)} className={`learning__node ${source === id ? 'is-source' : ''} ${event?.node === id ? 'is-tracing' : ''} ${id === 'agent' || id === 'model' ? 'is-core' : ''}`} style={{ left: `${position.x / 10}%`, top: `${position.y / 5.3}%` }}><span className="learning__node-symbol">{component.symbol}</span><span><strong>{component.name}</strong><small>{component.category}</small></span><span className="learning__node-port" /></button>
                })}
                {graph.nodes.length === 1 && <div className="learning__empty-slot"><Plus size={22} /><span>Your first component<br />starts here.</span></div>}
                <span className="learning__canvas-legend"><MousePointer2 size={12} /> Click to connect · Esc to cancel</span>
                <span className="learning__canvas-scale">LOCAL SANDBOX / NOT A LIVE AGENT</span>
              </div>
            </div>
            <div className="learning__tray" aria-label="Component tray">
              <span className="learning__tray-label">COMPONENTS</span>
              {lesson.nodes.filter(id => id !== 'user').map(id => <button type="button" key={id} aria-label={`${graph.nodes.includes(id) ? 'Remove' : 'Add'} ${COMPONENTS[id].name}`} className={graph.nodes.includes(id) ? 'is-added' : ''} onClick={() => {
                const removing = graph.nodes.includes(id)
                updateGraph(removing ? removeComponent(graph, id) : { ...graph, nodes: [...graph.nodes, id] })
                setSource(null)
                setInspected(removing ? 'user' : id)
                setAnnouncement(`${COMPONENTS[id].name} ${removing ? 'removed' : 'added'}.`)
              }}>{graph.nodes.includes(id) ? <Check size={12} /> : <Plus size={12} />}{COMPONENTS[id].name}</button>)}
            </div>
          </section>

          <div className="learning__under-canvas">
            <div className="learning__inspector"><span className="learning__eyebrow">COMPONENT NOTES · {COMPONENTS[inspected].name}</span><p>{COMPONENTS[inspected].description}</p></div>
            <button type="button" className="learning__hint-button" aria-expanded={showHint} onClick={() => setShowHint(!showHint)}><Lightbulb size={15} />{showHint ? 'Hide hint' : 'Need a hint?'}</button>
          </div>
          {showHint && <p className="learning__hint">{lesson.hint}</p>}

          <details className="learning__connections"><summary><Link2 size={14} /> Connections <span>{graph.edges.length}</span></summary><p>Arrows show a call or dependency; its response is implicit. Remove a connection to rewire it.</p><div>{graph.edges.length ? graph.edges.map(connection => <button key={connectionId(connection)} type="button" aria-label={`Remove connection ${COMPONENTS[connection.source].name} to ${COMPONENTS[connection.target].name}`} onClick={() => { updateGraph({ ...graph, edges: graph.edges.filter(e => connectionId(e) !== connectionId(connection)) }); setSource(null) }}>{COMPONENTS[connection.source].name} → {COMPONENTS[connection.target].name}<X size={12} /></button>) : <small>No connections yet. Choose two cards to create one.</small>}</div></details>

          <div className="learning__run-bar"><span><span className="learning__exercise-tag">EXERCISE {String(lessonIndex + 1).padStart(2, '0')}</span> Build it. Check it. Follow a request.</span><button type="button" className="learning__primary" onClick={runArchitecture}><Play size={14} /> Check & run</button></div>
          {checked && <section className="learning__checks" aria-label="Architecture checks"><h3>{passed ? 'Architecture connected. Now follow the request.' : 'Almost there. Check these connections.'}</h3>{checks.map(check => <p key={check.label} className={check.passed ? 'is-passed' : 'is-missing'}>{check.passed ? <CheckCircle2 size={14} /> : <span className="learning__unchecked" />}{check.label}</p>)}<small>Checks match this exercise’s teaching architecture, not every valid system design.</small></section>}

          {event && <section className="learning__trace" aria-labelledby="trace-title"><div className="learning__trace-heading"><span id="trace-title"><Terminal size={15} /> REQUEST TRACE</span><span>SIMULATED · {traceIndex! + 1} / {lesson.trace.length}</span></div><div className="learning__trace-content"><div className="learning__trace-step">{String(traceIndex! + 1).padStart(2, '0')}</div><div><span className="learning__eyebrow">{COMPONENTS[event.node].name}</span><h3>{event.title}</h3><p>{event.detail}</p></div></div><div className="learning__trace-controls"><button type="button" className="learning__text-button" disabled={traceIndex === 0} onClick={() => setTraceIndex(traceIndex! - 1)}><ArrowLeft size={13} /> Previous event</button>{traceFinished ? <span className="learning__trace-done"><CheckCircle2 size={14} /> Trace complete</span> : <button type="button" className="learning__primary" onClick={() => advanceTrace(traceIndex! + 1)}>Next event <ArrowRight size={14} /></button>}</div></section>}

          {(completed || traceFinished) && <section className="learning__takeaway"><span className="learning__eyebrow"><CheckCircle2 size={14} /> THE IDEA TO KEEP</span><p>{lesson.takeaway}</p>{progress.completed.length === LESSONS.length && <strong className="learning__all-done">Path complete. You have connected your first agent architecture.</strong>}</section>}
          <footer className="learning__footer"><button type="button" className="learning__text-button" disabled={lessonIndex === 0} onClick={() => selectLesson(lessonIndex - 1)}><ArrowLeft size={14} /> Previous lesson</button>{lessonIndex < LESSONS.length - 1 ? <button type="button" className="learning__next" disabled={!completed} onClick={() => selectLesson(lessonIndex + 1)}>Next lesson <ArrowRight size={14} /></button> : <Link to="/" className="learning__next">Back to ArchBoard <ArrowRight size={14} /></Link>}</footer>
          <div className="learning__sr-only" role="status" aria-live="polite">{announcement}</div>
        </main>
      </div>
    </div>
  )
}
