import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import * as Y from 'yjs'
import { adoptUserNodes, ConnectionMode, getEdgePosition } from '@xyflow/system'

const server = await createServer({ server: { middlewareMode: true } })
const { upsertNode, upsertEdge, setNodeFields, flowFromDoc, reconcileNodes } = await server.ssrLoadModule('/src/lib/boardDoc.ts')
const { createCanvasNode, duplicateNodes } = await server.ssrLoadModule('/src/canvas/canvasActions.ts')
const { matchesSearch, PALETTE_GROUPS } = await server.ssrLoadModule('/src/canvas/paletteGroups.ts')
const { CATALOG } = await server.ssrLoadModule('/src/canvas/catalog.ts')
after(() => server.close())

test('joining replicas retain edges and measured handles across document refreshes', () => {
  const source = new Y.Doc()
  for (const [id, x] of [['a', 0], ['b', 300]]) {
    upsertNode(source, { id, type: 'architecture', position: { x, y: 0 }, data: { kind: 'service', label: id } })
  }
  upsertEdge(source, { id: 'ab', source: 'a', target: 'b' })
  const joiner = new Y.Doc()
  Y.applyUpdate(joiner, Y.encodeStateAsUpdate(source), 'server')
  const initial = flowFromDoc(joiner)
  assert.deepEqual(initial.edges.map(({ id, source, target }) => ({ id, source, target })), [{ id: 'ab', source: 'a', target: 'b' }])
  const measured = initial.nodes.map((node) => ({ ...node, measured: { width: 164, height: 58 }, selected: true }))
  const lookup = new Map()
  const parents = new Map()
  adoptUserNodes(measured, lookup, parents)
  for (const node of lookup.values()) {
    node.internals.handleBounds = {
      source: [{ id: null, position: 'bottom', x: 82, y: 58, width: 8, height: 8 }],
      target: [{ id: null, position: 'top', x: 82, y: 0, width: 8, height: 8 }],
    }
  }
  setNodeFields(source, 'a', { 'data:technology': 'Go' })
  Y.applyUpdate(joiner, Y.encodeStateAsUpdate(source), 'remote')
  const refreshed = flowFromDoc(joiner)
  const reconciled = reconcileNodes(refreshed.nodes, measured)
  adoptUserNodes(reconciled, lookup, parents)
  assert.equal(reconciled[0].selected, true)
  assert.equal(reconciled[0].data.metadata.technology, 'Go')
  assert.ok(getEdgePosition({ id: 'ab', sourceNode: lookup.get('a'), targetNode: lookup.get('b'), connectionMode: ConnectionMode.Strict }))
  assert.equal(refreshed.nodes[0].measured, undefined)
  assert.deepEqual(reconcileNodes([], measured), [])
  assert.deepEqual(reconcileNodes(initial.nodes, []), initial.nodes)
  source.destroy()
  joiner.destroy()
})

test('legacy data remains readable and independent data fields merge', () => {
  const first = new Y.Doc()
  upsertNode(first, {
    id: 'n', type: 'architecture', position: { x: 0, y: 0 },
    data: { kind: 'service', label: 'old', metadata: { custom: true } },
  })
  assert.equal(flowFromDoc(first).nodes[0].data.label, 'old')
  const second = new Y.Doc()
  Y.applyUpdate(second, Y.encodeStateAsUpdate(first))
  setNodeFields(first, 'n', { 'data:label': 'new' })
  setNodeFields(second, 'n', { 'data:technology': 'Go' })
  Y.applyUpdate(first, Y.encodeStateAsUpdate(second))
  Y.applyUpdate(second, Y.encodeStateAsUpdate(first))
  for (const doc of [first, second]) {
    assert.deepEqual(flowFromDoc(doc).nodes[0].data, {
      kind: 'service', label: 'new', metadata: { custom: true, technology: 'Go' },
    })
  }
  setNodeFields(first, 'n', { 'data:technology': null })
  assert.deepEqual(flowFromDoc(first).nodes[0].data.metadata, { custom: true })
  first.destroy()
  second.destroy()
})

test('empty documents and edits of missing nodes are harmless', () => {
  const doc = new Y.Doc()
  setNodeFields(doc, 'missing', { 'data:label': 'new' })
  assert.deepEqual(flowFromDoc(doc), { nodes: [], edges: [] })
  doc.destroy()
})

test('palette groups cover every kind once and filter names or technologies', () => {
  const kinds = PALETTE_GROUPS.flatMap((group) => group.kinds)
  assert.equal(new Set(kinds).size, kinds.length)
  assert.deepEqual([...kinds].sort(), Object.keys(CATALOG).sort())
  assert.equal(matchesSearch('database', ' POSTGRES '), true)
  assert.equal(matchesSearch('api_service', 'api'), true)
  assert.equal(matchesSearch('queue', 'unmatched'), false)
  assert.equal(matchesSearch('shape', ''), true)
})

test('new nodes and selected duplicates write through the CRDT without transient state', () => {
  const doc = new Y.Doc()
  const first = createCanvasNode('database', { x: 40, y: 50 })
  assert.equal(first.type, 'architecture')
  assert.equal(createCanvasNode('sticky_note', { x: 0, y: 0 }).data.label, '')
  upsertNode(doc, first)
  const replica = new Y.Doc()
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc))
  const copies = duplicateNodes(doc, [{ ...first, selected: true, dragging: true }, createCanvasNode('queue', { x: 1, y: 1 })])
  assert.equal(copies.length, 1)
  assert.notEqual(copies[0].id, first.id)
  assert.deepEqual(copies[0].position, { x: 72, y: 82 })
  assert.deepEqual(copies[0].data, first.data)
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc))
  const persisted = flowFromDoc(replica).nodes
  assert.equal(persisted.length, 2)
  assert.equal(persisted.find((node) => node.id === copies[0].id).selected, undefined)
  assert.equal(persisted.find((node) => node.id === copies[0].id).dragging, undefined)
  assert.deepEqual(duplicateNodes(doc, []), [])
  doc.destroy()
  replica.destroy()
})
