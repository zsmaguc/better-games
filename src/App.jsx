import { useState } from 'react'
import './App.css'

function App() {
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
          status="Coming Soon"
        />
      </main>

      <footer className="footer">
        <p>Made with React + Vite</p>
      </footer>
    </div>
  )
}

function GameCard({ title, description, emoji, status }) {
  return (
    <div className="game-card">
      <div className="game-emoji">{emoji}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="game-button" disabled={status === "Coming Soon"}>
        {status === "Coming Soon" ? "Coming Soon" : "Play Now"}
      </button>
    </div>
  )
}

export default App