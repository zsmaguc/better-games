import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGameHistoryEntry, generateUUID } from './gameLogic'

describe('Game History Logic', () => {
  describe('createGameHistoryEntry', () => {
    it('should create entry with all required fields', () => {
      const entry = createGameHistoryEntry('TESTS', 3, null, 'list')

      expect(entry).toHaveProperty('id')
      expect(entry).toHaveProperty('w')
      expect(entry).toHaveProperty('r')
      expect(entry).toHaveProperty('src')
      expect(entry).toHaveProperty('t')
    })

    it('should set word field correctly', () => {
      const entry = createGameHistoryEntry('GAMES', 4, null, 'ai')

      expect(entry.w).toBe('GAMES')
    })

    it('should set result field for wins', () => {
      const entry = createGameHistoryEntry('WORDS', 3, null, 'list')

      expect(entry.r).toBe(3)
    })

    it('should set result field for losses', () => {
      const entry = createGameHistoryEntry('FAILS', -1, null, 'list')

      expect(entry.r).toBe(-1)
    })

    it('should set source field for list words', () => {
      const entry = createGameHistoryEntry('TESTS', 3, null, 'list')

      expect(entry.src).toBe('list')
    })

    it('should set source field for AI words', () => {
      const entry = createGameHistoryEntry('TESTS', 3, null, 'ai')

      expect(entry.src).toBe('ai')
    })

    it('should generate unique ID for each entry', () => {
      const entry1 = createGameHistoryEntry('WORD1', 3, null, 'list')
      const entry2 = createGameHistoryEntry('WORD2', 4, null, 'list')

      expect(entry1.id).toBeDefined()
      expect(entry2.id).toBeDefined()
      expect(entry1.id).not.toBe(entry2.id)
    })

    it('should include timestamp', () => {
      const before = Date.now()
      const entry = createGameHistoryEntry('TESTS', 3, null, 'list')
      const after = Date.now()

      expect(entry.t).toBeGreaterThanOrEqual(before)
      expect(entry.t).toBeLessThanOrEqual(after)
    })

    it('should include understanding rating when provided', () => {
      const entry = createGameHistoryEntry('TESTS', 3, 8, 'list')

      expect(entry.u).toBe(8)
    })

    it('should not include understanding field when null', () => {
      const entry = createGameHistoryEntry('TESTS', 3, null, 'list')

      expect(entry).not.toHaveProperty('u')
    })

    it('should not include understanding field when undefined', () => {
      const entry = createGameHistoryEntry('TESTS', 3, undefined, 'list')

      expect(entry).not.toHaveProperty('u')
    })

    it('should handle understanding rating of 1', () => {
      const entry = createGameHistoryEntry('TESTS', 3, 1, 'list')

      expect(entry.u).toBe(1)
    })

    it('should handle understanding rating of 10', () => {
      const entry = createGameHistoryEntry('TESTS', 3, 10, 'list')

      expect(entry.u).toBe(10)
    })
  })

  describe('generateUUID', () => {
    it('should generate valid UUID v4 format', () => {
      const uuid = generateUUID()

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      expect(uuid).toMatch(uuidRegex)
    })

    it('should generate unique UUIDs', () => {
      const uuid1 = generateUUID()
      const uuid2 = generateUUID()
      const uuid3 = generateUUID()

      expect(uuid1).not.toBe(uuid2)
      expect(uuid2).not.toBe(uuid3)
      expect(uuid1).not.toBe(uuid3)
    })

    it('should always have correct length (36 characters)', () => {
      const uuid = generateUUID()

      expect(uuid.length).toBe(36)
    })

    it('should always have dashes in correct positions', () => {
      const uuid = generateUUID()

      expect(uuid[8]).toBe('-')
      expect(uuid[13]).toBe('-')
      expect(uuid[18]).toBe('-')
      expect(uuid[23]).toBe('-')
    })

    it('should always have "4" in version position (14th character)', () => {
      const uuid = generateUUID()

      expect(uuid[14]).toBe('4')
    })
  })

  describe('Game History Array Management', () => {
    it('should create multiple entries with unique IDs', () => {
      const entries = [
        createGameHistoryEntry('WORD1', 3, null, 'list'),
        createGameHistoryEntry('WORD2', 4, null, 'list'),
        createGameHistoryEntry('WORD3', 2, null, 'ai')
      ]

      const ids = entries.map(e => e.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(3)
    })

    it('should maintain chronological order by timestamp', () => {
      const entry1 = createGameHistoryEntry('WORD1', 3, null, 'list')

      // Small delay to ensure different timestamp
      vi.useFakeTimers()
      vi.advanceTimersByTime(100)

      const entry2 = createGameHistoryEntry('WORD2', 4, null, 'list')

      vi.advanceTimersByTime(100)

      const entry3 = createGameHistoryEntry('WORD3', 2, null, 'ai')

      vi.useRealTimers()

      expect(entry1.t).toBeLessThan(entry2.t)
      expect(entry2.t).toBeLessThan(entry3.t)
    })

    it('should handle batch creation of history entries', () => {
      const words = ['ALPHA', 'BRAVO', 'DELTA', 'GAMMA']
      const entries = words.map((word, idx) =>
        createGameHistoryEntry(word, idx + 1, null, 'list')
      )

      expect(entries).toHaveLength(4)
      expect(entries.every(e => e.id && e.w && e.r && e.src && e.t)).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle single-letter words', () => {
      const entry = createGameHistoryEntry('A', 1, null, 'list')

      expect(entry.w).toBe('A')
    })

    it('should handle maximum guess count (6)', () => {
      const entry = createGameHistoryEntry('TESTS', 6, null, 'list')

      expect(entry.r).toBe(6)
    })

    it('should handle minimum guess count (1)', () => {
      const entry = createGameHistoryEntry('TESTS', 1, null, 'list')

      expect(entry.r).toBe(1)
    })

    it('should handle understanding rating at boundaries', () => {
      const entry1 = createGameHistoryEntry('TESTS', 3, 0, 'list')
      const entry2 = createGameHistoryEntry('TESTS', 3, 10, 'list')

      expect(entry1.u).toBe(0)
      expect(entry2.u).toBe(10)
    })

    it('should create valid entry for lost game', () => {
      const entry = createGameHistoryEntry('FAILS', -1, null, 'list')

      expect(entry.r).toBe(-1)
      expect(entry.id).toBeDefined()
      expect(entry.t).toBeDefined()
    })

    it('should create valid entry for AI-generated word with understanding', () => {
      const entry = createGameHistoryEntry('SYNTH', 4, 7, 'ai')

      expect(entry.w).toBe('SYNTH')
      expect(entry.r).toBe(4)
      expect(entry.u).toBe(7)
      expect(entry.src).toBe('ai')
    })
  })
})
