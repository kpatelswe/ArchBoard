import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import * as Y from 'yjs'

const server = await createServer({ server: { middlewareMode: true } })
const { upsertNode, setNodeFields, flowFromDoc } = await server.ssrLoadModule('/src/lib/boardDoc.ts')
after(() => server.close())

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
