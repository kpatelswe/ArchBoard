export type LessonNotes = {
  topic: string
  minutes: number
  lead: string
  sections: { heading: string; paragraphs: string[] }[]
  flow: string[]
  example: { title: string; steps: { label: string; detail: string }[] }
  question: { prompt: string; answer: number; options: { label: string; explanation: string }[] }
  sources: { title: string; url: string }[]
}

type PracticeBase = { title: string; instructions: string; explanation: string }
export type GraphPractice = PracticeBase & { kind: 'graph'; labId: string }
export type ScenarioPractice = PracticeBase & { kind: 'scenario'; options: { label: string; feedback: string }[]; correct: number[] }
export type SequencePractice = PracticeBase & { kind: 'sequence'; items: { id: string; label: string }[]; correctOrder: string[] }
export type BudgetPractice = PracticeBase & {
  kind: 'budget'
  fields: { id: string; label: string; unit: string; min: number; max: number; step: number; initial: number }[]
  constraints: { label: string; coefficients: Record<string, number>; operator: '<=' | '>=' | '='; limit: number }[]
  solution: Record<string, number>
}
export type Practice = GraphPractice | ScenarioPractice | SequencePractice | BudgetPractice
export type LessonContent = { id: string; title: string; notes: LessonNotes; practice: Practice }
export type ModuleContent = { id: string; title: string; lessons: LessonContent[] }
export type CourseLesson = LessonContent & { moduleId: string; moduleTitle: string; goal: string }
export type PracticeAnswer = { choices?: number[]; order?: string[]; values?: Record<string, number> }
export type PracticeCheck = { label: string; passed: boolean }
