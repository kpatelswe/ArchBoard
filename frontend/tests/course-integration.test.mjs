import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { COURSE_PLAN } from '../src/learn/coursePlan.ts'
import { GRAPH_LESSONS, checkArchitecture, readProgress, starterFor } from '../src/learn/curriculum.ts'
import { checkPractice, starterAnswer } from '../src/learn/practice.ts'
import { validateContent } from '../scripts/validate-course.mjs'

const modules = await Promise.all(COURSE_PLAN.map(async module => JSON.parse(await readFile(new URL(`../src/learn/content/${module.id}.json`, import.meta.url), 'utf8'))))
const capstone = JSON.parse(await readFile(new URL('../src/learn/content/capstone.json', import.meta.url), 'utf8'))
const course = COURSE_PLAN.flatMap(module => module.lessons.map(planned => ({ ...(modules.find(entry => entry.id === module.id).lessons.find(entry => entry.id === planned.id) ?? capstone), moduleId: module.id, moduleTitle: module.title, goal: planned.goal })))
const solvedAnswer = practice => practice.kind === 'scenario' ? { choices: practice.correct } : practice.kind === 'sequence' ? { order: practice.correctOrder } : { values: practice.solution }

test('all eight module files and the capstone satisfy the author contract', () => {
  const ids = [...modules.flatMap(validateContent), ...validateContent(capstone)]
  assert.equal(ids.length, 32)
  assert.equal(new Set(ids).size, 32)
  assert.deepEqual(course.map(lesson => lesson.id), COURSE_PLAN.flatMap(module => module.lessons.map(lesson => lesson.id)))
})

for (const lesson of course) {
  test(`${lesson.title}: teaching, question, and solvable practice are present`, () => {
    assert.ok(lesson.notes.sections.length >= 2)
    assert.ok(lesson.notes.question.options[lesson.notes.question.answer])
    if (lesson.practice.kind === 'graph') {
      const lab = GRAPH_LESSONS.find(lab => lab.id === lesson.practice.labId)
      assert.ok(lab)
      assert.ok(checkArchitecture(lab, { nodes: lab.nodes, edges: lab.edges }).every(check => check.passed))
      assert.ok(checkArchitecture(lab, starterFor(lab)).some(check => !check.passed))
    } else {
      assert.ok(checkPractice(lesson.practice, solvedAnswer(lesson.practice)).every(check => check.passed))
      assert.ok(checkPractice(lesson.practice, starterAnswer(lesson.practice)).some(check => !check.passed))
    }
  })
}

test('completed lessons and every practice answer round-trip across the full course', () => {
  const graphs = Object.fromEntries(GRAPH_LESSONS.map(lab => [lab.id, { nodes: lab.nodes, edges: lab.edges }]))
  const activities = Object.fromEntries(course.filter(lesson => lesson.practice.kind !== 'graph').map(lesson => [lesson.id, solvedAnswer(lesson.practice)]))
  const state = { version: 1, active: 'capstone', phase: 'practice', learned: course.map(lesson => lesson.id), completed: course.map(lesson => lesson.id), graphs, activities }
  assert.deepEqual(readProgress(JSON.stringify(state), course), state)
})

test('practice stays locked unless the current lesson check was passed', () => {
  for (const phase of ['practice', 'invalid', null]) {
    const state = readProgress(JSON.stringify({ version: 1, active: 'context-windows', phase, learned: ['other', null] }), course)
    assert.equal(state.phase, 'lesson'); assert.deepEqual(state.learned, [])
  }
  const state = readProgress(JSON.stringify({ version: 1, active: 'context-windows', phase: 'practice', learned: ['context-windows', 'context-windows', 'bogus'] }), course)
  assert.equal(state.phase, 'practice'); assert.deepEqual(state.learned, ['context-windows'])
})

test('malformed activity answers are sanitized and cannot restore false completion', () => {
  const scenario = course.find(lesson => lesson.practice.kind === 'scenario')
  const sequence = course.find(lesson => lesson.practice.kind === 'sequence')
  const budget = course.find(lesson => lesson.practice.kind === 'budget')
  const raw = { version: 1, completed: [scenario.id, sequence.id, budget.id], activities: {
    [scenario.id]: { choices: ['0', -1, 900, null, 0, 0] },
    [sequence.id]: { order: ['unknown', sequence.practice.items[0].id, sequence.practice.items[0].id] },
    [budget.id]: { values: { unknown: 123, [budget.practice.fields[0].id]: 'not a number' } },
  } }
  const restored = readProgress(JSON.stringify(raw), course)
  assert.deepEqual(restored.activities[scenario.id], { choices: [0] })
  assert.deepEqual(restored.activities[sequence.id].order, sequence.practice.items.map(item => item.id))
  assert.deepEqual(restored.activities[budget.id], { values: {} })
  assert.deepEqual(restored.completed, [])
})

test('incomplete activity answers do not restore a completion marker', () => {
  for (const lesson of course.filter(lesson => lesson.practice.kind !== 'graph')) {
    const restored = readProgress(JSON.stringify({ version: 1, completed: [lesson.id], activities: { [lesson.id]: starterAnswer(lesson.practice) } }), course)
    assert.deepEqual(restored.completed, [])
  }
})

test('repairing a truncated saved sequence does not award completion', () => {
  for (const lesson of course.filter(lesson => lesson.practice.kind === 'sequence')) {
    const restored = readProgress(JSON.stringify({ version: 1, completed: [lesson.id], activities: { [lesson.id]: { order: lesson.practice.correctOrder.slice(0, -1) } } }), course)
    assert.deepEqual(restored.activities[lesson.id].order, lesson.practice.correctOrder)
    assert.deepEqual(restored.completed, [])
  }
})

test('capstone starts blank and rejects every missing required link or approval bypass', () => {
  const lab = GRAPH_LESSONS.find(lesson => lesson.id === 'capstone')
  assert.deepEqual(starterFor(lab), { nodes: ['user'], edges: [] })
  for (const edge of lab.edges) assert.ok(checkArchitecture(lab, { nodes: lab.nodes, edges: lab.edges.filter(candidate => candidate !== edge) }).some(check => !check.passed))
  for (const source of lab.nodes.filter(id => !['tools', 'approval'].includes(id))) assert.ok(checkArchitecture(lab, { nodes: lab.nodes, edges: [...lab.edges, { source, target: 'tools' }] }).some(check => !check.passed))
})
