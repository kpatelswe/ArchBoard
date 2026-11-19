import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COURSE_PLAN } from '../src/learn/coursePlan.ts'
import { checkPractice, starterAnswer } from '../src/learn/practice.ts'

const plan = COURSE_PLAN.flatMap(module => module.lessons)
const text = (value, label, minimum = 12) => assert.ok(typeof value === 'string' && value.trim().length >= minimum, `${label}: expected at least ${minimum} characters`)
const list = (value, label, minimum = 1, maximum = Infinity) => assert.ok(Array.isArray(value) && value.length >= minimum && value.length <= maximum, `${label}: expected ${minimum}–${maximum} items`)
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label}: duplicates are not allowed`)
const finite = (value, label) => assert.ok(typeof value === 'number' && Number.isFinite(value), `${label}: expected a finite number`)

export function validateLesson(lesson) {
  const expected = plan.find(item => item.id === lesson?.id)
  assert.ok(expected, `Unknown lesson ID: ${lesson?.id}`)
  const prefix = lesson.id
  assert.equal(lesson.title, expected.title, `${prefix}: use the canonical course title`)
  const notes = lesson.notes
  assert.ok(notes && typeof notes === 'object', `${prefix}: notes are required`)
  text(notes.topic, `${prefix}.topic`, 4)
  assert.ok(Number.isInteger(notes.minutes) && notes.minutes >= 1 && notes.minutes <= 15, `${prefix}: reading minutes must be 1–15`)
  text(notes.lead, `${prefix}.lead`, 80)
  list(notes.sections, `${prefix}.sections`, 2, 4)
  for (const section of notes.sections) {
    text(section.heading, `${prefix}.section.heading`)
    list(section.paragraphs, `${prefix}.section.paragraphs`, 2, 4)
    section.paragraphs.forEach(paragraph => text(paragraph, `${prefix}.paragraph`, 70))
  }
  list(notes.flow, `${prefix}.flow`, 3, 6)
  notes.flow.forEach(step => text(step, `${prefix}.flow step`, 3))
  text(notes.example?.title, `${prefix}.example.title`)
  list(notes.example?.steps, `${prefix}.example.steps`, 3, 5)
  notes.example.steps.forEach(step => { text(step.label, `${prefix}.example.label`, 3); text(step.detail, `${prefix}.example.detail`, 45) })
  const prose = [notes.lead, ...notes.sections.flatMap(section => section.paragraphs), ...notes.example.steps.map(step => step.detail)].join(' ')
  const words = prose.trim().split(/\s+/).length
  assert.ok(words >= 220 && words <= 650, `${prefix}: article needs 220–650 substantive words; got ${words}`)
  text(notes.question?.prompt, `${prefix}.question.prompt`, 35)
  list(notes.question?.options, `${prefix}.question.options`, 3, 4)
  notes.question.options.forEach(option => { text(option.label, `${prefix}.question.option`); text(option.explanation, `${prefix}.question.explanation`, 40) })
  unique(notes.question.options.map(option => option.label), `${prefix}.question.options`)
  assert.ok(Number.isInteger(notes.question.answer) && notes.question.answer >= 0 && notes.question.answer < notes.question.options.length, `${prefix}: question.answer must be an option index`)
  list(notes.sources, `${prefix}.sources`, 1, 4)
  notes.sources.forEach(source => { text(source.title, `${prefix}.source.title`); assert.equal(new URL(source.url).protocol, 'https:', `${prefix}: source URL must be HTTPS`) })

  const practice = lesson.practice
  assert.equal(practice?.kind, expected.kind, `${prefix}: practice type must be ${expected.kind}`)
  text(practice.title, `${prefix}.practice.title`)
  text(practice.instructions, `${prefix}.practice.instructions`, 90)
  text(practice.explanation, `${prefix}.practice.explanation`, 80)
  if (practice.kind === 'graph') {
    assert.equal(practice.labId, lesson.id, `${prefix}: graph labId must match lesson ID`)
  } else if (practice.kind === 'scenario') {
    list(practice.options, `${prefix}.practice.options`, 4, 8)
    practice.options.forEach(option => { text(option.label, `${prefix}.practice.option`, 20); text(option.feedback, `${prefix}.practice.feedback`, 40) })
    unique(practice.options.map(option => option.label), `${prefix}.practice.options`)
    list(practice.correct, `${prefix}.practice.correct`, 2, practice.options.length - 1)
    unique(practice.correct, `${prefix}.practice.correct`)
    assert.ok(practice.correct.every(index => Number.isInteger(index) && index >= 0 && index < practice.options.length), `${prefix}: invalid correct option index`)
  } else if (practice.kind === 'sequence') {
    list(practice.items, `${prefix}.practice.items`, 4, 7)
    practice.items.forEach(item => { text(item.id, `${prefix}.practice.item.id`, 2); text(item.label, `${prefix}.practice.item.label`, 20) })
    const ids = practice.items.map(item => item.id)
    unique(ids, `${prefix}.practice.items`)
    assert.deepEqual([...practice.correctOrder].sort(), [...ids].sort(), `${prefix}: correctOrder must contain every item exactly once`)
    assert.notDeepEqual(practice.correctOrder, ids, `${prefix}: sequence must start unsolved`)
  } else if (practice.kind === 'budget') {
    list(practice.fields, `${prefix}.practice.fields`, 2, 4)
    const ids = practice.fields.map(field => field.id)
    unique(ids, `${prefix}.practice.fields`)
    for (const field of practice.fields) {
      text(field.id, `${prefix}.field.id`, 2); text(field.label, `${prefix}.field.label`, 10); text(field.unit, `${prefix}.field.unit`, 1)
      for (const key of ['min', 'max', 'step', 'initial']) finite(field[key], `${prefix}.${field.id}.${key}`)
      assert.ok(field.max > field.min && field.step > 0, `${prefix}: fields need a positive range and step`)
      assert.ok(field.initial >= field.min && field.initial <= field.max, `${prefix}: initial value must be in range`)
      assert.ok(Math.abs((field.initial - field.min) / field.step - Math.round((field.initial - field.min) / field.step)) < 1e-8, `${prefix}: initial value must align with step`)
    }
    list(practice.constraints, `${prefix}.practice.constraints`, 2, 6)
    for (const constraint of practice.constraints) {
      text(constraint.label, `${prefix}.constraint.label`, 20)
      assert.ok(['<=', '>=', '='].includes(constraint.operator), `${prefix}: invalid constraint operator`)
      finite(constraint.limit, `${prefix}.constraint.limit`)
      const terms = Object.entries(constraint.coefficients)
      assert.ok(terms.length && terms.some(([, coefficient]) => coefficient !== 0), `${prefix}: constraint needs nonzero coefficients`)
      terms.forEach(([id, coefficient]) => { assert.ok(ids.includes(id), `${prefix}: unknown constraint field ${id}`); finite(coefficient, `${prefix}.coefficient`) })
    }
  }
  if (practice.kind !== 'graph') {
    const answer = practice.kind === 'scenario' ? { choices: practice.correct } : practice.kind === 'sequence' ? { order: practice.correctOrder } : { values: practice.solution }
    assert.ok(checkPractice(practice, answer).every(check => check.passed), `${prefix}: reference solution must pass`)
    assert.ok(checkPractice(practice, starterAnswer(practice)).some(check => !check.passed), `${prefix}: initial practice must be incomplete`)
  }
  return lesson.id
}

export function validateContent(content) {
  if (!Array.isArray(content?.lessons)) return [validateLesson(content)]
  const expected = COURSE_PLAN.find(module => module.id === content.id)
  assert.ok(expected, `Unknown module ID: ${content.id}`)
  assert.equal(content.title, expected.title, 'Use the canonical module title')
  const expectedIds = expected.lessons.filter(lesson => lesson.id !== 'capstone').map(lesson => lesson.id)
  assert.deepEqual(content.lessons.map(lesson => lesson.id), expectedIds, `${content.id}: include all assigned lessons in canonical order; capstone is owned separately`)
  return content.lessons.map(validateLesson)
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const directory = resolve(root, 'src/learn/content')
  const paths = process.argv.slice(2)
  const files = paths.length ? paths.map(path => resolve(path)) : (await readdir(directory)).filter(name => name.endsWith('.json')).map(name => resolve(directory, name))
  assert.ok(files.length, 'No content files found')
  let count = 0
  for (const file of files) {
    const lessons = validateContent(JSON.parse(await readFile(file, 'utf8')))
    count += lessons.length
    console.log(`PASS ${file}: ${lessons.join(', ')}`)
  }
  console.log(`Validated ${count} lesson entries in ${files.length} content files.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
