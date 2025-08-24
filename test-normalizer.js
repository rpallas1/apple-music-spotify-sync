const AppleMusicParser = require("./src/parsers/apple-music");
const SongNormalizer = require("./src/data/song-normalizer");
const SongValidator = require("./src/data/song-validator");
const Logger = require("./src/utils/logger");

async function testNormalization() {
  try {
    Logger.info("=== Testing Song Normalization & Validation ===");

    // Step 1: Parse the file
    const parser = new AppleMusicParser();
    const parseResult = await parser.parseFile(
      "examples/before-21st-century.txt",
    );

    Logger.info(`📁 Parsed ${parseResult.songs.length} songs from Apple Music`);

    // Step 2: Normalize the songs
    const normalizer = new SongNormalizer();
    const normalizeResult = normalizer.normalizePlaylist(parseResult.songs);

    Logger.success(`🧼 Normalized ${normalizeResult.songs.length} songs`);

    // Step 3: Validate the songs
    const validator = new SongValidator();
    const validationReport = validator.generateReport(normalizeResult.songs);

    // Step 4: Filter songs
    const filterResult = validator.filterSongs(normalizeResult.songs, {
      minQualityScore: 60,
      allowLowConfidence: false,
      removeInvalid: true,
    });

    // Display results
    console.log("\n📊 NORMALIZATION RESULTS:");
    console.log(`  Original Songs: ${parseResult.songs.length}`);
    console.log(`  Normalized Songs: ${normalizeResult.songs.length}`);
    console.log(`  High Quality: ${normalizeResult.stats.highQuality}`);
    console.log(`  Medium Quality: ${normalizeResult.stats.mediumQuality}`);
    console.log(`  Low Quality: ${normalizeResult.stats.lowQuality}`);
    console.log(`  Songs with Features: ${normalizeResult.stats.features}`);
    console.log(`  Songs with Versions: ${normalizeResult.stats.versions}`);
    console.log(`  Processing Time: ${normalizeResult.stats.processingTime}ms`);

    console.log("\n✅ VALIDATION RESULTS:");
    console.log(`  Valid Songs: ${validationReport.summary.valid}`);
    console.log(`  Invalid Songs: ${validationReport.summary.invalid}`);
    console.log(`  High Confidence: ${validationReport.summary.highQuality}`);
    console.log(
      `  Medium Confidence: ${validationReport.summary.mediumQuality}`,
    );
    console.log(`  Low Confidence: ${validationReport.summary.lowQuality}`);

    console.log("\n🔍 FILTERING RESULTS:");
    console.log(`  Songs Ready for Spotify: ${filterResult.stats.valid}`);
    console.log(
      `  Songs Filtered Out: ${filterResult.stats.filtered + filterResult.stats.invalid}`,
    );
    console.log(`  Songs with Warnings: ${filterResult.warnings.length}`);

    console.log("\n🎵 SAMPLE NORMALIZED SONGS:");
    filterResult.valid.slice(0, 5).forEach((song, index) => {
      console.log(`  ${index + 1}. "${song.title}" by ${song.artist}`);
      if (song.album) console.log(`     Album: ${song.album}`);
      if (song.year) console.log(`     Year: ${song.year}`);
      if (song.features.length > 0)
        console.log(`     Features: ${song.features.join(", ")}`);
      if (song.version) console.log(`     Version: ${song.version}`);
      console.log(
        `     Quality: ${song.quality.score}/100 (${song.quality.confidence})`,
      );
      console.log(
        `     Search: "${song.searchTitle}" - "${song.searchArtist}"`,
      );
      console.log("");
    });

    if (validationReport.recommendations.length > 0) {
      console.log("\n💡 RECOMMENDATIONS:");
      validationReport.recommendations.forEach((rec) => {
        console.log(`  • ${rec}`);
      });
    }

    // Show common issues
    if (Object.keys(validationReport.issues).length > 0) {
      console.log("\n⚠️  COMMON ISSUES:");
      Object.entries(validationReport.issues).forEach(([issue, count]) => {
        console.log(`  • ${issue}: ${count} songs`);
      });
    }
  } catch (error) {
    Logger.error(`Normalization test failed: ${error.message}`);
  }
}

testNormalization();
