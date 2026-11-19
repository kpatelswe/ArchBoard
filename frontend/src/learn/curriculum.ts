export const COMPONENTS = {
  user: { name: 'User', category: 'Input', description: 'Sends a goal and receives a response. The application, not the user, owns credentials and permissions.', symbol: '01', x: 30, y: 226 },
  model: { name: 'Language model', category: 'Reasoning', description: 'Predicts the next response or proposes a tool call. It cannot execute tools or remember previous requests by itself.', symbol: 'LM', x: 426, y: 40 },
  agent: { name: 'Agent runtime', category: 'Orchestration', description: 'Owns the loop: send context to the model, validate proposed actions, run permitted tools, return observations, and stop within a step budget.', symbol: 'AG', x: 426, y: 226 },
  tools: { name: 'Tool API', category: 'Action', description: 'Executes a typed operation outside the model. Use scoped credentials, validate arguments, set timeouts, and make writes idempotent.', symbol: '↗', x: 810, y: 226 },
  knowledge: { name: 'Knowledge store', category: 'Retrieval', description: 'Retrieves relevant documentation for the current question. Retrieval-augmented generation (RAG) supplies evidence; it does not guarantee correctness.', symbol: 'KB', x: 666, y: 40 },
  memory: { name: 'Session memory', category: 'State', description: 'Persists scoped conversation state outside the model. Store only what is needed, apply retention limits, and isolate users and sessions.', symbol: 'DB', x: 426, y: 412 },
  guardrail: { name: 'Policy gateway', category: 'Safety', description: 'Authenticates the caller and checks input policy before orchestration. Tool-side authorization is still required; a prompt is not a security boundary.', symbol: '⊘', x: 228, y: 226 },
  approval: { name: 'Human approval', category: 'Safety', description: 'Pauses sensitive actions for a person to approve or deny. Bind approval to the exact action and arguments before executing.', symbol: '✓', x: 618, y: 226 },
  queue: { name: 'Task queue', category: 'Reliability', description: 'Buffers long-running work for workers. Bound retries and concurrency; use idempotency keys because delivery may happen more than once.', symbol: 'Q', x: 228, y: 412 },
  telemetry: { name: 'Trace & evals', category: 'Observability', description: 'Records redacted latency, cost, tool calls, and outcomes. Use offline evaluations to compare quality; do not log raw secrets or personal data.', symbol: '◎', x: 666, y: 412 },
} as const

export type ComponentId = keyof typeof COMPONENTS
export type Connection = { source: ComponentId; target: ComponentId }
export type Architecture = { nodes: ComponentId[]; edges: Connection[] }
export type TraceEvent = { node: ComponentId; title: string; detail: string }
type Lesson = {
  id: string
  title: string
  subtitle: string
  minutes: number
  concept: string
  mission: string
  takeaway: string
  hint: string
  nodes: ComponentId[]
  edges: Connection[]
  starter: Architecture
  checks: { label: string; nodes?: ComponentId[]; edges?: Connection[]; absent?: Connection[] }[]
  trace: TraceEvent[]
}

const edge = (source: ComponentId, target: ComponentId): Connection => ({ source, target })
const coreNodes: ComponentId[] = ['user', 'agent', 'model', 'tools']
const coreEdges = [edge('user', 'agent'), edge('agent', 'model'), edge('agent', 'tools')]
const knowledgeNodes: ComponentId[] = [...coreNodes, 'knowledge']
const knowledgeEdges = [...coreEdges, edge('agent', 'knowledge')]
const memoryNodes: ComponentId[] = [...knowledgeNodes, 'memory']
const memoryEdges = [...knowledgeEdges, edge('agent', 'memory')]
const safeNodes: ComponentId[] = [...memoryNodes, 'guardrail', 'approval']
const safeEdges = [...memoryEdges.filter(e => e.source !== 'user' && e.target !== 'tools'), edge('user', 'guardrail'), edge('guardrail', 'agent'), edge('agent', 'approval'), edge('approval', 'tools')]
const baseTrace: TraceEvent[] = [
  { node: 'user', title: 'A goal arrives', detail: '“Find our refund policy and prepare a refund for order #42.” This is a fixed teaching scenario, not a live model request.' },
  { node: 'agent', title: 'The runtime assembles context', detail: 'The application loads instructions and the allowed tool schemas. It sets a maximum of 5 reasoning steps and a request deadline.' },
  { node: 'model', title: 'The model proposes an action', detail: 'The model emits a structured lookup_order call. A proposal is data: the runtime still needs to validate and execute it.' },
  { node: 'tools', title: 'The tool returns an observation', detail: 'After argument and permission checks, the order API returns order #42. The runtime sends the observation back to the model.' },
  { node: 'model', title: 'Reason → act → observe → stop', detail: 'With enough information, the model produces an answer. The runtime stops on a final response or when its step/time budget is exhausted.' },
]

export const LESSONS: Lesson[] = [
  {
    id: 'first-call', title: 'Start with a model', subtitle: 'A request is not an agent', minutes: 3,
    concept: 'Start with the smallest useful system: an application sends a user’s prompt to a language model and returns text. A model call has no tools, persistent memory, or autonomous loop.',
    mission: 'Add a language model, then connect the user to it. Click a source card, then a destination to draw a directed connection.',
    takeaway: 'A model generates a response. An agent system adds application-controlled decisions, actions, and feedback around that model.',
    hint: 'Add Language model from the tray. Click User, then Language model. The arrow should point toward the model.',
    nodes: ['user', 'model'], edges: [edge('user', 'model')], starter: { nodes: ['user'], edges: [] },
    checks: [{ label: 'A language model receives the request', nodes: ['model'] }, { label: 'User → Language model', edges: [edge('user', 'model')] }],
    trace: [baseTrace[0], { node: 'model', title: 'One model call', detail: 'The application sends the prompt to the model and returns generated text. No tool is executed and nothing is remembered across requests.' }],
  },
  {
    id: 'agent-loop', title: 'Give it a tool', subtitle: 'Reason, act, observe, repeat', minutes: 5,
    concept: 'An agent is a model inside an application-controlled loop. The model proposes actions; the runtime validates them, calls tools, and feeds results back. Bound that loop so it cannot run forever.',
    mission: 'The runtime and model are wired. Add a tool API and connect the runtime to it. Do not wire the model directly to a tool.',
    takeaway: 'The model proposes; the runtime disposes. Keep credentials, argument validation, timeouts, and the stopping condition outside the prompt.',
    hint: 'Add Tool API. Connect Agent runtime → Tool API. The existing runtime → model link represents calls and their responses.',
    nodes: coreNodes, edges: coreEdges,
    starter: { nodes: ['user', 'agent', 'model'], edges: coreEdges.slice(0, 2) },
    checks: [{ label: 'The runtime owns the model call', edges: [edge('user', 'agent'), edge('agent', 'model')] }, { label: 'The runtime can invoke a tool', nodes: ['tools'], edges: [edge('agent', 'tools')] }, { label: 'No direct model → tool execution', absent: [edge('model', 'tools')] }], trace: baseTrace,
  },
  {
    id: 'grounding', title: 'Ground it in knowledge', subtitle: 'Give answers a source', minutes: 4,
    concept: 'A model does not automatically know your private or current documentation. Retrieval-augmented generation (RAG) fetches relevant passages and adds them to the model’s context before it answers.',
    mission: 'Add a knowledge store and let the runtime retrieve policy documents. Keep the tool API for actions; knowledge is evidence, not permission.',
    takeaway: 'Retrieval improves grounding, but can return stale or hostile content. Cite sources, enforce document access, and treat retrieved text as untrusted data.',
    hint: 'Add Knowledge store, then connect Agent runtime → Knowledge store. Retrieval results flow back as the response on that connection.',
    nodes: knowledgeNodes, edges: knowledgeEdges, starter: { nodes: coreNodes, edges: coreEdges },
    checks: [{ label: 'The working agent loop is preserved', nodes: coreNodes, edges: coreEdges }, { label: 'The runtime can retrieve evidence', nodes: ['knowledge'], edges: [edge('agent', 'knowledge')] }, { label: 'The runtime controls tool access', absent: [edge('model', 'tools')] }],
    trace: [baseTrace[0], baseTrace[1], { node: 'knowledge', title: 'Retrieve before reasoning', detail: 'The runtime checks document access and retrieves the refund-policy passage with its source. It treats the passage as evidence, never as instructions.' }, { node: 'model', title: 'Answer with evidence', detail: 'The model receives the retrieved passage and can cite the 30-day return window. If no trustworthy passage is found, the application should ask or abstain.' }, baseTrace[3], baseTrace[4]],
  },
  {
    id: 'memory', title: 'Remember the conversation', subtitle: 'State belongs outside the model', minutes: 4,
    concept: 'Model requests are stateless unless your application supplies prior context. Store conversation state outside the model, scope it to the current user and session, and load only the relevant pieces.',
    mission: 'Add session memory and connect it to the runtime, so a follow-up like “what about that order?” can resolve the earlier reference.',
    takeaway: 'Knowledge is shared reference material; memory is scoped interaction state. Neither is unlimited: define access rules, retention, deletion, and a context budget.',
    hint: 'Add Session memory. Connect Agent runtime → Session memory. This is a read/write dependency, not a direct user-to-database link.',
    nodes: memoryNodes, edges: memoryEdges, starter: { nodes: knowledgeNodes, edges: knowledgeEdges },
    checks: [{ label: 'The grounded agent still works', nodes: knowledgeNodes, edges: knowledgeEdges }, { label: 'The runtime owns session state', nodes: ['memory'], edges: [edge('agent', 'memory')] }, { label: 'The user cannot access memory directly', absent: [edge('user', 'memory'), edge('model', 'tools')] }],
    trace: [baseTrace[0], { node: 'memory', title: 'Load scoped state', detail: 'The runtime reads only this authenticated user’s session. A prior turn identifies order #42; another user’s conversations remain inaccessible.' }, baseTrace[1], { node: 'knowledge', title: 'Fetch current policy', detail: 'Conversation history identifies the order; retrieved documentation supplies the policy. These are different stores with different retention rules.' }, baseTrace[2], baseTrace[3], { node: 'memory', title: 'Save the minimum useful state', detail: 'Save a scoped summary and order reference, not payment credentials. Apply a retention limit and support deletion.' }, baseTrace[4]],
  },
  {
    id: 'safety', title: 'Put boundaries on action', subtitle: 'Permission is not a prompt', minutes: 6,
    concept: 'A convincing prompt is not authorization. Authenticate and check policy before orchestration, and require approval for sensitive writes. Tool APIs must independently enforce permissions.',
    mission: 'Route the user through a policy gateway. Replace the runtime’s direct tool connection with Agent runtime → Human approval → Tool API.',
    takeaway: 'Defense in depth: input policy, least-privilege tools, action-bound approval, and tool-side authorization. A person can deny an action, not just rubber-stamp it.',
    hint: 'Remove User → Agent runtime and Agent runtime → Tool API using Connections below. Add Policy gateway and Human approval; wire User → Policy gateway → Agent runtime → Human approval → Tool API.',
    nodes: safeNodes, edges: safeEdges, starter: { nodes: memoryNodes, edges: memoryEdges },
    checks: [{ label: 'Authenticate before orchestration', nodes: ['guardrail'], edges: [edge('user', 'guardrail'), edge('guardrail', 'agent')], absent: [edge('user', 'agent')] }, { label: 'Sensitive tools require human approval', nodes: ['approval'], edges: [edge('agent', 'approval'), edge('approval', 'tools')], absent: [edge('agent', 'tools'), edge('model', 'tools'), edge('user', 'tools'), edge('guardrail', 'tools')] }, { label: 'Keep model, knowledge, and memory dependencies', edges: [edge('agent', 'model'), edge('agent', 'knowledge'), edge('agent', 'memory')] }],
    trace: [baseTrace[0], { node: 'guardrail', title: 'Authenticate and check policy', detail: 'The application verifies the caller and request scope. Retrieved documents and user prompts cannot grant new permissions.' }, baseTrace[1], { node: 'model', title: 'Propose a sensitive action', detail: 'The model proposes refund(order_id=42, amount=25). The runtime validates arguments and checks the tool allowlist.' }, { node: 'approval', title: 'Pause for a person', detail: 'A reviewer approves this exact order and amount. Denial would stop execution. In this illustrative trace, approval is granted.' }, { node: 'tools', title: 'Execute with scoped credentials', detail: 'The tool API independently checks authorization and an idempotency key before applying the approved refund. A changed amount would require new approval.' }, baseTrace[4]],
  },
  {
    id: 'production', title: 'Design for the real world', subtitle: 'Make failure observable', minutes: 6,
    concept: 'Slow tools, retries, and traffic spikes are normal. A queue decouples request intake from workers. Traces and evaluations tell you where latency, cost, and quality go wrong.',
    mission: 'Replace Policy gateway → Agent runtime with Policy gateway → Task queue → Agent runtime. Add a trace & evals connection from the runtime.',
    takeaway: 'This is a starting architecture, not a production certification. Add bounded retries, dead-letter handling, idempotency, redacted telemetry, budgets, and real evaluations before shipping.',
    hint: 'Remove Policy gateway → Agent runtime. Add Task queue and Trace & evals. Connect Policy gateway → Task queue → Agent runtime, then Agent runtime → Trace & evals.',
    nodes: [...safeNodes, 'queue', 'telemetry'], edges: [...safeEdges.filter(e => !(e.source === 'guardrail' && e.target === 'agent')), edge('guardrail', 'queue'), edge('queue', 'agent'), edge('agent', 'telemetry')],
    starter: { nodes: safeNodes, edges: safeEdges },
    checks: [{ label: 'Queue authenticated work before the runtime', nodes: ['queue'], edges: [edge('user', 'guardrail'), edge('guardrail', 'queue'), edge('queue', 'agent')], absent: [edge('user', 'agent'), edge('guardrail', 'agent')] }, { label: 'Observe the runtime’s behavior', nodes: ['telemetry'], edges: [edge('agent', 'telemetry')] }, { label: 'Preserve grounded, stateful, approved actions', nodes: safeNodes, edges: safeEdges.filter(e => e.source !== 'guardrail'), absent: [edge('agent', 'tools'), edge('model', 'tools'), edge('user', 'tools'), edge('guardrail', 'tools'), edge('queue', 'tools')] }],
    trace: [baseTrace[0], { node: 'guardrail', title: 'Authorize at intake', detail: 'Authenticate, check permissions, apply rate limits, and assign a correlation ID before accepting work.' }, { node: 'queue', title: 'Buffer and bound the work', detail: 'Return a task ID; a worker claims the job. Retries have backoff and a maximum count. Repeated failures belong in a dead-letter queue, not an infinite loop.' }, { node: 'agent', title: 'Run with a deadline', detail: 'The worker loads scoped memory and policy evidence, then enters a bounded model loop. Use a cancellation path and a cost budget.' }, baseTrace[2], { node: 'approval', title: 'Persist the approval checkpoint', detail: 'The worker pauses the sensitive action until the exact operation is approved. A rejected or expired approval prevents execution.' }, { node: 'tools', title: 'Handle at-least-once delivery safely', detail: 'The approved tool write uses an idempotency key, so a retried job does not issue a second refund. Tool errors are classified before retry.' }, { node: 'telemetry', title: 'Measure, then evaluate', detail: 'Record redacted spans for retrieval, model, and tool calls. Track latency, tokens, failures, and outcome quality; compare changes against an offline evaluation set.' }, { node: 'user', title: 'Return a result, not a mystery', detail: 'The client can poll or subscribe using its task ID. Surface success or a clear failure. This local simulation has made no external calls.' }],
  },
]

export function connectionId(connection: Connection): string {
  return `${connection.source}:${connection.target}`
}

export function connect(graph: Architecture, source: ComponentId, target: ComponentId): Architecture {
  if (source === target || !graph.nodes.includes(source) || !graph.nodes.includes(target) || graph.edges.some(e => e.source === source && e.target === target)) return graph
  return { ...graph, edges: [...graph.edges, { source, target }] }
}

export function removeComponent(graph: Architecture, id: ComponentId): Architecture {
  if (id === 'user') return graph
  return { nodes: graph.nodes.filter(node => node !== id), edges: graph.edges.filter(e => e.source !== id && e.target !== id) }
}

export function checkArchitecture(lesson: Lesson, graph: Architecture) {
  const hasEdge = (e: Connection) => graph.nodes.includes(e.source) && graph.nodes.includes(e.target) && graph.edges.some(candidate => connectionId(candidate) === connectionId(e))
  return [...lesson.checks.map(check => ({
    label: check.label,
    passed: (check.nodes ?? []).every(id => graph.nodes.includes(id)) && (check.edges ?? []).every(hasEdge) && !(check.absent ?? []).some(hasEdge),
  })), {
    label: 'No extra dependencies or bypass routes',
    passed: graph.nodes.every(id => lesson.nodes.includes(id)) && graph.edges.every(e => lesson.edges.some(expected => connectionId(expected) === connectionId(e))),
  }]
}

export function starterFor(lesson: Lesson): Architecture {
  return { nodes: [...lesson.starter.nodes], edges: lesson.starter.edges.map(e => ({ ...e })) }
}

export const PROGRESS_KEY = 'archboard.agent-learning.v1'
export type LearningProgress = { version: 1; active: string; graphs: Record<string, Architecture>; completed: string[] }

export function readProgress(raw: string | null): LearningProgress {
  const empty: LearningProgress = { version: 1, active: LESSONS[0].id, graphs: {}, completed: [] }
  try {
    const parsed = JSON.parse(raw ?? 'null')
    if (!parsed || parsed.version !== 1) return empty
    const graphs: Record<string, Architecture> = {}
    for (const lesson of LESSONS) {
      const graph = parsed.graphs?.[lesson.id]
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) continue
      const nodes = [...new Set<ComponentId>(graph.nodes.filter((id: ComponentId) => lesson.nodes.includes(id)))]
      if (!nodes.includes('user')) nodes.unshift('user')
      let safe: Architecture = { nodes, edges: [] }
      for (const e of graph.edges) {
        if (e && nodes.includes(e.source) && nodes.includes(e.target)) safe = connect(safe, e.source, e.target)
      }
      graphs[lesson.id] = safe
    }
    return {
      version: 1,
      active: LESSONS.some(l => l.id === parsed.active) ? parsed.active : empty.active,
      graphs,
      completed: LESSONS.filter(l => Array.isArray(parsed.completed) && parsed.completed.includes(l.id) && graphs[l.id] && checkArchitecture(l, graphs[l.id]).every(c => c.passed)).map(l => l.id),
    }
  } catch {
    return empty
  }
}
