const dotenv = require("dotenv");
dotenv.config();

const SpotifyWebApi = require("spotify-web-api-node");
const Logger = require("./src/utils/logger");
const playlistUtils = require("./src/spotify/playlist");
const trackManager = require("./src/spotify/trackManager");
const AppleMusicParser = require("./src/parsers/apple-music"); // CORRECT parser import
const SpotifyAuth = require("./src/auth/spotify-auth"); // Auth handler with token management
const { searchTrack } = require("./src/spotify/search"); // Import the searchTrack function

async function main() {
  // 1. Read playlist file path from CLI argument
  const appleMusicFile = process.argv[2];
  if (!appleMusicFile) {
    Logger.error("Usage: npm start <apple_music_playlist.tsv>");
    process.exit(1);
  }

  // 2. Authenticate Spotify
  const spotifyAuth = new SpotifyAuth();
  await spotifyAuth.authenticate(); // Handles OAuth and stores tokens
  const spotifyApi = spotifyAuth.getSpotifyApi(); // Authenticated instance

  // 3. Parse the Apple Music playlist -- instantiate the parser class!
  const parser = new AppleMusicParser();
  const parseResult = await parser.parseFile(appleMusicFile);
  const applePlaylistName =
    (parseResult.metadata && parseResult.metadata.fileName) ||
    "Imported Playlist";

  // 4. Get user profile from Spotify
  const me = await spotifyApi.getMe();
  if (!me || !me.body || !me.body.id) {
    Logger.error("Failed to get Spotify user profile:", me);
    process.exit(1);
  }

  // 5. Run playlist selection/creation flow (no userId param needed anymore!)
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

  // 6. Search for Spotify URIs for Apple Music tracks
  Logger.info(
    `Searching for ${parseResult.tracks.length} tracks on Spotify...`,
  );

  const trackResults = [];
  const batchSize = 10; // Process tracks in batches to avoid rate limits

  for (let i = 0; i < parseResult.tracks.length; i += batchSize) {
    const batch = parseResult.tracks.slice(i, i + batchSize);
    const batchPromises = batch.map(async (track) => {
      try {
        const searchResult = await searchTrack(spotifyApi, {
          title: track.title || track.name,
          artist: track.artist,
          album: track.album,
        });

        if (searchResult && searchResult.uri) {
          Logger.info(
            `Found: ${track.artist} - ${track.title} (confidence: ${searchResult.confidence?.toFixed(2) || "N/A"})`,
          );
          return {
            ...track,
            spotifyUri: searchResult.uri,
            matched: true,
            confidence: searchResult.confidence,
          };
        } else {
          Logger.warning(`Not found: ${track.artist} - ${track.title}`);
          return {
            ...track,
            matched: false,
          };
        }
      } catch (error) {
        Logger.error(
          `Error searching for ${track.artist} - ${track.title}: ${error.message}`,
        );
        return {
          ...track,
          matched: false,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    trackResults.push(...batchResults);

    // Small delay between batches to respect rate limits
    if (i + batchSize < parseResult.tracks.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // 7. Filter successful matches and extract URIs
  const matchedTracks = trackResults.filter((track) => track.matched);
  const trackUris = matchedTracks.map((track) => track.spotifyUri);

  Logger.info(
    `Found ${matchedTracks.length} out of ${parseResult.tracks.length} tracks on Spotify`,
  );

  if (!trackUris.length) {
    Logger.warning("No tracks found on Spotify. Exiting.");
    process.exit(0);
  }

  // 8. Add tracks to the playlist, handle duplicates, batch operations
  const addedCount = await trackManager.addTracksToPlaylist(
    spotifyApi,
    targetPlaylist.id,
    trackUris,
  );

  Logger.info(
    `Sync complete. Added ${addedCount} tracks to playlist "${targetPlaylist.name}".`,
  );

  // Log summary of unmatched tracks
  const unmatchedTracks = trackResults.filter((track) => !track.matched);
  if (unmatchedTracks.length > 0) {
    Logger.warning(
      `${unmatchedTracks.length} tracks could not be found on Spotify:`,
    );
    unmatchedTracks.forEach((track) => {
      Logger.warning(`  - ${track.artist} - ${track.title}`);
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
