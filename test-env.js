require("dotenv").config();

console.log("🔧 Environment Configuration Test");
console.log("================================");
console.log(
  "Client ID:",
  process.env.SPOTIFY_CLIENT_ID ? "✅ Set" : "❌ Missing",
);
console.log(
  "Client Secret:",
  process.env.SPOTIFY_CLIENT_SECRET ? "✅ Set" : "❌ Missing",
);
console.log("Redirect URI:", process.env.SPOTIFY_REDIRECT_URI || "❌ Missing");
console.log("Port:", process.env.PORT || "8888 (default)");

if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
  console.log("\n❌ Please set up your .env file with Spotify credentials");
  process.exit(1);
}

console.log("\n✅ Environment configured correctly!");
