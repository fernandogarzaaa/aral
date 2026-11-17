/**
 * Prompt builders for Aral.
 * Each prompt pins the exact output format the parsers in router.ts expect,
 * so model output can be turned into flashcards and quiz questions.
 */

export function buildSummaryPrompt(notes: string): string {
  return [
    'Summarize the study notes below in short bullet points.',
    'Keep every fact from the notes. Add no new facts.',
    'Use plain words. Keep each bullet to one sentence.',
    '',
    '--- NOTES ---',
    notes.trim(),
  ].join('\n')
}

export function buildFlashcardsPrompt(notes: string, count = 6): string {
  return [
    `Make ${count} flashcards from the study notes below.`,
    'Use only facts from the notes. Add no new facts.',
    'Output one flashcard per pair of lines, exactly in this format:',
    'Q: <question>',
    'A: <short answer>',
    'Put a blank line between flashcards. No extra text.',
    '',
    '--- NOTES ---',
    notes.trim(),
  ].join('\n')
}

export function buildQuizPrompt(notes: string, count = 4): string {
  return [
    `Make ${count} multiple choice questions from the study notes below.`,
    'Use only facts from the notes. Add no new facts.',
    'Each question has exactly 4 options labelled A, B, C, D.',
    'Output each question exactly in this format:',
    'Q: <question>',
    'A) <option>',
    'B) <option>',
    'C) <option>',
    'D) <option>',
    'Answer: <letter>',
    'Put a blank line between questions. No extra text.',
    '',
    '--- NOTES ---',
    notes.trim(),
  ].join('\n')
}
