const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const Logger = require("../utils/logger");
const { SpotifyAuthError } = require("../utils/errors");

/**
 * Token management system for storing and refreshing Spotify tokens
 */
class TokenManager {
  constructor() {
    // Store tokens in user's home directory (hidden folder)
    this.tokenDir = path.join(os.homedir(), ".apple-music-spotify-sync");
    this.tokenFile = path.join(this.tokenDir, "spotify-tokens.json");
  }

  /**
   * Ensure the token directory exists
   */
  async ensureTokenDir() {
    try {
      await fs.mkdir(this.tokenDir, { recursive: true });
    } catch (err) {
      throw new SpotifyAuthError(
        `Could not create token directory: ${err.message}`,
      );
    }
  }

  /**
   * Save tokens to disk
   * @param {Object} tokens - Object containing accessToken, refreshToken, expiresIn
   */
  async saveTokens(tokens) {
    try {
      await this.ensureTokenDir();

      const tokenData = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000, // Convert to milliseconds
        savedAt: Date.now(),
      };

      await fs.writeFile(this.tokenFile, JSON.stringify(tokenData, null, 2));
      Logger.success("Tokens saved successfully");
    } catch (err) {
      throw new SpotifyAuthError(`Could not save tokens: ${err.message}`);
    }
  }

  /**
   * Load tokens from disk
   * @returns {Object|null} Token data or null if not found
   */
  async loadTokens() {
    try {
      const data = await fs.readFile(this.tokenFile, "utf8");
      const tokens = JSON.parse(data);

      Logger.debug("Tokens loaded from disk");
      return tokens;
    } catch (err) {
      if (err.code === "ENOENT") {
        Logger.debug("No saved tokens found");
        return null;
      }
      throw new SpotifyAuthError(`Could not load tokens: ${err.message}`);
    }
  }

  /**
   * Check if tokens exist and are valid
   * @returns {boolean} True if valid tokens exist
   */
  async hasValidTokens() {
    const tokens = await this.loadTokens();

    if (!tokens) {
      return false;
    }

    // Check if access token has expired (with 5 minute buffer)
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

    if (tokens.expiresAt < fiveMinutesFromNow) {
      Logger.debug("Access token has expired");
      return false;
    }

    Logger.debug("Valid tokens found");
    return true;
  }

  /**
   * Refresh the access token using the refresh token
   * @param {SpotifyWebApi} spotifyApi - The Spotify API client
   * @returns {Object} New token data
   */
  async refreshTokens(spotifyApi) {
    try {
      const tokens = await this.loadTokens();

      if (!tokens || !tokens.refreshToken) {
        throw new SpotifyAuthError("No refresh token available");
      }

      Logger.info("Refreshing access token...");

      spotifyApi.setRefreshToken(tokens.refreshToken);
      const data = await spotifyApi.refreshAccessToken();

      const newTokens = {
        accessToken: data.body.access_token,
        refreshToken: tokens.refreshToken, // Keep the original refresh token
        expiresIn: data.body.expires_in,
      };

      // If Spotify provided a new refresh token, use it
      if (data.body.refresh_token) {
        newTokens.refreshToken = data.body.refresh_token;
      }

      await this.saveTokens(newTokens);
      Logger.success("Access token refreshed successfully");

      return newTokens;
    } catch (err) {
      throw new SpotifyAuthError(`Could not refresh tokens: ${err.message}`);
    }
  }

  /**
   * Clear saved tokens (for logout)
   */
  async clearTokens() {
    try {
      await fs.unlink(this.tokenFile);
      Logger.info("Tokens cleared");
    } catch (err) {
      if (err.code !== "ENOENT") {
        Logger.warning(`Could not clear tokens: ${err.message}`);
      }
    }
  }

  /**
   * Get token file path (for debugging)
   * @returns {string} Path to token file
   */
  getTokenFilePath() {
    return this.tokenFile;
  }
}

module.exports = TokenManager;
