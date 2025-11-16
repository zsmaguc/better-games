import { describe, it, expect } from 'vitest'
import { intelligentMerge, getInitialStats } from './gameLogic'

describe('Sync Merge Logic', () => {
  describe('Merging Stats', () => {
    it('CRITICAL: currentStreak should use most recent device, not Math.max', () => {
      const localData = {
        stats: { ...getInitialStats(), currentStreak: 0, played: 10 },
        gameHistory: [{ id: '1', w: 'WORD', r: -1, src: 'list', t: 1000 }],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: { ...getInitialStats(), currentStreak: 5, played: 10 },
        gameHistory: [{ id: '2', w: 'TEST', r: 3, src: 'list', t: 500 }],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      // Local has more recent game (t: 1000 vs 500), so use local currentStreak
      expect(merged.stats.currentStreak).toBe(0)
    })

    it('should use remote currentStreak if remote has more recent game', () => {
      const localData = {
        stats: { ...getInitialStats(), currentStreak: 5, played: 10 },
        gameHistory: [{ id: '1', w: 'WORD', r: 3, src: 'list', t: 500 }],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: { ...getInitialStats(), currentStreak: 0, played: 10 },
        gameHistory: [{ id: '2', w: 'TEST', r: -1, src: 'list', t: 1000 }],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      // Remote has more recent game (t: 1000 vs 500), so use remote currentStreak
      expect(merged.stats.currentStreak).toBe(0)
    })

    it('should use Math.max for maxStreak (historical best)', () => {
      const localData = {
        stats: { ...getInitialStats(), maxStreak: 15 },
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: { ...getInitialStats(), maxStreak: 10 },
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.stats.maxStreak).toBe(15)
    })

    it('should use Math.max for played counter', () => {
      const localData = {
        stats: { ...getInitialStats(), played: 20 },
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: { ...getInitialStats(), played: 15 },
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.stats.played).toBe(20)
    })

    it('should use Math.max for wins counter', () => {
      const localData = {
        stats: { ...getInitialStats(), wins: 18 },
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: { ...getInitialStats(), wins: 12 },
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.stats.wins).toBe(18)
    })

    it('should merge guess distributions using Math.max per index', () => {
      const localData = {
        stats: { ...getInitialStats(), guessDistribution: [5, 10, 8, 3, 1, 0] },
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: { ...getInitialStats(), guessDistribution: [3, 12, 6, 5, 2, 1] },
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.stats.guessDistribution).toEqual([5, 12, 8, 5, 2, 1])
    })
  })

  describe('Merging Game History', () => {
    it('should combine unique games from both devices', () => {
      const localData = {
        stats: getInitialStats(),
        gameHistory: [
          { id: '1', w: 'WORD1', r: 3, src: 'list', t: 1000 }
        ],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: getInitialStats(),
        gameHistory: [
          { id: '2', w: 'WORD2', r: 4, src: 'list', t: 2000 }
        ],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.gameHistory).toHaveLength(2)
      expect(merged.gameHistory.map(g => g.id)).toContain('1')
      expect(merged.gameHistory.map(g => g.id)).toContain('2')
    })

    it('should deduplicate by gameId and keep most recent', () => {
      const localData = {
        stats: getInitialStats(),
        gameHistory: [
          { id: '1', w: 'WORD', r: 3, src: 'list', t: 1000 }
        ],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: getInitialStats(),
        gameHistory: [
          { id: '1', w: 'WORD', r: 4, src: 'list', t: 2000 }  // Same ID, newer timestamp
        ],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.gameHistory).toHaveLength(1)
      expect(merged.gameHistory[0].r).toBe(4)  // Should keep remote (newer)
      expect(merged.gameHistory[0].t).toBe(2000)
    })

    it('should handle old entries without IDs by adding UUIDs', () => {
      const localData = {
        stats: getInitialStats(),
        gameHistory: [
          { w: 'OLDGAME', r: 3, src: 'list' }  // No ID or timestamp
        ],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.gameHistory).toHaveLength(1)
      expect(merged.gameHistory[0].id).toBeDefined()
      expect(merged.gameHistory[0].t).toBeDefined()
    })

    it('should respect MAX_HISTORY_SIZE limit (20 games)', () => {
      const manyGames = Array.from({ length: 15 }, (_, i) => ({
        id: `local-${i}`,
        w: `WORD${i}`,
        r: 3,
        src: 'list',
        t: i * 100
      }))

      const moreGames = Array.from({ length: 10 }, (_, i) => ({
        id: `remote-${i}`,
        w: `TEST${i}`,
        r: 4,
        src: 'list',
        t: (i + 15) * 100
      }))

      const localData = {
        stats: getInitialStats(),
        gameHistory: manyGames,
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: getInitialStats(),
        gameHistory: moreGames,
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.gameHistory).toHaveLength(20)
      // Should keep most recent 20
      expect(merged.gameHistory[0].id).toBe('local-5')  // Oldest kept
      expect(merged.gameHistory[19].id).toBe('remote-9')  // Most recent
    })
  })

  describe('Merging Used Words', () => {
    it('should create union of both word sets', () => {
      const localData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: ['WORD1', 'WORD2', 'WORD3'],
        settings: {}
      }

      const remoteData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: ['WORD3', 'WORD4', 'WORD5'],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.usedWords).toHaveLength(5)
      expect(merged.usedWords).toContain('WORD1')
      expect(merged.usedWords).toContain('WORD2')
      expect(merged.usedWords).toContain('WORD3')
      expect(merged.usedWords).toContain('WORD4')
      expect(merged.usedWords).toContain('WORD5')
    })
  })

  describe('Merging Settings', () => {
    it('should prefer local settings', () => {
      const localData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: [],
        settings: { aiEnabled: true, tier2Focus: true }
      }

      const remoteData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: [],
        settings: { aiEnabled: false, tier2Focus: false }
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.settings.aiEnabled).toBe(true)
      expect(merged.settings.tier2Focus).toBe(true)
    })

    it('should not include apiKey in merged settings (security)', () => {
      const localData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: [],
        settings: { aiEnabled: true }
      }

      const remoteData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: [],
        settings: { aiEnabled: true }
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.settings.apiKey).toBeUndefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty remote data (first sync)', () => {
      const localData = {
        stats: { ...getInitialStats(), played: 10, wins: 8 },
        gameHistory: [{ id: '1', w: 'WORD', r: 3, src: 'list', t: 1000 }],
        usedWords: ['WORD1', 'WORD2'],
        settings: { aiEnabled: true }
      }

      const remoteData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.stats.played).toBe(10)
      expect(merged.stats.wins).toBe(8)
      expect(merged.gameHistory).toHaveLength(1)
      expect(merged.usedWords).toHaveLength(2)
    })

    it('should handle empty local data (new device)', () => {
      const localData = {
        stats: getInitialStats(),
        gameHistory: [],
        usedWords: [],
        settings: {}
      }

      const remoteData = {
        stats: { ...getInitialStats(), played: 10, wins: 8 },
        gameHistory: [{ id: '1', w: 'WORD', r: 3, src: 'list', t: 1000 }],
        usedWords: ['WORD1', 'WORD2'],
        settings: { aiEnabled: true }
      }

      const merged = intelligentMerge(localData, remoteData)

      expect(merged.stats.played).toBe(10)
      expect(merged.stats.wins).toBe(8)
      expect(merged.gameHistory).toHaveLength(1)
      expect(merged.usedWords).toHaveLength(2)
    })

    it('should handle identical data (no-op merge)', () => {
      const identicalData = {
        stats: { ...getInitialStats(), played: 5, wins: 3 },
        gameHistory: [{ id: '1', w: 'WORD', r: 3, src: 'list', t: 1000 }],
        usedWords: ['WORD1'],
        settings: { aiEnabled: true }
      }

      const merged = intelligentMerge(identicalData, identicalData)

      expect(merged.stats.played).toBe(5)
      expect(merged.stats.wins).toBe(3)
      expect(merged.gameHistory).toHaveLength(1)
      expect(merged.usedWords).toHaveLength(1)
    })
  })
})
