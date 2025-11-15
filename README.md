# WordWise

An educational word-guessing game that adapts to your skill level using AI.

## Features

- **Adaptive Difficulty**: AI analyzes your performance and selects appropriately challenging words
- **Educational Focus**: Learn definitions and example sentences after each game
- **Progress Tracking**: Comprehensive statistics and streak tracking
- **Multi-language Support**: Definitions available in English, German, and Croatian (coming soon)
- **Personalized Learning**: Rate your understanding to help AI choose better words for you

## How It Works

WordWise is like Wordle, but smarter. Instead of random words, an AI assistant analyzes your game history and selects words that match your vocabulary level - challenging enough to help you learn, but not so difficult that you'll give up.

After each game, you can view the word's definition and example sentences, then rate how well you knew it. This feedback helps the AI choose even better words for your next game.

## Getting Started

### Play Online

Visit [https://zsmaguc.github.io/better-games/](https://YOUR_USERNAME.github.io/better-games/)

### Setup for AI Features

1. Get a free API key from [Anthropic](https://console.anthropic.com/)
2. Click the Settings icon in WordWise
3. Add your API key
4. Enable AI Word Selection

Your API key is stored locally in your browser and never sent to our servers.

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Local Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/better-games.git
cd better-games

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to play locally.

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Tech Stack

- **Frontend**: React + Vite
- **Styling**: CSS (custom light theme)
- **AI**: Claude (Anthropic) via Cloudflare Workers proxy
- **Hosting**: GitHub Pages
- **Deployment**: GitHub Actions

## Privacy & Cost

- **Your API Key**: Stored only in your browser's localStorage
- **Your Data**: Game history stored locally, never sent to any server
- **AI Costs**: You pay only for your own API usage (typically <$2 per 10,000 games)
- **No Tracking**: No analytics, no cookies, no data collection

## Project Structure

```
better-games/
├── src/
│   ├── components/
│   │   └── WordWise.jsx      # Main game component
│   ├── data/
│   │   ├── wordle-answers.txt    # Curated word list
│   │   └── wordle-allowed.txt    # Valid guesses
│   └── App.jsx
├── cloudflare-worker/
│   └── worker.js             # CORS proxy for API calls
└── .github/
    └── workflows/
        └── deploy-worker.yml # Auto-deploy worker
```

## Contributing

This is a personal learning project, but suggestions and bug reports are welcome!

## License

MIT License - feel free to use this code for your own projects.

## Acknowledgments

- Word lists sourced from the original Wordle game
- Definitions from [Free Dictionary API](https://dictionaryapi.dev/)
- AI powered by [Anthropic's Claude](https://www.anthropic.com/)

---

**Note**: This is an educational tool to help expand vocabulary. It is not affiliated with or endorsed by the New York Times or the original Wordle game.