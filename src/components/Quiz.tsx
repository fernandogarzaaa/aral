import { useState } from 'react'
import type { QuizQuestion } from '../lib/router'

interface QuizProps {
  questions: QuizQuestion[]
}

const LETTERS = ['A', 'B', 'C', 'D']

export function Quiz({ questions }: QuizProps) {
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [answered, setAnswered] = useState(0)

  if (questions.length === 0) {
    return <p>No quiz yet. Generate one from your notes.</p>
  }

  const question = questions[Math.min(index, questions.length - 1)]
  const done = answered >= questions.length && picked === null

  const pick = (optionIndex: number) => {
    if (picked !== null) {
      return
    }
    setPicked(optionIndex)
    setAnswered((value) => value + 1)
    if (optionIndex === question.correctIndex) {
      setScore((value) => value + 1)
    }
  }

  const next = () => {
    setIndex((value) => Math.min(questions.length - 1, value + 1))
    setPicked(null)
  }

  const restart = () => {
    setIndex(0)
    setPicked(null)
    setScore(0)
    setAnswered(0)
  }

  if (done) {
    return (
      <div className="quiz-done">
        <p>
          Score: {score} of {questions.length}
        </p>
        <button type="button" onClick={restart}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="quiz">
      <p className="quiz-progress">
        Question {index + 1} of {questions.length} · Score {score}
      </p>
      <p className="quiz-question">{question.question}</p>
      <div className="quiz-options">
        {question.options.map((option, optionIndex) => {
          const isCorrect = picked !== null && optionIndex === question.correctIndex
          const isWrongPick = picked === optionIndex && optionIndex !== question.correctIndex
          const className = [
            'quiz-option',
            isCorrect ? 'correct' : '',
            isWrongPick ? 'wrong' : '',
          ]
            .join(' ')
            .trim()
          return (
            <button
              key={`${index}-${optionIndex}`}
              type="button"
              className={className}
              onClick={() => pick(optionIndex)}
              disabled={picked !== null}
            >
              {LETTERS[optionIndex]}. {option}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <button type="button" onClick={next} disabled={index >= questions.length - 1}>
          {index >= questions.length - 1 ? 'See score' : 'Next question'}
        </button>
      )}
    </div>
  )
}
