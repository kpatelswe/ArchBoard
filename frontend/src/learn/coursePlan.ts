export const COURSE_PLAN = [
  { id: 'foundations', title: 'Foundations', description: 'Understand the model before adding autonomy.', lessons: [
    { id: 'first-call', title: 'Start with a model', goal: "Distinguish generated text from an executed external action and identify the application’s role.", kind: 'graph' },
    { id: 'context-windows', title: 'Tokens, context & model limits', goal: "Allocate a finite context window across instructions, evidence, history, and output without overflow.", kind: 'budget' },
    { id: 'structured-output', title: 'Make outputs predictable', goal: "Design and validate a typed response, including refusals, invalid output, and repair limits.", kind: 'scenario' },
    { id: 'agents-vs-workflows', title: 'When do you need an agent?', goal: "Choose a deterministic workflow or bounded agent based on uncertainty and required control.", kind: 'scenario' },
  ] },
  { id: 'tools', title: 'Tools & integrations', description: 'Turn proposals into controlled actions.', lessons: [
    { id: 'tool-contracts', title: 'Design a tool contract', goal: "Specify typed arguments, results, authorization, and side-effect semantics for a tool.", kind: 'scenario' },
    { id: 'agent-loop', title: 'Build the agent loop', goal: "Trace the runtime-controlled propose, validate, execute, observe, and stop loop.", kind: 'graph' },
    { id: 'tool-failures', title: 'Handle tool failures', goal: "Classify tool errors and order safe recovery without repeating side effects.", kind: 'sequence' },
    { id: 'integration-boundaries', title: 'Connect tools with MCP', goal: "Explain MCP client/server responsibilities without treating discovery as authorization.", kind: 'scenario' },
  ] },
  { id: 'orchestration', title: 'Orchestration', description: 'Choose control flow instead of hoping it emerges.', lessons: [
    { id: 'routing', title: 'Route work to the right path', goal: "Choose explicit routing rules, fallbacks, and escalation for heterogeneous requests.", kind: 'scenario' },
    { id: 'workflow-dags', title: 'Compose workflows & DAGs', goal: "Order dependent tasks and identify opportunities for safe parallel execution.", kind: 'sequence' },
    { id: 'planning', title: 'Plan, execute & replan', goal: "Separate planning from execution and use observations to revise a bounded plan.", kind: 'sequence' },
    { id: 'execution-budgets', title: 'Set budgets & stop conditions', goal: "Allocate call, time, and cost limits with explicit termination conditions.", kind: 'budget' },
  ] },
  { id: 'knowledge-memory', title: 'Knowledge & memory', description: 'Manage evidence, context, and state deliberately.', lessons: [
    { id: 'grounding', title: 'Ground answers with retrieval', goal: "Connect authorized retrieval to generation and surface missing evidence instead of guessing.", kind: 'graph' },
    { id: 'retrieval-quality', title: 'Improve retrieval quality', goal: "Order ingestion, chunking, indexing, retrieval, reranking, and evidence evaluation.", kind: 'sequence' },
    { id: 'memory', title: 'Remember the conversation', goal: "Isolate conversation state by authenticated user and session with deliberate retention.", kind: 'graph' },
    { id: 'long-term-memory', title: 'Design long-term memory', goal: "Choose what to store, verify, expire, and delete across sessions without confusing memory with truth.", kind: 'scenario' },
  ] },
  { id: 'multi-agent', title: 'Multi-agent systems', description: 'Coordinate specialists without losing control.', lessons: [
    { id: 'agent-handoffs', title: 'Roles, ownership & handoffs', goal: "Assign ownership and transfer scoped context, permissions, and termination responsibility.", kind: 'scenario' },
    { id: 'manager-worker', title: 'Manager–worker architectures', goal: "Design bounded specialist delegation with explicit acceptance and synthesis.", kind: 'sequence' },
    { id: 'parallel-agents', title: 'Parallel work & shared state', goal: "Coordinate independent workers without shared-state races or unbounded fan-out.", kind: 'scenario' },
    { id: 'coordination-tradeoffs', title: 'Know when one agent is enough', goal: "Quantify coordination overhead and choose the simplest architecture meeting requirements.", kind: 'budget' },
  ] },
  { id: 'safety-security', title: 'Safety & security', description: 'Enforce trust boundaries outside the model.', lessons: [
    { id: 'trust-boundaries', title: 'Map trust & authorization', goal: "Place authentication and resource authorization at enforceable system boundaries.", kind: 'scenario' },
    { id: 'prompt-injection', title: 'Contain prompt injection', goal: "Treat external text as untrusted data and constrain tool access and data exfiltration.", kind: 'scenario' },
    { id: 'safety', title: 'Require approval for sensitive actions', goal: "Bind sensitive-action approval to exact arguments and reject changed, denied, or expired approvals.", kind: 'graph' },
    { id: 'sandboxing', title: 'Sandbox tools & isolate tenants', goal: "Restrict execution, network access, credentials, and tenant data outside the model.", kind: 'scenario' },
  ] },
  { id: 'production-systems', title: 'Production systems', description: 'Make execution durable, visible, and operable.', lessons: [
    { id: 'production', title: 'Queue work & retry safely', goal: "Queue authenticated work and handle retries, duplicate delivery, and observability.", kind: 'graph' },
    { id: 'durable-state', title: 'Checkpoint, resume & cancel', goal: "Order checkpoints, resumptions, cancellations, and irreversible side effects safely.", kind: 'sequence' },
    { id: 'observability', title: 'Trace the system without leaking data', goal: "Choose useful correlated telemetry while redacting sensitive data and limiting retention.", kind: 'scenario' },
    { id: 'deployment', title: 'Ship, version & roll back', goal: "Version prompts, tools, models, and state; stage rollout and preserve a rollback path.", kind: 'sequence' },
  ] },
  { id: 'evaluation-capstone', title: 'Evaluation & capstone', description: 'Prove behavior, compare tradeoffs, and design the whole system.', lessons: [
    { id: 'evaluation-datasets', title: 'Build evaluations that matter', goal: "Build representative, held-out evaluations with outcome and safety rubrics.", kind: 'scenario' },
    { id: 'cost-latency', title: 'Balance quality, cost & latency', goal: "Calculate a simplified request budget and compare optimization tradeoffs without ignoring quality.", kind: 'budget' },
    { id: 'failure-testing', title: 'Test failures, not just happy paths', goal: "Select adversarial and failure scenarios with measurable expected behavior.", kind: 'scenario' },
    { id: 'capstone', title: 'Design a production agent system', goal: "Construct and justify a complete bounded, grounded, permissioned, durable, observable agent architecture.", kind: 'graph' },
  ] },
] as const
