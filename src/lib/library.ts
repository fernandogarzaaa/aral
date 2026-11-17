/**
 * Study set library. localStorage is the working store, so the library
 * works offline with no Firebase project. Firestore sync lives in
 * sync.ts and runs only when Firebase is configured and signed in.
 */

import type { Flashcard, QuizQuestion } from './router'

export interface StudySet {
  id: string
  title: string
  notes: string
  summary: string
  flashcards: Flashcard[]
  quiz: QuizQuestion[]
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'aral.studySets.v1'

export function loadSets(): StudySet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is StudySet => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as StudySet).id === 'string' &&
        typeof (item as StudySet).title === 'string' &&
        typeof (item as StudySet).notes === 'string'
      )
    })
  } catch {
    return []
  }
}

export function saveSet(set: StudySet): StudySet[] {
  const sets = loadSets()
  const index = sets.findIndex((item) => item.id === set.id)
  const updated: StudySet = { ...set, updatedAt: new Date().toISOString() }
  if (index >= 0) {
    sets[index] = updated
  } else {
    sets.unshift(updated)
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
  } catch {
    // Storage full or unavailable. The in-memory list still works.
  }
  return sets
}

export function deleteSet(id: string): StudySet[] {
  const sets = loadSets().filter((item) => item.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
  } catch {
    // Storage unavailable. The in-memory list still works.
  }
  return sets
}

export function makeSetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `set-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

export function titleFromNotes(notes: string): string {
  const firstLine = notes.trim().split('\n')[0]?.trim() ?? ''
  if (firstLine.length === 0) {
    return 'Untitled set'
  }
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
}
