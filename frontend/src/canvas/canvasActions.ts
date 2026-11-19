import type { Node, XYPosition } from '@xyflow/react'
import type * as Y from 'yjs'
import { canonicalNode } from '../lib/api'
import { LOCAL_ORIGIN, upsertNode } from '../lib/boardDoc'
import { CATALOG, type NodeKind } from './catalog'

export function createCanvasNode(kind: NodeKind, position: XYPosition): Node {
  const entry = CATALOG[kind]
  return {
    id: crypto.randomUUID(),
    type: entry.category === 'annotation' ? kind : 'architecture',
    position,
    data: { kind, label: entry.category === 'annotation' ? '' : entry.label },
  }
}

export function duplicateNodes(doc: Y.Doc, nodes: Node[]): Node[] {
  const copies = nodes.filter((node) => node.selected).map((node) => ({
    ...canonicalNode(node),
    id: crypto.randomUUID(),
    position: { x: node.position.x + 32, y: node.position.y + 32 },
    data: structuredClone(node.data),
    width: node.width,
    height: node.height,
    selected: true,
  }))
  doc.transact(() => copies.forEach((node) => upsertNode(doc, node)), LOCAL_ORIGIN)
  return copies
}
