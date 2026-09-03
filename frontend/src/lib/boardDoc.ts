import { MarkerType, type Edge, type Node } from '@xyflow/react'
import * as Y from 'yjs'
import { canonicalEdge, canonicalNode } from './api'

/** Transaction origin for edits made on this client. The socket layer sends
 *  only 'local' transactions; the canvas re-renders on everything else. */
export const LOCAL_ORIGIN = 'local'

/** The board document: two root maps keyed by id, one Y.Map per element so
 *  concurrent edits to different fields of the same node merge instead of
 *  clobbering (the scenario the editing locks existed to avoid). */
export const nodesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('nodes')
export const edgesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('edges')

function yMapFrom(fields: Record<string, unknown>): Y.Map<unknown> {
  return new Y.Map(Object.entries(fields).filter(([, v]) => v !== undefined))
}

export function flowFromDoc(doc: Y.Doc): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  nodesMap(doc).forEach((value) => nodes.push(value.toJSON() as Node))
  edgesMap(doc).forEach((value) =>
    edges.push({
      ...(value.toJSON() as Edge),
      markerEnd: { type: MarkerType.ArrowClosed },
    }),
  )
  return { nodes, edges }
}

export function upsertNode(doc: Y.Doc, node: Node) {
  doc.transact(() => {
    nodesMap(doc).set(node.id, yMapFrom(canonicalNode(node)))
  }, LOCAL_ORIGIN)
}

/** Set only the given top-level fields, leaving siblings for others to edit. */
export function setNodeFields(
  doc: Y.Doc,
  id: string,
  fields: Record<string, unknown>,
) {
  doc.transact(() => {
    const node = nodesMap(doc).get(id)
    if (!node) return
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) node.set(key, value)
    }
  }, LOCAL_ORIGIN)
}

export function removeNode(doc: Y.Doc, id: string) {
  doc.transact(() => {
    nodesMap(doc).delete(id)
    // A deleted node takes its edges with it, mirroring the snapshot
    // validator's no-dangling-edges rule.
    const edges = edgesMap(doc)
    for (const [edgeId, edge] of [...edges.entries()]) {
      if (edge.get('source') === id || edge.get('target') === id)
        edges.delete(edgeId)
    }
  }, LOCAL_ORIGIN)
}

export function upsertEdge(doc: Y.Doc, edge: Edge) {
  doc.transact(() => {
    edgesMap(doc).set(edge.id, yMapFrom(canonicalEdge(edge)))
  }, LOCAL_ORIGIN)
}

export function removeEdge(doc: Y.Doc, id: string) {
  doc.transact(() => {
    edgesMap(doc).delete(id)
  }, LOCAL_ORIGIN)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
