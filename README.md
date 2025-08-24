# Apple MusicSpotify Sync

CLI tool to sync Apple Music playlists to Spotify with interactive song matching.

## Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/rpallas1/apple-music-to-spotify-sync.git
   cd apple-music-spotify-sync
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up Spotify API credentials**

   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications)
   - Create a new app or use your existing one
   - Add `http://127.0.0.1:8888/callback` as a redirect URI
   - Copy your Client ID and Client Secret

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your actual Spotify credentials.

## Usage

```bash
npm start
```

## Features

- 🎵 Parse Apple Music playlist exports (TSV format)
- 🔍 Smart song matching with Spotify search
- 🎨 Interactive CLI with progress bars and album art
- ✅ Manual confirmation for uncertain matches
- 🔄 Sync support for playlist updates
