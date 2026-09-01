import {
  ArchitectureNode,
  ShapeNode,
  StickyNoteNode,
  TextNode,
} from './nodes'

/** React Flow maps a node's `type` string onto a component through this.
 *  Kept out of nodes.tsx so that file exports only components (Fast Refresh). */
export const nodeTypes = {
  architecture: ArchitectureNode,
  sticky_note: StickyNoteNode,
  text: TextNode,
  shape: ShapeNode,
}
