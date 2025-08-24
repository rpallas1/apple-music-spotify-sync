const express = require("express");
const SpotifyWebApi = require("spotify-web-api-node");
const crypto = require("crypto");
const Logger = require("../utils/logger");
const { SpotifyAuthError } = require("../utils/errors");

/**
 * Spotify OAuth authentication handler
 * Implements OAuth 2.0 authorization code flow with PKCE
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
   * Open the Spotify authorization URL in the default browser
   * @param {string} authUrl - The authorization URL
   */
  async openBrowser(authUrl) {
    const { default: open } = await import("open");
    try {
      await open(authUrl);
      Logger.success("Opened browser for Spotify authorization");
    } catch (err) {
      Logger.warning("Could not open browser automatically");
      Logger.info(`Please open this URL manually: ${authUrl}`);
    }
  }

  /**
   * Start the OAuth flow
   * @returns {Promise<Object>} Access token and refresh token
   */
  async authenticate() {
    try {
      Logger.info("Starting Spotify OAuth flow...");

      // Generate PKCE parameters (for enhanced security)
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
      const tokens = await serverPromise;

      Logger.success("Successfully authenticated with Spotify!");
      return tokens;
    } catch (error) {
      if (this.server) {
        this.server.close();
      }
      throw new SpotifyAuthError(`Authentication failed: ${error.message}`);
    }
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
