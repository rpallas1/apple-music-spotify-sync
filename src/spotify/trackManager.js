const Logger = require("../utils/logger");

/**
 * Fetch all tracks from a Spotify playlist (handles paging).
 * Returns an array of track URIs.
 */
async function fetchAllPlaylistTrackUris(spotifyApi, playlistId) {
  const trackUris = [];
  let offset = 0;
  const limit = 100;
  let total = null;

  try {
    do {
      const resp = await spotifyApi.getPlaylistTracks(playlistId, {
        offset,
        limit,
      });
      const items = (resp.body && resp.body.items) || [];
      trackUris.push(...items.map((item) => item.track.uri));
      total = resp.body && resp.body.total;
      offset += items.length;
    } while (total !== null && offset < total);
  } catch (err) {
    Logger.error(
      `Error fetching tracks from playlist ${playlistId}: ${err.message}`,
    );
    throw err;
  }
  return trackUris;
}

/**
 * Adds tracks to a Spotify playlist, handling duplicates and batching for efficiency.
 * - Only adds tracks that aren't already present.
 * - Batches additions in groups of 100 (Spotify API limit).
 * - Logs progress and results.
 * Returns the number of tracks added.
 */
async function addTracksToPlaylist(spotifyApi, playlistId, trackUris) {
  Logger.debug(
    `Preparing to add ${trackUris.length} tracks to playlist ${playlistId}.`,
  );
  // 1. Fetch current playlist tracks
  let existingUris;
  try {
    existingUris = await fetchAllPlaylistTrackUris(spotifyApi, playlistId);
  } catch (err) {
    Logger.error("Failed to fetch existing tracks.");
    throw err;
  }
  Logger.debug(`Playlist currently has ${existingUris.length} tracks.`);

  // 2. Filter out duplicates
  const urisToAdd = trackUris.filter((uri) => !existingUris.includes(uri));
  if (urisToAdd.length === 0) {
    Logger.info(
      "No new tracks to add (all provided tracks already exist in playlist).",
    );
    return 0;
  }
  Logger.info(`Adding ${urisToAdd.length} new tracks to playlist.`);

  // 3. Batch additions (max 100 per request)
  let addedCount = 0;
  for (let i = 0; i < urisToAdd.length; i += 100) {
    const batch = urisToAdd.slice(i, i + 100);
    try {
      await spotifyApi.addTracksToPlaylist(playlistId, batch);
      Logger.info(
        `Added batch of ${batch.length} tracks (${addedCount + 1} - ${addedCount + batch.length}).`,
      );
      addedCount += batch.length;
    } catch (err) {
      Logger.error(
        `Failed to add batch starting at index ${i}: ${err.message}`,
      );
      // Optionally, continue to next batch or break
      break;
    }
  }
  Logger.info(`Finished adding tracks. Total added: ${addedCount}`);
  return addedCount;
}

module.exports = {
  fetchAllPlaylistTrackUris,
  addTracksToPlaylist,
};
