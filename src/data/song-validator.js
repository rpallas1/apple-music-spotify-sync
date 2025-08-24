const Logger = require("../utils/logger");

/**
 * Song data validator for quality checks and filtering
 */
class SongValidator {
  constructor() {
    this.requiredFields = ["title", "artist"];
    this.optionalFields = ["album", "genre", "year", "duration"];
  }

  /**
   * Validate a single normalized song
   * @param {Object} song - Normalized song object
   * @returns {Object} Validation result with status and issues
   */
  validateSong(song) {
    const validation = {
      isValid: true,
      issues: [],
      warnings: [],
      score: song.quality?.score || 0,
      confidence: song.quality?.confidence || "unknown",
    };

    // Check required fields
    this.requiredFields.forEach((field) => {
      if (!song[field] || song[field].trim() === "") {
        validation.issues.push(`missing_${field}`);
        validation.isValid = false;
      }
    });

    // Check for suspicious content
    if (song.title && this.isSuspiciousContent(song.title)) {
      validation.warnings.push("suspicious_title_content");
    }

    if (song.artist && this.isSuspiciousContent(song.artist)) {
      validation.warnings.push("suspicious_artist_content");
    }

    // Check data consistency
    if (
      song.year &&
      (song.year < 1900 || song.year > new Date().getFullYear())
    ) {
      validation.warnings.push("invalid_year");
    }

    if (song.duration && (song.duration < 5 || song.duration > 1800)) {
      validation.warnings.push("unusual_duration");
    }

    // Adjust validity based on quality score
    if (validation.score < 50) {
      validation.isValid = false;
      validation.issues.push("low_quality_score");
    }

    return validation;
  }

  /**
   * Check for suspicious content patterns
   */
  isSuspiciousContent(text) {
    const suspiciousPatterns = [
      /^track\s*\d+$/i,
      /^unknown/i,
      /^untitled/i,
      /^\d+$/,
      /^[^a-zA-Z0-9]*$/,
      /test|debug|sample/i,
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(text));
  }

  /**
   * Filter songs based on validation criteria
   * @param {Array} songs - Array of normalized songs
   * @param {Object} options - Filtering options
   * @returns {Object} Filtered results
   */
  filterSongs(songs, options = {}) {
    const {
      minQualityScore = 50,
      allowLowConfidence = false,
      removeInvalid = true,
    } = options;

    Logger.info(
      `Filtering ${songs.length} songs with criteria: minScore=${minQualityScore}, allowLowConf=${allowLowConfidence}`,
    );

    const results = {
      valid: [],
      invalid: [],
      warnings: [],
      stats: {
        total: songs.length,
        valid: 0,
        invalid: 0,
        filtered: 0,
      },
    };

    songs.forEach((song) => {
      const validation = this.validateSong(song);

      if (!validation.isValid && removeInvalid) {
        results.invalid.push({ song, validation });
        results.stats.invalid++;
        return;
      }

      if (validation.score < minQualityScore) {
        results.invalid.push({ song, validation });
        results.stats.filtered++;
        return;
      }

      if (!allowLowConfidence && validation.confidence === "low") {
        results.invalid.push({ song, validation });
        results.stats.filtered++;
        return;
      }

      if (validation.warnings.length > 0) {
        results.warnings.push({ song, validation });
      }

      results.valid.push(song);
      results.stats.valid++;
    });

    Logger.info(
      `Filtering complete: ${results.stats.valid} valid, ${results.stats.invalid} invalid, ${results.stats.filtered} filtered`,
    );

    return results;
  }

  /**
   * Generate validation report
   */
  generateReport(songs) {
    const report = {
      summary: {
        total: songs.length,
        valid: 0,
        invalid: 0,
        highQuality: 0,
        mediumQuality: 0,
        lowQuality: 0,
      },
      issues: {},
      warnings: {},
      qualityDistribution: {},
      recommendations: [],
    };

    songs.forEach((song) => {
      const validation = this.validateSong(song);

      if (validation.isValid) {
        report.summary.valid++;
      } else {
        report.summary.invalid++;
      }

      // Track quality distribution
      if (validation.confidence === "high") report.summary.highQuality++;
      else if (validation.confidence === "medium")
        report.summary.mediumQuality++;
      else report.summary.lowQuality++;

      // Track issues
      validation.issues.forEach((issue) => {
        report.issues[issue] = (report.issues[issue] || 0) + 1;
      });

      validation.warnings.forEach((warning) => {
        report.warnings[warning] = (report.warnings[warning] || 0) + 1;
      });

      // Quality score distribution
      const scoreRange = Math.floor(validation.score / 10) * 10;
      report.qualityDistribution[scoreRange] =
        (report.qualityDistribution[scoreRange] || 0) + 1;
    });

    // Generate recommendations
    this.generateRecommendations(report);

    return report;
  }

  /**
   * Generate recommendations based on validation results
   */
  generateRecommendations(report) {
    const { summary, issues, warnings } = report;

    if (summary.invalid > summary.total * 0.1) {
      report.recommendations.push(
        "High number of invalid songs detected. Consider reviewing source data quality.",
      );
    }

    if (issues.missing_title > 0) {
      report.recommendations.push(
        `${issues.missing_title} songs missing titles. These will be excluded from Spotify matching.`,
      );
    }

    if (issues.missing_artist > 0) {
      report.recommendations.push(
        `${issues.missing_artist} songs missing artists. These will be excluded from Spotify matching.`,
      );
    }

    if (warnings.suspicious_title_content > 0) {
      report.recommendations.push(
        `${warnings.suspicious_title_content} songs have suspicious title content. Manual review recommended.`,
      );
    }

    if (summary.lowQuality > summary.total * 0.2) {
      report.recommendations.push(
        "High number of low-quality songs. Consider adjusting quality thresholds or source data.",
      );
    }

    if (summary.valid < summary.total * 0.8) {
      report.recommendations.push(
        "Low percentage of valid songs. Review normalization and validation criteria.",
      );
    }
  }
}

module.exports = SongValidator;
