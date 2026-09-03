import {
  Archive,
  Braces,
  Boxes,
  Database,
  Globe,
  Inbox,
  Layers,
  Monitor,
  Network,
  Plug,
  Search,
  Shapes,
  StickyNote,
  Type,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { NodeKind } from './catalog'

const ICONS: Record<NodeKind, LucideIcon> = {
  client: Monitor,
  cdn: Globe,
  load_balancer: Network,
  api_service: Braces,
  service: Boxes,
  database: Database,
  redis: Zap,
  cache: Layers,
  queue: Inbox,
  worker: Wrench,
  object_storage: Archive,
  search: Search,
  external_api: Plug,

  sticky_note: StickyNote,
  text: Type,
  shape: Shapes,
}

export function KindIcon({ kind }: { kind: NodeKind }) {
  const Icon = ICONS[kind]
  return <Icon className="kind-icon" aria-hidden="true" />
}
