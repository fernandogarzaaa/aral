/**
 * Inference providers for Aral.
 *
 * FirebaseAIProvider calls Firebase AI Logic (hybrid inference) through
 * the real SDK. MockProvider is the fallback when no Firebase config
 * exists, so the app still works end to end. Mock output is labelled
 * "Demo mode" in the UI and is deterministic.
 */

import type { GenerativeModel } from 'firebase/ai'

export type InferenceSource = 'on-device' | 'cloud' | 'demo'
export type InferenceKind = 'summary' | 'flashcards' | 'quiz'

export interface InferenceResult {
  text: string
  source: InferenceSource
  latencyMs: number
}

export interface InferenceProvider {
  /** Short label shown in the UI, for example "Firebase AI Logic". */
  readonly label: string
  generate(prompt: string, kind: InferenceKind): Promise<InferenceResult>
  initializeDeviceModel?(onProgress: (progress: number) => void): Promise<void>
}

/** Extract the notes block a prompt builder appended after the marker. */
function notesFromPrompt(prompt: string): string {
  const marker = '--- NOTES ---'
  const index = prompt.indexOf(marker)
  if (index === -1) {
    return prompt.trim()
  }
  return prompt.slice(index + marker.length).trim()
}

/** Split text into sentences, keeping the ending punctuation. */
function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? []
  return matches.map((sentence) => sentence.trim()).filter((s) => s.length > 0)
}

/**
 * Deterministic demo provider. Same input always gives the same output.
 * It builds study material from the notes in the prompt, so the full
 * study loop works with no Firebase project configured.
 */
export class MockProvider implements InferenceProvider {
  readonly label = 'Demo mode'

  async generate(prompt: string, kind: InferenceKind): Promise<InferenceResult> {
    const started = performance.now()
    const notes = notesFromPrompt(prompt)
    const sentences = splitSentences(notes)
    let text: string

    if (kind === 'summary') {
      const bullets = sentences.slice(0, 5).map((sentence) => `- ${sentence}`)
      text =
        bullets.length > 0
          ? bullets.join('\n')
          : '- No notes to summarize yet. Add some notes first.'
    } else if (kind === 'flashcards') {
      const cards = sentences.slice(0, 6).map((sentence) => {
        const words = sentence.split(/\s+/)
        const topic = words.slice(0, 4).join(' ')
        return `Q: What is the key point about ${topic}?\nA: ${sentence}`
      })
      text =
        cards.length > 0
          ? cards.join('\n\n')
          : 'Q: What is Aral?\nA: Aral is an offline-first study companion.'
    } else {
      const questions = sentences.slice(0, 4).map((sentence, index) => {
        const correct = sentence
        const distractors = [
          'The opposite of what the notes say.',
          'A detail that does not appear in the notes.',
          'A guess with no support in the notes.',
        ]
        const options = [correct, ...distractors]
        // Rotate the correct answer position deterministically.
        const correctIndex = index % 4
        const rotated = options.map((_, i) => options[(i - correctIndex + 4) % 4])
        const letters = ['A', 'B', 'C', 'D']
        const optionLines = rotated.map((option, i) => `${letters[i]}) ${option}`)
        return [`Q: Which statement matches your notes (${index + 1})?`, ...optionLines, `Answer: ${letters[correctIndex]}`].join('\n')
      })
      text =
        questions.length > 0
          ? questions.join('\n\n')
          : [
              'Q: Which statement matches your notes (1)?',
              'A) Aral works offline with on-device inference.',
              'B) Aral needs a connection for every feature.',
              'C) Aral only works on one device.',
              'D) Aral stores notes in the cloud only.',
              'Answer: A',
            ].join('\n')
    }

    return { text, source: 'demo', latencyMs: Math.round(performance.now() - started) }
  }
}

/**
 * Real Firebase AI Logic provider. Wraps a hybrid GenerativeModel created
 * with InferenceMode.PREFER_ON_DEVICE. The SDK reports where each call
 * actually ran through response.inferenceSource.
 *
 * Errors are thrown to the caller. The UI shows them honestly instead of
 * silently falling back to demo output.
 */
export class FirebaseAIProvider implements InferenceProvider {
  readonly label = 'Firebase AI Logic'
  private model: GenerativeModel

  constructor(model: GenerativeModel) {
    this.model = model
  }

  async initializeDeviceModel(onProgress: (progress: number) => void): Promise<void> {
    await this.model.initializeDeviceModel(onProgress)
  }

  async generate(prompt: string, _kind: InferenceKind): Promise<InferenceResult> {
    const started = performance.now()
    const result = await this.model.generateContent(prompt)
    const text = result.response.text()
    const inferenceSource = result.response.inferenceSource
    const source: InferenceSource =
      inferenceSource === 'on_device' ? 'on-device' : 'cloud'
    return { text, source, latencyMs: Math.round(performance.now() - started) }
  }
}
