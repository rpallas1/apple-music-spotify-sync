const AppleMusicParser = require("./src/parsers/apple-music");
const SongNormalizer = require("./src/data/song-normalizer");
const SpotifyAuth = require("./src/auth/spotify-auth");
const SpotifySearchService = require("./src/spotify/search");
const Logger = require("./src/utils/logger");

async function runSpotifySearchTest() {
  try {
    Logger.info("=== Spotify Search Test ===");

    // Step 1: Parse Apple Music file
    const parser = new AppleMusicParser();
    const { songs } = await parser.parseFile(
      "examples/before-21st-century.txt",
    );

    // Step 2: Normalize songs
    const normalizer = new SongNormalizer();
    const normalized = normalizer.normalizePlaylist(songs).songs;

    // Step 3: Authenticated Spotify API client (IMPORTANT: this sets tokens!)
    const spotifyAuth = new SpotifyAuth();
    await spotifyAuth.authenticate(); // This sets access/refresh tokens
    const spotifyApi = spotifyAuth.getSpotifyApi(); // This instance has tokens

    // Step 4: Pass the authenticated instance to search service
    const spotifySearch = new SpotifySearchService(spotifyApi);
    const sample = normalized.slice(0, 200);
    const results = await spotifySearch.searchPlaylistSmart(sample);

    // Step 5: Print results
    results.forEach(({ song, match }, i) => {
      console.log(`\n${i + 1}. "${song.title}" by ${song.artist}`);
      if (match) {
        console.log(
          `   ➡️ Found: "${match.name}" by ${match.artists.map((a) => a.name).join(", ")}`,
        );
        console.log(`   Spotify ID: ${match.id}`);
        console.log(`   Album: ${match.album.name}`);
        console.log(`   Preview: ${match.preview_url}`);
      } else {
        console.log("   ❌ No match found");
      }
    });
  } catch (err) {
    Logger.error(`Test failed: ${err.message}`);
  }
}

runSpotifySearchTest();
