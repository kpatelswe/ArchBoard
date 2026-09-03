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
  accent: string
  /** Annotations are documentation only — the analyzer and simulator skip them. */
  category: 'architecture' | 'annotation'
  /** Concrete implementations to suggest. Cosmetic today (stored in node
   *  metadata.technology); the simulator may read it later. */
  technologies?: string[]
}

export const CATALOG: Record<NodeKind, CatalogEntry> = {
  client: {
    label: 'Client', accent: '#64748b', category: 'architecture',
    technologies: ['Web browser', 'iOS', 'Android', 'Desktop', 'CLI'],
  },
  cdn: {
    label: 'CDN', accent: '#0891b2', category: 'architecture',
    technologies: ['CloudFront', 'Cloudflare', 'Fastly', 'Akamai'],
  },
  load_balancer: {
    label: 'Load Balancer', accent: '#0d9488', category: 'architecture',
    technologies: ['NGINX', 'HAProxy', 'AWS ALB', 'Envoy', 'Traefik'],
  },
  api_service: {
    label: 'API Service', accent: '#2563eb', category: 'architecture',
    technologies: ['FastAPI', 'Express', 'Spring Boot', 'Go', 'Rails', 'Django'],
  },
  service: {
    label: 'Service', accent: '#4f46e5', category: 'architecture',
    technologies: ['FastAPI', 'Go', 'gRPC', 'Spring Boot', 'Node.js'],
  },
  database: {
    label: 'Database', accent: '#7c3aed', category: 'architecture',
    technologies: ['PostgreSQL', 'MySQL', 'DynamoDB', 'MongoDB', 'Cassandra', 'SQLite'],
  },
  redis: {
    label: 'Redis', accent: '#dc2626', category: 'architecture',
    technologies: ['Redis', 'Valkey', 'ElastiCache', 'Upstash'],
  },
  cache: {
    label: 'Cache', accent: '#ea580c', category: 'architecture',
    technologies: ['Redis', 'Memcached', 'ElastiCache', 'In-process'],
  },
  queue: {
    label: 'Queue', accent: '#d97706', category: 'architecture',
    technologies: ['SQS', 'RabbitMQ', 'Kafka', 'Redis Streams', 'Pub/Sub'],
  },
  worker: {
    label: 'Worker', accent: '#65a30d', category: 'architecture',
    technologies: ['Celery', 'Sidekiq', 'BullMQ', 'AWS Lambda'],
  },
  object_storage: {
    label: 'Object Storage', accent: '#0284c7', category: 'architecture',
    technologies: ['AWS S3', 'Cloudflare R2', 'Google Cloud Storage', 'MinIO', 'Azure Blob'],
  },
  search: {
    label: 'Search Engine', accent: '#c026d3', category: 'architecture',
    technologies: ['Elasticsearch', 'OpenSearch', 'Algolia', 'Meilisearch', 'Typesense'],
  },
  external_api: {
    label: 'External API', accent: '#475569', category: 'architecture',
    technologies: ['Stripe', 'Twilio', 'SendGrid', 'Auth0', 'OpenAI'],
  },

  sticky_note: { label: 'Sticky Note', accent: '#eab308', category: 'annotation' },
  text: { label: 'Text', accent: '#334155', category: 'annotation' },
  shape: { label: 'Shape', accent: '#94a3b8', category: 'annotation' },
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
