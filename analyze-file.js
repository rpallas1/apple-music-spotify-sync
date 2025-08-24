const fs = require("fs").promises;

async function analyzeFile() {
  try {
    const content = await fs.readFile(
      "examples/before-21st-century.txt",
      "utf16le",
    );

    console.log("=== FILE ANALYSIS ===");
    console.log(`Total length: ${content.length} characters`);
    console.log(`First 500 characters:`);
    console.log(content.substring(0, 500));
    console.log("\n=== LOOKING FOR PATTERNS ===");

    // Look for the first few song entries
    const locationIndex = content.indexOf("Location");
    if (locationIndex !== -1) {
      const afterLocation = content.substring(
        locationIndex + "Location".length,
        locationIndex + 2000,
      );
      console.log('First 2000 characters after "Location":');
      console.log(afterLocation);

      // Count tabs to understand structure
      const tabCount = (afterLocation.match(/\t/g) || []).length;
      console.log(`\nTab count in first 2000 chars: ${tabCount}`);

      // Try to identify individual songs by looking for artist patterns
      console.log("\n=== ATTEMPTING TO IDENTIFY SONGS ===");

      // Split by tabs and analyze
      const parts = afterLocation.split("\t");
      console.log(`Total parts after splitting by tabs: ${parts.length}`);
      console.log("First 20 parts:");
      parts.slice(0, 20).forEach((part, i) => {
        console.log(`${i}: "${part}"`);
      });
    }
  } catch (error) {
    console.error("Analysis failed:", error.message);
  }
}

analyzeFile();
