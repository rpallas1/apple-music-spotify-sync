const path = require("path");
const AppleMusicParser = require("./src/parsers/apple-music");
const Logger = require("./src/utils/logger");

async function testParser() {
  try {
    const parser = new AppleMusicParser();

    // You'll need to provide an actual Apple Music TSV file
    const testFile = process.argv[2];

    if (!testFile) {
      Logger.error("Please provide a TSV file path as an argument");
      Logger.info(
        "Usage: node test-parser.js /path/to/your/apple-music-export.tsv",
      );
      return;
    }

    Logger.info("=== Testing Apple Music TSV Parser ===");

    const result = await parser.parseFile(testFile);

    Logger.success("Parsing Results:");
    console.log("\n📊 Metadata:");
    console.log(`  File: ${result.metadata.fileName}`);
    console.log(`  Encoding: ${result.metadata.encoding}`);
    console.log(`  Total Songs: ${result.metadata.totalSongs}`);
    console.log(`  Parsed At: ${result.metadata.parsedAt}`);

    console.log("\n📈 Statistics:");
    console.log(`  Songs with Album: ${result.metadata.stats.songsWithAlbum}`);
    console.log(`  Songs with Year: ${result.metadata.stats.songsWithYear}`);
    console.log(
      `  Songs with Duration: ${result.metadata.stats.songsWithDuration}`,
    );
    if (result.metadata.stats.averageDuration) {
      console.log(
        `  Average Duration: ${Math.floor(result.metadata.stats.averageDuration / 60)}:${(result.metadata.stats.averageDuration % 60).toString().padStart(2, "0")}`,
      );
    }

    console.log("\n🎵 Sample Songs:");
    result.songs.slice(0, 5).forEach((song, index) => {
      console.log(`  ${index + 1}. "${song.title}" by ${song.artist}`);
      if (song.album) console.log(`     Album: ${song.album}`);
      if (song.year) console.log(`     Year: ${song.year}`);
      if (song.duration)
        console.log(
          `     Duration: ${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, "0")}`,
        );
      console.log("");
    });

    if (result.songs.length > 5) {
      console.log(`  ... and ${result.songs.length - 5} more songs`);
    }
  } catch (error) {
    Logger.error(`Parser test failed: ${error.message}`);
    if (error.filename) {
      Logger.error(`File: ${error.filename}`);
    }
  }
}

testParser();
