# WordWise Testing Documentation

This directory contains the test infrastructure and documentation for the WordWise game.

## Overview

We use [Vitest](https://vitest.dev/) for unit testing, along with React Testing Library for component testing. All tests run automatically in CI/CD before deployment to prevent regressions.

## Quick Start

```bash
# Run all tests once
npm run test:run

# Run tests in watch mode (interactive development)
npm test

# Run tests with UI dashboard
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### Test Files

All test files are located alongside the code they test:

- `src/utils/gameLogic.stats.test.js` - Statistics update logic (19 tests)
- `src/utils/gameLogic.sync.test.js` - Cloud sync merge logic (16 tests)
- `src/utils/gameLogic.history.test.js` - Game history entry creation (27 tests)

**Total: 60 tests**

### Test Setup

- `src/test/setup.js` - Global test configuration
  - Configures React Testing Library cleanup
  - Mocks localStorage for testing
  - Imports jest-dom matchers

## What We Test

### 1. Statistics Logic (`gameLogic.stats.test.js`)

Tests the `updateStatistics()` function that handles game outcome tracking.

**Win Scenarios:**
- Current streak increments
- Max streak updates when exceeded
- Wins counter increments
- Played counter increments
- Guess distribution updates correctly

**Loss Scenarios:**
- **CRITICAL:** Current streak resets to 0
- Max streak remains unchanged
- Wins counter stays the same
- Played counter increments
- Guess distribution not affected

**Word Source Tracking:**
- AI-generated words tracked separately
- List words tracked separately

**Edge Cases:**
- First game ever (all stats at 0)
- Streak transitions (1 → loss, 10 → win)

### 2. Sync Merge Logic (`gameLogic.sync.test.js`)

Tests the `intelligentMerge()` function that resolves conflicts when syncing data between devices.

**Stats Merging:**
- **CRITICAL:** Current streak uses most recent device (NOT Math.max)
- Max streak uses Math.max (historical best)
- Played/wins use Math.max
- Guess distribution merges using Math.max per index

**Game History Merging:**
- Combines unique games from both devices
- Deduplicates by game ID
- Keeps most recent entry for duplicates
- Handles old entries without IDs (adds UUIDs)
- Respects MAX_HISTORY_SIZE limit (20 games)

**Used Words Merging:**
- Creates union of both word sets
- No duplicates

**Settings Merging:**
- Prefers local settings (current device)
- API key explicitly NOT synced (security)

**Edge Cases:**
- Empty remote data (first sync)
- Empty local data (new device)
- Identical data (no-op merge)

### 3. Game History Logic (`gameLogic.history.test.js`)

Tests the `createGameHistoryEntry()` and `generateUUID()` functions.

**Entry Creation:**
- All required fields present (id, w, r, src, t)
- Word field set correctly
- Result field handles wins (1-6) and losses (-1)
- Source field set correctly ('ai' or 'list')
- Unique ID generated for each entry
- Timestamp reflects creation time
- Optional understanding field (u) included when provided

**UUID Generation:**
- Valid UUID v4 format
- Unique UUIDs for each call
- Correct length (36 characters)
- Dashes in correct positions
- Version "4" in correct position

**Array Management:**
- Multiple entries have unique IDs
- Chronological ordering by timestamp
- Batch creation support

**Edge Cases:**
- Single-letter words
- Minimum/maximum guess counts
- Understanding ratings at boundaries (0-10)
- Lost games (result = -1)
- AI words with understanding ratings

## Critical Tests

These tests prevent specific bugs that occurred in production:

### Current Streak Reset on Loss
```javascript
it('CRITICAL: should reset currentStreak to 0 on loss', () => {
  const stats = { ...getInitialStats(), currentStreak: 5 }
  const result = updateStatistics(stats, 'lost', 6, 'list')
  expect(result.currentStreak).toBe(0)
})
```

**Why Critical:** This bug caused streaks to persist after losses, breaking game mechanics.

### Current Streak Sync Logic
```javascript
it('CRITICAL: currentStreak should use most recent device, not Math.max', () => {
  const localData = {
    stats: { currentStreak: 0 },
    gameHistory: [{ t: 1000 }] // More recent
  }
  const remoteData = {
    stats: { currentStreak: 5 },
    gameHistory: [{ t: 500 }] // Older
  }
  const merged = intelligentMerge(localData, remoteData)
  expect(merged.stats.currentStreak).toBe(0) // Use local (most recent)
})
```

**Why Critical:** Using Math.max for currentStreak caused incorrect streak values after sync. Current streak is time-sensitive, not cumulative.

## Test Configuration

### vitest.config.js

```javascript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,           // Enable global test APIs
    environment: 'jsdom',    // DOM environment for React
    setupFiles: './src/test/setup.js',
    css: true,              // Process CSS imports
  },
})
```

### Environment Setup

The test environment includes:
- **jsdom:** Simulates browser DOM for React components
- **localStorage mock:** Prevents errors when testing storage-dependent code
- **React Testing Library:** Utilities for testing React components
- **@testing-library/jest-dom:** Extended matchers (toBeInTheDocument, etc.)

## CI/CD Integration

Tests run automatically on every push to `main` via GitHub Actions.

**Workflow:** `.github/workflows/deploy.yml`

```yaml
- name: Run tests
  run: npm run test:run

- name: Build (only if tests pass)
  run: npm run build
```

**Result:** Build fails if any tests fail, preventing broken code from deploying.

## Writing New Tests

### General Guidelines

1. **Test pure functions** - Extract logic from React components into testable utilities
2. **One assertion per test** - Makes failures easier to diagnose
3. **Descriptive test names** - Clearly state what is being tested
4. **Arrange-Act-Assert pattern** - Set up, execute, verify
5. **Test edge cases** - Boundary values, empty data, null/undefined

### Example Test

```javascript
import { describe, it, expect } from 'vitest'
import { updateStatistics, getInitialStats } from './gameLogic'

describe('Feature Name', () => {
  it('should do something specific when condition occurs', () => {
    // Arrange: Set up test data
    const stats = { ...getInitialStats(), played: 5 }

    // Act: Execute the function
    const result = updateStatistics(stats, 'won', 3, 'list')

    // Assert: Verify the outcome
    expect(result.played).toBe(6)
  })
})
```

### Testing localStorage-dependent Code

The test setup includes a localStorage mock:

```javascript
// This works in tests thanks to the mock
localStorage.setItem('key', 'value')
const data = localStorage.getItem('key')
```

### Mocking Timestamps

Use `vi.useFakeTimers()` to control time:

```javascript
import { vi } from 'vitest'

it('should create entries with different timestamps', () => {
  vi.useFakeTimers()

  const entry1 = createGameHistoryEntry('WORD1', 3, null, 'list')

  vi.advanceTimersByTime(1000) // Advance 1 second

  const entry2 = createGameHistoryEntry('WORD2', 4, null, 'list')

  expect(entry2.t).toBeGreaterThan(entry1.t)

  vi.useRealTimers()
})
```

## Test Coverage

To generate a coverage report:

```bash
npm run test:coverage
```

This produces:
- Terminal summary of coverage percentages
- HTML report in `coverage/` directory

**Coverage Goals:**
- Critical game logic: 100%
- Utility functions: 95%+
- React components: 80%+

## Troubleshooting

### Tests Fail Locally But Pass in CI

- Check Node.js version (CI uses Node 20)
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check for environment-specific code

### localStorage Errors

If you see "localStorage is not defined":
- Verify `setupFiles: './src/test/setup.js'` in vitest.config.js
- Check that setup.js includes the localStorage mock

### React Component Errors

If testing React components:
- Import cleanup: `import { cleanup } from '@testing-library/react'`
- Use `afterEach(() => cleanup())` in test setup
- Wrap components with necessary providers (if using Context)

### Timeout Errors

Increase test timeout for slow operations:

```javascript
it('should handle slow operation', async () => {
  // Test code
}, 10000) // 10 second timeout
```

## Best Practices

1. **Run tests before committing:** `npm run test:run`
2. **Keep tests fast:** Avoid unnecessary delays or complex setup
3. **Test behavior, not implementation:** Focus on what the code does, not how
4. **Use descriptive names:** Test names should read like documentation
5. **Mark critical tests:** Add "CRITICAL" to test names that prevent major bugs
6. **Update tests with code changes:** Keep tests in sync with implementation

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Jest-DOM Matchers](https://github.com/testing-library/jest-dom)

## Maintenance

### Adding New Test Files

1. Create test file next to the code: `feature.test.js`
2. Import test functions from vitest
3. Write tests following existing patterns
4. Run `npm run test:run` to verify

### Updating Existing Tests

When code changes:
1. Update affected tests to match new behavior
2. Add new tests for new functionality
3. Run full test suite to catch regressions
4. Update this documentation if test structure changes

### Removing Tests

Only remove tests if:
- The feature no longer exists
- The test is truly redundant (exact duplicate)
- The test was incorrectly written and needs replacement

**Never remove tests just because they fail** - Fix the code or update the test.
