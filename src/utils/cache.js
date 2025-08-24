const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const Logger = require("./logger");

// Cache file location
const CACHE_DIR = path.join(__dirname, "../../.cache");
const SEARCH_CACHE_FILE = path.join(CACHE_DIR, "search-cache.json");

/**
 * Generate a unique key for a track to use in cache
 */
function generateTrackKey(track) {
  const normalizedTitle = (track.title || track.name || track.Name || "").toLowerCase().trim();
  const normalizedArtist = (track.artist || track.Artist || "").toLowerCase().trim();
  const normalizedAlbum = (track.album || track.Album || "").toLowerCase().trim();
  
  const combined = `${normalizedTitle}|${normalizedArtist}|${normalizedAlbum}`;
  return crypto.createHash('md5').update(combined).digest('hex');
}

/**
 * Load search cache from file
 */
async function loadSearchCache() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cacheData = await fs.readFile(SEARCH_CACHE_FILE, 'utf8');
    const cache = JSON.parse(cacheData);
    Logger.debug(`Loaded ${Object.keys(cache).length} cached search results`);
    return cache;
  } catch (error) {
    Logger.debug("No existing search cache found, starting fresh");
    return {};
  }
}

/**
 * Save search cache to file
 */
async function saveSearchCache(cache) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(SEARCH_CACHE_FILE, JSON.stringify(cache, null, 2));
    Logger.debug(`Saved ${Object.keys(cache).length} search results to cache`);
  } catch (error) {
    Logger.error(`Failed to save search cache: ${error.message}`);
  }
}

/**
 * Clear the search cache file
 */
async function clearSearchCache() {
  try {
    await fs.unlink(SEARCH_CACHE_FILE);
    Logger.info("Search cache cleared");
  } catch (error) {
    if (error.code !== 'ENOENT') {
      Logger.error(`Failed to clear search cache: ${error.message}`);
    }
  }
}

module.exports = {
  generateTrackKey,
  loadSearchCache,
  saveSearchCache,
  clearSearchCache
};
