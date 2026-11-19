import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import type { LessonNotes } from './courseTypes'

type Props = { notes: LessonNotes; learned: boolean; onLearned: () => void; onPractice: () => void }

export function LessonReader({ notes, learned, onLearned, onPractice }: Props) {
  const [choice, setChoice] = useState<number | null>(null)
  const selected = learned ? notes.question.answer : choice
  const [firstSection, ...remainingSections] = notes.sections

  function answer(index: number) {
    setChoice(index)
    if (index === notes.question.answer) onLearned()
  }

  return (
    <article className="reading" aria-label="Lesson content">
      <p className="reading__lead">{notes.lead}</p>
      <section className="reading__section"><h3>{firstSection.heading}</h3>{firstSection.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>
      <ol className="reading__flow" aria-label="Conceptual request flow">{notes.flow.map((step, index) => <li key={step}><span>{step}</span>{index < notes.flow.length - 1 && <ArrowRight size={18} aria-hidden="true" />}</li>)}</ol>
      <section className="reading__example" aria-label="Worked example"><span>For example</span><h3>{notes.example.title}</h3><ol>{notes.example.steps.map(step => <li key={step.label}><strong>{step.label}</strong><p>{step.detail}</p></li>)}</ol></section>
      {remainingSections.map(section => <section className="reading__section" key={section.heading}><h3>{section.heading}</h3>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}
      <section className="reading__check" aria-label="Lesson understanding check">
        <fieldset disabled={learned} aria-describedby="lesson-question">
          <legend>Before you practice</legend>
          <p id="lesson-question">{notes.question.prompt}</p>
          {notes.question.options.map((option, index) => <label key={option.label}><input type="radio" name="lesson-answer" checked={selected === index} onChange={() => answer(index)} /><span>{option.label}</span></label>)}
        </fieldset>
        <div className={`reading__feedback ${learned ? 'is-correct' : ''}`} aria-live="polite">{selected !== null && <p>{learned && <Check size={16} aria-hidden="true" />}{notes.question.options[selected].explanation}</p>}</div>
      </section>
      <footer className="reading__footer"><div><span>Next: put it into practice</span><p>{learned ? 'Apply what you’ve learned in a hands-on exercise.' : 'Answer the check above to continue.'}</p></div><button type="button" className="learning__primary" disabled={!learned} onClick={onPractice}>Start practice <ArrowRight size={16} /></button></footer>
      <section className="reading__sources" aria-label="Further reading"><h3>Read further</h3>{notes.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <ArrowRight size={13} aria-hidden="true" /></a>)}</section>
    </article>
  )
}
