import type { ReactElement } from 'react'
import type { NodeKind } from './catalog'

/** Stroke-drawn schematic symbols, one per kind, on a 16×16 grid. */
const GLYPHS: Record<NodeKind, ReactElement> = {
  client: (
    <>
      <rect x="2.5" y="3" width="11" height="8" rx="1" />
      <path d="M8 11v2.5M5.5 13.5h5" />
    </>
  ),
  cdn: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <ellipse cx="8" cy="8" rx="2.5" ry="5.5" />
      <path d="M2.5 8h11" />
    </>
  ),
  load_balancer: (
    <>
      <path d="M2 8h4.5" />
      <path d="M6.5 8c2.5 0 2.5-4 5-4H14" />
      <path d="M6.5 8H14" />
      <path d="M6.5 8c2.5 0 2.5 4 5 4H14" />
    </>
  ),
  api_service: (
    <>
      <path d="M5.5 5 3 8l2.5 3" />
      <path d="M10.5 5 13 8l-2.5 3" />
      <path d="M9 4.5l-2 7" />
    </>
  ),
  service: (
    <>
      <path d="M8 2l5.2 3v6L8 14l-5.2-3V5z" />
      <circle cx="8" cy="8" r="1.6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="8" cy="4" rx="5" ry="2" />
      <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
      <path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </>
  ),
  redis: <path d="M9.5 2 4.5 9H8l-1.5 5 5-7H8.5z" />,
  cache: (
    <>
      <path d="M8 2 14 5 8 8 2 5z" />
      <path d="M2 8.2l6 3 6-3" />
      <path d="M2 11.2l6 3 6-3" />
    </>
  ),
  queue: (
    <>
      <rect x="1.5" y="5.5" width="2.8" height="5" rx="0.5" />
      <rect x="5.1" y="5.5" width="2.8" height="5" rx="0.5" />
      <rect x="8.7" y="5.5" width="2.8" height="5" rx="0.5" />
      <path d="M12.5 8h2.5m0 0-1.4-1.4M15 8l-1.4 1.4" />
    </>
  ),
  worker: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4" />
    </>
  ),
  object_storage: (
    <>
      <ellipse cx="8" cy="4.5" rx="5" ry="1.6" />
      <path d="M3 4.5l1.2 8.3c.1.7 1.8 1.2 3.8 1.2s3.7-.5 3.8-1.2L13 4.5" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2 14 14" />
    </>
  ),
  external_api: (
    <>
      <path d="M6.5 4.5h-3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3" />
      <path d="M8.5 7.5 14 2M10 2h4v4" />
    </>
  ),

  sticky_note: (
    <>
      <path d="M3 3h10v6l-4 4H3z" />
      <path d="M9 13V9h4" />
    </>
  ),
  text: <path d="M3.5 5V3.5h9V5M8 3.5V13M6 13h4" />,
  shape: (
    <>
      <rect x="2.5" y="2.5" width="8" height="8" rx="1" />
      <circle cx="10.5" cy="10.5" r="3" />
    </>
  ),
}

export function KindIcon({ kind }: { kind: NodeKind }) {
  return (
    <svg className="kind-icon" viewBox="0 0 16 16" aria-hidden="true">
      {GLYPHS[kind]}
    </svg>
  )
}
