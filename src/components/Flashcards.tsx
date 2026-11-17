import { useState } from 'react'
import type { Flashcard } from '../lib/router'

interface FlashcardsProps {
  cards: Flashcard[]
}

export function Flashcards({ cards }: FlashcardsProps) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (cards.length === 0) {
    return <p>No flashcards yet. Generate some from your notes.</p>
  }

  const card = cards[Math.min(index, cards.length - 1)]

  const goTo = (next: number) => {
    setIndex(next)
    setFlipped(false)
  }

  return (
    <div className="flashcards">
      <button
        type="button"
        className="flashcard"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? 'Show question' : 'Show answer'}
      >
        <span className="flashcard-label">{flipped ? 'Answer' : 'Question'}</span>
        <span className="flashcard-text">{flipped ? card.answer : card.question}</span>
        <span className="flashcard-hint">Tap to flip</span>
      </button>
      <div className="flashcard-nav">
        <button
          type="button"
          onClick={() => goTo(Math.max(0, index - 1))}
          disabled={index === 0}
        >
          Previous
        </button>
        <span>
          Card {index + 1} of {cards.length}
        </span>
        <button
          type="button"
          onClick={() => goTo(Math.min(cards.length - 1, index + 1))}
          disabled={index >= cards.length - 1}
        >
          Next
        </button>
      </div>
    </div>
  )
}
