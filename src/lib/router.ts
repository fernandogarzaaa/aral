/**
 * Pure routing and parsing helpers for Aral.
 * No Firebase imports here. Every function is unit tested.
 */

export type RouteTarget = 'on-device' | 'cloud'

export interface RouteDecision {
  target: RouteTarget
  reason: string
}

export interface RouteInput {
  charCount: number
  online: boolean
  preferOnDevice: boolean
  onDeviceAvailable: boolean
  /** Notes longer than this go to the cloud. Default 6000. */
  cloudThresholdChars?: number
  /** Hard cap for on-device input. Default 8000. */
  maxOnDeviceChars?: number
}

/**
 * Decide where a generation request should run.
 * The decision is shown to the user next to the result.
 */
export function decideRoute(input: RouteInput): RouteDecision {
  const cloudThreshold = input.cloudThresholdChars ?? 6000
  const maxOnDevice = input.maxOnDeviceChars ?? 8000

  if (!input.online) {
    if (input.onDeviceAvailable) {
      return {
        target: 'on-device',
        reason: 'You are offline. The on-device model works without a connection.',
      }
    }
    return {
      target: 'on-device',
      reason:
        'You are offline and the on-device model is not ready yet. Prepare the model to study offline.',
    }
  }

  if (!input.preferOnDevice) {
    return {
      target: 'cloud',
      reason: 'Cloud preferred in settings.',
    }
  }

  if (!input.onDeviceAvailable) {
    return {
      target: 'cloud',
      reason: 'The on-device model is not ready, so this runs in the cloud.',
    }
  }

  if (input.charCount > maxOnDevice) {
    return {
      target: 'cloud',
      reason: `Notes are ${input.charCount} characters. That is over the ${maxOnDevice} character on-device limit.`,
    }
  }

  if (input.charCount > cloudThreshold) {
    return {
      target: 'cloud',
      reason: `Notes are ${input.charCount} characters. Long notes run in the cloud.`,
    }
  }

  return {
    target: 'on-device',
    reason: 'Short notes run on-device. Fast, private, and free.',
  }
}

/**
 * Split long notes into chunks of at most maxChars characters.
 * Splits on sentence boundaries when possible so no sentence is cut
 * in half. A single sentence longer than maxChars is hard cut.
 */
export function splitIntoChunks(text: string, maxChars: number): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return []
  }
  if (trimmed.length <= maxChars) {
    return [trimmed]
  }

  const sentences = trimmed.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [trimmed]
  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    const chunk = current.trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }
    current = ''
  }

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim()
    if (sentence.length === 0) {
      continue
    }
    if (sentence.length > maxChars) {
      pushCurrent()
      for (let i = 0; i < sentence.length; i += maxChars) {
        chunks.push(sentence.slice(i, i + maxChars).trim())
      }
      continue
    }
    if (current.length > 0 && current.length + 1 + sentence.length > maxChars) {
      pushCurrent()
    }
    current = current.length > 0 ? `${current} ${sentence}` : sentence
  }
  pushCurrent()
  return chunks
}

export interface Flashcard {
  question: string
  answer: string
}

/**
 * Parse "Q: ... / A: ..." lines into flashcards.
 * A question pairs with the next answer line after it.
 * Lines that do not match are ignored.
 */
export function parseFlashcards(text: string): Flashcard[] {
  const cards: Flashcard[] = []
  let pendingQuestion: string | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    const qMatch = /^Q:\s*(.+)$/i.exec(line)
    if (qMatch) {
      pendingQuestion = qMatch[1].trim()
      continue
    }
    const aMatch = /^A:\s*(.+)$/i.exec(line)
    if (aMatch && pendingQuestion !== null) {
      const answer = aMatch[1].trim()
      if (answer.length > 0) {
        cards.push({ question: pendingQuestion, answer })
      }
      pendingQuestion = null
    }
  }
  return cards
}

export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
}

/**
 * Parse a simple MCQ format into quiz questions.
 * Each block looks like:
 *   Q: What is ...?
 *   A) first option
 *   B) second option
 *   C) third option
 *   D) fourth option
 *   Answer: B
 * The answer line may also name the option text instead of a letter.
 * Blocks are separated by blank lines. A block needs four options and
 * a matching answer to be kept.
 */
export function parseQuiz(text: string): QuizQuestion[] {
  const questions: QuizQuestion[] = []
  const blocks = text.split(/\n\s*\n/)

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (lines.length === 0) {
      continue
    }

    let question: string | null = null
    const options: string[] = []
    let answerText: string | null = null

    for (const line of lines) {
      const qMatch = /^Q:\s*(.+)$/i.exec(line)
      if (qMatch) {
        question = qMatch[1].trim()
        continue
      }
      const optMatch = /^[A-D][).]\s*(.+)$/i.exec(line)
      if (optMatch && options.length < 4) {
        options.push(optMatch[1].trim())
        continue
      }
      const ansMatch = /^Answer:\s*(.+)$/i.exec(line)
      if (ansMatch) {
        answerText = ansMatch[1].trim()
      }
    }

    if (question === null || options.length !== 4 || answerText === null) {
      continue
    }

    let correctIndex = -1
    const letterMatch = /^[A-D]$/i.exec(answerText)
    if (letterMatch) {
      correctIndex = letterMatch[0].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0)
    } else {
      correctIndex = options.findIndex(
        (option) => option.toLowerCase() === answerText.toLowerCase(),
      )
    }
    if (correctIndex < 0 || correctIndex > 3) {
      continue
    }
    questions.push({ question, options, correctIndex })
  }
  return questions
}
