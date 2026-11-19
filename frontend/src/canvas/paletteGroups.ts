import { CATALOG, type NodeKind } from './catalog'

export const PALETTE_GROUPS: { label: string; kinds: NodeKind[] }[] = [
  { label: 'Clients & edge', kinds: ['client', 'cdn', 'load_balancer', 'external_api'] },
  { label: 'Compute', kinds: ['api_service', 'service', 'worker'] },
  { label: 'Data', kinds: ['database', 'redis', 'cache', 'object_storage', 'search'] },
  { label: 'Messaging', kinds: ['queue'] },
  { label: 'Annotations', kinds: ['sticky_note', 'text', 'shape'] },
]

export function matchesSearch(kind: NodeKind, query: string) {
  const entry = CATALOG[kind]
  return [entry.label, ...(entry.technologies ?? [])].join(' ').toLowerCase().includes(query.trim().toLowerCase())
}
