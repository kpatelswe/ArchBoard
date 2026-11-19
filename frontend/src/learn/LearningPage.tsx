import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Bot, Braces, Check, CheckCircle2, ChevronRight, CircleDashed, Cpu, Database, GitBranch, Layers3, Lightbulb, Link2, MousePointer2, Network, Play, Plus, RotateCcw, ShieldCheck, Terminal, UserRound, Workflow, X, type LucideIcon } from 'lucide-react'
import { COMPONENTS, GRAPH_LESSONS, PROGRESS_KEY, checkArchitecture, connect, connectionId, readProgress, removeComponent, starterFor, type Architecture, type ComponentId } from './curriculum'
import { COURSE_LESSONS } from './course'
import { COURSE_PLAN } from './coursePlan'
import type { PracticeAnswer } from './courseTypes'
import { PracticeExercise } from './PracticeExercise'
import { LessonReader } from './LessonReader'
import './learning.css'

const COMPONENT_ICONS: Record<ComponentId, LucideIcon> = {
  user: UserRound, model: Cpu, agent: Bot, tools: Braces, knowledge: Layers3,
  memory: Database, guardrail: ShieldCheck, approval: UserRound, queue: GitBranch, telemetry: Network,
}

function loadProgress() {
  try { return readProgress(localStorage.getItem(PROGRESS_KEY), COURSE_LESSONS) } catch { return readProgress(null, COURSE_LESSONS) }
}

function componentPosition(id: ComponentId, firstLesson: boolean) {
  if (firstLesson) return { x: id === 'user' ? 238 : 586, y: 226 }
  return COMPONENTS[id]
}

export function LearningPage() {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const contentsRef = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(loadProgress)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [source, setSource] = useState<ComponentId | null>(null)
  const [inspected, setInspected] = useState<ComponentId>('user')
  const [showHint, setShowHint] = useState(false)
  const [checked, setChecked] = useState(false)
  const [traceIndex, setTraceIndex] = useState<number | null>(null)
  const [storageFailed, setStorageFailed] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const lessonIndex = Math.max(0, COURSE_LESSONS.findIndex(l => l.id === progress.active))
  const lesson = COURSE_LESSONS[lessonIndex]
  const notes = lesson.notes
  const lab = GRAPH_LESSONS.find(item => item.id === (lesson.practice.kind === 'graph' ? lesson.practice.labId : '')) ?? GRAPH_LESSONS[0]
  const [openModules, setOpenModules] = useState([lesson.moduleId])
  const learned = progress.learned.includes(lesson.id)
  const graph = progress.graphs[lesson.id] ?? starterFor(lab)
  const checks = checkArchitecture(lab, graph)
  const passed = checks.every(check => check.passed)
  const completed = progress.completed.includes(lesson.id)
  const event = traceIndex === null ? null : lab.trace[traceIndex]
  const traceFinished = traceIndex === lab.trace.length - 1

  useEffect(() => {
    const nav = contentsRef.current
    if (!nav) return
    function revealCurrentLesson() {
      const current = nav!.querySelector<HTMLButtonElement>('[aria-current="step"]')
      if (!current || !nav!.clientHeight) return
      const bounds = nav!.getBoundingClientRect()
      const item = current.getBoundingClientRect()
      const offset = item.top < bounds.top ? item.top - bounds.top - 8 : item.bottom > bounds.bottom ? item.bottom - bounds.bottom + 8 : 0
      if (offset) nav!.scrollBy({ top: offset, behavior: 'instant' })
    }
    revealCurrentLesson()
    const observer = new ResizeObserver(revealCurrentLesson)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [lesson.id, outlineOpen, openModules])

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
    } catch { setStorageFailed(true) }
  }, [progress])

  function updateAnswer(answer: PracticeAnswer) {
    setProgress(current => ({ ...current, activities: { ...current.activities, [lesson.id]: answer }, completed: current.completed.filter(id => id !== lesson.id) }))
  }

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
    setProgress(current => ({ ...current, active: COURSE_LESSONS[index].id, phase: 'lesson' }))
    setOpenModules([COURSE_LESSONS[index].moduleId])
    setOutlineOpen(false)
    setSource(null)
    setInspected('user')
    setShowHint(false)
    setChecked(false)
    setTraceIndex(null)
    setResetting(false)
    setAnnouncement(`Lesson ${index + 1}: ${COURSE_LESSONS[index].title}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
    headingRef.current?.focus({ preventScroll: true })
  }

  function selectPhase(phase: 'lesson' | 'practice') {
    if (phase === 'practice' && !learned) return
    setProgress(current => ({ ...current, phase }))
    setSource(null)
    setResetting(false)
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
    if (index === lab.trace.length - 1) {
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
      setAnnouncement('Not quite yet. Review the unmet design checks.')
    }
  }

  const InspectedIcon = COMPONENT_ICONS[inspected]

  return (
    <div className="learning">
      <header className="learning__nav">
        <Link to="/" className="learning__brand" aria-label="ArchBoard home">
          <Workflow size={21} strokeWidth={1.7} />
          ARCH<span className="learning__brand-slash">/</span>BOARD
        </Link>
        <span className="learning__nav-label">Learn</span>
        <Link to="/" className="learning__back">Open whiteboard <ArrowRight size={15} /></Link>
      </header>

      <div className={`learning__layout ${progress.phase === 'practice' ? 'is-practice' : ''}`}>
        <aside className="learning__outline" aria-label="Course contents">
          <div className="learning__outline-heading"><h1>Agent architecture</h1><button type="button" className="learning__outline-toggle" aria-expanded={outlineOpen} aria-controls="course-lessons" onClick={() => setOutlineOpen(!outlineOpen)}>Contents <ChevronRight size={14} /></button></div>
          <p className="learning__course-caption">From first principles to production.<br />32 lessons, each followed by practice.</p>
          <nav ref={contentsRef} id="course-lessons" className={`learning__lessons ${outlineOpen ? 'is-open' : ''}`} aria-label="Lessons">
            {COURSE_PLAN.map((module, moduleIndex) => <details key={module.id} className="learning__module" open={openModules.includes(module.id)}>
              <summary onClick={event => { event.preventDefault(); setOpenModules(current => current.includes(module.id) ? current.filter(id => id !== module.id) : [...current, module.id]) }}><span>{String(moduleIndex + 1).padStart(2, '0')}</span>{module.title}<ChevronRight size={13} /></summary>
              <div>{module.lessons.map(item => {
                const index = COURSE_LESSONS.findIndex(candidate => candidate.id === item.id)
                return <button type="button" key={item.id} disabled={index < 0} onClick={() => selectLesson(index)} className={`learning__lesson ${lesson.id === item.id ? 'is-active' : ''}`} aria-current={lesson.id === item.id ? 'step' : undefined}><span>{item.title}</span>{progress.completed.includes(item.id) && <Check size={13} aria-label="Practice completed" />}</button>
              })}</div>
            </details>)}
          </nav>
          <p className="learning__course-progress">{progress.completed.length} of {COURSE_LESSONS.length} practices complete</p>
          <p className={`learning__save-note ${storageFailed ? 'is-error' : ''}`} role={storageFailed ? 'alert' : undefined}>{storageFailed ? 'Storage unavailable. Progress lasts for this visit.' : 'Your progress is saved on this device.'}</p>
        </aside>

        <main className="learning__main">
          <nav className="learning__phases" aria-label="Lesson stages">
            <button type="button" aria-current={progress.phase === 'lesson' ? 'page' : undefined} onClick={() => selectPhase('lesson')}>Lesson</button>
            <span>/</span>
            <button type="button" aria-current={progress.phase === 'practice' ? 'page' : undefined} disabled={!learned} title={learned ? 'Open practice' : 'Complete the lesson check first'} onClick={() => selectPhase('practice')}>Practice</button>
            <small>{progress.phase === 'lesson' ? `${notes.minutes} min read` : 'Practice exercise'}</small>
          </nav>
          <div className="learning__heading">
            <div><div className="learning__eyebrow">{String(lessonIndex + 1).padStart(2, '0')} — {progress.phase === 'lesson' ? notes.topic : 'Practice'}</div><h2 ref={headingRef} tabIndex={-1}>{lesson.title}</h2></div>
            {progress.phase === 'practice' && completed && <span className="learning__badge"><CheckCircle2 size={14} /> Completed</span>}
          </div>

          {progress.phase === 'lesson' ? <LessonReader key={lesson.id} notes={notes} learned={learned} onLearned={() => setProgress(current => ({ ...current, learned: [...new Set([...current.learned, lesson.id])] }))} onPractice={() => selectPhase('practice')} /> : lesson.practice.kind !== 'graph' ? <PracticeExercise key={lesson.id} practice={lesson.practice} answer={progress.activities[lesson.id]} completed={completed} first={lessonIndex === 0} onAnswer={updateAnswer} onComplete={() => setProgress(current => ({ ...current, completed: [...new Set([...current.completed, lesson.id])] }))} onNext={() => selectLesson(lessonIndex + 1)} onPrevious={() => selectLesson(lessonIndex - 1)} /> : (
          <div className="learning__lab-grid">
            <div className="learning__canvas-column">
              <div className="learning__task"><span>{lesson.practice.title}</span><p>{lesson.practice.instructions}</p></div>
              <section className="learning__workspace" aria-label="Interactive architecture builder">
                <div className="learning__workspace-bar">
                  <span className="learning__workspace-title"><Workflow size={16} /> Architecture <span className="learning__workspace-count">{graph.nodes.length} nodes · {graph.edges.length} links</span></span>
                  <span className="learning__scroll-note">Scroll canvas to explore <ArrowRight size={12} /></span>
                  <button type="button" className="learning__reset-button" onClick={() => setResetting(true)} aria-label="Reset lesson"><RotateCcw size={14} /><span>Reset</span></button>
                </div>
                {resetting && <div className="learning__reset" role="alert"><span>Reset this lesson’s diagram and completion? Other lessons stay saved.</span><button type="button" onClick={() => { updateGraph(starterFor(lab)); setSource(null); setInspected('user'); setResetting(false) }}>Reset diagram</button><button type="button" onClick={() => setResetting(false)}>Cancel</button></div>}
                <div className="learning__canvas-scroll">
                  <div className={`learning__canvas ${source ? 'has-source' : ''}`} onKeyDown={e => { if (e.key === 'Escape') setSource(null) }}>
                    <div className="learning__canvas-caption"><span className="learning__live-dot" />{source ? `FROM ${COMPONENTS[source].name.toUpperCase()} → CHOOSE A TARGET` : 'CLICK A SOURCE, THEN A DESTINATION'}</div>
                    <svg className="learning__wires" viewBox="0 0 1000 530" preserveAspectRatio="none" aria-hidden="true">
                      <defs><marker id="learning-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
                      {graph.edges.map(connection => {
                        const a = componentPosition(connection.source, lesson.id === 'first-call')
                        const b = componentPosition(connection.target, lesson.id === 'first-call')
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
                      const position = componentPosition(id, lesson.id === 'first-call')
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
                  <div className="learning__tray-heading"><span>Components</span><small>Click to add or remove</small></div>
                  <div className="learning__tray-items">
                    {lab.nodes.filter(id => id !== 'user').map(id => {
                      const Icon = COMPONENT_ICONS[id]
                      const added = graph.nodes.includes(id)
                      return <button type="button" key={id} data-kind={id} aria-label={`${added ? 'Remove' : 'Add'} ${COMPONENTS[id].name}`} className={added ? 'is-added' : ''} onClick={() => toggleComponent(id)}><span className="learning__tray-icon"><Icon size={16} /></span><span>{COMPONENTS[id].name}<small>{COMPONENTS[id].category}</small></span>{added ? <Check size={13} className="learning__tray-status" /> : <Plus size={13} className="learning__tray-status" />}</button>
                    })}
                  </div>
                </div>
                <div className="learning__run-bar"><span><span className="learning__live-dot" />{completed ? 'Architecture complete' : 'Connect, check, then follow the request.'}</span><button type="button" className="learning__primary" onClick={runArchitecture}><Play size={14} fill="currentColor" /> Check & run <span className="learning__button-arrow">↗</span></button></div>
              </section>

              <div className="learning__inspector"><span className="learning__inspector-icon" data-kind={inspected}><InspectedIcon size={20} /></span><div><span className="learning__eyebrow">ABOUT {COMPONENTS[inspected].name}</span><p>{COMPONENTS[inspected].description}</p></div></div>
              <details className="learning__connections"><summary><Link2 size={14} /> Connections <span>{graph.edges.length}</span><small>Edit wiring</small></summary><p>Arrows show a call or dependency; its response is implicit. Remove a connection to rewire it.</p><div>{graph.edges.length ? graph.edges.map(connection => <button key={connectionId(connection)} type="button" aria-label={`Remove connection ${COMPONENTS[connection.source].name} to ${COMPONENTS[connection.target].name}`} onClick={() => { updateGraph({ ...graph, edges: graph.edges.filter(e => connectionId(e) !== connectionId(connection)) }); setSource(null) }}>{COMPONENTS[connection.source].name}<ArrowRight size={11} />{COMPONENTS[connection.target].name}<X size={12} /></button>) : <small>No connections yet. Choose two cards to create one.</small>}</div></details>

              {event ? (
                <section className="learning__trace" aria-labelledby="trace-title">
                  <div className="learning__trace-heading"><span id="trace-title"><Terminal size={15} /> Request trace <span className="learning__trace-sim">SIMULATED</span></span><span>EVENT {traceIndex! + 1} / {lab.trace.length}</span></div>
                  <div className="learning__trace-track" aria-label="Trace progress">{lab.trace.map((step, index) => <span key={index} className={index === traceIndex ? 'is-current' : index < traceIndex! ? 'is-done' : ''} title={step.title} />)}</div>
                  <div className="learning__trace-content"><div className="learning__trace-step">{String(traceIndex! + 1).padStart(2, '0')}</div><div><span className="learning__eyebrow">{COMPONENTS[event.node].name}</span><h3>{event.title}</h3><p>{event.detail}</p></div></div>
                  <div className="learning__trace-controls"><button type="button" className="learning__text-button" disabled={traceIndex === 0} onClick={() => setTraceIndex(traceIndex! - 1)}><ArrowLeft size={13} /> Previous event</button>{traceFinished ? <span className="learning__trace-done"><CheckCircle2 size={14} /> Trace complete</span> : <button type="button" className="learning__primary" onClick={() => advanceTrace(traceIndex! + 1)}>Next event <ArrowRight size={14} /></button>}</div>
                </section>
              ) : (
                <div className="learning__trace-empty"><span className="learning__trace-empty-icon"><Terminal size={21} /></span><div><strong>What happens when a request arrives?</strong><p>Connect your architecture, then run it to follow the request.</p></div><span className="learning__trace-empty-label">TRACE WAITING</span></div>
              )}
              {(completed || traceFinished) && <section className="learning__takeaway"><span className="learning__eyebrow"><CheckCircle2 size={14} /> THE IDEA TO KEEP</span><p>{lesson.practice.explanation}</p>{progress.completed.length === COURSE_LESSONS.length && <strong className="learning__all-done">Course complete. You have worked through all 32 lessons and practices.</strong>}</section>}
            </div>

            <aside className="learning__brief" aria-label="Lesson brief">
              <section className={`learning__checks ${checked && !passed ? 'has-errors' : ''}`} aria-label="Architecture checks">
                <div className="learning__check-heading"><h3>{checked ? passed ? 'Ready to run' : 'Keep connecting' : 'Design checklist'}</h3><span>{checks.filter(c => c.passed).length}/{checks.length}</span></div>
                {checks.map(check => <p key={check.label} className={check.passed ? 'is-passed' : checked ? 'is-missing' : 'is-pending'}>{check.passed ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}{check.label}</p>)}
                {checked && <small>Checks match this exercise’s teaching architecture, not every valid system design.</small>}
              </section>
              <button type="button" className="learning__hint-button" aria-expanded={showHint} onClick={() => setShowHint(!showHint)}><Lightbulb size={15} /><span>{showHint ? 'Hide hint' : 'Show a hint'}</span><ChevronRight size={13} /></button>
              {showHint && <p className="learning__hint">{lab.hint}</p>}
              <footer className="learning__footer">
                {lessonIndex < COURSE_LESSONS.length - 1 ? <button type="button" className="learning__next" disabled={!completed} onClick={() => selectLesson(lessonIndex + 1)}>Next lesson <ArrowRight size={15} /></button> : <Link to="/" className="learning__next">Back to ArchBoard <ArrowRight size={15} /></Link>}
                <button type="button" className="learning__text-button" disabled={lessonIndex === 0} onClick={() => selectLesson(lessonIndex - 1)}><ArrowLeft size={13} /> Previous lesson</button>
              </footer>
              <p className="learning__brief-note"><ShieldCheck size={13} />Simulated locally. No API calls or real-world actions.</p>
            </aside>
          </div>
          )}
          <div className="learning__sr-only" role="status" aria-live="polite">{announcement}</div>
        </main>
      </div>
    </div>
  )
}
