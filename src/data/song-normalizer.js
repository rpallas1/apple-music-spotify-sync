const Logger = require("../utils/logger");

/**
 * Song data normalizer for cleaning and standardizing music metadata
 * Prepares Apple Music data for accurate Spotify matching
 */
class SongNormalizer {
  constructor() {
    // Common feature keywords and variations
    this.featurePatterns = [
      /\(feat\.?\s+([^)]+)\)/gi,
      /\(featuring\s+([^)]+)\)/gi,
      /\(ft\.?\s+([^)]+)\)/gi,
      /\(with\s+([^)]+)\)/gi,
      /feat\.?\s+([^,&\(]+)/gi,
      /featuring\s+([^,&\(]+)/gi,
      /ft\.?\s+([^,&\(]+)/gi,
      /with\s+([^,&\(]+)/gi,
    ];

    // Version/remix identifiers
    this.versionPatterns = [
      /\((.*?(?:remix|mix|edit|version|remaster|live|acoustic|instrumental|radio|clean|explicit|deluxe).*?)\)/gi,
      /\[(.*?(?:remix|mix|edit|version|remaster|live|acoustic|instrumental|radio|clean|explicit|deluxe).*?)\]/gi,
      /\s+-\s+(.*?(?:remix|mix|edit|version|remaster|live|acoustic|instrumental|radio|clean|explicit|deluxe).*?)$/gi,
    ];

    // Words to remove from search strings
    this.stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
    ]);

    // Invalid/suspicious patterns
    this.invalidPatterns = [
      /^track\s+\d+$/gi,
      /^unknown\s+(artist|album|title)$/gi,
      /^\d+$/, // Just numbers
      /^[^a-zA-Z]*$/, // No letters
      /^apple\s+music/gi,
    ];
  }

  /**
   * Normalize a single song object
   * @param {Object} song - Raw song data from parser
   * @returns {Object} Normalized song with additional metadata
   */
  normalizeSong(song) {
    try {
      const normalized = {
        // Original data (preserved)
        original: {
          title: song.title,
          artist: song.artist,
          album: song.album,
          genre: song.genre,
          year: song.year,
          duration: song.duration,
          playCount: song.playCount,
        },

        // Cleaned display versions
        title: this.cleanText(song.title),
        artist: this.cleanText(song.artist),
        album: this.cleanText(song.album),
        genre: this.cleanText(song.genre),
        year: this.validateYear(song.year),
        duration: this.validateDuration(song.duration),
        playCount: this.validatePlayCount(song.playCount),

        // Extracted metadata
        features: [],
        version: null,
        isLive: false,
        isRemix: false,
        isInstrumental: false,
        isExplicit: false,

        // Search-optimized strings
        searchTitle: "",
        searchArtist: "",
        searchAlbum: "",

        // Quality metrics
        quality: {
          score: 0,
          issues: [],
          confidence: "high",
        },

        // Processing metadata
        processed: {
          timestamp: new Date().toISOString(),
          processor: "SongNormalizer v1.0",
        },
      };

      // Process title
      this.processTitle(normalized);

      // Process artist
      this.processArtist(normalized);

      // Process album
      this.processAlbum(normalized);

      // Create search strings
      this.createSearchStrings(normalized);

      // Validate and score
      this.validateAndScore(normalized);

      return normalized;
    } catch (error) {
      Logger.warning(
        `Error normalizing song "${song.title}" by "${song.artist}": ${error.message}`,
      );
      return this.createFallbackNormalization(song);
    }
  }

  /**
   * Clean and standardize text
   */
  cleanText(text) {
    if (!text || typeof text !== "string") return "";

    return text
      .trim()
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[""]/g, '"') // Normalize quotes
      .replace(/['']/g, "'") // Normalize apostrophes
      .replace(/[…]/g, "...") // Normalize ellipsis
      .replace(/[–—]/g, "-") // Normalize dashes
      .replace(/^\W+|\W+$/g, "") // Remove leading/trailing non-word chars
      .trim();
  }

  /**
   * Process song title - extract features, versions, etc.
   */
  processTitle(normalized) {
    let title = normalized.title;

    if (!title) {
      normalized.quality.issues.push("missing_title");
      return;
    }

    // Extract version information
    const versionMatch = this.extractVersionInfo(title);
    if (versionMatch) {
      normalized.version = versionMatch.version;
      title = versionMatch.cleanTitle;

      // Set flags based on version
      normalized.isLive = /live/i.test(normalized.version);
      normalized.isRemix = /(remix|mix)$/i.test(normalized.version);
      normalized.isInstrumental = /instrumental/i.test(normalized.version);
      normalized.isExplicit = /explicit/i.test(normalized.version);
    }

    // Extract features from title
    const titleFeatures = this.extractFeatures(title);
    if (titleFeatures.features.length > 0) {
      normalized.features = [...normalized.features, ...titleFeatures.features];
      title = titleFeatures.cleanText;
    }

    // Apply title case
    normalized.title = this.toTitleCase(title);
  }

  /**
   * Process artist name - extract main artist and features
   */
  processArtist(normalized) {
    let artist = normalized.artist;

    if (!artist) {
      normalized.quality.issues.push("missing_artist");
      return;
    }

    // Handle "Artist, The" format
    artist = this.normalizeArticles(artist);

    // Extract features from artist field
    const artistFeatures = this.extractFeatures(artist);
    if (artistFeatures.features.length > 0) {
      normalized.features = [
        ...normalized.features,
        ...artistFeatures.features,
      ];
      artist = artistFeatures.cleanText;
    }

    // Handle multiple artists (feat, &, and)
    const multipleArtists = this.splitMultipleArtists(artist);
    normalized.artist = this.toTitleCase(multipleArtists.main);

    if (multipleArtists.additional.length > 0) {
      normalized.features = [
        ...normalized.features,
        ...multipleArtists.additional,
      ];
    }

    // Remove duplicates from features
    normalized.features = [
      ...new Set(normalized.features.map((f) => this.toTitleCase(f))),
    ];
  }

  /**
   * Process album name
   */
  processAlbum(normalized) {
    let album = normalized.album;

    if (!album) return;

    // Remove common album suffixes
    album = album
      .replace(
        /\s*\((Bonus Track Version|Deluxe Edition|Expanded Edition|Remastered|Special Edition)\)$/gi,
        "",
      )
      .replace(
        /\s*\[(Bonus Track Version|Deluxe Edition|Expanded Edition|Remastered|Special Edition)\]$/gi,
        "",
      );

    normalized.album = this.toTitleCase(album);
  }

  /**
   * Extract version information from text
   */
  extractVersionInfo(text) {
    for (const pattern of this.versionPatterns) {
      const match = text.match(pattern);
      if (match) {
        const version = match[1].trim();
        const cleanText = text.replace(pattern, "").trim();
        return { version, cleanText };
      }
    }
    return null;
  }

  /**
   * Extract featured artists from text
   */
  extractFeatures(text) {
    const features = [];
    let cleanText = text;

    for (const pattern of this.featurePatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1]) {
          // Split multiple featured artists
          const featuredArtists = match[1]
            .split(/[,&]/)
            .map((artist) => artist.trim())
            .filter((artist) => artist.length > 0);

          features.push(...featuredArtists);
          cleanText = cleanText.replace(match[0], "").trim();
        }
      }
    }

    return { features, cleanText };
  }

  /**
   * Handle "Artist, The" -> "The Artist" format
   */
  normalizeArticles(artist) {
    const articlePattern = /^(.+),\s+(the|a|an)$/i;
    const match = artist.match(articlePattern);

    if (match) {
      return `${match[2]} ${match[1]}`.trim();
    }

    return artist;
  }

  /**
   * Split multiple artists from a single field
   */
  splitMultipleArtists(artist) {
    // Handle patterns like "Artist A & Artist B", "Artist A and Artist B"
    const separators = /\s+(&|and|\+|,)\s+/i;

    if (separators.test(artist)) {
      const parts = artist
        .split(separators)
        .filter((part) => !separators.test(part));
      return {
        main: parts[0].trim(),
        additional: parts.slice(1).map((p) => p.trim()),
      };
    }

    return { main: artist, additional: [] };
  }

  /**
   * Convert to title case (proper capitalization)
   */
  toTitleCase(text) {
    if (!text) return "";

    return text
      .toLowerCase()
      .split(" ")
      .map((word) => {
        // Don't capitalize small words unless they're first/last
        if (word.length <= 3 && this.stopWords.has(word.toLowerCase())) {
          return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ")
      .replace(/^[a-z]/, (char) => char.toUpperCase()) // Capitalize first word
      .replace(/\s+[a-z]$/g, (match) => match.toUpperCase()); // Capitalize last word
  }

  /**
   * Create search-optimized strings
   */
  createSearchStrings(normalized) {
    // Create simplified search strings (lowercase, no punctuation)
    normalized.searchTitle = this.createSearchString(normalized.title);
    normalized.searchArtist = this.createSearchString(normalized.artist);
    normalized.searchAlbum = this.createSearchString(normalized.album);
  }

  /**
   * Create a search-optimized string
   */
  createSearchString(text) {
    if (!text) return "";

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim()
      .split(" ")
      .filter((word) => !this.stopWords.has(word)) // Remove stop words
      .join(" ");
  }

  /**
   * Validate year
   */
  validateYear(year) {
    if (!year) return null;

    const currentYear = new Date().getFullYear();
    const numYear = parseInt(year);

    if (numYear >= 1900 && numYear <= currentYear) {
      return numYear;
    }

    return null;
  }

  /**
   * Validate duration (in seconds)
   */
  validateDuration(duration) {
    if (!duration) return null;

    const numDuration = parseInt(duration);

    // Valid song duration: 5 seconds to 20 minutes
    if (numDuration >= 5 && numDuration <= 1200) {
      return numDuration;
    }

    return null;
  }

  /**
   * Validate play count
   */
  validatePlayCount(playCount) {
    if (!playCount) return null;

    const numPlayCount = parseInt(playCount);

    if (numPlayCount >= 0 && numPlayCount <= 100000) {
      return numPlayCount;
    }

    return null;
  }

  /**
   * Validate song data and assign quality score
   */
  validateAndScore(normalized) {
    let score = 100;
    const issues = [];

    // Check for required fields
    if (!normalized.title) {
      issues.push("missing_title");
      score -= 50;
    }

    if (!normalized.artist) {
      issues.push("missing_artist");
      score -= 50;
    }

    // Check for suspicious patterns
    if (
      normalized.title &&
      this.invalidPatterns.some((pattern) => pattern.test(normalized.title))
    ) {
      issues.push("suspicious_title");
      score -= 20;
    }

    if (
      normalized.artist &&
      this.invalidPatterns.some((pattern) => pattern.test(normalized.artist))
    ) {
      issues.push("suspicious_artist");
      score -= 20;
    }

    // Check for very short/long titles
    if (normalized.title && normalized.title.length < 2) {
      issues.push("title_too_short");
      score -= 15;
    }

    if (normalized.title && normalized.title.length > 100) {
      issues.push("title_too_long");
      score -= 10;
    }

    // Bonus points for complete metadata
    if (normalized.album) score += 5;
    if (normalized.year) score += 5;
    if (normalized.duration) score += 5;
    if (normalized.genre) score += 5;

    // Assign confidence level
    let confidence = "high";
    if (score < 70) confidence = "low";
    else if (score < 85) confidence = "medium";

    normalized.quality = {
      score: Math.max(0, Math.min(100, score)),
      issues,
      confidence,
    };
  }

  /**
   * Create a fallback normalization for problematic songs
   */
  createFallbackNormalization(song) {
    return {
      original: song,
      title: song.title || "Unknown Title",
      artist: song.artist || "Unknown Artist",
      album: song.album || "",
      genre: song.genre || "",
      year: null,
      duration: null,
      playCount: null,
      features: [],
      version: null,
      isLive: false,
      isRemix: false,
      isInstrumental: false,
      isExplicit: false,
      searchTitle: "unknown title",
      searchArtist: "unknown artist",
      searchAlbum: "",
      quality: {
        score: 0,
        issues: ["normalization_failed"],
        confidence: "low",
      },
      processed: {
        timestamp: new Date().toISOString(),
        processor: "SongNormalizer v1.0 (fallback)",
      },
    };
  }

  /**
   * Normalize an array of songs
   * @param {Array} songs - Array of raw song objects
   * @returns {Object} Results with normalized songs and statistics
   */
  normalizePlaylist(songs) {
    Logger.info(`Starting normalization of ${songs.length} songs...`);

    const startTime = Date.now();
    const normalized = [];
    const stats = {
      total: songs.length,
      processed: 0,
      highQuality: 0,
      mediumQuality: 0,
      lowQuality: 0,
      issues: {},
      features: 0,
      versions: 0,
      processingTime: 0,
    };

    for (let i = 0; i < songs.length; i++) {
      try {
        const normalizedSong = this.normalizeSong(songs[i]);
        normalized.push(normalizedSong);

        stats.processed++;

        // Track quality distribution
        if (normalizedSong.quality.confidence === "high") stats.highQuality++;
        else if (normalizedSong.quality.confidence === "medium")
          stats.mediumQuality++;
        else stats.lowQuality++;

        // Track issues
        normalizedSong.quality.issues.forEach((issue) => {
          stats.issues[issue] = (stats.issues[issue] || 0) + 1;
        });

        // Track features and versions
        if (normalizedSong.features.length > 0) stats.features++;
        if (normalizedSong.version) stats.versions++;

        // Progress logging
        if ((i + 1) % 100 === 0) {
          Logger.debug(`Normalized ${i + 1}/${songs.length} songs...`);
        }
      } catch (error) {
        Logger.warning(`Failed to normalize song ${i + 1}: ${error.message}`);
        normalized.push(this.createFallbackNormalization(songs[i]));
        stats.lowQuality++;
      }
    }

    stats.processingTime = Date.now() - startTime;

    Logger.success(
      `Normalization complete: ${stats.processed} songs processed in ${stats.processingTime}ms`,
    );
    Logger.info(
      `Quality distribution: ${stats.highQuality} high, ${stats.mediumQuality} medium, ${stats.lowQuality} low`,
    );

    return {
      songs: normalized,
      stats,
      metadata: {
        originalCount: songs.length,
        normalizedCount: normalized.length,
        processingTime: stats.processingTime,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

module.exports = SongNormalizer;
