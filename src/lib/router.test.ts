import { describe, expect, it } from 'vitest'
import { decideRoute, parseFlashcards, parseQuiz, splitIntoChunks } from './router'

describe('decideRoute', () => {
  it('routes short notes on-device when online and preferred', () => {
    const decision = decideRoute({
      charCount: 500,
      online: true,
      preferOnDevice: true,
      onDeviceAvailable: true,
    })
    expect(decision.target).toBe('on-device')
    expect(decision.reason).toContain('on-device')
  })

  it('routes long notes to the cloud past the threshold', () => {
    const decision = decideRoute({
      charCount: 6500,
      online: true,
      preferOnDevice: true,
      onDeviceAvailable: true,
    })
    expect(decision.target).toBe('cloud')
  })

  it('routes notes over the hard on-device cap to the cloud', () => {
    const decision = decideRoute({
      charCount: 9000,
      online: true,
      preferOnDevice: true,
      onDeviceAvailable: true,
      cloudThresholdChars: 6000,
      maxOnDeviceChars: 8000,
    })
    expect(decision.target).toBe('cloud')
    expect(decision.reason).toContain('8000')
  })

  it('routes to the cloud when the user prefers cloud', () => {
    const decision = decideRoute({
      charCount: 100,
      online: true,
      preferOnDevice: false,
      onDeviceAvailable: true,
    })
    expect(decision.target).toBe('cloud')
  })

  it('routes to the cloud when the on-device model is not ready', () => {
    const decision = decideRoute({
      charCount: 100,
      online: true,
      preferOnDevice: true,
      onDeviceAvailable: false,
    })
    expect(decision.target).toBe('cloud')
    expect(decision.reason).toContain('not ready')
  })

  it('routes on-device when offline and the model is ready', () => {
    const decision = decideRoute({
      charCount: 100,
      online: false,
      preferOnDevice: true,
      onDeviceAvailable: true,
    })
    expect(decision.target).toBe('on-device')
    expect(decision.reason).toContain('offline')
  })

  it('still targets on-device when offline and the model is not ready', () => {
    const decision = decideRoute({
      charCount: 100,
      online: false,
      preferOnDevice: true,
      onDeviceAvailable: false,
    })
    expect(decision.target).toBe('on-device')
    expect(decision.reason).toContain('not ready')
  })

  it('keeps short notes on-device at the exact threshold', () => {
    const decision = decideRoute({
      charCount: 6000,
      online: true,
      preferOnDevice: true,
      onDeviceAvailable: true,
      cloudThresholdChars: 6000,
    })
    expect(decision.target).toBe('on-device')
  })
})

describe('splitIntoChunks', () => {
  it('returns one chunk for short text', () => {
    expect(splitIntoChunks('Hello world.', 100)).toEqual(['Hello world.'])
  })

  it('returns no chunks for blank text', () => {
    expect(splitIntoChunks('   ', 100)).toEqual([])
  })

  it('keeps every chunk within the limit', () => {
    const text = 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.'
    const chunks = splitIntoChunks(text, 30)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30)
    }
  })

  it('keeps all sentences across chunks', () => {
    const text = 'Alpha one. Beta two. Gamma three. Delta four.'
    const chunks = splitIntoChunks(text, 25)
    expect(chunks.join(' ')).toBe(text)
  })
})

describe('parseFlashcards', () => {
  it('parses Q and A line pairs', () => {
    const cards = parseFlashcards(
      'Q: What is photosynthesis?\nA: How plants make food from light.\n\nQ: What absorbs light?\nA: Chlorophyll.',
    )
    expect(cards).toEqual([
      { question: 'What is photosynthesis?', answer: 'How plants make food from light.' },
      { question: 'What absorbs light?', answer: 'Chlorophyll.' },
    ])
  })

  it('ignores a question with no answer', () => {
    const cards = parseFlashcards('Q: No answer here.\nSome other text.')
    expect(cards).toEqual([])
  })

  it('ignores an answer with no question', () => {
    const cards = parseFlashcards('A: Orphan answer.')
    expect(cards).toEqual([])
  })

  it('ignores blank input', () => {
    expect(parseFlashcards('')).toEqual([])
  })
})

describe('parseQuiz', () => {
  const sample = [
    'Q: What do plants use to make food?',
    'A) Sunlight',
    'B) Moonlight',
    'C) Soil only',
    'D) Wind',
    'Answer: A',
    '',
    'Q: What gas do plants take in?',
    'A) Oxygen',
    'B) Nitrogen',
    'C) Carbon dioxide',
    'D) Helium',
    'Answer: C',
  ].join('\n')

  it('parses questions with four options and a letter answer', () => {
    const questions = parseQuiz(sample)
    expect(questions).toHaveLength(2)
    expect(questions[0]).toEqual({
      question: 'What do plants use to make food?',
      options: ['Sunlight', 'Moonlight', 'Soil only', 'Wind'],
      correctIndex: 0,
    })
    expect(questions[1].correctIndex).toBe(2)
  })

  it('accepts the full option text as the answer', () => {
    const text = [
      'Q: What absorbs sunlight?',
      'A) Roots',
      'B) Chlorophyll',
      'C) Stomata',
      'D) Stem',
      'Answer: Chlorophyll',
    ].join('\n')
    const questions = parseQuiz(text)
    expect(questions).toHaveLength(1)
    expect(questions[0].correctIndex).toBe(1)
  })

  it('drops a block with fewer than four options', () => {
    const text = ['Q: Incomplete?', 'A) One', 'B) Two', 'Answer: A'].join('\n')
    expect(parseQuiz(text)).toEqual([])
  })

  it('drops a block with an answer letter outside A to D', () => {
    const text = [
      'Q: Bad answer?',
      'A) One',
      'B) Two',
      'C) Three',
      'D) Four',
      'Answer: E',
    ].join('\n')
    expect(parseQuiz(text)).toEqual([])
  })
})
