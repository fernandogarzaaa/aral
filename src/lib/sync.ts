/**
 * Firestore sync for study sets. This runs only when Firebase is
 * configured and the user is signed in. The App checks that first and
 * tells the user "Sign in to sync" when it is not the case.
 */

import { doc, setDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { StudySet } from './library'

export async function saveSetToCloud(
  db: Firestore,
  userId: string,
  set: StudySet,
): Promise<void> {
  await setDoc(doc(db, 'users', userId, 'studySets', set.id), {
    title: set.title,
    notes: set.notes,
    summary: set.summary,
    flashcards: set.flashcards,
    quiz: set.quiz,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
  })
}
