import { describe, expect, it } from 'vitest'
import { MockProvider } from './inference'
import { buildFlashcardsPrompt, buildQuizPrompt, buildSummaryPrompt } from './prompts'
import { parseFlashcards, parseQuiz } from './router'

const NOTES = [
  'Photosynthesis is how plants make food from light.',
  'Chlorophyll in the leaves absorbs sunlight.',
  'Water enters through the roots.',
  'Carbon dioxide enters through the stomata.',
].join('\n')

describe('MockProvider', () => {
  it('returns the same summary for the same input', async () => {
    const provider = new MockProvider()
    const prompt = buildSummaryPrompt(NOTES)
    const first = await provider.generate(prompt, 'summary')
    const second = await provider.generate(prompt, 'summary')
    expect(first.text).toBe(second.text)
    expect(first.source).toBe('demo')
    expect(first.text).toContain('Photosynthesis')
  })

  it('returns flashcards that parse into cards', async () => {
    const provider = new MockProvider()
    const result = await provider.generate(buildFlashcardsPrompt(NOTES), 'flashcards')
    const cards = parseFlashcards(result.text)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThanOrEqual(6)
    for (const card of cards) {
      expect(card.question.length).toBeGreaterThan(0)
      expect(card.answer.length).toBeGreaterThan(0)
    }
  })

  it('returns quiz output that parses into four-option questions', async () => {
    const provider = new MockProvider()
    const result = await provider.generate(buildQuizPrompt(NOTES), 'quiz')
    const questions = parseQuiz(result.text)
    expect(questions.length).toBeGreaterThan(0)
    for (const question of questions) {
      expect(question.options).toHaveLength(4)
      expect(question.correctIndex).toBeGreaterThanOrEqual(0)
      expect(question.correctIndex).toBeLessThanOrEqual(3)
    }
  })

  it('reports a non-negative latency', async () => {
    const provider = new MockProvider()
    const result = await provider.generate(buildSummaryPrompt(NOTES), 'summary')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
