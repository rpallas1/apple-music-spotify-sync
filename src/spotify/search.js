const Logger = require("../utils/logger");
const stringSimilarity = require("string-similarity");

// Helper to normalize strings for comparison
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[\W_]+/g, " ") // Remove punctuation, replace with space
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

class SpotifySearchService {
  constructor(spotifyApi) {
    this.spotifyApi = spotifyApi;
    this.maxRetries = 3;
    this.baseDelay = 1000;
  }

  /**
   * Try multiple search strategies, return best match with confidence
   */
  async searchTrackSmart(song) {
    const strategies = [
      {
        name: "track+artist (exact)",
        getQuery: (s) => `track:${s.searchTitle} artist:${s.searchArtist}`,
      },
      {
        name: "track+artist (loose)",
        getQuery: (s) =>
          `track:${normalize(s.searchTitle)} artist:${normalize(s.searchArtist)}`,
      },
      { name: "track-only", getQuery: (s) => `track:${s.searchTitle}` },
      { name: "artist-only", getQuery: (s) => `artist:${s.searchArtist}` },
    ];

    for (let strategy of strategies) {
      const result = await this.searchWithStrategy(song, strategy);
      if (result && result.match && result.confidence > 0.5) {
        Logger.info(
          `Matched: "${song.title}" -> ${result.match.name} (${strategy.name}, confidence=${result.confidence.toFixed(2)})`,
        );
        return result;
      }
    }
    Logger.info(`No good match for "${song.title}" by "${song.artist}"`);
    return { song, match: null, confidence: 0, strategy: null };
  }

  /**
   * Search using a strategy, score candidates, pick best
   */
  async searchWithStrategy(song, strategy) {
    const query = strategy.getQuery(song);
    let attempt = 0,
      lastError = null;

    while (attempt <= this.maxRetries) {
      try {
        Logger.debug(
          `Searching Spotify (${strategy.name}, attempt ${attempt + 1}): ${query}`,
        );
        const result = await this.spotifyApi.searchTracks(query, { limit: 5 });
        if (result.body.tracks.items.length > 0) {
          const best = this.scoreAndSelectBestMatch(
            song,
            result.body.tracks.items,
          );
          return {
            song,
            match: best.match,
            confidence: best.confidence,
            strategy: strategy.name,
          };
        }
        return null;
      } catch (err) {
        lastError = err;
        // Rate limiting
        if (err.statusCode === 429) {
          const retryAfterSec = parseInt(
            err.headers?.["retry-after"] || "1",
            10,
          );
          const delay = Math.max(
            this.baseDelay * Math.pow(2, attempt),
            retryAfterSec * 1000,
          );
          Logger.warning(
            `Rate limit hit, retrying after ${delay / 1000}s (attempt ${attempt + 1}/${this.maxRetries + 1})...`,
          );
          await new Promise((r) => setTimeout(r, delay));
          attempt++;
          continue;
        }
        Logger.error(
          `Spotify search error for "${song.title}": ${err.message}`,
        );
        break;
      }
    }
    return null;
  }

  /**
   * Score all candidates, pick best
   */
  scoreAndSelectBestMatch(song, candidates) {
    const normTitle = normalize(song.title);
    const normArtist = normalize(song.artist);

    let best = { match: null, confidence: 0 };
    candidates.forEach((candidate) => {
      const candTitle = normalize(candidate.name);
      const candArtists = candidate.artists
        .map((a) => normalize(a.name))
        .join(" ");
      // Score: weighted fuzzy match (title 70%, artist 30%)
      const titleScore = stringSimilarity.compareTwoStrings(
        normTitle,
        candTitle,
      );
      const artistScore = stringSimilarity.compareTwoStrings(
        normArtist,
        candArtists,
      );
      const confidence = 0.7 * titleScore + 0.3 * artistScore;
      if (confidence > best.confidence) best = { match: candidate, confidence };
    });
    return best;
  }

  /**
   * Smart search for all songs in a playlist
   */
  async searchPlaylistSmart(normalizedSongs) {
    const matches = [];
    for (const song of normalizedSongs) {
      const result = await this.searchTrackSmart(song);
      matches.push(result);
    }
    return matches;
  }
}

/**
 * Simple wrapper function for compatibility with index.js
 * @param {SpotifyWebApi} spotifyApi - Authenticated Spotify API instance
 * @param {Object} trackInfo - Track information
 * @param {string} trackInfo.title - Song title
 * @param {string} trackInfo.artist - Artist name
 * @param {string} [trackInfo.album] - Album name (optional)
 * @returns {Object|null} - Spotify track info with URI, or null if not found
 */
async function searchTrack(spotifyApi, { title, artist, album }) {
  const searchService = new SpotifySearchService(spotifyApi);
  
  // Format the track data for the smart search
  const song = {
    title: title,
    artist: artist,
    album: album,
    searchTitle: title,
    searchArtist: artist
  };
  
  const result = await searchService.searchTrackSmart(song);
  
  if (result && result.match && result.confidence > 0.5) {
    return {
      uri: result.match.uri,
      id: result.match.id,
      name: result.match.name,
      artists: result.match.artists.map(a => a.name),
      album: result.match.album.name,
      confidence: result.confidence
    };
  }
  
  return null;
}

module.exports = {
  SpotifySearchService,
  searchTrack
};
