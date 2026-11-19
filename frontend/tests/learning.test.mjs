import assert from 'node:assert/strict'
import test from 'node:test'
import { COMPONENTS, LESSONS, checkArchitecture, connect, connectionId, readProgress, removeComponent, starterFor } from '../src/learn/curriculum.ts'

const isValid = (lesson, graph) => checkArchitecture(lesson, graph).every(check => check.passed)
const solutionFor = lesson => ({ nodes: [...lesson.nodes], edges: lesson.edges.map(e => ({ ...e })) })

for (const lesson of LESSONS) {
  test(`${lesson.title}: starter is a real, incomplete challenge`, () => {
    const starter = starterFor(lesson)
    assert.equal(isValid(lesson, starter), false)
    assert.ok(starter.nodes.includes('user'))
    assert.ok(starter.edges.every(e => starter.nodes.includes(e.source) && starter.nodes.includes(e.target)))
  })

  test(`${lesson.title}: the intended architecture passes`, () => {
    assert.equal(isValid(lesson, solutionFor(lesson)), true)
  })

  test(`${lesson.title}: every required connection matters`, () => {
    for (const missing of lesson.edges) {
      const solution = solutionFor(lesson)
      solution.edges = solution.edges.filter(e => connectionId(e) !== connectionId(missing))
      assert.equal(isValid(lesson, solution), false, `Must require ${connectionId(missing)}`)
    }
  })

  test(`${lesson.title}: reversed and extra dependencies cannot bypass the challenge`, () => {
    for (const e of lesson.edges) {
      if (lesson.edges.some(candidate => candidate.source === e.target && candidate.target === e.source)) continue
      const solution = solutionFor(lesson)
      solution.edges.push({ source: e.target, target: e.source })
      assert.equal(isValid(lesson, solution), false)
    }
  })

  test(`${lesson.title}: traces only refer to components in the solution`, () => {
    assert.ok(lesson.trace.length >= 2)
    for (const event of lesson.trace) {
      assert.ok(lesson.nodes.includes(event.node))
      assert.ok(event.title && event.detail)
    }
  })
}

test('safe lessons reject every unapproved path into tools', () => {
  for (const lesson of LESSONS.slice(4)) {
    for (const source of lesson.nodes.filter(id => id !== 'tools' && id !== 'approval')) {
      const graph = connect(solutionFor(lesson), source, 'tools')
      assert.equal(isValid(lesson, graph), false, `Must reject ${source} → tools`)
    }
  }
})

test('connect is directed, immutable, and refuses missing nodes, duplicates, and self-loops', () => {
  const graph = { nodes: ['user', 'model'], edges: [] }
  const connected = connect(graph, 'user', 'model')
  assert.deepEqual(graph.edges, [])
  assert.deepEqual(connected.edges, [{ source: 'user', target: 'model' }])
  assert.equal(connect(connected, 'user', 'model'), connected)
  assert.equal(connect(graph, 'user', 'user'), graph)
  assert.equal(connect(graph, 'agent', 'model'), graph)
  assert.equal(connect(graph, 'user', 'tools'), graph)
  assert.equal(isValid(LESSONS[0], connect(graph, 'model', 'user')), false)
})

test('removing a component removes incident connections but never the user', () => {
  const graph = solutionFor(LESSONS[1])
  const reduced = removeComponent(graph, 'agent')
  assert.equal(reduced.nodes.includes('agent'), false)
  assert.deepEqual(reduced.edges, [])
  assert.equal(graph.nodes.includes('agent'), true)
  assert.equal(removeComponent(graph, 'user'), graph)
})

test('reset starters do not share mutable arrays or edge objects', () => {
  const a = starterFor(LESSONS[1])
  a.nodes.push('memory')
  a.edges[0].source = 'model'
  const b = starterFor(LESSONS[1])
  assert.equal(b.nodes.includes('memory'), false)
  assert.equal(b.edges[0].source, 'user')
})

test('missing, corrupt, and unknown-version progress safely defaults', () => {
  for (const raw of [null, '', 'not json', 'null', '[]', '1', '{}', '{"version":2}', '{"version":1,"graphs":null}']) {
    const progress = readProgress(raw)
    assert.equal(progress.active, LESSONS[0].id)
    assert.deepEqual(progress.completed, [])
    assert.deepEqual(progress.graphs, {})
  }
})

test('valid progress survives a round trip for every lesson', () => {
  const saved = { version: 1, active: LESSONS[5].id, graphs: Object.fromEntries(LESSONS.map(l => [l.id, solutionFor(l)])), completed: LESSONS.map(l => l.id) }
  assert.deepEqual(readProgress(JSON.stringify(saved)), { ...saved, phase: 'lesson', learned: [], activities: {} })
})

test('saved graphs remove unknown components, dangling edges, duplicates, and self-loops', () => {
  const lesson = LESSONS[0]
  const saved = { version: 1, active: 'missing', graphs: { [lesson.id]: { nodes: ['model', 'model', 'unknown', null], edges: [null, { source: 'user', target: 'user' }, { source: 'model', target: 'tools' }, { source: 'user', target: 'model' }, { source: 'user', target: 'model' }] } }, completed: ['unknown', lesson.id, lesson.id] }
  const restored = readProgress(JSON.stringify(saved))
  assert.equal(restored.active, lesson.id)
  assert.deepEqual(restored.graphs[lesson.id], solutionFor(lesson))
  assert.deepEqual(restored.completed, [lesson.id])
})

test('completion cannot be restored for an incomplete or missing architecture', () => {
  const saved = { version: 1, active: LESSONS[2].id, graphs: { [LESSONS[0].id]: starterFor(LESSONS[0]) }, completed: LESSONS.map(l => l.id) }
  assert.deepEqual(readProgress(JSON.stringify(saved)).completed, [])
})

test('malformed graph and completion fields do not crash hydration', () => {
  const raw = JSON.stringify({ version: 1, graphs: { [LESSONS[0].id]: { nodes: 3, edges: 'bad' } }, completed: 'first-call' })
  assert.deepEqual(readProgress(raw).graphs, {})
  assert.deepEqual(readProgress(raw).completed, [])
})

test('every component has explanatory notes and every lesson has a unique id', () => {
  assert.equal(new Set(LESSONS.map(l => l.id)).size, LESSONS.length)
  for (const component of Object.values(COMPONENTS)) assert.ok(component.description.length > 60)
})
