const express = require("express");
const SpotifyWebApi = require("spotify-web-api-node");
const crypto = require("crypto");
const Logger = require("../utils/logger");
const TokenManager = require("./token-manager");
const { SpotifyAuthError } = require("../utils/errors");

/**
 * Spotify OAuth authentication handler with persistent token management
 */
class SpotifyAuth {
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    this.port = process.env.OAUTH_PORT || 8888;

    if (!this.clientId || !this.clientSecret) {
      throw new SpotifyAuthError(
        "Spotify credentials not found in environment variables",
      );
    }

    this.spotifyApi = new SpotifyWebApi({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: this.redirectUri,
    });

    this.tokenManager = new TokenManager();
    this.server = null;
    this.authPromise = null;
  }

  /**
   * Generate PKCE code verifier and challenge
   * @returns {Object} Object with codeVerifier and codeChallenge
   */
  generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    return { codeVerifier, codeChallenge };
  }

  /**
   * Start the OAuth server and wait for callback
   * @returns {Promise<Object>} Promise that resolves with auth tokens
   */
  startOAuthServer() {
    return new Promise((resolve, reject) => {
      const app = express();

      // Store the resolve/reject functions
      this.authResolve = resolve;
      this.authReject = reject;

      // Serve a simple success page
      app.get("/callback", async (req, res) => {
        try {
          const { code, error, state } = req.query;

          if (error) {
            res.send(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h1 style="color: #e22134;">❌ Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            return this.authReject(
              new SpotifyAuthError(`Authorization failed: ${error}`),
            );
          }

          if (!code) {
            res.send(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h1 style="color: #e22134;">❌ No Authorization Code</h1>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            return this.authReject(
              new SpotifyAuthError("No authorization code received"),
            );
          }

          // Exchange authorization code for tokens
          Logger.info("Exchanging authorization code for tokens...");
          const data = await this.spotifyApi.authorizationCodeGrant(code);

          res.send(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #1db954;">✅ Authorization Successful!</h1>
                <p>You can now close this window and return to your terminal.</p>
                <script>
                  setTimeout(() => window.close(), 2000);
                </script>
              </body>
            </html>
          `);

          // Close the server
          this.server.close();

          this.authResolve({
            accessToken: data.body.access_token,
            refreshToken: data.body.refresh_token,
            expiresIn: data.body.expires_in,
          });
        } catch (err) {
          Logger.error(`Token exchange failed: ${err.message}`);
          res.send(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #e22134;">❌ Token Exchange Failed</h1>
                <p>${err.message}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          this.authReject(err);
        }
      });

      // Start the server
      this.server = app.listen(this.port, () => {
        Logger.info(`OAuth callback server started on port ${this.port}`);
      });

      // Handle server errors
      this.server.on("error", (err) => {
        this.authReject(new SpotifyAuthError(`Server error: ${err.message}`));
      });
    });
  }

  /**
   * Open the Spotify authorization URL in preferred browser
   * @param {string} authUrl - The authorization URL
   */
  async openBrowser(authUrl) {
    const { default: open } = await import("open");
    const preferredBrowser = process.env.PREFERRED_BROWSER;

    try {
      if (preferredBrowser) {
        await open(authUrl, { app: { name: preferredBrowser } });
        Logger.success(`Opened ${preferredBrowser} for Spotify authorization`);
      } else {
        await open(authUrl);
        Logger.success("Opened default browser for Spotify authorization");
      }
    } catch (error) {
      Logger.warning(
        `Could not open ${preferredBrowser || "browser"} automatically`,
      );
      Logger.info(`Please open this URL manually: ${authUrl}`);
    }
  }

  /**
   * Main authentication method - handles both new auth and token refresh
   * @param {boolean} forceReauth - Force new authentication even if valid tokens exist
   * @returns {Promise<Object>} Access token and refresh token
   */
  async authenticate(forceReauth = false) {
    try {
      // Check for existing valid tokens first
      if (!forceReauth && (await this.tokenManager.hasValidTokens())) {
        Logger.info("Using existing valid tokens");
        const tokens = await this.tokenManager.loadTokens();

        this.spotifyApi.setAccessToken(tokens.accessToken);
        this.spotifyApi.setRefreshToken(tokens.refreshToken);

        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: Math.floor((tokens.expiresAt - Date.now()) / 1000),
        };
      }

      // Try to refresh tokens if we have a refresh token
      const existingTokens = await this.tokenManager.loadTokens();
      if (!forceReauth && existingTokens && existingTokens.refreshToken) {
        try {
          Logger.info("Attempting to refresh expired tokens...");
          const refreshedTokens = await this.tokenManager.refreshTokens(
            this.spotifyApi,
          );

          this.spotifyApi.setAccessToken(refreshedTokens.accessToken);
          this.spotifyApi.setRefreshToken(refreshedTokens.refreshToken);

          return refreshedTokens;
        } catch (refreshError) {
          Logger.warning(
            "Token refresh failed, starting new authentication flow",
          );
        }
      }

      // Start new OAuth flow
      Logger.info("Starting new Spotify OAuth flow...");
      const tokens = await this.performOAuthFlow();

      // Save the new tokens
      await this.tokenManager.saveTokens(tokens);

      this.spotifyApi.setAccessToken(tokens.accessToken);
      this.spotifyApi.setRefreshToken(tokens.refreshToken);

      return tokens;
    } catch (error) {
      if (this.server) {
        this.server.close();
      }
      throw new SpotifyAuthError(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Perform the OAuth flow (extracted from original authenticate method)
   * @returns {Promise<Object>} Tokens from OAuth flow
   */
  async performOAuthFlow() {
    // Generate PKCE parameters
    const { codeVerifier, codeChallenge } = this.generatePKCE();

    // Define the scopes we need
    const scopes = [
      "playlist-read-private",
      "playlist-read-collaborative",
      "playlist-modify-private",
      "playlist-modify-public",
      "user-library-read",
    ];

    // Create authorization URL
    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = this.spotifyApi.createAuthorizeURL(scopes, state);

    Logger.info("Opening Spotify authorization page...");

    // Start the OAuth server
    const serverPromise = this.startOAuthServer();

    // Open the browser
    await this.openBrowser(authUrl);

    Logger.info("Waiting for authorization...");
    Logger.info("Please authorize the application in your browser");

    // Wait for the OAuth callback
    return await serverPromise;
  }

  /**
   * Logout - clear saved tokens
   */
  async logout() {
    await this.tokenManager.clearTokens();
    Logger.success("Logged out successfully");
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} True if authenticated
   */
  async isAuthenticated() {
    return await this.tokenManager.hasValidTokens();
  }

  /**
   * Set access token for the Spotify API client
   * @param {string} accessToken - The access token
   */
  setAccessToken(accessToken) {
    this.spotifyApi.setAccessToken(accessToken);
  }

  /**
   * Set refresh token for the Spotify API client
   * @param {string} refreshToken - The refresh token
   */
  setRefreshToken(refreshToken) {
    this.spotifyApi.setRefreshToken(refreshToken);
  }

  /**
   * Get the configured Spotify API client
   * @returns {SpotifyWebApi} The Spotify API client
   */
  getSpotifyApi() {
    return this.spotifyApi;
  }
}

module.exports = SpotifyAuth;
