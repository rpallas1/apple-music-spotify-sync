/**
 * Track comparison utility for smart duplicate detection
 */
class TrackComparison {
  constructor() {
    // Using simple normalization for reliability
  }

  /**
   * Create a simple normalization of track data
   */
  normalizeSong(track) {
    const title = String(track.name || track.title || "").toLowerCase().trim();
    const artist = track.artists ? 
      (Array.isArray(track.artists) ? track.artists.join(" ") : String(track.artists)) : 
      String(track.artist || "");
    const album = String(track.album || "").toLowerCase().trim();

    return {
      title: title,
      artist: artist.toLowerCase().trim(),
      album: album,
      searchTitle: this.cleanText(title),
      searchArtist: this.cleanText(artist),
      searchAlbum: this.cleanText(album),
      original: {
        title: track.name || track.title,
        artist: track.artists ? track.artists : track.artist,
        album: track.album
      }
    };
  }

  /**
   * Clean text for comparison
   */
  cleanText(text) {
    if (!text) return "";
    return String(text)
      .toLowerCase()
      .replace(/[^\w\s]/g, " ") // Replace special chars with spaces
      .replace(/\s+/g, " ") // Collapse whitespace
      .trim();
  }

  /**
   * Create a track signature for duplicate detection
   */
  createTrackSignature(track) {
    const normalized = this.normalizeSong(track);
    const title = normalized.searchTitle || "";
    const artist = normalized.searchArtist || "";
    return `${title}|||${artist}`;
  }

  /**
   * Create a core signature that ignores version differences
   */
  createCoreTrackSignature(track) {
    const normalized = this.normalizeSong(track);
    
    // Remove version indicators for core matching
    let coreTitle = normalized.searchTitle || "";
    coreTitle = coreTitle
      .replace(/\b(remaster|remastered|deluxe|extended|radio edit|album version|single version|ultimate mix)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    
    const coreArtist = normalized.searchArtist || "";
    return `${coreTitle}|||${coreArtist}`;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    if (!str1 || !str2) return Math.max(String(str1 || "").length, String(str2 || "").length);
    
    str1 = String(str1);
    str2 = String(str2);
    
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate string similarity using multiple methods
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 && !str2) return 1;
    if (!str1 || !str2) return 0;
    
    str1 = String(str1);
    str2 = String(str2);
    
    if (str1 === str2) return 1;

    // Levenshtein-based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    const levenshteinSimilarity = (longer.length - editDistance) / longer.length;

    // Token-based similarity (Jaccard)
    const tokens1 = new Set(str1.split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(str2.split(/\s+/).filter(t => t.length > 0));
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

    // Combine methods
    return levenshteinSimilarity * 0.6 + jaccardSimilarity * 0.4;
  }

  /**
   * Calculate similarity between two tracks
   */
  calculateTrackSimilarity(track1, track2) {
    const norm1 = this.normalizeSong(track1);
    const norm2 = this.normalizeSong(track2);

    const titleSimilarity = this.calculateStringSimilarity(
      norm1.searchTitle || "",
      norm2.searchTitle || ""
    );
    
    const artistSimilarity = this.calculateStringSimilarity(
      norm1.searchArtist || "",
      norm2.searchArtist || ""
    );

    const albumSimilarity = (norm1.searchAlbum && norm2.searchAlbum) 
      ? this.calculateStringSimilarity(norm1.searchAlbum, norm2.searchAlbum)
      : 0;

    // Weighted similarity (title 60%, artist 35%, album 5%)
    const overallSimilarity = (
      titleSimilarity * 0.60 +
      artistSimilarity * 0.35 +
      albumSimilarity * 0.05
    );

    return {
      overall: overallSimilarity,
      title: titleSimilarity,
      artist: artistSimilarity,
      album: albumSimilarity
    };
  }

  /**
   * Check if a track already exists in the playlist
   */
  isTrackAlreadyInPlaylist(newTrack, existingTracks) {
    if (!newTrack || !existingTracks || !Array.isArray(existingTracks)) {
      return {
        isDuplicate: false,
        method: null,
        confidence: 0,
        existingTrack: null
      };
    }

    const newSignature = this.createTrackSignature(newTrack);
    const newCoreSignature = this.createCoreTrackSignature(newTrack);
    
    for (const existingTrack of existingTracks) {
      if (!existingTrack) continue;
      
      const existingSignature = this.createTrackSignature(existingTrack);
      const existingCoreSignature = this.createCoreTrackSignature(existingTrack);
      
      // Exact signature match
      if (newSignature === existingSignature && newSignature.length > 6) {
        return {
          isDuplicate: true,
          method: "exact_signature",
          confidence: 1.0,
          existingTrack
        };
      }
      
      // Core signature match (ignores versions)
      if (newCoreSignature === existingCoreSignature && newCoreSignature.length > 6) {
        return {
          isDuplicate: true,
          method: "core_signature",
          confidence: 0.95,
          existingTrack
        };
      }
      
      // Similarity-based matching
      const similarity = this.calculateTrackSimilarity(newTrack, existingTrack);
      
      if (similarity.overall > 0.90) {
        return {
          isDuplicate: true,
          method: "high_similarity",
          confidence: similarity.overall,
          existingTrack
        };
      }
      
      if (similarity.overall > 0.75 && similarity.artist > 0.95) {
        return {
          isDuplicate: true,
          method: "medium_similarity_exact_artist",
          confidence: similarity.overall,
          existingTrack
        };
      }
    }
    
    return {
      isDuplicate: false,
      method: null,
      confidence: 0,
      existingTrack: null
    };
  }
}

// Create singleton instance
const trackComparison = new TrackComparison();

// Export functions
module.exports = {
  // Simple exports for backward compatibility
  normalizeString: (str) => trackComparison.cleanText(str),
  createTrackSignature: (track) => trackComparison.createTrackSignature(track),
  isTrackAlreadyInPlaylist: (newTrack, existingTracks) => {
    const result = trackComparison.isTrackAlreadyInPlaylist(newTrack, existingTracks);
    return result.isDuplicate;
  },
  calculateSimilarity: (str1, str2) => trackComparison.calculateStringSimilarity(str1, str2),
  levenshteinDistance: (str1, str2) => trackComparison.levenshteinDistance(str1, str2),
  
  // Enhanced exports
  trackComparison,
  calculateTrackSimilarity: (track1, track2) => trackComparison.calculateTrackSimilarity(track1, track2),
  isTrackAlreadyInPlaylistDetailed: (newTrack, existingTracks) =>
    trackComparison.isTrackAlreadyInPlaylist(newTrack, existingTracks)
};