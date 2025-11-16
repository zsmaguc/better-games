import { describe, it, expect } from 'vitest'
import { getInitialStats, updateStatistics } from './gameLogic'

describe('Stats Logic', () => {
  describe('updateStatistics - Win scenarios', () => {
    it('should increment currentStreak on win', () => {
      const stats = { ...getInitialStats(), currentStreak: 3 }
      const result = updateStatistics(stats, 'won', 4, 'list')

      expect(result.currentStreak).toBe(4)
    })

    it('should update maxStreak if currentStreak exceeds it', () => {
      const stats = { ...getInitialStats(), currentStreak: 5, maxStreak: 5 }
      const result = updateStatistics(stats, 'won', 3, 'list')

      expect(result.currentStreak).toBe(6)
      expect(result.maxStreak).toBe(6)
    })

    it('should keep maxStreak same if currentStreak is lower', () => {
      const stats = { ...getInitialStats(), currentStreak: 2, maxStreak: 10 }
      const result = updateStatistics(stats, 'won', 3, 'list')

      expect(result.currentStreak).toBe(3)
      expect(result.maxStreak).toBe(10)
    })

    it('should increment wins counter', () => {
      const stats = { ...getInitialStats(), wins: 5 }
      const result = updateStatistics(stats, 'won', 3, 'list')

      expect(result.wins).toBe(6)
    })

    it('should increment played counter', () => {
      const stats = { ...getInitialStats(), played: 10 }
      const result = updateStatistics(stats, 'won', 3, 'list')

      expect(result.played).toBe(11)
    })

    it('should update guess distribution for win in 1 guess', () => {
      const stats = getInitialStats()
      const result = updateStatistics(stats, 'won', 1, 'list')

      expect(result.guessDistribution[0]).toBe(1)
      expect(result.guessDistribution[1]).toBe(0)
    })

    it('should update guess distribution for win in 6 guesses', () => {
      const stats = getInitialStats()
      const result = updateStatistics(stats, 'won', 6, 'list')

      expect(result.guessDistribution[5]).toBe(1)
      expect(result.guessDistribution[0]).toBe(0)
    })
  })

  describe('updateStatistics - Loss scenarios', () => {
    it('CRITICAL: should reset currentStreak to 0 on loss', () => {
      const stats = { ...getInitialStats(), currentStreak: 5 }
      const result = updateStatistics(stats, 'lost', 6, 'list')

      expect(result.currentStreak).toBe(0)
    })

    it('should keep maxStreak unchanged on loss', () => {
      const stats = { ...getInitialStats(), currentStreak: 5, maxStreak: 10 }
      const result = updateStatistics(stats, 'lost', 6, 'list')

      expect(result.maxStreak).toBe(10)
    })

    it('should increment played counter on loss', () => {
      const stats = { ...getInitialStats(), played: 10 }
      const result = updateStatistics(stats, 'lost', 6, 'list')

      expect(result.played).toBe(11)
    })

    it('should not increment wins counter on loss', () => {
      const stats = { ...getInitialStats(), wins: 5 }
      const result = updateStatistics(stats, 'lost', 6, 'list')

      expect(result.wins).toBe(5)
    })

    it('should not affect guess distribution on loss', () => {
      const stats = getInitialStats()
      const result = updateStatistics(stats, 'lost', 6, 'list')

      expect(result.guessDistribution).toEqual([0, 0, 0, 0, 0, 0])
    })
  })

  describe('updateStatistics - Word source tracking', () => {
    it('should track AI words', () => {
      const stats = { ...getInitialStats(), aiWords: 3 }
      const result = updateStatistics(stats, 'won', 3, 'ai')

      expect(result.aiWords).toBe(4)
      expect(result.listWords).toBe(0)
    })

    it('should track list words', () => {
      const stats = { ...getInitialStats(), listWords: 5 }
      const result = updateStatistics(stats, 'won', 3, 'list')

      expect(result.listWords).toBe(6)
      expect(result.aiWords).toBe(0)
    })
  })

  describe('updateStatistics - Edge cases', () => {
    it('should handle first game ever (all stats at 0)', () => {
      const stats = getInitialStats()
      const result = updateStatistics(stats, 'won', 3, 'list')

      expect(result.played).toBe(1)
      expect(result.wins).toBe(1)
      expect(result.currentStreak).toBe(1)
      expect(result.maxStreak).toBe(1)
    })

    it('should handle streak of 1 then loss', () => {
      const stats = { ...getInitialStats(), currentStreak: 1, maxStreak: 1 }
      const result = updateStatistics(stats, 'lost', 6, 'list')

      expect(result.currentStreak).toBe(0)
      expect(result.maxStreak).toBe(1)
    })

    it('should handle streak of 10 then win', () => {
      const stats = { ...getInitialStats(), currentStreak: 10, maxStreak: 10 }
      const result = updateStatistics(stats, 'won', 4, 'ai')

      expect(result.currentStreak).toBe(11)
      expect(result.maxStreak).toBe(11)
    })
  })
})
