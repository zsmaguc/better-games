/**
 * Pure utility functions for WordWise game logic
 * These functions are extracted to make them easily testable
 */

const MAX_HISTORY_SIZE = 20

/**
 * Get initial stats object
 */
export const getInitialStats = () => ({
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0],
  aiWords: 0,
  listWords: 0
})

/**
 * Generate UUID v4
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Update statistics based on game outcome
 * @param {Object} currentStats - Current statistics
 * @param {string} status - Game status ('won' or 'lost')
 * @param {number} guessCount - Number of guesses (1-6)
 * @param {string} source - Word source ('ai' or 'list')
 * @returns {Object} Updated statistics
 */
export function updateStatistics(currentStats, status, guessCount, source) {
  const newStats = { ...currentStats }
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
  } else {
    newStats.currentStreak = 0
  }

  return newStats
}

/**
 * Intelligently merge local and remote data for sync
 * @param {Object} localData - Local game data
 * @param {Object} remoteData - Remote game data
 * @returns {Object} Merged data
 */
export function intelligentMerge(localData, remoteData) {
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

/**
 * Create a game history entry
 * @param {string} word - The target word
 * @param {number} result - Number of guesses to win (1-6), or -1 for loss
 * @param {number|null} understanding - Understanding rating (1-10)
 * @param {string} source - Word source ('ai' or 'list')
 * @returns {Object} Game history entry
 */
export function createGameHistoryEntry(word, result, understanding, source) {
  const entry = {
    id: generateUUID(),
    w: word,
    r: result,
    src: source,
    t: Date.now()
  }

  if (understanding !== null && understanding !== undefined) {
    entry.u = understanding
  }

  return entry
}
