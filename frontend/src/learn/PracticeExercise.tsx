import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, RotateCcw } from 'lucide-react'
import { checkPractice, starterAnswer } from './practice'
import type { Practice, PracticeAnswer } from './courseTypes'

type Props = {
  practice: Exclude<Practice, { kind: 'graph' }>
  answer: PracticeAnswer | undefined
  completed: boolean
  onAnswer: (answer: PracticeAnswer) => void
  onComplete: () => void
  onNext: () => void
  onPrevious: () => void
  first: boolean
}

export function PracticeExercise({ practice, answer, completed, onAnswer, onComplete, onNext, onPrevious, first }: Props) {
  const [checked, setChecked] = useState(false)
  const [resetting, setResetting] = useState(false)
  const current = answer ?? starterAnswer(practice)
  const checks = checkPractice(practice, current)
  const passed = checks.every(check => check.passed)
  const reveal = checked || completed

  function update(next: PracticeAnswer) {
    setChecked(false)
    onAnswer(next)
  }

  function move(index: number, direction: number) {
    const order = [...(current.order ?? [])]
    const destination = index + direction
    if (destination < 0 || destination >= order.length) return
    ;[order[index], order[destination]] = [order[destination], order[index]]
    update({ order })
  }

  return (
    <section className="exercise" aria-label="Practice exercise">
      <h3>{practice.title}</h3><p className="exercise__instructions">{practice.instructions}</p>
      {practice.kind === 'scenario' && <fieldset className="exercise__choices"><legend>Select all appropriate decisions</legend>{practice.options.map((option, index) => <div key={option.label}><label><input type="checkbox" checked={current.choices?.includes(index) ?? false} onChange={() => update({ choices: current.choices?.includes(index) ? current.choices.filter(choice => choice !== index) : [...(current.choices ?? []), index] })} /><span>{option.label}</span></label>{reveal && current.choices?.includes(index) && <p>{option.feedback}</p>}</div>)}</fieldset>}
      {practice.kind === 'sequence' && <><p className="exercise__instruction-note">Move the steps into order. The top step happens first.</p><ol className="exercise__sequence">{current.order?.map((id, index) => <li key={id}><span className="exercise__step-number">{index + 1}</span><span>{practice.items.find(item => item.id === id)?.label}</span><div><button type="button" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" aria-label={`Move step ${index + 1} down`} disabled={index === current.order!.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button></div></li>)}</ol></>}
      {practice.kind === 'budget' && <><p className="exercise__instruction-note">A simplified design model, not measured production performance.</p><div className="exercise__fields">{practice.fields.map(field => <label key={field.id}><span>{field.label}<small>{field.min}–{field.max} {field.unit}, increments of {field.step}</small></span><input type="number" aria-label={field.label} min={field.min} max={field.max} step={field.step} value={Number.isFinite(current.values?.[field.id]) ? current.values![field.id] : ''} onChange={event => update({ values: { ...current.values, [field.id]: event.currentTarget.valueAsNumber } })} /></label>)}</div><div className="exercise__requirements"><h4>Design constraints</h4><ul>{practice.constraints.map(constraint => <li key={constraint.label}>{constraint.label}</li>)}</ul></div></>}
      <div className="exercise__actions"><button type="button" className="learning__primary" onClick={() => { setChecked(true); if (passed) onComplete() }}>Check practice <Check size={16} /></button><button type="button" className="learning__text-button" onClick={() => setResetting(true)}><RotateCcw size={14} /> Reset exercise</button></div>
      {resetting && <div className="learning__reset" role="alert"><span>Reset this exercise and its completion? The lesson check stays saved.</span><button type="button" onClick={() => { update(starterAnswer(practice)); setResetting(false) }}>Confirm reset</button><button type="button" onClick={() => setResetting(false)}>Cancel</button></div>}
      <div aria-live="polite" className="exercise__result">{reveal && <><h4>{passed ? 'Practice complete' : 'Not quite yet'}</h4><ul>{checks.map(check => <li key={check.label}>{check.passed ? <Check size={15} aria-label="Passed" /> : <span aria-label="Not passed">—</span>}{check.label}</li>)}</ul>{passed ? <p>{practice.explanation}</p> : <p>Review the requirements and adjust your answer. You can try again.</p>}</>}</div>
      <footer className="exercise__footer"><button type="button" className="learning__text-button" disabled={first} onClick={onPrevious}><ArrowLeft size={14} /> Previous lesson</button><button type="button" className="learning__next" disabled={!completed} onClick={onNext}>Next lesson <ArrowRight size={15} /></button></footer>
    </section>
  )
}
