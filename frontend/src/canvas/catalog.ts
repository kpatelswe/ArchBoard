export type ComponentKind =
  | 'client'
  | 'cdn'
  | 'load_balancer'
  | 'api_service'
  | 'service'
  | 'database'
  | 'redis'
  | 'cache'
  | 'queue'
  | 'worker'
  | 'object_storage'
  | 'search'
  | 'external_api'

export type AnnotationKind = 'sticky_note' | 'text' | 'shape'

export type NodeKind = ComponentKind | AnnotationKind

type CatalogEntry = {
  label: string
  icon: string
  accent: string
  /** Annotations are documentation only — the analyzer and simulator skip them. */
  category: 'architecture' | 'annotation'
}

export const CATALOG: Record<NodeKind, CatalogEntry> = {
  client: { label: 'Client', icon: '🖥', accent: '#64748b', category: 'architecture' },
  cdn: { label: 'CDN', icon: '🌐', accent: '#0891b2', category: 'architecture' },
  load_balancer: { label: 'Load Balancer', icon: '⚖', accent: '#0d9488', category: 'architecture' },
  api_service: { label: 'API Service', icon: '⚙', accent: '#2563eb', category: 'architecture' },
  service: { label: 'Service', icon: '🧩', accent: '#4f46e5', category: 'architecture' },
  database: { label: 'Database', icon: '🗄', accent: '#7c3aed', category: 'architecture' },
  redis: { label: 'Redis', icon: '⚡', accent: '#dc2626', category: 'architecture' },
  cache: { label: 'Cache', icon: '📦', accent: '#ea580c', category: 'architecture' },
  queue: { label: 'Queue', icon: '📬', accent: '#d97706', category: 'architecture' },
  worker: { label: 'Worker', icon: '🔧', accent: '#65a30d', category: 'architecture' },
  object_storage: { label: 'Object Storage', icon: '🪣', accent: '#0284c7', category: 'architecture' },
  search: { label: 'Search Engine', icon: '🔎', accent: '#c026d3', category: 'architecture' },
  external_api: { label: 'External API', icon: '🔌', accent: '#475569', category: 'architecture' },

  sticky_note: { label: 'Sticky Note', icon: '🗒', accent: '#eab308', category: 'annotation' },
  text: { label: 'Text', icon: '🔤', accent: '#334155', category: 'annotation' },
  shape: { label: 'Shape', icon: '⬜', accent: '#94a3b8', category: 'annotation' },
}

export const COMPONENT_KINDS = (Object.keys(CATALOG) as NodeKind[]).filter(
  (kind) => CATALOG[kind].category === 'architecture',
)

export const ANNOTATION_KINDS = (Object.keys(CATALOG) as NodeKind[]).filter(
  (kind) => CATALOG[kind].category === 'annotation',
)

export type ArchNodeData = {
  kind: NodeKind
  label: string
  /** Architecture metadata (capacity, hit rate, ...) arrives in a later checkpoint. */
  metadata?: Record<string, unknown>
}
