const dotenv = require("dotenv");
dotenv.config();

const SpotifyWebApi = require("spotify-web-api-node");
const Logger = require("./src/utils/logger");
const playlistUtils = require("./src/spotify/playlist");
const trackManager = require("./src/spotify/trackManager");
const AppleMusicParser = require("./src/parsers/apple-music");
const SpotifyAuth = require("./src/auth/spotify-auth");
const { searchTrack } = require("./src/spotify/search");
const { isTrackAlreadyInPlaylistDetailed } = require("./src/utils/track-comparison");
const { generateTrackKey, loadSearchCache, saveSearchCache } = require("./src/utils/cache");

async function main() {
  // 1. Read playlist file path from CLI argument
  const appleMusicFile = process.argv[2];
  if (!appleMusicFile) {
    Logger.error("Usage: npm start <apple_music_playlist.tsv>");
    process.exit(1);
  }

  // 2. Authenticate Spotify
  const spotifyAuth = new SpotifyAuth();
  await spotifyAuth.authenticate();
  const spotifyApi = spotifyAuth.getSpotifyApi();

  // 3. Parse the Apple Music playlist
  const parser = new AppleMusicParser();
  const parseResult = await parser.parseFile(appleMusicFile);
  
  // Debug: Log the structure of parseResult to understand what we're getting
  Logger.debug("Parse result structure:", Object.keys(parseResult));
  Logger.debug("Parse result:", parseResult);
  
  const applePlaylistName =
    (parseResult.metadata && parseResult.metadata.fileName) ||
    "Imported Playlist";

  // Handle different possible structures from the parser
  let tracks;
  if (parseResult.tracks) {
    tracks = parseResult.tracks;
  } else if (parseResult.songs) {
    tracks = parseResult.songs;
  } else if (Array.isArray(parseResult)) {
    tracks = parseResult;
  } else {
    Logger.error("Could not find tracks in parse result. Available properties:", Object.keys(parseResult));
    process.exit(1);
  }

  Logger.info(`Found ${tracks.length} tracks to sync`);

  // 4. Get user profile from Spotify
  const me = await spotifyApi.getMe();
  if (!me || !me.body || !me.body.id) {
    Logger.error("Failed to get Spotify user profile:", me);
    process.exit(1);
  }

  // 5. Run playlist selection/creation flow
  const targetPlaylist = await playlistUtils.selectOrCreatePlaylistFlow(
    spotifyApi,
    applePlaylistName,
  );
  if (!targetPlaylist) {
    Logger.error("No playlist selected or created. Exiting.");
    process.exit(1);
  }
  Logger.info(
    `Selected playlist: "${targetPlaylist.name}" (${targetPlaylist.id})`,
  );

  // 6. Get existing tracks from the Spotify playlist
  Logger.info("Fetching existing tracks from Spotify playlist...");
  const existingTracks = await playlistUtils.getPlaylistTracks(spotifyApi, targetPlaylist.id);
  const existingTrackUris = new Set(existingTracks.map(track => track.uri));
  Logger.info(`Found ${existingTracks.length} existing tracks in playlist`);

  // 7. Load search cache and identify tracks to search
  Logger.info("Loading search cache...");
  const searchCache = await loadSearchCache();
  
  const tracksToSearch = [];
  const cachedResults = [];
  let cacheHits = 0;
  
  tracks.forEach(track => {
    const trackKey = generateTrackKey(track);
    if (searchCache[trackKey]) {
      // Found in cache
      cachedResults.push({
        ...track,
        ...searchCache[trackKey],
        fromCache: true
      });
      cacheHits++;
    } else {
      // Need to search
      tracksToSearch.push({ ...track, _cacheKey: trackKey });
    }
  });

  Logger.info(`Cache hits: ${cacheHits}/${tracks.length} tracks (${((cacheHits/tracks.length)*100).toFixed(1)}%)`);
  Logger.info(`Need to search: ${tracksToSearch.length} tracks`);

  // 8. Search for tracks not in cache
  const newSearchResults = [];
  if (tracksToSearch.length > 0) {
    Logger.info(`Searching for ${tracksToSearch.length} new tracks on Spotify...`);
    
    const batchSize = 10;
    for (let i = 0; i < tracksToSearch.length; i += batchSize) {
      const batch = tracksToSearch.slice(i, i + batchSize);
      const batchPromises = batch.map(async (track) => {
        try {
          const searchResult = await searchTrack(spotifyApi, {
            title: track.title || track.name || track.Name,
            artist: track.artist || track.Artist,
            album: track.album || track.Album
          });
          
          let result;
          if (searchResult && searchResult.uri) {
            Logger.info(
              `Found: ${track.artist || track.Artist} - ${track.title || track.name || track.Name} (confidence: ${searchResult.confidence?.toFixed(2) || "N/A"})`,
            );
            result = {
              ...track,
              spotifyUri: searchResult.uri,
              spotifyTrackInfo: {
                name: searchResult.name,
                artists: searchResult.artists,
                album: searchResult.album
              },
              matched: true,
              confidence: searchResult.confidence,
            };
          } else {
            Logger.warning(`Not found: ${track.artist || track.Artist} - ${track.title || track.name || track.Name}`);
            result = {
              ...track,
              matched: false,
            };
          }

          // Update cache
          searchCache[track._cacheKey] = {
            spotifyUri: result.spotifyUri,
            spotifyTrackInfo: result.spotifyTrackInfo,
            matched: result.matched,
            confidence: result.confidence,
            cachedAt: new Date().toISOString()
          };

          return result;
        } catch (error) {
          Logger.error(
            `Error searching for ${track.artist || track.Artist} - ${track.title || track.name || track.Name}: ${error.message}`,
          );
          const result = {
            ...track,
            matched: false,
          };

          // Cache the failure too (to avoid re-searching)
          searchCache[track._cacheKey] = {
            matched: false,
            cachedAt: new Date().toISOString(),
            error: error.message
          };

          return result;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      newSearchResults.push(...batchResults);

      // Small delay between batches to respect rate limits
      if (i + batchSize < tracksToSearch.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Save updated cache
    await saveSearchCache(searchCache);
  }

  // 9. Combine cached and new results
  const allTrackResults = [...cachedResults, ...newSearchResults];

  // 10. Filter successful matches and use smart duplicate detection
  const matchedTracks = allTrackResults.filter((track) => track.matched);
  
  // Smart duplicate filtering - check against existing tracks
  const newTracksToAdd = [];
  const smartDuplicates = [];
  
  matchedTracks.forEach(track => {
    const trackForComparison = {
      name: track.spotifyTrackInfo?.name || track.title || track.name || track.Name,
      artists: track.spotifyTrackInfo?.artists || [track.artist || track.Artist],
      album: track.spotifyTrackInfo?.album || track.album || track.Album
    };
    
    const duplicateResult = isTrackAlreadyInPlaylistDetailed(trackForComparison, existingTracks);
    
    if (duplicateResult.isDuplicate) {
      smartDuplicates.push({
        track,
        method: duplicateResult.method,
        confidence: duplicateResult.confidence
      });
      Logger.debug(`Smart duplicate detected: ${track.artist || track.Artist} - ${track.title || track.name || track.Name} (${duplicateResult.method}, confidence: ${duplicateResult.confidence.toFixed(2)})`);
    } else {
      newTracksToAdd.push(track);
    }
  });

  const newTrackUris = newTracksToAdd.map(track => track.spotifyUri);
  const duplicateCount = smartDuplicates.length;

  Logger.info(`Found ${matchedTracks.length} out of ${tracks.length} tracks on Spotify`);
  Logger.info(`${duplicateCount} tracks already exist in playlist (smart detection), ${newTrackUris.length} new tracks to add`);

  if (!newTrackUris.length) {
    Logger.info("No new tracks to add. Playlist is already up to date!");
    
    // Still show summary of unmatched tracks
    const unmatchedTracks = allTrackResults.filter((track) => !track.matched);
    if (unmatchedTracks.length > 0) {
      Logger.warning(
        `${unmatchedTracks.length} tracks could not be found on Spotify:`,
      );
      unmatchedTracks.forEach((track) => {
        Logger.warning(`  - ${track.artist || track.Artist} - ${track.title || track.name || track.Name}`);
      });
    }
    
    return;
  }

  // 11. Add only new tracks to the playlist
  Logger.info(`Adding ${newTrackUris.length} new tracks to playlist...`);
  const addedCount = await trackManager.addTracksToPlaylist(
    spotifyApi,
    targetPlaylist.id,
    newTrackUris,
  );

  Logger.info(
    `Sync complete! Added ${addedCount} new tracks to playlist "${targetPlaylist.name}".`,
  );
  
  // Summary statistics
  Logger.info(`\n📊 Sync Summary:`);
  Logger.info(`  • Total Apple Music tracks: ${tracks.length}`);
  Logger.info(`  • Cache hits: ${cacheHits} (${((cacheHits/tracks.length)*100).toFixed(1)}%)`);
  Logger.info(`  • New searches: ${tracksToSearch.length}`);
  Logger.info(`  • Found on Spotify: ${matchedTracks.length}`);
  Logger.info(`  • Smart duplicates detected: ${duplicateCount}`);
  Logger.info(`  • Newly added: ${addedCount}`);
  Logger.info(`  • Not found: ${allTrackResults.filter(t => !t.matched).length}`);

  // Log summary of unmatched tracks
  const unmatchedTracks = allTrackResults.filter((track) => !track.matched);
  if (unmatchedTracks.length > 0) {
    Logger.warning(`\n❌ Tracks not found on Spotify:`);
    unmatchedTracks.forEach((track) => {
      Logger.warning(`  - ${track.artist || track.Artist} - ${track.title || track.name || track.Name}`);
    });
  }
}

if (require.main === module) {
  main().catch((err) => {
    Logger.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = main;