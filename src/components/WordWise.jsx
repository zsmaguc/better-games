import { useState, useEffect, useRef, useMemo } from 'react'
import './WordWise.css'
import answersText from '../data/wordle-answers.txt?raw'
import allowedText from '../data/wordle-allowed-guesses.txt?raw'

const WORD_LENGTH = 5
const MAX_ATTEMPTS = 6
const STATS_KEY = 'wordwise-stats'
const GAME_STATE_KEY = 'wordwise-game-state'
const WORD_HISTORY_KEY = 'wordwise-word-history'

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
]

// Parse word lists
const ANSWER_WORDS = answersText.trim().split('\n').map(word => word.trim().toUpperCase())
const ALLOWED_WORDS = allowedText.trim().split('\n').map(word => word.trim().toUpperCase())
const VALID_WORDS = new Set([...ANSWER_WORDS, ...ALLOWED_WORDS])

// Statistics helper functions
const getInitialStats = () => ({
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0] // Indices 0-5 represent guesses 1-6
})

const loadStats = () => {
  try {
    const stored = localStorage.getItem(STATS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Error loading stats:', error)
  }
  return getInitialStats()
}

const saveStats = (stats) => {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch (error) {
    console.error('Error saving stats:', error)
  }
}

const resetStats = () => {
  const initial = getInitialStats()
  saveStats(initial)
  return initial
}

// Word history helper functions
const loadWordHistory = () => {
  try {
    const stored = localStorage.getItem(WORD_HISTORY_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Error loading word history:', error)
  }
  return []
}

const saveWordHistory = (history) => {
  try {
    localStorage.setItem(WORD_HISTORY_KEY, JSON.stringify(history))
  } catch (error) {
    console.error('Error saving word history:', error)
  }
}

const addWordToHistory = (word) => {
  const history = loadWordHistory()
  if (!history.includes(word)) {
    history.push(word)
    saveWordHistory(history)
  }
}

const resetWordHistory = () => {
  try {
    localStorage.removeItem(WORD_HISTORY_KEY)
  } catch (error) {
    console.error('Error resetting word history:', error)
  }
}

// Game state helper functions
const saveGameState = (state) => {
  try {
    localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Error saving game state:', error)
  }
}

const loadGameState = () => {
  try {
    const stored = localStorage.getItem(GAME_STATE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Error loading game state:', error)
  }
  return null
}

const clearGameState = () => {
  try {
    localStorage.removeItem(GAME_STATE_KEY)
  } catch (error) {
    console.error('Error clearing game state:', error)
  }
}

// Helper function to get random word (excluding previously used words)
const getRandomWord = () => {
  const history = loadWordHistory()
  const availableWords = ANSWER_WORDS.filter(word => !history.includes(word))

  // If all words have been used, reset history and use all words again
  if (availableWords.length === 0) {
    resetWordHistory()
    return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)]
  }

  return availableWords[Math.floor(Math.random() * availableWords.length)]
}

// Helper function to shuffle array
const shuffleArray = (array) => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function WordWise() {
  // Initialize state from localStorage if available
  const initializeGameState = () => {
    const savedState = loadGameState()
    if (savedState) {
      return savedState
    }
    const newWord = getRandomWord()
    // Don't add to history yet - only add when game is completed
    return {
      targetWord: newWord,
      guesses: Array(MAX_ATTEMPTS).fill(''),
      currentGuess: '',
      currentRow: 0,
      gameStatus: 'playing',
      keyColors: {}
    }
  }

  const initialState = initializeGameState()
  const [wordHistory, setWordHistory] = useState(() => loadWordHistory())

  const [targetWord, setTargetWord] = useState(initialState.targetWord)
  const [guesses, setGuesses] = useState(initialState.guesses)
  const [currentGuess, setCurrentGuess] = useState(initialState.currentGuess || '')
  const [currentRow, setCurrentRow] = useState(initialState.currentRow)
  const [gameStatus, setGameStatus] = useState(initialState.gameStatus)
  const [keyColors, setKeyColors] = useState(initialState.keyColors)
  const [errorMessage, setErrorMessage] = useState('')
  const [stats, setStats] = useState(() => loadStats())
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [showLearnModal, setShowLearnModal] = useState(false)
  const [showGameOverModal, setShowGameOverModal] = useState(false)
  const [definitionData, setDefinitionData] = useState(null)
  const [definitionLoading, setDefinitionLoading] = useState(false)
  const [definitionError, setDefinitionError] = useState(null)
  const [lastWinRow, setLastWinRow] = useState(null)
  const errorTimeoutRef = useRef(null)
  const gameEndedRef = useRef(initialState.gameStatus !== 'playing')

  // Handle physical keyboard input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameStatus !== 'playing') return

      const key = e.key.toUpperCase()

      if (key === 'ENTER') {
        handleSubmit()
      } else if (key === 'BACKSPACE') {
        handleBackspace()
      } else if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
        setCurrentGuess(prev => prev + key)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentGuess, currentRow, gameStatus])

  // Update statistics when game ends
  useEffect(() => {
    if (gameStatus !== 'playing' && !gameEndedRef.current) {
      gameEndedRef.current = true
      updateStatistics(gameStatus, currentRow + 1)

      // Add word to history when game is completed
      addWordToHistory(targetWord)
      setWordHistory(loadWordHistory())

      setShowGameOverModal(true)

      // Auto-show statistics after a brief delay
      setTimeout(() => {
        setShowGameOverModal(false)
        setShowStatsModal(true)
      }, 2500)
    }
  }, [gameStatus])

  // Save game state whenever it changes
  useEffect(() => {
    if (gameStatus !== 'playing' || currentRow > 0 || guesses.some(g => g) || currentGuess) {
      saveGameState({
        targetWord,
        guesses,
        currentGuess,
        currentRow,
        gameStatus,
        keyColors
      })
    }
  }, [targetWord, guesses, currentGuess, currentRow, gameStatus, keyColors])

  // Cleanup error timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
    }
  }, [])

  const updateStatistics = (status, guessCount) => {
    const newStats = { ...stats }
    newStats.played += 1

    if (status === 'won') {
      newStats.wins += 1
      newStats.currentStreak += 1
      newStats.maxStreak = Math.max(newStats.maxStreak, newStats.currentStreak)
      newStats.guessDistribution[guessCount - 1] += 1
      setLastWinRow(guessCount - 1)
    } else {
      newStats.currentStreak = 0
    }

    saveStats(newStats)
    setStats(newStats)
  }

  const showError = (message) => {
    setErrorMessage(message)
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
    }
    errorTimeoutRef.current = setTimeout(() => {
      setErrorMessage('')
    }, 2000)
  }

  const handleKeyClick = (key) => {
    if (gameStatus !== 'playing') return

    if (key === 'ENTER') {
      handleSubmit()
    } else if (key === 'BACKSPACE') {
      handleBackspace()
    } else if (currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(prev => prev + key)
    }
  }

  const handleBackspace = () => {
    setCurrentGuess(prev => prev.slice(0, -1))
  }

  const handleSubmit = () => {
    if (currentGuess.length !== WORD_LENGTH) return
    if (currentRow >= MAX_ATTEMPTS) return

    // Validate word
    if (!VALID_WORDS.has(currentGuess)) {
      showError('Not in word list')
      return
    }

    // Update guesses array
    const newGuesses = [...guesses]
    newGuesses[currentRow] = currentGuess
    setGuesses(newGuesses)

    // Update keyboard colors
    updateKeyboardColors(currentGuess)

    // Check win condition
    if (currentGuess === targetWord) {
      setGameStatus('won')
      return
    }

    // Check lose condition
    if (currentRow === MAX_ATTEMPTS - 1) {
      setGameStatus('lost')
      return
    }

    // Move to next row
    setCurrentRow(prev => prev + 1)
    setCurrentGuess('')
  }

  const updateKeyboardColors = (guess) => {
    const newKeyColors = { ...keyColors }

    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i]
      const currentColor = newKeyColors[letter]

      if (targetWord[i] === letter) {
        newKeyColors[letter] = 'correct'
      } else if (targetWord.includes(letter) && currentColor !== 'correct') {
        newKeyColors[letter] = 'present'
      } else if (!newKeyColors[letter]) {
        newKeyColors[letter] = 'absent'
      }
    }

    setKeyColors(newKeyColors)
  }

  const getLetterStatus = (letter, position, rowIndex) => {
    if (rowIndex > currentRow) return ''

    // If game is still playing and this is the current row being typed, don't evaluate yet
    if (rowIndex === currentRow && gameStatus === 'playing') return ''

    const guess = guesses[rowIndex]
    if (!guess) return ''

    // Count how many times this letter appears in the target word
    const targetLetterCount = targetWord.split('').filter(l => l === letter).length

    // If this position is an exact match, it's correct (green)
    if (targetWord[position] === letter) {
      return 'correct'
    }

    // For non-exact matches, check if there are available instances of this letter
    // Count how many of this letter are already "used" (either correct or present before this position)
    let usedCount = 0

    // Count exact matches (correct/green) for this letter across the whole guess
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === letter && targetWord[i] === letter) {
        usedCount++
      }
    }

    // Count present matches (yellow) that come before this position
    for (let i = 0; i < position; i++) {
      if (guess[i] === letter && targetWord[i] !== letter) {
        // This position has the same letter but not exact match
        // Check if it would be marked as present (yellow)
        if (usedCount < targetLetterCount) {
          usedCount++
        }
      }
    }

    // If the letter exists in target and we haven't used all instances, mark as present
    if (targetWord.includes(letter) && usedCount < targetLetterCount) {
      return 'present'
    }

    // Otherwise, mark as absent (gray)
    return 'absent'
  }

  // Calculate remaining possible words based on revealed information
  const getRemainingWords = () => {
    const submittedGuesses = guesses.slice(0, currentRow)

    if (submittedGuesses.length === 0 || submittedGuesses.every(g => !g)) {
      return ANSWER_WORDS
    }

    return ANSWER_WORDS.filter(word => {
      // Check if this word is compatible with all guesses
      for (let guessIndex = 0; guessIndex < submittedGuesses.length; guessIndex++) {
        const guess = submittedGuesses[guessIndex]
        if (!guess) continue

        for (let i = 0; i < WORD_LENGTH; i++) {
          const letter = guess[i]
          const status = getLetterStatus(letter, i, guessIndex)

          if (status === 'correct') {
            // Green: word must have this letter at this position
            if (word[i] !== letter) return false
          } else if (status === 'present') {
            // Yellow: word must contain this letter but NOT at this position
            if (!word.includes(letter)) return false
            if (word[i] === letter) return false
          } else if (status === 'absent') {
            // Gray: word must not contain this letter
            if (word.includes(letter)) return false
          }
        }
      }
      return true
    })
  }

  const resetGame = () => {
    clearGameState()
    const newWord = getRandomWord()
    // Don't add to history yet - will be added when this game is completed
    setTargetWord(newWord)
    setGuesses(Array(MAX_ATTEMPTS).fill(''))
    setCurrentGuess('')
    setCurrentRow(0)
    setGameStatus('playing')
    setKeyColors({})
    setErrorMessage('')
    setShowGameOverModal(false)
    gameEndedRef.current = false
  }

  const handleResetStats = () => {
    if (window.confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
      const newStats = resetStats()
      setStats(newStats)
      setLastWinRow(null)
    }
  }

  const handleResetWordHistory = () => {
    if (window.confirm('Are you sure you want to reset word history? Previously used words will be able to appear again.')) {
      resetWordHistory()
      setWordHistory([])
    }
  }

  const fetchDefinition = async (word) => {
    setDefinitionLoading(true)
    setDefinitionError(null)
    setShowLearnModal(true)

    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`)

      if (!response.ok) {
        throw new Error('Definition not available')
      }

      const data = await response.json()
      setDefinitionData(data)
    } catch (error) {
      setDefinitionError(error.message)
    } finally {
      setDefinitionLoading(false)
    }
  }

  const handleLearnClick = () => {
    fetchDefinition(targetWord)
  }

  const closeLearnModal = () => {
    setShowLearnModal(false)
    setDefinitionData(null)
    setDefinitionError(null)
  }

  // Get remaining words for debug panel - only recalculate when guesses or currentRow changes
  const remainingWords = useMemo(() => {
    return getRemainingWords()
  }, [guesses, currentRow, targetWord])

  const shuffledRemainingWords = useMemo(() => {
    return shuffleArray(remainingWords).slice(0, 10)
  }, [remainingWords])

  // Calculate win percentage
  const winPercentage = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0

  // Get max value for bar chart scaling
  const maxDistribution = Math.max(...stats.guessDistribution, 1)

  return (
    <div className="wordwise-container">
      {/* Top Action Buttons */}
      <div className="top-action-buttons">
        <button
          className="icon-button"
          onClick={() => setShowStatsModal(true)}
          title="Statistics"
        >
          📊
        </button>
        <button
          className="icon-button"
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          title="Debug Panel"
        >
          🐛
        </button>
      </div>

      {/* Debug Panel */}
      {showDebugPanel && (
        <div className="debug-panel">
          <h3>Debug Info</h3>
          <div className="debug-item">
            <strong>Target Word:</strong> {targetWord}
          </div>
          <div className="debug-item">
            <strong>Remaining Words:</strong> {remainingWords.length}
          </div>
          <div className="debug-item">
            <strong>First 10 (random order):</strong>
            <div className="debug-words">
              {shuffledRemainingWords.join(', ')}
            </div>
          </div>
          <div className="debug-item">
            <strong>Used Words:</strong> {wordHistory.length} / {ANSWER_WORDS.length}
          </div>
          <button className="reset-stats-button" onClick={handleResetStats}>
            Reset Statistics
          </button>
          <button className="reset-history-button" onClick={handleResetWordHistory}>
            Reset Word History
          </button>
        </div>
      )}

      <div className="wordwise-header">
        <h1>WordWise</h1>
        <p>Guess the 5-letter word in 6 tries</p>
      </div>

      {errorMessage && (
        <div className="error-message">
          {errorMessage}
        </div>
      )}

      <div className="game-board">
        {guesses.map((guess, rowIndex) => (
          <div key={rowIndex} className="guess-row">
            {Array(WORD_LENGTH).fill('').map((_, colIndex) => {
              const isCurrentRow = rowIndex === currentRow
              const letter = isCurrentRow
                ? currentGuess[colIndex] || ''
                : guess[colIndex] || ''
              const status = getLetterStatus(letter, colIndex, rowIndex)

              return (
                <div
                  key={colIndex}
                  className={`letter-box ${status}`}
                >
                  {letter}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Action Buttons (shown after game ends) */}
      {gameStatus !== 'playing' && (
        <div className="game-over-actions">
          <button className="learn-button" onClick={handleLearnClick}>
            📖 Learn
          </button>
          <button className="play-again-button" onClick={resetGame}>
            🔄 Play Again
          </button>
        </div>
      )}

      <div className="keyboard">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="keyboard-row">
            {row.map((key) => {
              const keyClass = key === 'ENTER' || key === 'BACKSPACE' ? 'key-wide' : ''
              const colorClass = keyColors[key] || ''

              return (
                <button
                  key={key}
                  className={`key ${keyClass} ${colorClass}`}
                  onClick={() => handleKeyClick(key)}
                  disabled={gameStatus !== 'playing'}
                >
                  {key === 'BACKSPACE' ? '⌫' : key}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Statistics Modal */}
      {showStatsModal && (
        <div className="modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Statistics</h2>
              <button className="close-button" onClick={() => setShowStatsModal(false)}>
                ✕
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{stats.played}</div>
                <div className="stat-label">Played</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{winPercentage}</div>
                <div className="stat-label">Win %</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.currentStreak}</div>
                <div className="stat-label">Current Streak</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.maxStreak}</div>
                <div className="stat-label">Max Streak</div>
              </div>
            </div>

            <div className="guess-distribution">
              <h3>Guess Distribution</h3>
              <div className="distribution-chart">
                {stats.guessDistribution.map((count, index) => {
                  const percentage = maxDistribution > 0 ? (count / maxDistribution) * 100 : 0
                  const isLastWin = lastWinRow === index && gameStatus === 'won'

                  return (
                    <div key={index} className="distribution-row">
                      <div className="distribution-label">{index + 1}</div>
                      <div className="distribution-bar-container">
                        <div
                          className={`distribution-bar ${isLastWin ? 'highlight' : ''}`}
                          style={{ width: `${Math.max(percentage, count > 0 ? 7 : 0)}%` }}
                        >
                          <span className="distribution-count">{count}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Win/Loss Notification Modal - Brief notification */}
      {showGameOverModal && (
        <div className="modal-overlay notification-overlay">
          <div className="modal notification-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              {gameStatus === 'won' ? (
                <>
                  <div className="modal-emoji">🎉</div>
                  <h2>You won!</h2>
                  <p>You guessed <strong>{targetWord}</strong> in {currentRow + 1} {currentRow + 1 === 1 ? 'try' : 'tries'}!</p>
                </>
              ) : (
                <>
                  <div className="modal-emoji">😔</div>
                  <h2>Game Over</h2>
                  <p>The word was <strong>{targetWord}</strong></p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Learn Modal */}
      {showLearnModal && (
        <div className="modal-overlay" onClick={closeLearnModal}>
          <div className="modal learn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{targetWord}</h2>
              <button className="close-button" onClick={closeLearnModal}>
                ✕
              </button>
            </div>

            <div className="learn-content">
              {definitionLoading && (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading definition...</p>
                </div>
              )}

              {definitionError && (
                <div className="error-state">
                  <p>{definitionError}</p>
                  <p className="error-hint">Try searching for this word on a dictionary website.</p>
                </div>
              )}

              {definitionData && !definitionLoading && (
                <>
                  {/* Pronunciation */}
                  {definitionData[0]?.phonetic && (
                    <div className="pronunciation">
                      <strong>Pronunciation:</strong> {definitionData[0].phonetic}
                    </div>
                  )}

                  {/* Meanings */}
                  {definitionData[0]?.meanings?.slice(0, 2).map((meaning, meaningIndex) => (
                    <div key={meaningIndex} className="meaning-section">
                      <h3 className="part-of-speech">{meaning.partOfSpeech}</h3>

                      {/* Definitions */}
                      <div className="definitions">
                        <strong>Definitions:</strong>
                        <ol>
                          {meaning.definitions.slice(0, 3).map((def, defIndex) => (
                            <li key={defIndex}>
                              {def.definition}
                              {def.example && (
                                <div className="example">
                                  <em>Example: "{def.example}"</em>
                                </div>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  ))}

                  {/* API Attribution */}
                  <div className="api-attribution">
                    Definitions provided by{' '}
                    <a
                      href="https://dictionaryapi.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Free Dictionary API
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WordWise
