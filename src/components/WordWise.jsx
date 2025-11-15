import { useState, useEffect, useRef, useMemo } from 'react'
import './WordWise.css'
import answersText from '../data/wordle-answers.txt?raw'
import allowedText from '../data/wordle-allowed-guesses.txt?raw'

const WORD_LENGTH = 5
const MAX_ATTEMPTS = 6
const STATS_KEY = 'wordwise-stats'
const GAME_STATE_KEY = 'wordwise-game-state'
const HISTORY_KEY = 'wordwise-history'  // Game history (last 20 games)
const USED_WORDS_KEY = 'wordwise-used'  // All used words
const AI_ENABLED_KEY = 'wordwise-ai-enabled'  // AI toggle preference
const PENDING_UNDERSTANDING_KEY = 'wordwise-pending-understanding'  // Pending understanding rating
const API_KEY_KEY = 'wordwise-api-key'  // Anthropic API key
const SHOW_REASONING_KEY = 'wordwise-show-reasoning'  // Show AI reasoning toggle
const MAX_HISTORY_SIZE = 20

const CLOUDFLARE_WORKER_URL = 'https://wordwise-proxy.zsmaguc.workers.dev'

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
  guessDistribution: [0, 0, 0, 0, 0, 0], // Indices 0-5 represent guesses 1-6
  aiWords: 0,      // Count of AI-selected words
  listWords: 0     // Count of random list words
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

// Game history helper functions (last 20 games with details)
const loadGameHistory = () => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Error loading game history:', error)
  }
  return []
}

const saveGameHistory = (history) => {
  try {
    // Keep only last 20 games
    const trimmed = history.slice(-MAX_HISTORY_SIZE)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch (error) {
    console.error('Error saving game history:', error)
  }
}

const addGameToHistory = (word, result, understanding, source) => {
  const history = loadGameHistory()
  const entry = { w: word, r: result, src: source }
  if (understanding !== null && understanding !== undefined) {
    entry.u = understanding
  }
  history.push(entry)
  saveGameHistory(history)
}

// Used words helper functions (all words ever played)
const loadUsedWords = () => {
  try {
    const stored = localStorage.getItem(USED_WORDS_KEY)
    if (stored) {
      return new Set(JSON.parse(stored))
    }
  } catch (error) {
    console.error('Error loading used words:', error)
  }
  return new Set()
}

const saveUsedWords = (usedWords) => {
  try {
    localStorage.setItem(USED_WORDS_KEY, JSON.stringify(Array.from(usedWords)))
  } catch (error) {
    console.error('Error saving used words:', error)
  }
}

const addUsedWord = (word) => {
  const usedWords = loadUsedWords()
  usedWords.add(word)
  saveUsedWords(usedWords)
}

const clearUsedWords = () => {
  try {
    localStorage.removeItem(USED_WORDS_KEY)
  } catch (error) {
    console.error('Error clearing used words:', error)
  }
}

// AI preference helper functions
const loadAIEnabled = () => {
  try {
    const stored = localStorage.getItem(AI_ENABLED_KEY)
    if (stored !== null) {
      return stored === 'true'
    }
  } catch (error) {
    console.error('Error loading AI preference:', error)
  }
  return true  // Default to ON
}

const saveAIEnabled = (enabled) => {
  try {
    localStorage.setItem(AI_ENABLED_KEY, enabled ? 'true' : 'false')
  } catch (error) {
    console.error('Error saving AI preference:', error)
  }
}

// Pending understanding helper functions
const loadPendingUnderstanding = () => {
  try {
    const stored = localStorage.getItem(PENDING_UNDERSTANDING_KEY)
    if (stored !== null) {
      return parseInt(stored)
    }
  } catch (error) {
    console.error('Error loading pending understanding:', error)
  }
  return null
}

const savePendingUnderstanding = (rating) => {
  try {
    if (rating !== null && rating !== undefined) {
      localStorage.setItem(PENDING_UNDERSTANDING_KEY, rating.toString())
    } else {
      localStorage.removeItem(PENDING_UNDERSTANDING_KEY)
    }
  } catch (error) {
    console.error('Error saving pending understanding:', error)
  }
}

// API key helper functions
const loadAPIKey = () => {
  try {
    return localStorage.getItem(API_KEY_KEY) || null
  } catch (error) {
    console.error('Error loading API key:', error)
    return null
  }
}

const saveAPIKey = (key) => {
  try {
    if (key) {
      localStorage.setItem(API_KEY_KEY, key)
    } else {
      localStorage.removeItem(API_KEY_KEY)
    }
  } catch (error) {
    console.error('Error saving API key:', error)
  }
}

const maskAPIKey = (key) => {
  if (!key || key.length < 4) return '••••••••••••'
  const lastFour = key.slice(-4)
  return '••••••••••••' + lastFour
}

// Show reasoning helper functions
const loadShowReasoning = () => {
  try {
    const stored = localStorage.getItem(SHOW_REASONING_KEY)
    if (stored !== null) {
      return stored === 'true'
    }
  } catch (error) {
    console.error('Error loading show reasoning:', error)
  }
  return false  // Default to OFF
}

const saveShowReasoning = (enabled) => {
  try {
    localStorage.setItem(SHOW_REASONING_KEY, enabled ? 'true' : 'false')
  } catch (error) {
    console.error('Error saving show reasoning:', error)
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

// Claude API integration
const callClaudeAPI = async (prompt, apiKey) => {
  try {
    // Use Cloudflare Worker if URL is configured, otherwise direct API call
    const apiUrl = CLOUDFLARE_WORKER_URL || 'https://api.anthropic.com/v1/messages'
    const useWorker = !!CLOUDFLARE_WORKER_URL

    // Build headers based on whether we're using the worker or not
    const headers = {
      'Content-Type': 'application/json'
    }

    if (useWorker) {
      // Worker expects API key in X-API-Key header
      headers['X-API-Key'] = apiKey
    } else {
      // Direct API call uses x-api-key header
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      const errorMessage = error.error?.message || 'API request failed'

      // Provide user-friendly error messages
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your key in the debug panel.')
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again in a moment.')
      } else if (response.status >= 500) {
        throw new Error('Claude API is temporarily unavailable.')
      } else {
        throw new Error(errorMessage)
      }
    }

    const data = await response.json()
    return data.content[0].text.trim().toUpperCase()
  } catch (error) {
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      const workerHint = CLOUDFLARE_WORKER_URL
        ? 'Check your Cloudflare Worker is running and accessible.'
        : 'Network error. Try deploying a Cloudflare Worker to bypass CORS restrictions.'
      throw new Error(`Network error. ${workerHint}`)
    }
    throw error
  }
}

// Optimized AI prompt generation
const generateOptimizedPrompt = (gameHistory, usedWords) => {
  const totalGames = gameHistory.length
  const wins = gameHistory.filter(g => g.r > 0).length
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0
  const wonGames = gameHistory.filter(g => g.r > 0)
  const avgGuesses = wonGames.length > 0
    ? Math.round((wonGames.reduce((sum, g) => sum + g.r, 0) / wonGames.length) * 10) / 10
    : 0

  // Format recent games compactly: WORD(result,understanding,source)
  const recentCompact = gameHistory.slice(0, 20).map(g => {
    let str = `${g.w}(${g.r}`
    if (g.u) str += `,${g.u}`
    str += `,${g.src === 'ai' ? 'a' : 'l'})`
    return str
  }).join(',')

  // Limit used words to last 100 (or all if less than 100)
  const usedArray = Array.from(usedWords)
  const recentUsed = usedArray.slice(-100).join(',')

  return `Select next 5-letter English word for user:
Stats: ${totalGames}games, ${winRate}%win, ${avgGuesses}avg
Recent20: ${recentCompact}
Format: WORD(result,understanding,source) where result=1-6 if won or -1 if lost, source=a(AI) or l(list)
Avoid: ${recentUsed}
Return only the word, nothing else.`
}

// Get word selection reasoning
const getWordReasoning = async (word, gameHistory, apiKey) => {
  const recentGames = gameHistory.slice(0, 5).map(g =>
    `${g.w}(${g.r > 0 ? 'won' : 'lost'})`
  ).join(',')

  const prompt = `You selected "${word}" for a user who recently played: ${recentGames}. In ONE sentence, explain why this word is appropriate for their skill level.`

  return await callClaudeAPI(prompt, apiKey)
}

// Helper function to get random word (excluding previously used words)
const getRandomWord = (usedWords) => {
  const availableWords = ANSWER_WORDS.filter(word => !usedWords.has(word))

  // If all words have been used, return null to show victory dialog
  if (availableWords.length === 0) {
    return null
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
    const usedWords = loadUsedWords()
    const newWord = getRandomWord(usedWords)
    // Don't add to history yet - only add when game is completed
    return {
      targetWord: newWord,
      wordSource: 'list',  // First game is always random
      guesses: Array(MAX_ATTEMPTS).fill(''),
      currentGuess: '',
      currentRow: 0,
      gameStatus: 'playing',
      keyColors: {}
    }
  }

  const initialState = initializeGameState()
  const [usedWords, setUsedWords] = useState(() => loadUsedWords())
  const [gameHistory, setGameHistory] = useState(() => loadGameHistory())

  const [targetWord, setTargetWord] = useState(initialState.targetWord)
  const [wordSource, setWordSource] = useState(initialState.wordSource || 'list')
  const [guesses, setGuesses] = useState(initialState.guesses)
  const [currentGuess, setCurrentGuess] = useState(initialState.currentGuess || '')
  const [currentRow, setCurrentRow] = useState(initialState.currentRow)
  const [gameStatus, setGameStatus] = useState(initialState.gameStatus)
  const [keyColors, setKeyColors] = useState(initialState.keyColors)
  const [errorMessage, setErrorMessage] = useState('')
  const [stats, setStats] = useState(() => loadStats())
  const [aiEnabled, setAIEnabled] = useState(() => loadAIEnabled())
  const [showReasoning, setShowReasoning] = useState(() => loadShowReasoning())
  const [apiKey, setAPIKey] = useState(() => loadAPIKey())
  const [currentReasoning, setCurrentReasoning] = useState(null)
  const [isLoadingWord, setIsLoadingWord] = useState(false)
  const [showAPIKeyDialog, setShowAPIKeyDialog] = useState(false)
  const [apiKeyInput, setAPIKeyInput] = useState('')
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [showLearnModal, setShowLearnModal] = useState(false)
  const [showGameOverModal, setShowGameOverModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [showVictoryDialog, setShowVictoryDialog] = useState(false)
  const [definitionData, setDefinitionData] = useState(null)
  const [definitionLoading, setDefinitionLoading] = useState(false)
  const [definitionError, setDefinitionError] = useState(null)
  const [lastWinRow, setLastWinRow] = useState(null)
  const [pendingUnderstanding, setPendingUnderstanding] = useState(() => loadPendingUnderstanding())
  const errorTimeoutRef = useRef(null)
  const gameEndedRef = useRef(initialState.gameStatus !== 'playing')
  const pendingNewGameRef = useRef(false)

  // Handle physical keyboard input
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Block keyboard input when any modal is open
      if (showStatsModal || showLearnModal || showFeedbackModal || showAPIKeyDialog || showVictoryDialog) {
        return
      }

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
  }, [currentGuess, currentRow, gameStatus, showStatsModal, showLearnModal, showFeedbackModal, showAPIKeyDialog, showVictoryDialog])

  // Update statistics when game ends
  useEffect(() => {
    if (gameStatus !== 'playing' && !gameEndedRef.current) {
      gameEndedRef.current = true

      // Show result dialog immediately
      setShowFeedbackModal(true)
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

  const updateStatistics = (status, guessCount, source) => {
    const newStats = { ...stats }
    newStats.played += 1

    // Track word source
    if (source === 'ai') {
      newStats.aiWords = (newStats.aiWords || 0) + 1
    } else {
      newStats.listWords = (newStats.listWords || 0) + 1
    }

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

  const saveGameToHistory = () => {
    // Save game without understanding rating (rating will be added later from Learn More)
    const result = gameStatus === 'won' ? currentRow + 1 : -1

    // Update statistics
    updateStatistics(gameStatus, currentRow + 1, wordSource)

    // Add to game history without understanding rating
    addGameToHistory(targetWord, result, null, wordSource)
    setGameHistory(loadGameHistory())

    // Add to used words
    addUsedWord(targetWord)
    setUsedWords(loadUsedWords())
  }

  const handleCloseFeedback = () => {
    // Save game to history if not already saved
    if (!usedWords.has(targetWord)) {
      saveGameToHistory()
    }
    setShowFeedbackModal(false)
  }

  const handleLearnMore = () => {
    // Save game to history if not already saved (in case they click Learn without closing dialog)
    if (!usedWords.has(targetWord)) {
      saveGameToHistory()
    }
    fetchDefinition(targetWord)
  }

  const handlePlayAgain = () => {
    // Save game to history if not already saved (in case they click Play Again without closing dialog)
    if (!usedWords.has(targetWord)) {
      saveGameToHistory()
    }
    startNewGame()
  }

  const handleUnderstandingRating = (rating) => {
    // Save rating to pending storage
    savePendingUnderstanding(rating)
    setPendingUnderstanding(rating)
  }

  const handleAIToggle = (enabled) => {
    setAIEnabled(enabled)
    saveAIEnabled(enabled)
  }

  const handleShowReasoningToggle = (enabled) => {
    setShowReasoning(enabled)
    saveShowReasoning(enabled)
  }

  const handleAddAPIKey = () => {
    setAPIKeyInput(apiKey || '')
    setShowAPIKeyDialog(true)
  }

  const handleSaveAPIKey = () => {
    const key = apiKeyInput.trim()
    if (key) {
      saveAPIKey(key)
      setAPIKey(key)
    }
    setShowAPIKeyDialog(false)
    setAPIKeyInput('')
  }

  const handleClearAPIKey = () => {
    if (window.confirm('Remove your API key from this device?')) {
      saveAPIKey(null)
      setAPIKey(null)
    }
  }

  const handleClearUsedWords = () => {
    if (window.confirm('Are you sure you want to clear all used words? This will allow all words to appear again.')) {
      clearUsedWords()
      setUsedWords(new Set())
    }
  }

  const startNewGame = async () => {
    try {
      setIsLoadingWord(true)
      setCurrentReasoning(null)

      const availableFromList = ANSWER_WORDS.filter(w => !usedWords.has(w))

      // Check if random mode or insufficient history
      if (!aiEnabled || gameHistory.length < 5) {
        if (availableFromList.length === 0) {
          setShowVictoryDialog(true)
          setIsLoadingWord(false)
          return
        }
        const word = availableFromList[Math.floor(Math.random() * availableFromList.length)]
        startGameWithWord(word, 'list')
        setIsLoadingWord(false)
        return
      }

      // AI mode - check for API key
      if (!apiKey) {
        alert('Please add your Anthropic API key in the debug panel to use AI word selection.')
        // Fallback to random
        if (availableFromList.length === 0) {
          setShowVictoryDialog(true)
          setIsLoadingWord(false)
          return
        }
        const word = availableFromList[Math.floor(Math.random() * availableFromList.length)]
        startGameWithWord(word, 'list')
        setIsLoadingWord(false)
        return
      }

      try {
        // Generate optimized prompt
        const prompt = generateOptimizedPrompt(gameHistory, usedWords)

        // Call Claude API for word
        const word = await callClaudeAPI(prompt, apiKey)

        // Validate word
        if (!word || word.length !== 5 || !/^[A-Z]+$/.test(word)) {
          throw new Error('Invalid word format from API')
        }

        if (usedWords.has(word)) {
          throw new Error('API returned already-used word')
        }

        // Get reasoning if enabled
        let reasoning = null
        if (showReasoning) {
          try {
            reasoning = await getWordReasoning(word, gameHistory, apiKey)
            setCurrentReasoning(reasoning)
          } catch (error) {
            console.error('Failed to get reasoning:', error)
            // Continue without reasoning - don't fail the whole request
          }
        }

        startGameWithWord(word, 'ai')
        setIsLoadingWord(false)

      } catch (error) {
        console.error('AI word selection failed:', error)
        alert(`AI word selection failed: ${error.message}\nFalling back to random selection.`)

        // Fallback to random
        if (availableFromList.length === 0) {
          setShowVictoryDialog(true)
          setIsLoadingWord(false)
          return
        }
        const word = availableFromList[Math.floor(Math.random() * availableFromList.length)]
        startGameWithWord(word, 'list')
        setIsLoadingWord(false)
      }
    } catch (error) {
      console.error('Error in startNewGame:', error)
      setIsLoadingWord(false)
    }
  }

  const startGameWithWord = (word, source) => {
    // Save pending understanding to most recent game before starting new game
    const pendingRating = loadPendingUnderstanding()
    if (pendingRating !== null) {
      const history = loadGameHistory()
      if (history.length > 0) {
        // Update the most recent game (last item in array)
        history[history.length - 1].u = pendingRating
        saveGameHistory(history)
        setGameHistory(history)
      }
      // Clear pending understanding
      savePendingUnderstanding(null)
      setPendingUnderstanding(null)
    }

    clearGameState()
    setTargetWord(word)
    setWordSource(source)
    setGuesses(Array(MAX_ATTEMPTS).fill(''))
    setCurrentGuess('')
    setCurrentRow(0)
    setGameStatus('playing')
    setKeyColors({})
    setErrorMessage('')
    setShowGameOverModal(false)
    gameEndedRef.current = false
  }

  const handleVictoryStartFresh = () => {
    if (window.confirm('Are you sure you want to start fresh? This will clear all history, used words, and stats.')) {
      // Clear all data except AI preference
      clearUsedWords()
      resetStats()
      localStorage.removeItem(HISTORY_KEY)

      // Reset state
      setUsedWords(new Set())
      setGameHistory([])
      setStats(getInitialStats())
      setShowVictoryDialog(false)

      // Start new game
      startNewGame()
    }
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
    // Save game to history if not already saved
    if (!usedWords.has(targetWord)) {
      saveGameToHistory()
    }
    startNewGame()
  }

  const handleResetStats = () => {
    if (window.confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
      const newStats = resetStats()
      setStats(newStats)
      setLastWinRow(null)
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
    // Save game to history if not already saved
    if (!usedWords.has(targetWord)) {
      saveGameToHistory()
    }
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
          {currentReasoning && (
            <div className="debug-item">
              <strong>AI Reasoning:</strong>
              <div className="ai-reasoning">
                {currentReasoning}
              </div>
            </div>
          )}
          <div className="debug-item">
            <strong>Remaining (list):</strong> {ANSWER_WORDS.filter(w => !usedWords.has(w)).length} words
          </div>
          <div className="debug-item">
            <strong>Next 10:</strong>
            <div className="debug-words">
              {shuffledRemainingWords.join(', ')}
            </div>
          </div>
          <div className="debug-item">
            <strong>AI Selection:</strong>
            <div className="ai-toggle">
              <button
                className={`toggle-btn ${aiEnabled ? 'active' : ''}`}
                onClick={() => handleAIToggle(true)}
              >
                ON
              </button>
              <button
                className={`toggle-btn ${!aiEnabled ? 'active' : ''}`}
                onClick={() => handleAIToggle(false)}
              >
                OFF
              </button>
            </div>
          </div>
          {aiEnabled && (
            <div className="debug-item">
              <strong>Show Reasoning:</strong>
              <div className="ai-toggle">
                <button
                  className={`toggle-btn ${showReasoning ? 'active' : ''}`}
                  onClick={() => handleShowReasoningToggle(true)}
                >
                  ON
                </button>
                <button
                  className={`toggle-btn ${!showReasoning ? 'active' : ''}`}
                  onClick={() => handleShowReasoningToggle(false)}
                >
                  OFF
                </button>
              </div>
            </div>
          )}
          {aiEnabled && (
            <div className="debug-item">
              <strong>API Configuration:</strong>
              <div className="api-key-section">
                {apiKey ? (
                  <div className="api-key-display">
                    <span className="masked-key">{maskAPIKey(apiKey)}</span>
                    <button className="api-key-btn edit" onClick={handleAddAPIKey}>
                      Edit
                    </button>
                    <button className="api-key-btn clear" onClick={handleClearAPIKey}>
                      Clear
                    </button>
                  </div>
                ) : (
                  <button className="add-api-key-btn" onClick={handleAddAPIKey}>
                    Add API Key
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="debug-item">
            <strong>Total used:</strong> {usedWords.size} ({stats.aiWords || 0} AI, {stats.listWords || 0} list)
          </div>
          <button className="reset-stats-button" onClick={handleResetStats}>
            Reset Statistics
          </button>
          <button className="reset-history-button" onClick={handleClearUsedWords}>
            Clear Used Words
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
          <button className="learn-button" onClick={handleLearnClick} disabled={isLoadingWord}>
            📖 Learn
          </button>
          <button className="play-again-button" onClick={resetGame} disabled={isLoadingWord}>
            {isLoadingWord ? (
              <>
                <span className="spinner-small"></span>
                Loading...
              </>
            ) : (
              <>🔄 Play Again</>
            )}
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

            {/* Word Sources */}
            {(stats.aiWords > 0 || stats.listWords > 0) && (
              <div className="word-sources">
                <h3>WORD SOURCES</h3>
                <div className="source-item">
                  {stats.aiWords || 0} AI-selected ({stats.played > 0 ? Math.round(((stats.aiWords || 0) / stats.played) * 100) : 0}%)
                </div>
                <div className="source-item">
                  {stats.listWords || 0} Random ({stats.played > 0 ? Math.round(((stats.listWords || 0) / stats.played) * 100) : 0}%)
                </div>
              </div>
            )}

            <div className="guess-distribution">
              <h3>GUESS DISTRIBUTION</h3>
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

              {/* Understanding Rating Section */}
              <div className="understanding-rating-section">
                <div className="rating-separator"></div>
                <h3>How well do you understand this word's meaning?</h3>
                <div className="rating-buttons">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                    <button
                      key={rating}
                      className={`rating-btn ${pendingUnderstanding === rating ? 'selected' : ''}`}
                      onClick={() => handleUnderstandingRating(rating)}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
                <p className="rating-note">(You can change your rating anytime)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result Dialog */}
      {showFeedbackModal && (
        <div className="modal-overlay">
          <div className="modal feedback-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              {gameStatus === 'won' ? (
                <>
                  <div className="modal-emoji">🎉</div>
                  <h2>You won!</h2>
                  <p>The word was: <strong>{targetWord}</strong></p>
                  <p>Guessed in {currentRow + 1} {currentRow + 1 === 1 ? 'try' : 'tries'}</p>
                </>
              ) : (
                <>
                  <div className="modal-emoji">😔</div>
                  <h2>Game Over</h2>
                  <p>The word was: <strong>{targetWord}</strong></p>
                </>
              )}

              <p className="word-source">
                Word source: {wordSource === 'ai' ? 'AI-selected for your level' : 'Random from list'}
              </p>

              <button className="close-result-button" onClick={handleCloseFeedback}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Dialog */}
      {showAPIKeyDialog && (
        <div className="modal-overlay" onClick={() => setShowAPIKeyDialog(false)}>
          <div className="modal api-key-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Anthropic API Key</h2>
              <button className="close-button" onClick={() => setShowAPIKeyDialog(false)}>
                ✕
              </button>
            </div>

            <div className="modal-content">
              <p>Enter your Anthropic API key to enable AI word selection:</p>

              <input
                type="password"
                className="api-key-input"
                value={apiKeyInput}
                onChange={(e) => setAPIKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                autoFocus
              />

              <div className="api-key-warning">
                ⚠️ Your API key will be stored in your browser's localStorage. Only add your key on devices you trust.
              </div>

              <div className="api-key-info">
                <p>Don't have an API key? Get one from:</p>
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
                  https://console.anthropic.com/
                </a>
              </div>

              <div className="api-dialog-actions">
                <button className="cancel-btn" onClick={() => setShowAPIKeyDialog(false)}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSaveAPIKey} disabled={!apiKeyInput.trim()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Victory Dialog */}
      {showVictoryDialog && (
        <div className="modal-overlay">
          <div className="modal victory-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-emoji">🎉</div>
              <h2>INCREDIBLE ACHIEVEMENT!</h2>
              <p>You've played EVERY possible word!</p>

              <div className="victory-stats">
                <h3>📊 Final Statistics:</h3>
                <ul>
                  <li>{stats.listWords || 0} words from the standard list</li>
                  <li>{stats.aiWords || 0} AI-selected words</li>
                  <li>{usedWords.size} total unique words</li>
                  <li>{stats.wins} wins ({winPercentage}%)</li>
                  <li>Max streak: {stats.maxStreak}</li>
                </ul>
              </div>

              <p className="victory-message">You've truly mastered WordWise!</p>

              <div className="victory-actions">
                <button className="start-fresh-btn" onClick={handleVictoryStartFresh}>
                  Start Fresh
                </button>
                <button className="close-btn" onClick={() => setShowVictoryDialog(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WordWise
