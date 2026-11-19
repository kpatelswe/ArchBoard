import type { Practice, PracticeAnswer, PracticeCheck } from './courseTypes.ts'

export function starterAnswer(practice: Practice): PracticeAnswer {
  if (practice.kind === 'scenario') return { choices: [] }
  if (practice.kind === 'sequence') return { order: practice.items.map(item => item.id) }
  if (practice.kind === 'budget') return { values: Object.fromEntries(practice.fields.map(field => [field.id, field.initial])) }
  return {}
}

export function checkPractice(practice: Practice, answer: PracticeAnswer | undefined): PracticeCheck[] {
  if (practice.kind === 'scenario') {
    const choices = answer?.choices
    return [{ label: 'Choose all appropriate decisions, without the unsafe or unnecessary ones', passed: Array.isArray(choices) && choices.length === practice.correct.length && new Set(choices).size === choices.length && choices.every(choice => Number.isInteger(choice) && practice.correct.includes(choice)) }]
  }
  if (practice.kind === 'sequence') {
    const order = answer?.order
    return [{ label: 'Put every step in the required order', passed: Array.isArray(order) && order.length === practice.correctOrder.length && order.every((id, index) => id === practice.correctOrder[index]) }]
  }
  if (practice.kind === 'budget') {
    const values = answer?.values
    const valid = !!values && practice.fields.every(field => typeof values[field.id] === 'number' && Number.isFinite(values[field.id]) && values[field.id] >= field.min && values[field.id] <= field.max && Math.abs((values[field.id] - field.min) / field.step - Math.round((values[field.id] - field.min) / field.step)) < 1e-8)
    return [{ label: 'Use values within the allowed ranges and increments', passed: valid }, ...practice.constraints.map(constraint => {
      const total = valid ? Object.entries(constraint.coefficients).reduce((sum, [id, coefficient]) => sum + coefficient * values![id], 0) : NaN
      return { label: constraint.label, passed: Number.isFinite(total) && (constraint.operator === '<=' ? total <= constraint.limit + 1e-8 : constraint.operator === '>=' ? total >= constraint.limit - 1e-8 : Math.abs(total - constraint.limit) < 1e-8) }
    })]
  }
  return [{ label: 'Complete this architecture exercise on the canvas', passed: false }]
}
