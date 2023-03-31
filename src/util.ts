import type { Category, Question } from "./types";

export function isDoublePoints(categories: Category[], treshold: number = 5): boolean {
  let allQuestions: Question[] = [];
  categories.forEach((category) => allQuestions.push(...category.questions));
  let notAnsweredCount = 0;
  allQuestions.forEach((question) => !question.answered && notAnsweredCount++);
  return notAnsweredCount <= treshold;
}
