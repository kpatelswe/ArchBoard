import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { COURSE_PLAN } from '../src/learn/coursePlan.ts'
import { checkPractice, starterAnswer } from '../src/learn/practice.ts'
import { validateContent, validateLesson } from '../scripts/validate-course.mjs'

const example = JSON.parse(await readFile(new URL('../src/learn/content/example-lesson.json', import.meta.url), 'utf8'))
const lessonWith = (id, practice) => ({ ...structuredClone(example), id, title: COURSE_PLAN.flatMap(module => module.lessons).find(lesson => lesson.id === id).title, practice })
const base = { title: 'Choose a safe design', instructions: 'Select the safe decisions for this support application. Keep the model separate from the application’s enforced authorization boundary.', explanation: 'Application code validates inputs and permissions before executing actions. Generated text never grants credentials or permission by itself.' }
const scenario = { ...base, kind: 'scenario', options: [
  { label: 'Validate typed arguments before executing the requested tool.', feedback: 'The application must reject malformed or unsupported arguments before execution.' },
  { label: 'Put an unrestricted production secret into every model prompt.', feedback: 'Credentials belong outside the model context and should have narrowly scoped privileges.' },
  { label: 'Check access to the requested resource at the tool boundary.', feedback: 'Authenticating intake does not replace resource-level authorization when a tool runs.' },
  { label: 'Treat any retrieved document as a privileged instruction source.', feedback: 'Retrieved content is untrusted data and must not gain authority over application rules.' },
], correct: [0, 2] }
const sequence = { ...base, kind: 'sequence', items: [
  { id: 'execute', label: 'Execute the validated operation with scoped credentials.' },
  { id: 'receive', label: 'Receive the proposed operation from the model response.' },
  { id: 'validate', label: 'Validate the proposed arguments and resource permissions.' },
  { id: 'observe', label: 'Return the tool observation to the bounded runtime loop.' },
], correctOrder: ['receive', 'validate', 'execute', 'observe'] }
const budget = { ...base, kind: 'budget', fields: [
  { id: 'history', label: 'Conversation history', unit: 'tokens', min: 0, max: 4000, step: 500, initial: 4000 },
  { id: 'output', label: 'Reserved output', unit: 'tokens', min: 0, max: 4000, step: 500, initial: 4000 },
], constraints: [
  { label: 'Fit within the remaining 4,000-token context budget', coefficients: { history: 1, output: 1 }, operator: '<=', limit: 4000 },
  { label: 'Reserve at least 1,000 tokens for the output', coefficients: { output: 1 }, operator: '>=', limit: 1000 },
], solution: { history: 3000, output: 1000 } }

test('course has 32 unique goal-oriented lessons in eight ordered modules', () => {
  assert.equal(COURSE_PLAN.length, 8)
  const lessons = COURSE_PLAN.flatMap(module => { assert.equal(module.lessons.length, 4); return module.lessons })
  assert.equal(lessons.length, 32)
  assert.equal(new Set(lessons.map(lesson => lesson.id)).size, 32)
  assert.ok(lessons.every(lesson => lesson.goal.length > 50))
  assert.equal(lessons.at(-1).id, 'capstone')
  assert.deepEqual(new Set(lessons.map(lesson => lesson.kind)), new Set(['graph', 'scenario', 'sequence', 'budget']))
})

test('fully written example satisfies the content contract', () => assert.deepEqual(validateContent(example), ['first-call']))
test('schema accepts substantive scenario, sequencing, and budget lessons', () => {
  for (const [id, practice] of [['tool-contracts', scenario], ['tool-failures', sequence], ['context-windows', budget]]) assert.equal(validateLesson(lessonWith(id, practice)), id)
})
test('schema rejects unknown lessons, wrong types, missing teaching, and missing sources', () => {
  assert.throws(() => validateLesson({ ...example, id: 'unknown' }))
  assert.throws(() => validateLesson({ ...example, practice: scenario }))
  const short = structuredClone(example); short.notes.sections = []
  assert.throws(() => validateLesson(short))
  const unsourced = structuredClone(example); unsourced.notes.sources = []
  assert.throws(() => validateLesson(unsourced))
})
test('module validation requires the complete assigned lesson set in canonical order', () => {
  assert.throws(() => validateContent({ id: 'foundations', title: 'Foundations', lessons: [example] }))
})
test('scenarios require every correct decision and reject extras or duplicate choices', () => {
  assert.ok(checkPractice(scenario, { choices: [2, 0] }).every(check => check.passed))
  for (const choices of [[], [0], [0, 2, 1], [0, 0], [0, -1], [0, '2']]) assert.ok(checkPractice(scenario, { choices }).some(check => !check.passed))
  assert.ok(checkPractice(scenario, undefined).some(check => !check.passed))
})
test('sequences require the entire exact order, not just a correct prefix', () => {
  assert.ok(checkPractice(sequence, { order: sequence.correctOrder }).every(check => check.passed))
  for (const order of [[], sequence.correctOrder.slice(0, 3), [...sequence.correctOrder, 'other'], sequence.items.map(item => item.id)]) assert.ok(checkPractice(sequence, { order }).some(check => !check.passed))
})
test('budget exercises enforce bounds, increments, finite values, and every constraint', () => {
  assert.ok(checkPractice(budget, { values: budget.solution }).every(check => check.passed))
  for (const values of [{ history: 4000, output: 4000 }, { history: 0, output: 0 }, { history: -500, output: 1000 }, { history: 5000, output: 1000 }, { history: 1250, output: 1000 }, { history: NaN, output: 1000 }, { history: Infinity, output: 1000 }, { history: '3000', output: 1000 }, {}]) assert.ok(checkPractice(budget, { values }).some(check => !check.passed))
})
test('all practice variants start incomplete without sharing mutable answer arrays', () => {
  for (const practice of [scenario, sequence, budget]) assert.ok(checkPractice(practice, starterAnswer(practice)).some(check => !check.passed))
  const answer = starterAnswer(sequence); answer.order.reverse()
  assert.deepEqual(starterAnswer(sequence).order, sequence.items.map(item => item.id))
})
test('schema rejects trivial exercises and infeasible reference configurations', () => {
  assert.throws(() => validateLesson(lessonWith('tool-failures', { ...sequence, correctOrder: sequence.items.map(item => item.id) })))
  assert.throws(() => validateLesson(lessonWith('context-windows', { ...budget, solution: { history: 4000, output: 4000 } })))
  assert.throws(() => validateLesson(lessonWith('tool-contracts', { ...scenario, correct: [0, 0] })))
})
