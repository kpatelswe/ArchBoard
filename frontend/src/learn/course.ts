import { COURSE_PLAN } from './coursePlan'
import type { CourseLesson, LessonContent, ModuleContent } from './courseTypes'

const files = import.meta.glob<ModuleContent | LessonContent>(['./content/*.json', '!./content/example-lesson.json'], { eager: true, import: 'default' })
const content = Object.values(files)
const modules = content.filter((entry): entry is ModuleContent => 'lessons' in entry)
const standalone = content.filter((entry): entry is LessonContent => !('lessons' in entry))

export const COURSE_LESSONS: CourseLesson[] = COURSE_PLAN.flatMap(module => module.lessons.flatMap(planned => {
  const lesson = modules.find(entry => entry.id === module.id)?.lessons.find(entry => entry.id === planned.id) ?? standalone.find(entry => entry.id === planned.id)
  if (!lesson) throw new Error(`Missing course lesson: ${planned.id}`)
  return [{ ...lesson, goal: planned.goal, moduleId: module.id, moduleTitle: module.title }]
}))
