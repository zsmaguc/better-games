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
const TIER2_FOCUS_KEY = 'wordwise-tier2-focus'  // Tier II vocabulary focus toggle
const EXTENDED_INFO_KEY = 'wordwise-extended-info'  // Extended word information toggle
const TOKEN_USAGE_KEY = 'wordwise-token-usage'  // AI token usage tracking (dev only)
const SYNC_CODE_KEY = 'wordwise-sync-code'  // Cloud sync code
const SYNC_VERSION_KEY = 'wordwise-sync-version'  // Cloud sync version number
const SYNC_ENABLED_KEY = 'wordwise-sync-enabled'  // Cloud sync enabled toggle
const MAX_HISTORY_SIZE = 20
const MAX_TOKEN_USAGE_SIZE = 100

const CLOUDFLARE_WORKER_URL = 'https://wordwise-proxy.zsmaguc.workers.dev'

// UUID v4 generator for game IDs
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

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
  const entry = {
    id: generateUUID(),  // Unique game ID for sync merge
    w: word,
    r: result,
    src: source,
    t: Date.now()  // Timestamp for conflict resolution
  }
  if (understanding !== null && understanding !== undefined) {
    entry.u = understanding
  }
  history.push(entry)
  saveGameHistory(history)
  return entry  // Return the entry for potential sync triggering
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

// Tier II focus helper functions
const loadTier2Focus = () => {
  try {
    const stored = localStorage.getItem(TIER2_FOCUS_KEY)
    if (stored !== null) {
      return stored === 'true'
    }
  } catch (error) {
    console.error('Error loading Tier II focus:', error)
  }
  return false  // Default to OFF
}

const saveTier2Focus = (enabled) => {
  try {
    localStorage.setItem(TIER2_FOCUS_KEY, enabled ? 'true' : 'false')
  } catch (error) {
    console.error('Error saving Tier II focus:', error)
  }
}

// Extended info helper functions
const loadExtendedInfo = () => {
  try {
    const stored = localStorage.getItem(EXTENDED_INFO_KEY)
    if (stored !== null) {
      return stored === 'true'
    }
  } catch (error) {
    console.error('Error loading extended info:', error)
  }
  return false  // Default to OFF
}

const saveExtendedInfo = (enabled) => {
  try {
    localStorage.setItem(EXTENDED_INFO_KEY, enabled ? 'true' : 'false')
  } catch (error) {
    console.error('Error saving extended info:', error)
  }
}

// Token usage helper functions (dev only)
const loadTokenUsage = () => {
  try {
    const stored = localStorage.getItem(TOKEN_USAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Error loading token usage:', error)
  }
  return []
}

const saveTokenUsage = (usageData) => {
  try {
    // Keep only last 100 entries
    const trimmed = usageData.slice(0, MAX_TOKEN_USAGE_SIZE)
    localStorage.setItem(TOKEN_USAGE_KEY, JSON.stringify(trimmed))
  } catch (error) {
    console.error('Error saving token usage:', error)
  }
}

const storeTokenUsage = (word, type, usage, reasoningText = null) => {
  const data = loadTokenUsage()

  let entry = data.find(e => e.word === word)
  if (!entry) {
    entry = { word }
    data.unshift(entry)
  }

  if (type === 'reasoning') {
    entry.reasoning = { usage, text: reasoningText }
  } else {
    entry[type] = usage
  }

  saveTokenUsage(data)
}

const clearTokenUsage = () => {
  try {
    localStorage.removeItem(TOKEN_USAGE_KEY)
  } catch (error) {
    console.error('Error clearing token usage:', error)
  }
}

// Cloud sync helper functions
const loadSyncCode = () => {
  try {
    return localStorage.getItem(SYNC_CODE_KEY) || null
  } catch (error) {
    console.error('Error loading sync code:', error)
    return null
  }
}

const saveSyncCode = (code) => {
  try {
    if (code) {
      localStorage.setItem(SYNC_CODE_KEY, code)
    } else {
      localStorage.removeItem(SYNC_CODE_KEY)
    }
  } catch (error) {
    console.error('Error saving sync code:', error)
  }
}

const loadSyncVersion = () => {
  try {
    const stored = localStorage.getItem(SYNC_VERSION_KEY)
    return stored ? parseInt(stored) : 0
  } catch (error) {
    console.error('Error loading sync version:', error)
    return 0
  }
}

const saveSyncVersion = (version) => {
  try {
    localStorage.setItem(SYNC_VERSION_KEY, version.toString())
  } catch (error) {
    console.error('Error saving sync version:', error)
  }
}

const loadSyncEnabled = () => {
  try {
    const stored = localStorage.getItem(SYNC_ENABLED_KEY)
    return stored === 'true'
  } catch (error) {
    console.error('Error loading sync enabled:', error)
    return false
  }
}

const saveSyncEnabled = (enabled) => {
  try {
    localStorage.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false')
  } catch (error) {
    console.error('Error saving sync enabled:', error)
  }
}

// Intelligent merge strategy for synced data
const intelligentMerge = (localData, remoteData) => {
  const merged = {
    stats: {},
    gameHistory: [],
    usedWords: [],
    settings: {}
  }

  // Stats: Use max values for all metrics
  const localStats = localData.stats || getInitialStats()
  const remoteStats = remoteData.stats || getInitialStats()

  // Get game history arrays (needed for currentStreak logic)
  const localHistory = localData.gameHistory || []
  const remoteHistory = remoteData.gameHistory || []

  // Determine which device has the most recent game to get accurate currentStreak
  const localLastGame = localHistory.length > 0 ? localHistory[localHistory.length - 1] : null
  const remoteLastGame = remoteHistory.length > 0 ? remoteHistory[remoteHistory.length - 1] : null

  // Use currentStreak from device with most recent game
  // (currentStreak is time-sensitive - it should reflect the actual current state, not a max)
  let currentStreakToUse = localStats.currentStreak || 0
  if (localLastGame && remoteLastGame) {
    // Both have games - use streak from device with most recent game
    const localTime = localLastGame.t || 0
    const remoteTime = remoteLastGame.t || 0
    currentStreakToUse = remoteTime > localTime
      ? (remoteStats.currentStreak || 0)
      : (localStats.currentStreak || 0)
  } else if (remoteLastGame && !localLastGame) {
    // Only remote has games
    currentStreakToUse = remoteStats.currentStreak || 0
  }

  merged.stats = {
    played: Math.max(localStats.played || 0, remoteStats.played || 0),
    wins: Math.max(localStats.wins || 0, remoteStats.wins || 0),
    currentStreak: currentStreakToUse,  // Use most recent, not max!
    maxStreak: Math.max(localStats.maxStreak || 0, remoteStats.maxStreak || 0),
    guessDistribution: (localStats.guessDistribution || [0,0,0,0,0,0]).map((val, idx) =>
      Math.max(val, (remoteStats.guessDistribution || [0,0,0,0,0,0])[idx] || 0)
    ),
    aiWords: Math.max(localStats.aiWords || 0, remoteStats.aiWords || 0),
    listWords: Math.max(localStats.listWords || 0, remoteStats.listWords || 0)
  }

  // Game history: Merge by unique game ID, keep most recent for duplicates
  const historyMap = new Map()
  const gamesWithoutId = []

  // Add all local games
  localHistory.forEach(game => {
    if (game.id) {
      historyMap.set(game.id, game)
    } else {
      // Old game entry without ID - add UUID and timestamp
      const updatedGame = {
        ...game,
        id: generateUUID(),
        t: Date.now()
      }
      gamesWithoutId.push(updatedGame)
    }
  })

  // Add remote games, overwrite if remote timestamp is newer
  remoteHistory.forEach(game => {
    if (game.id) {
      const existing = historyMap.get(game.id)
      if (!existing || (game.t && existing.t && game.t > existing.t)) {
        historyMap.set(game.id, game)
      }
    } else {
      // Old game entry without ID - add UUID and timestamp
      const updatedGame = {
        ...game,
        id: generateUUID(),
        t: Date.now()
      }
      gamesWithoutId.push(updatedGame)
    }
  })

  // Combine games with IDs and old games without IDs
  const allGames = [...Array.from(historyMap.values()), ...gamesWithoutId]

  // Convert to array and sort by timestamp (most recent last)
  merged.gameHistory = allGames
    .sort((a, b) => (a.t || 0) - (b.t || 0))
    .slice(-MAX_HISTORY_SIZE)  // Keep last 20 games

  // Used words: Union of both sets
  const localWords = new Set(localData.usedWords || [])
  const remoteWords = new Set(remoteData.usedWords || [])
  merged.usedWords = Array.from(new Set([...localWords, ...remoteWords]))

  // Settings: Prefer local values (user's current device settings)
  // But sync preferences like tier2Focus and extendedInfo
  merged.settings = {
    aiEnabled: localData.settings?.aiEnabled !== undefined ? localData.settings.aiEnabled : (remoteData.settings?.aiEnabled || true),
    showReasoning: localData.settings?.showReasoning !== undefined ? localData.settings.showReasoning : (remoteData.settings?.showReasoning || false),
    tier2Focus: localData.settings?.tier2Focus !== undefined ? localData.settings.tier2Focus : (remoteData.settings?.tier2Focus || false),
    extendedInfo: localData.settings?.extendedInfo !== undefined ? localData.settings.extendedInfo : (remoteData.settings?.extendedInfo || false)
    // Note: apiKey is explicitly NOT synced for security
  }

  return merged
}

// Sync API functions
const generateSyncCode = async (localData) => {
  try {
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}/sync/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: localData })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to generate sync code')
    }

    const result = await response.json()
    return result.code
  } catch (error) {
    console.error('Error generating sync code:', error)
    throw error
  }
}

const fetchSyncData = async (code) => {
  try {
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}/sync/${code}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch sync data')
    }

    return await response.json()
  } catch (error) {
    console.error('Error fetching sync data:', error)
    throw error
  }
}

const updateSyncData = async (code, data, version) => {
  try {
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}/sync/${code}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data, version })
    })

    if (!response.ok) {
      const error = await response.json()

      // Handle version conflict
      if (response.status === 409) {
        return {
          conflict: true,
          currentVersion: error.currentVersion,
          currentData: error.currentData
        }
      }

      throw new Error(error.error || 'Failed to update sync data')
    }

    return await response.json()
  } catch (error) {
    console.error('Error updating sync data:', error)
    throw error
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
const callClaudeAPI = async (prompt, apiKey, returnUsage = false) => {
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
    const word = data.content[0].text.trim().toUpperCase()

    if (returnUsage) {
      return {
        word,
        usage: {
          input: data.usage?.input_tokens || 0,
          output: data.usage?.output_tokens || 0
        }
      }
    }

    return word
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

// Get extended word information (Etymology + Translations)
const getExtendedWordInfo = async (word, apiKey) => {
  const prompt = `For "${word}":

1. Etymology (2 sentences max)
2. Word family (4 related 5-letter words with brief definitions)
3. German and Croatian: translation, definition, 2 examples each

JSON format:
{
  "e": "etymology text",
  "f": ["WORD - def", "WORD - def", ...],
  "de": {
    "w": "word",
    "d": "definition",
    "ex": ["example 1", "example 2"]
  },
  "hr": {
    "w": "word",
    "d": "definition",
    "ex": ["example 1", "example 2"]
  }
}

Keep under 250 words. Return ONLY valid JSON.`

  try {
    const apiUrl = CLOUDFLARE_WORKER_URL || 'https://api.anthropic.com/v1/messages'
    const useWorker = !!CLOUDFLARE_WORKER_URL

    const headers = {
      'Content-Type': 'application/json'
    }

    if (useWorker) {
      headers['X-API-Key'] = apiKey
    } else {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      const errorMessage = error.error?.message || 'API request failed'
      throw new Error(errorMessage)
    }

    const data = await response.json()
    let text = data.content[0].text.trim()

    // Strip markdown code blocks if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Parse JSON response
    const parsed = JSON.parse(text)

    // Return both parsed data and usage
    return {
      data: parsed,
      usage: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0
      }
    }
  } catch (error) {
    console.error('Failed to get extended info:', error)
    throw error
  }
}

// Optimized AI prompt generation
const generateOptimizedPrompt = (gameHistory, usedWords, tier2Enabled) => {
  const totalGames = gameHistory.length
  const wins = gameHistory.filter(g => g.r > 0).length
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0
  const wonGames = gameHistory.filter(g => g.r > 0)
  const avgGuesses = wonGames.length > 0
    ? Math.round((wonGames.reduce((sum, g) => sum + g.r, 0) / wonGames.length) * 10) / 10
    : 0

  // Format recent 30 games compactly: WORD(result,understanding,source)
  const recentCompact = gameHistory.slice(0, 30).map(g => {
    let str = `${g.w}(${g.r}`
    if (g.u) str += `,${g.u}`
    str += `,${g.src === 'ai' ? 'a' : 'l'})`
    return str
  }).join(',')

  let prompt = `Select next 5-letter English word for user:
Stats: ${totalGames} games, ${winRate}% win, ${avgGuesses} avg
Recent30: ${recentCompact}
Format: WORD(result,understanding,source) where result=1-6 if won or -1 if lost, source=a(AI) or l(list)
Do not repeat words from Recent30.`

  if (tier2Enabled) {
    prompt += `

TIER II FOCUS: Prioritize Tier II vocabulary:
- High-frequency across contexts (not domain-specific)
- Academically valuable
- Complex but not obscure
Good: INFER, ADAPT, YIELD, IMPLY, SHIFT
Avoid basic: CATCH, SLEEP, HAPPY, WATER
Avoid specialized: STEAM, MOLAR, PRISM`
  }

  prompt += `

Return only the word, nothing else.`

  return prompt
}

// Get word selection reasoning
const getWordReasoning = async (word, gameHistory, apiKey) => {
  const recentGames = gameHistory.slice(0, 5).map(g =>
    `${g.w}(${g.r > 0 ? 'won' : 'lost'})`
  ).join(',')

  const prompt = `You selected "${word}" for a user who recently played: ${recentGames}. In ONE sentence, explain why this word is appropriate for their skill level.`

  // Call with usage tracking
  const apiUrl = CLOUDFLARE_WORKER_URL || 'https://api.anthropic.com/v1/messages'
  const useWorker = !!CLOUDFLARE_WORKER_URL

  const headers = {
    'Content-Type': 'application/json'
  }

  if (useWorker) {
    headers['X-API-Key'] = apiKey
  } else {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  })

  const data = await response.json()
  const text = data.content[0].text.trim()

  return {
    text,
    usage: {
      input: data.usage?.input_tokens || 0,
      output: data.usage?.output_tokens || 0
    }
  }
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
  const [tier2Focus, setTier2Focus] = useState(() => loadTier2Focus())
  const [extendedInfo, setExtendedInfo] = useState(() => loadExtendedInfo())
  const [apiKey, setAPIKey] = useState(() => loadAPIKey())
  const [currentReasoning, setCurrentReasoning] = useState(null)
  const [isLoadingWord, setIsLoadingWord] = useState(false)
  const [showAPIKeyDialog, setShowAPIKeyDialog] = useState(false)
  const [apiKeyInput, setAPIKeyInput] = useState('')
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [showLearnModal, setShowLearnModal] = useState(false)
  const [showGameOverModal, setShowGameOverModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [showVictoryDialog, setShowVictoryDialog] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [aiUsagePage, setAIUsagePage] = useState(0)
  const [definitionData, setDefinitionData] = useState(null)
  const [definitionLoading, setDefinitionLoading] = useState(false)
  const [definitionError, setDefinitionError] = useState(null)
  const [learnTab, setLearnTab] = useState('definition')
  const [extendedInfoData, setExtendedInfoData] = useState({})
  const [extendedInfoLoading, setExtendedInfoLoading] = useState(false)
  const [extendedInfoError, setExtendedInfoError] = useState(null)
  const [currentLearnWord, setCurrentLearnWord] = useState(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [lastWinRow, setLastWinRow] = useState(null)
  const [pendingUnderstanding, setPendingUnderstanding] = useState(() => loadPendingUnderstanding())
  const [settingsTab, setSettingsTab] = useState('ai')  // 'ai' or 'sync'
  const [syncCode, setSyncCode] = useState(() => loadSyncCode())
  const [syncEnabled, setSyncEnabled] = useState(() => loadSyncEnabled())
  const [syncVersion, setSyncVersion] = useState(() => loadSyncVersion())
  const [syncStatus, setSyncStatus] = useState(null)  // null, 'syncing', 'success', 'error'
  const [syncError, setSyncError] = useState(null)
  const [syncCodeInput, setSyncCodeInput] = useState('')
  const errorTimeoutRef = useRef(null)
  const gameEndedRef = useRef(initialState.gameStatus !== 'playing')
  const pendingNewGameRef = useRef(false)

  // Handle physical keyboard input
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Block keyboard input when any modal is open
      if (showStatsModal || showSettingsModal || showLearnModal || showFeedbackModal || showAPIKeyDialog || showVictoryDialog || showHistoryModal || showAIPanel) {
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
  }, [currentGuess, currentRow, gameStatus, showStatsModal, showSettingsModal, showLearnModal, showFeedbackModal, showAPIKeyDialog, showVictoryDialog, showHistoryModal, showAIPanel])

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

  // Sync on load (only if sync is enabled and sync code exists)
  useEffect(() => {
    const syncOnLoad = async () => {
      // Only sync if we have both sync code and it's enabled
      if (syncEnabled && syncCode && syncCode.length === 9) {
        try {
          // Fetch latest remote data first
          const remoteData = await fetchSyncData(syncCode)

          // Merge with local data
          const localData = prepareDataForSync()
          const mergedData = intelligentMerge(localData, remoteData.data)

          // Apply merged data locally
          applyMergedData(mergedData)

          console.log('Synced on load successfully')
        } catch (error) {
          console.error('Failed to sync on load:', error)
          // Don't show error on load, just log it
        }
      }
    }

    syncOnLoad()
  }, [])  // Only run once on mount

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

  const saveGameToHistory = async () => {
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

    // Trigger cloud sync if enabled
    if (syncEnabled && syncCode) {
      try {
        await handleSyncNow()
      } catch (error) {
        console.error('Failed to sync after game completion:', error)
        // Don't block the game flow if sync fails
      }
    }
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

  const handleTier2Toggle = (enabled) => {
    setTier2Focus(enabled)
    saveTier2Focus(enabled)
  }

  const handleExtendedInfoToggle = (enabled) => {
    setExtendedInfo(enabled)
    saveExtendedInfo(enabled)
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
      // Automatically disable AI if it's currently enabled
      if (aiEnabled) {
        handleAIToggle(false)
      }
    }
  }

  const handleClearUsedWords = () => {
    if (window.confirm('Are you sure you want to clear all used words? This will allow all words to appear again.')) {
      clearUsedWords()
      setUsedWords(new Set())
    }
  }

  // Cloud Sync handlers
  const prepareDataForSync = () => {
    // Read from localStorage to ensure we have the most recent data
    // (React state updates are async and might not have completed)
    return {
      stats: loadStats(),
      gameHistory: loadGameHistory(),
      usedWords: Array.from(loadUsedWords()),
      settings: {
        aiEnabled: loadAIEnabled(),
        showReasoning: loadShowReasoning(),
        tier2Focus: loadTier2Focus(),
        extendedInfo: loadExtendedInfo()
        // apiKey is explicitly NOT included for security
      }
    }
  }

  const applyMergedData = (mergedData) => {
    // Apply merged stats
    setStats(mergedData.stats)
    saveStats(mergedData.stats)

    // Apply merged game history
    setGameHistory(mergedData.gameHistory)
    saveGameHistory(mergedData.gameHistory)

    // Apply merged used words
    const mergedUsedWordsSet = new Set(mergedData.usedWords)
    setUsedWords(mergedUsedWordsSet)
    saveUsedWords(mergedUsedWordsSet)

    // Apply synced settings
    if (mergedData.settings.aiEnabled !== undefined) {
      setAIEnabled(mergedData.settings.aiEnabled)
      saveAIEnabled(mergedData.settings.aiEnabled)
    }
    if (mergedData.settings.showReasoning !== undefined) {
      setShowReasoning(mergedData.settings.showReasoning)
      saveShowReasoning(mergedData.settings.showReasoning)
    }
    if (mergedData.settings.tier2Focus !== undefined) {
      setTier2Focus(mergedData.settings.tier2Focus)
      saveTier2Focus(mergedData.settings.tier2Focus)
    }
    if (mergedData.settings.extendedInfo !== undefined) {
      setExtendedInfo(mergedData.settings.extendedInfo)
      saveExtendedInfo(mergedData.settings.extendedInfo)
    }
  }

  const handleGenerateSyncCode = async () => {
    try {
      setSyncStatus('syncing')
      setSyncError(null)

      const localData = prepareDataForSync()
      const code = await generateSyncCode(localData)

      setSyncCode(code)
      saveSyncCode(code)
      setSyncVersion(1)
      saveSyncVersion(1)
      setSyncEnabled(true)
      saveSyncEnabled(true)
      setSyncStatus('success')

      setTimeout(() => setSyncStatus(null), 3000)
    } catch (error) {
      setSyncStatus('error')
      setSyncError(error.message)
    }
  }

  const handleEnterSyncCode = async () => {
    const code = syncCodeInput.trim().toUpperCase()
    if (!code || code.length !== 9) {
      setSyncError('Invalid sync code format. Use XXXX-YYYY format.')
      return
    }

    try {
      setSyncStatus('syncing')
      setSyncError(null)

      // Fetch remote data
      const remoteData = await fetchSyncData(code)

      // Merge with local data
      const localData = prepareDataForSync()
      const mergedData = intelligentMerge(localData, remoteData.data)

      // Apply merged data
      applyMergedData(mergedData)

      // Save sync code and enable sync
      setSyncCode(code)
      saveSyncCode(code)
      setSyncVersion(remoteData.version)
      saveSyncVersion(remoteData.version)
      setSyncEnabled(true)
      saveSyncEnabled(true)
      setSyncCodeInput('')
      setSyncStatus('success')

      setTimeout(() => setSyncStatus(null), 3000)
    } catch (error) {
      setSyncStatus('error')
      setSyncError(error.message)
    }
  }

  const handleSyncNow = async () => {
    if (!syncCode) return

    try {
      setSyncStatus('syncing')
      setSyncError(null)

      // Fetch latest remote data first
      const remoteData = await fetchSyncData(syncCode)

      // Merge with local data
      const localData = prepareDataForSync()
      const mergedData = intelligentMerge(localData, remoteData.data)

      // Apply merged data locally
      applyMergedData(mergedData)

      // Upload merged data with incremented version
      const newVersion = remoteData.version + 1
      const updateResult = await updateSyncData(syncCode, mergedData, newVersion)

      if (updateResult.conflict) {
        // Handle conflict by merging again with the newer data
        const newerMerged = intelligentMerge(mergedData, updateResult.currentData.data)
        applyMergedData(newerMerged)

        // Try updating again with the correct version
        const retryVersion = updateResult.currentVersion + 1
        await updateSyncData(syncCode, newerMerged, retryVersion)
        setSyncVersion(retryVersion)
        saveSyncVersion(retryVersion)
      } else {
        setSyncVersion(newVersion)
        saveSyncVersion(newVersion)
      }

      setSyncStatus('success')
      setTimeout(() => setSyncStatus(null), 3000)
    } catch (error) {
      setSyncStatus('error')
      setSyncError(error.message)
    }
  }

  const handleDisableSync = () => {
    if (window.confirm('Disable cloud sync? Your sync code will be removed from this device but data in the cloud will remain.')) {
      setSyncCode(null)
      saveSyncCode(null)
      setSyncEnabled(false)
      saveSyncEnabled(false)
      setSyncVersion(0)
      saveSyncVersion(0)
      setSyncCodeInput('')
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
        const prompt = generateOptimizedPrompt(gameHistory, usedWords, tier2Focus)

        // Call Claude API for word with usage tracking
        const result = await callClaudeAPI(prompt, apiKey, true)
        const word = result.word

        // Store word selection token usage
        storeTokenUsage(word, 'wordSelection', result.usage)

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
            const reasoningResult = await getWordReasoning(word, gameHistory, apiKey)
            reasoning = reasoningResult.text
            setCurrentReasoning(reasoning)

            // Store reasoning token usage
            storeTokenUsage(word, 'reasoning', reasoningResult.usage, reasoning)
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
    setCurrentLearnWord(word)
    setLearnTab('definition')

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

  const fetchExtendedInfo = async (word) => {
    // Check if already fetched for this word
    if (extendedInfoData[word]) {
      return
    }

    setExtendedInfoLoading(true)
    setExtendedInfoError(null)

    try {
      const result = await getExtendedWordInfo(word, apiKey)
      setExtendedInfoData(prev => ({
        ...prev,
        [word]: result.data
      }))

      // Store extended info token usage
      storeTokenUsage(word, 'extendedInfo', result.usage)
    } catch (error) {
      setExtendedInfoError(error.message)
    } finally {
      setExtendedInfoLoading(false)
    }
  }

  const handleLearnTabChange = (tab) => {
    setLearnTab(tab)

    // Lazy load extended info when switching to Etymology or Translations tab
    if ((tab === 'etymology' || tab === 'translations') && extendedInfo && currentLearnWord && !extendedInfoData[currentLearnWord] && !extendedInfoLoading) {
      fetchExtendedInfo(currentLearnWord)
    }
  }

  const handleEnableExtendedInfo = () => {
    handleExtendedInfoToggle(true)
    if (currentLearnWord && !extendedInfoData[currentLearnWord]) {
      fetchExtendedInfo(currentLearnWord)
    }
  }

  const handleLearnClick = () => {
    // Save game to history if not already saved
    if (!usedWords.has(targetWord)) {
      saveGameToHistory()
    }
    fetchDefinition(targetWord)
  }

  const handleHistoryLearnClick = (word) => {
    setShowHistoryModal(false)
    fetchDefinition(word)
  }

  const closeLearnModal = () => {
    setShowLearnModal(false)
    setDefinitionData(null)
    setDefinitionError(null)
    setLearnTab('definition')
    setExtendedInfoError(null)
    setCurrentLearnWord(null)
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
          onClick={() => {
            setHistoryPage(0)
            setShowHistoryModal(true)
          }}
          title="Word History"
        >
          📜
        </button>
        <button
          className="icon-button"
          onClick={() => setShowSettingsModal(true)}
          title="Settings"
        >
          ⚙️
        </button>
        {import.meta.env.DEV && (
          <>
            <button
              className="icon-button"
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              title="Debug Panel"
            >
              🐛
            </button>
            <button
              className="icon-button"
              onClick={() => {
                setAIUsagePage(0)
                setShowAIPanel(true)
              }}
              title="AI Usage"
            >
              AI
            </button>
          </>
        )}
      </div>

      {/* Debug Panel */}
      {showDebugPanel && (
        <div className="debug-panel">
          <h3>Debug Info</h3>
          <div className="debug-item">
            <strong>Target Word:</strong> {targetWord}
          </div>
          <div className="debug-item">
            <strong>Remaining (list):</strong> {ANSWER_WORDS.filter(w => !usedWords.has(w)).length} words
          </div>
          <div className="debug-item">
            <strong>Next 10:</strong>
            <div className="debug-words">
              {shuffledRemainingWords.join(', ')}
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

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button className="close-button" onClick={() => setShowSettingsModal(false)}>
                ✕
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="learn-tabs">
              <button
                className={`learn-tab ${settingsTab === 'ai' ? 'active' : ''}`}
                onClick={() => setSettingsTab('ai')}
              >
                AI Settings
              </button>
              <button
                className={`learn-tab ${settingsTab === 'sync' ? 'active' : ''}`}
                onClick={() => setSettingsTab('sync')}
              >
                Cloud Sync
              </button>
            </div>

            <div className="settings-content">
              {/* AI Settings Tab */}
              {settingsTab === 'ai' && (
                <>
                  {/* Enable AI Toggle */}
                  <div className="settings-section">
                    <h3>Enable AI</h3>
                    <p className="settings-description">Use AI to select words based on your skill level</p>
                    <div className="ai-toggle">
                      <button
                        className={`toggle-btn ${aiEnabled ? 'active' : ''}`}
                        onClick={() => handleAIToggle(true)}
                        disabled={!apiKey}
                        title={!apiKey ? 'Add an API key to enable AI' : ''}
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

                  {/* AI-dependent options - Only visible when AI is ON */}
                  {aiEnabled && (
                    <>
                      {/* Tier II Vocabulary Focus */}
                      <div className="settings-section">
                        <h3>Tier II Vocabulary Focus</h3>
                        <p className="settings-description">Prioritize academic vocabulary</p>
                        <div className="ai-toggle">
                          <button
                            className={`toggle-btn ${tier2Focus ? 'active' : ''}`}
                            onClick={() => handleTier2Toggle(true)}
                          >
                            ON
                          </button>
                          <button
                            className={`toggle-btn ${!tier2Focus ? 'active' : ''}`}
                            onClick={() => handleTier2Toggle(false)}
                          >
                            OFF
                          </button>
                        </div>
                      </div>

                      {/* Extended Word Information */}
                      <div className="settings-section">
                        <h3>Extended Word Information</h3>
                        <p className="settings-description">Enable etymology and translations</p>
                        <div className="ai-toggle">
                          <button
                            className={`toggle-btn ${extendedInfo ? 'active' : ''}`}
                            onClick={() => handleExtendedInfoToggle(true)}
                          >
                            ON
                          </button>
                          <button
                            className={`toggle-btn ${!extendedInfo ? 'active' : ''}`}
                            onClick={() => handleExtendedInfoToggle(false)}
                          >
                            OFF
                          </button>
                        </div>
                      </div>

                      {/* API Configuration */}
                      <div className="settings-section">
                        <h3>API Configuration</h3>

                        {!apiKey && (
                          <div className="api-key-warning">
                            ℹ️ AI requires an Anthropic API key
                          </div>
                        )}

                        <div className="api-key-section">
                          {apiKey ? (
                            <div className="api-key-display">
                              <div className="api-key-row">
                                <span className="api-key-label">API Key:</span>
                                <span className="masked-key">{maskAPIKey(apiKey)}</span>
                              </div>
                              <div className="api-key-actions">
                                <button className="api-key-btn edit" onClick={handleAddAPIKey}>
                                  Edit
                                </button>
                                <button className="api-key-btn clear" onClick={handleClearAPIKey}>
                                  Clear
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button className="add-api-key-btn" onClick={handleAddAPIKey}>
                              Add API Key
                            </button>
                          )}
                        </div>

                        {apiKey && (
                          <div className="api-key-warning">
                            ℹ️ Your API key is stored locally in your browser. Only add your key on devices you trust.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Cloud Sync Tab */}
              {settingsTab === 'sync' && (
                <>
                  {!syncCode ? (
                    <>
                      {/* No sync code - show options to generate or enter */}
                      <div className="settings-section">
                        <h3>New Device</h3>
                        <p className="settings-description">Generate a sync code to use on other devices</p>
                        <button
                          className="add-api-key-btn"
                          onClick={handleGenerateSyncCode}
                          disabled={syncStatus === 'syncing'}
                        >
                          {syncStatus === 'syncing' ? 'Generating...' : 'Generate Sync Code'}
                        </button>
                      </div>

                      <div className="settings-section">
                        <h3>Have a Code?</h3>
                        <p className="settings-description">Enter your sync code from another device</p>
                        <div className="sync-code-input-wrapper">
                          <input
                            type="text"
                            placeholder="XXXX-YYYY"
                            value={syncCodeInput}
                            onChange={(e) => setSyncCodeInput(e.target.value.toUpperCase())}
                            maxLength={9}
                            className="sync-code-input"
                          />
                          <button
                            className="add-api-key-btn"
                            onClick={handleEnterSyncCode}
                            disabled={syncStatus === 'syncing' || !syncCodeInput.trim()}
                          >
                            {syncStatus === 'syncing' ? 'Syncing...' : 'Use Code'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Has sync code - show code and sync controls */}
                      <div className="settings-section">
                        <h3>Sync Code</h3>
                        <div className="api-key-section">
                          <div className="api-key-display">
                            <div className="api-key-row">
                              <span className="sync-code">{syncCode}</span>
                            </div>
                            <div className="api-key-actions">
                              <button
                                className="api-key-btn edit"
                                onClick={() => {
                                  navigator.clipboard.writeText(syncCode)
                                  setSyncStatus('success')
                                  setTimeout(() => setSyncStatus(null), 2000)
                                }}
                              >
                                Copy
                              </button>
                              <button
                                className="api-key-btn clear"
                                onClick={handleDisableSync}
                                disabled={syncStatus === 'syncing'}
                              >
                                Disable
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="cloud-info">
                          ℹ️ Use this code on other devices to sync your progress. Data is synced automatically after each game.
                        </div>
                      </div>

                      <div className="settings-section">
                        <h3>Sync Control</h3>
                        <button
                          className="add-api-key-btn"
                          onClick={handleSyncNow}
                          disabled={syncStatus === 'syncing'}
                        >
                          {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
                        </button>
                        <div className="cloud-info" style={{ marginTop: '0.75rem' }}>
                          ℹ️ Your API key is NOT synced for security. You'll need to add it on each device.
                        </div>
                      </div>
                    </>
                  )}

                  {/* Sync status messages */}
                  {syncStatus === 'success' && (
                    <div className="sync-message success">
                      ✓ {syncCode ? 'Synced successfully!' : 'Code copied!'}
                    </div>
                  )}
                  {syncStatus === 'error' && syncError && (
                    <div className="sync-message error">
                      ✗ {syncError}
                    </div>
                  )}
                </>
              )}

              {/* Close Button */}
              <button className="settings-close-btn" onClick={() => setShowSettingsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Learn Modal */}
      {showLearnModal && (
        <div className="modal-overlay" onClick={closeLearnModal}>
          <div className="modal learn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{currentLearnWord || targetWord}</h2>
              <button className="close-button" onClick={closeLearnModal}>
                ✕
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="learn-tabs">
              <button
                className={`learn-tab ${learnTab === 'definition' ? 'active' : ''}`}
                onClick={() => handleLearnTabChange('definition')}
              >
                Definition
              </button>
              <button
                className={`learn-tab ${learnTab === 'etymology' ? 'active' : ''}`}
                onClick={() => handleLearnTabChange('etymology')}
              >
                Etymology
              </button>
              <button
                className={`learn-tab ${learnTab === 'translations' ? 'active' : ''}`}
                onClick={() => handleLearnTabChange('translations')}
              >
                Translations
              </button>
            </div>

            <div className="learn-content">
              {/* Definition Tab */}
              {learnTab === 'definition' && (
                <>
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
                </>
              )}

              {/* Etymology Tab */}
              {learnTab === 'etymology' && (
                <>
                  {!extendedInfo ? (
                    <div className="extended-info-disabled">
                      <h3>Etymology & Word Family</h3>
                      <p>Extended word information is currently disabled.</p>
                      <button className="enable-extended-btn" onClick={handleEnableExtendedInfo}>
                        Enable Extended Info in Settings
                      </button>
                    </div>
                  ) : extendedInfoLoading ? (
                    <div className="loading-state">
                      <div className="spinner"></div>
                      <p>Loading etymology...</p>
                    </div>
                  ) : extendedInfoError ? (
                    <div className="error-state">
                      <p>Failed to load extended information.</p>
                      <button className="retry-btn" onClick={() => fetchExtendedInfo(currentLearnWord)}>
                        Retry
                      </button>
                    </div>
                  ) : extendedInfoData[currentLearnWord] ? (
                    <div className="etymology-content">
                      <h3>Etymology & Word Family</h3>

                      <div className="etymology-section">
                        <h4>Etymology:</h4>
                        <p>{extendedInfoData[currentLearnWord].e}</p>
                      </div>

                      <div className="word-family-section">
                        <h4>Word Family:</h4>
                        <ul>
                          {extendedInfoData[currentLearnWord].f.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {/* Translations Tab */}
              {learnTab === 'translations' && (
                <>
                  {!extendedInfo ? (
                    <div className="extended-info-disabled">
                      <h3>Translations</h3>
                      <p>Extended word information is currently disabled.</p>
                      <button className="enable-extended-btn" onClick={handleEnableExtendedInfo}>
                        Enable Extended Info in Settings
                      </button>
                    </div>
                  ) : extendedInfoLoading ? (
                    <div className="loading-state">
                      <div className="spinner"></div>
                      <p>Loading translations...</p>
                    </div>
                  ) : extendedInfoError ? (
                    <div className="error-state">
                      <p>Failed to load extended information.</p>
                      <button className="retry-btn" onClick={() => fetchExtendedInfo(currentLearnWord)}>
                        Retry
                      </button>
                    </div>
                  ) : extendedInfoData[currentLearnWord] ? (
                    <div className="translations-content">
                      <div className="translation-section">
                        <h3>German Translation</h3>
                        <h4>{extendedInfoData[currentLearnWord].de.w}</h4>
                        <p>{extendedInfoData[currentLearnWord].de.d}</p>
                        <div className="translation-examples">
                          <strong>Examples:</strong>
                          <ul>
                            {extendedInfoData[currentLearnWord].de.ex.map((ex, idx) => (
                              <li key={idx}>{ex}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="translation-divider"></div>

                      <div className="translation-section">
                        <h3>Croatian Translation</h3>
                        <h4>{extendedInfoData[currentLearnWord].hr.w}</h4>
                        <p>{extendedInfoData[currentLearnWord].hr.d}</p>
                        <div className="translation-examples">
                          <strong>Examples:</strong>
                          <ul>
                            {extendedInfoData[currentLearnWord].hr.ex.map((ex, idx) => (
                              <li key={idx}>{ex}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {/* Understanding Rating Section */}
              <div className="understanding-rating-section">
                <div className="rating-separator"></div>
                <h3>How well did you know this word's meaning?</h3>
                <div className="rating-buttons-compact">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                    <button
                      key={rating}
                      className={`rating-btn-compact ${pendingUnderstanding === rating ? 'selected' : ''}`}
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

      {/* Word History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Word History</h2>
              <button className="close-button" onClick={() => setShowHistoryModal(false)}>
                ✕
              </button>
            </div>

            <div className="history-content">
              {gameHistory.length === 0 ? (
                <div className="empty-history">
                  <p>No word history yet. Play some games to build your history!</p>
                </div>
              ) : (
                <>
                  <div className="history-list">
                    {gameHistory
                      .slice()
                      .reverse()
                      .slice(historyPage * 10, (historyPage + 1) * 10)
                      .map((entry, index) => (
                        <div key={index} className="history-item">
                          <div className="history-word">{entry.w}</div>
                          <div className="history-result">
                            {entry.r > 0 ? (
                              <span className="history-won">✓ Won in {entry.r} {entry.r === 1 ? 'try' : 'tries'}</span>
                            ) : (
                              <span className="history-lost">✗ Lost</span>
                            )}
                          </div>
                          <button
                            className="history-learn-btn"
                            onClick={() => handleHistoryLearnClick(entry.w)}
                          >
                            Learn
                          </button>
                        </div>
                      ))}
                  </div>

                  {gameHistory.length > 10 && (
                    <div className="history-pagination">
                      <div className="pagination-info">
                        Showing {historyPage * 10 + 1}-{Math.min((historyPage + 1) * 10, gameHistory.length)} of {gameHistory.length}
                      </div>
                      <div className="pagination-controls">
                        <button
                          className="pagination-btn"
                          onClick={() => setHistoryPage(prev => Math.max(0, prev - 1))}
                          disabled={historyPage === 0}
                        >
                          &lt; Previous
                        </button>
                        <button
                          className="pagination-btn"
                          onClick={() => setHistoryPage(prev => prev + 1)}
                          disabled={(historyPage + 1) * 10 >= gameHistory.length}
                        >
                          Next &gt;
                        </button>
                      </div>
                    </div>
                  )}

                  <button className="history-close-btn" onClick={() => setShowHistoryModal(false)}>
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Usage Panel (Dev Only) */}
      {showAIPanel && import.meta.env.DEV && (
        <div className="modal-overlay" onClick={() => setShowAIPanel(false)}>
          <div className="modal ai-usage-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>AI Usage</h2>
              <button className="close-button" onClick={() => setShowAIPanel(false)}>
                ✕
              </button>
            </div>

            <div className="ai-usage-content">
              {(() => {
                const tokenUsage = loadTokenUsage()

                if (tokenUsage.length === 0) {
                  return (
                    <div className="empty-usage">
                      <p>No AI usage data yet. Play some games with AI enabled!</p>
                    </div>
                  )
                }

                // Paginate
                const pageData = tokenUsage.slice(aiUsagePage * 10, (aiUsagePage + 1) * 10)

                // Calculate session totals across all data
                const sessionTotals = tokenUsage.reduce((acc, entry) => {
                  if (entry.wordSelection) {
                    acc.input += entry.wordSelection.input
                    acc.output += entry.wordSelection.output
                  }
                  if (entry.reasoning) {
                    acc.input += entry.reasoning.usage.input
                    acc.output += entry.reasoning.usage.output
                  }
                  if (entry.extendedInfo) {
                    acc.input += entry.extendedInfo.input
                    acc.output += entry.extendedInfo.output
                  }
                  return acc
                }, { input: 0, output: 0 })

                return (
                  <>
                    <div className="usage-list">
                      {pageData.map((entry, index) => {
                        const entryTotal = {
                          input: (entry.wordSelection?.input || 0) +
                                (entry.reasoning?.usage.input || 0) +
                                (entry.extendedInfo?.input || 0),
                          output: (entry.wordSelection?.output || 0) +
                                 (entry.reasoning?.usage.output || 0) +
                                 (entry.extendedInfo?.output || 0)
                        }

                        return (
                          <div key={index} className="usage-entry">
                            <div className="usage-word">{entry.word}</div>
                            <div className="usage-details">
                              {entry.wordSelection && (
                                <div className="usage-item">
                                  • Word selection: {entry.wordSelection.input} → {entry.wordSelection.output}
                                </div>
                              )}
                              {entry.extendedInfo && (
                                <div className="usage-item">
                                  • Extended info: {entry.extendedInfo.input} → {entry.extendedInfo.output}
                                </div>
                              )}
                              {entry.reasoning && (
                                <div className="usage-item">
                                  • Reasoning ({entry.reasoning.usage.input} → {entry.reasoning.usage.output}): "{entry.reasoning.text}"
                                </div>
                              )}
                              <div className="usage-total">
                                Total: {entryTotal.input} in, {entryTotal.output} out
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {tokenUsage.length > 10 && (
                      <div className="usage-pagination">
                        <div className="pagination-info">
                          Showing {aiUsagePage * 10 + 1}-{Math.min((aiUsagePage + 1) * 10, tokenUsage.length)} of {tokenUsage.length}
                        </div>
                        <div className="pagination-controls">
                          <button
                            className="pagination-btn"
                            onClick={() => setAIUsagePage(prev => Math.max(0, prev - 1))}
                            disabled={aiUsagePage === 0}
                          >
                            &lt; Previous
                          </button>
                          <button
                            className="pagination-btn"
                            onClick={() => setAIUsagePage(prev => prev + 1)}
                            disabled={(aiUsagePage + 1) * 10 >= tokenUsage.length}
                          >
                            Next &gt;
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="session-totals">
                      <h3>SESSION TOTAL</h3>
                      <div className="totals-grid">
                        <div>Input: {sessionTotals.input.toLocaleString()} tokens</div>
                        <div>Output: {sessionTotals.output.toLocaleString()} tokens</div>
                      </div>
                    </div>

                    <div className="usage-actions">
                      <button className="clear-usage-btn" onClick={() => {
                        if (window.confirm('Clear all AI usage data?')) {
                          clearTokenUsage()
                          setShowAIPanel(false)
                        }
                      }}>
                        Clear Usage Data
                      </button>
                      <button className="usage-close-btn" onClick={() => setShowAIPanel(false)}>
                        Close
                      </button>
                    </div>
                  </>
                )
              })()}
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
