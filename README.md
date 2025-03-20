# Twitter Mirror

An automated system for monitoring, translating, and republishing Twitter threads. Built with TypeScript and Node.js.

## Features

- 🔄 Real-time Twitter thread monitoring
- 🌐 Automatic translation support
- 📝 Thread analysis and relationship mapping
- 📤 Automated republishing with media support
- 🚦 Rate limiting and queue management
- 📊 Event-driven architecture

## Prerequisites

- Node.js (v18 or higher)
- SQLite
- PM2 (for production deployment)

## Installation

1. Clone the repository:
```bash
git clone git@github.com:frmachao/twitter-mirror.git
cd twitter-mirror
```

2. Install dependencies:
```bash
npm install
```

3. Create and configure your `.env` file:
```env
# Twitter API Configuration
TWITTER_CONFIG=[{"name":"account1","targetUserId":"...", "oauth":{"apiKey":"...","apiSecret":"...","accessToken":"...","accessTokenSecret":"..."}}]

# Translation Settings
TRANSLATION_PROVIDER=moonshot
TRANSLATION_SOURCE_LANG=en
TRANSLATION_TARGET_LANG=zh
MOONSHOT_API_KEY=your_api_key
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1

# Monitoring Settings
CRON_MONITOR="*/15 * * * *"  # Every 15 minutes
```

## Development

1. Build the project:
```bash
npm run build
```

2. Start in development mode:
```bash
npm run dev
```

## Production Deployment

1. Build the project:
```bash
npm run build
```

2. Start with PM2:
```bash
npm run pm2:start:prod
```

Other PM2 commands:
- `npm run pm2:stop` - Stop the application
- `npm run pm2:restart` - Restart the application
- `npm run pm2:logs` - View logs
- `npm run pm2:monit` - Monitor the application

## Architecture

The system consists of several core components:
- **Monitor Service**: Watches for new tweets from specified users
- **Thread Analyzer**: Analyzes tweet relationships and builds thread structures
- **Translation Service**: Handles content translation using configured providers
- **Publisher Service**: Manages the republishing of translated content

Each component operates independently and communicates through an event bus system.

## Error Handling

The system includes:
- Graceful shutdown handling
- Automatic restart on failure
- Queue-based task processing with retry mechanisms
- Comprehensive logging
