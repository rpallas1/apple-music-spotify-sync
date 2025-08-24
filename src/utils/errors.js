/**
 * Custom error classes for the application.
 */
class SpotifyAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "SpotifyAuthError";
  }
}

class FileParsingError extends Error {
  constructor(message, filename) {
    super(message);
    this.name = "FileParsingError";
    this.filename = filename;
  }
}

class APIError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "APIError";
    this.statusCode = statusCode;
  }
}

module.exports = {
  SpotifyAuthError,
  FileParsingError,
  APIError,
};
