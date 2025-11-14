import { useState } from 'react'
import './App.css'
import WordWise from './components/WordWise'

function App() {
  const [currentPage, setCurrentPage] = useState('home')

  if (currentPage === 'wordwise') {
    return (
      <div className="app">
        <button
          className="back-button"
          onClick={() => setCurrentPage('home')}
        >
          ← Back to Games
        </button>
        <WordWise />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🎮 Better Games</h1>
        <p>Better games to boost your everyday skills</p>
      </header>

      <main className="games-grid">
        <GameCard
          title="WordWise"
          description="Educational word guessing game"
          emoji="📚"
          onClick={() => setCurrentPage('wordwise')}
        />
      </main>

      <footer className="footer">
        <p>Made with React + Vite</p>
      </footer>
    </div>
  )
}

function GameCard({ title, description, emoji, onClick }) {
  return (
    <div className="game-card">
      <div className="game-emoji">{emoji}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="game-button" onClick={onClick}>
        Play Now
      </button>
    </div>
  )
}

export default App