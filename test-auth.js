const dotenv = require("dotenv");
const SpotifyAuth = require("./src/auth/spotify-auth");
const Logger = require("./src/utils/logger");

dotenv.config();

async function testAuth() {
  try {
    const auth = new SpotifyAuth();
    const tokens = await auth.authenticate();

    Logger.success("Tokens received:");
    console.log("Access Token:", tokens.accessToken.substring(0, 20) + "...");
    console.log("Refresh Token:", tokens.refreshToken.substring(0, 20) + "...");
    console.log("Expires In:", tokens.expiresIn, "seconds");

    // Test API call
    auth.setAccessToken(tokens.accessToken);
    const api = auth.getSpotifyApi();
    const me = await api.getMe();

    Logger.success(`Successfully authenticated as: ${me.body.display_name}`);
  } catch (error) {
    Logger.error(`Auth test failed: ${error.message}`);
  }
}

testAuth();
