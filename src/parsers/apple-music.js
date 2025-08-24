const fs = require("fs").promises;
const path = require("path");
const Logger = require("../utils/logger");
const { FileParsingError } = require("../utils/errors");

/**
 * Apple Music TSV file parser
 * Handles parsing and normalization of Apple Music export files
 *
 * This implementation aligns with Apple Music/iTunes "Export Playlist" TSV files:
 * - 31 tab-separated columns with a header line
 * - Often encoded as UTF-16LE with BOM (fallbacks supported)
 * - Dates are locale-style and may contain narrow no‑break spaces (U+202F)
 */
class AppleMusicParser {
  constructor() {
    // We'll detect encoding from raw bytes (BOM/heuristics), then decode
    this.requiredColumns = ["Name", "Artist"];

    // Known Apple Music export column structure (31 columns)
    this.appleColumns = [
      "Name",
      "Artist",
      "Composer",
      "Album",
      "Grouping",
      "Work",
      "Movement Number",
      "Movement Count",
      "Movement Name",
      "Genre",
      "Size",
      "Time",
      "Disc Number",
      "Disc Count",
      "Track Number",
      "Track Count",
      "Year",
      "Date Modified",
      "Date Added",
      "Bit Rate",
      "Sample Rate",
      "Volume Adjustment",
      "Kind",
      "Equalizer",
      "Comments",
      "Plays",
      "Last Played",
      "Skips",
      "Last Skipped",
      "My Rating",
      "Location",
    ];
  }

  /**
   * Detect encoding using BOM and lightweight heuristics.
   * Priority: UTF-16LE (common for Music/iTunes) -> UTF-8 (with/without BOM) -> latin1 fallback
   */
  async detectEncoding(filePath) {
    const buf = await fs.readFile(filePath);

    // BOM checks
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      Logger.debug("Detected BOM: UTF-16LE");
      return "utf16le";
    }
    if (
      buf.length >= 3 &&
      buf[0] === 0xef &&
      buf[1] === 0xbb &&
      buf[2] === 0xbf
    ) {
      Logger.debug("Detected BOM: UTF-8");
      return "utf8";
    }
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      // UTF-16BE BOM present; Node does not natively decode 'utf16be'
      // Heuristic: try swapping to LE by reordering bytes (small files); otherwise fallback to utf8
      Logger.debug("Detected BOM: UTF-16BE (attempting LE decode)");
      try {
        const swapped = Buffer.allocUnsafe(buf.length);
        for (let i = 0; i + 1 < buf.length; i += 2) {
          swapped[i] = buf[i + 1];
          swapped[i + 1] = buf[i];
        }
        const text = swapped.toString("utf16le");
        if (this.looksLikeAppleTSV(text)) {
          return { encoding: "utf16le", swapped: true, swappedBuffer: swapped };
        }
      } catch (_) {
        // ignore and continue
      }
    }

    // Heuristic checks without BOM
    // Try utf16le
    try {
      const text = buf.toString("utf16le");
      if (this.looksLikeAppleTSV(text)) {
        Logger.debug("Heuristic encoding detection: utf16le");
        return "utf16le";
      }
    } catch (_) {}

    // Try utf8
    try {
      const text = buf.toString("utf8");
      if (this.looksLikeAppleTSV(text)) {
        Logger.debug("Heuristic encoding detection: utf8");
        return "utf8";
      }
    } catch (_) {}

    // Last resort: latin1
    try {
      const text = buf.toString("latin1");
      if (this.looksLikeAppleTSV(text)) {
        Logger.debug("Heuristic encoding detection: latin1");
        return "latin1";
      }
    } catch (_) {}

    throw new FileParsingError("Could not detect file encoding", filePath);
  }

  looksLikeAppleTSV(text) {
    if (!text) return false;
    // Normalize BOM on first header, replace special spaces for robust search
    const sample = this.normalizeUnicodeSpaces(text.slice(0, 4096)).replace(
      /^\uFEFF/,
      "",
    );
    // Must include tabs and key headers like "Name" and "Artist", and likely "Kind" or "Location"
    const hasTabs = sample.includes("\t");
    const hasName = sample.includes("Name");
    const hasArtist = sample.includes("Artist");
    const hasKindOrLocation =
      sample.includes("Kind") || sample.includes("Location");
    // Avoid false positives by requiring a header-like line with multiple tabs
    const firstLine = sample.split(/\r\n|\n/)[0] || "";
    const tabCount = (firstLine.match(/\t/g) || []).length;
    return (
      hasTabs && hasName && hasArtist && hasKindOrLocation && tabCount >= 10
    );
  }

  parseTSVContent(content, filePath) {
    try {
      // Normalize special spaces that may appear in date strings
      let cleanContent = this.normalizeUnicodeSpaces(String(content));

      // Trim trailing/leading whitespace but keep tabs/newlines
      cleanContent = cleanContent.replace(/^\s+/, "").replace(/\s+$/, "");

      // Always use standard TSV parsing for Apple Music export files
      return this.parseStandardTSV(cleanContent, filePath);
    } catch (err) {
      throw new FileParsingError(
        `TSV parsing failed: ${err.message}`,
        filePath,
      );
    }
  }

  /**
   * Parse standard Apple Music TSV with header.
   */
  parseStandardTSV(content, filePath) {
    // Normalize line endings
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rawLines = normalized.split("\n");

    // Drop completely empty lines
    const lines = rawLines.filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      throw new FileParsingError(
        "File appears to be empty or invalid",
        filePath,
      );
    }

    // Header
    let headerLine = lines[0].replace(/^\uFEFF/, ""); // strip BOM from first cell if present
    const headers = headerLine.split("\t").map((h) => h.trim());

    Logger.debug(`Found ${headers.length} columns in header`);
    const headerIndex = new Map();
    headers.forEach((h, i) => headerIndex.set(h, i));

    // Validate required columns
    for (const col of this.requiredColumns) {
      if (!headerIndex.has(col)) {
        throw new FileParsingError(`Missing required column: ${col}`, filePath);
      }
    }

    if (headers.length !== 31) {
      Logger.warning(
        `Header column count is ${headers.length} (expected 31). Continuing with best-effort parsing.`,
      );
    }

    const songs = [];
    let silentPadCount = 0;
    let warnPadCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Split on tabs; keep trailing empty fields (if present)
      const values = line.split("\t");

      if (values.length < headers.length) {
        const missing = headers.length - values.length;

        // Common Apple export case: last column "Location" is empty and exporter omits the trailing tab
        const lastHeader = headers[headers.length - 1];
        if (missing === 1 && lastHeader === "Location") {
          values.push("");
          silentPadCount++;
        } else {
          // Pad remaining trailing columns and warn
          while (values.length < headers.length) values.push("");
          Logger.warning(
            `Row ${i + 1}: Column count mismatch (missing ${missing}); padded to match header length`,
          );
          warnPadCount++;
        }
      } else if (values.length > headers.length) {
        Logger.warning(
          `Row ${i + 1}: Column count (${values.length}) exceeds header count (${headers.length}); extra columns will be ignored`,
        );
        values.length = headers.length; // trim extras
      }

      const song = this.parseSongRowFull(values, headers, headerIndex);
      if (this.isValidSong(song)) {
        songs.push(song);
      }
    }

    if (silentPadCount > 0) {
      Logger.info(
        `Silently padded ${silentPadCount} rows missing trailing "Location" column`,
      );
    }
    if (warnPadCount > 0) {
      Logger.info(
        `Warned on ${warnPadCount} rows with non-trailing or multi-column mismatches`,
      );
    }

    return songs;
  }

  /**
   * Build a song object using the full Apple columns when available.
   */
  parseSongRowFull(values, headers, headerIndex) {
    // Helper to get a field by header name safely
    const get = (name) => {
      const idx = headerIndex.get(name);
      return idx != null ? values[idx] : "";
    };

    const originalData = {};
    headers.forEach((h, idx) => {
      originalData[h] = values[idx] ?? "";
    });

    // Extract raw date strings and compute ISO variants
    const rawDateModified = this.cleanText(get("Date Modified"));
    const rawDateAdded = this.cleanText(get("Date Added"));
    const rawLastPlayed = this.cleanText(get("Last Played"));
    const rawLastSkipped = this.cleanText(get("Last Skipped"));

    const song = {
      title: this.cleanText(get("Name")),
      artist: this.cleanText(get("Artist")),
      composer: this.cleanText(get("Composer")),
      album: this.cleanText(get("Album")),
      grouping: this.cleanText(get("Grouping")),
      work: this.cleanText(get("Work")),
      movementNumber: this.parseNumber(get("Movement Number")),
      movementCount: this.parseNumber(get("Movement Count")),
      movementName: this.cleanText(get("Movement Name")),
      genre: this.cleanText(get("Genre")),
      size: this.parseNumber(get("Size")),
      // "Time" is seconds in Apple export; still accept mm:ss for resilience
      duration: this.parseDuration(this.cleanText(get("Time"))),
      discNumber: this.parseNumber(get("Disc Number")),
      discCount: this.parseNumber(get("Disc Count")),
      trackNumber: this.parseNumber(get("Track Number")),
      trackCount: this.parseNumber(get("Track Count")),
      year: this.parseYear(this.cleanText(get("Year"))),
      dateModified: rawDateModified, // normalized string
      dateModifiedISO: this.parseAppleDateToISO(rawDateModified),
      dateAdded: rawDateAdded,
      dateAddedISO: this.parseAppleDateToISO(rawDateAdded),
      bitRate: this.parseNumber(get("Bit Rate")),
      sampleRate: this.parseNumber(get("Sample Rate")),
      volumeAdjustment: this.parseNumber(get("Volume Adjustment")),
      kind: this.cleanText(get("Kind")),
      equalizer: this.cleanText(get("Equalizer")),
      comments: this.cleanText(get("Comments")),
      playCount: this.parseNumber(get("Plays")),
      lastPlayed: rawLastPlayed,
      lastPlayedISO: this.parseAppleDateToISO(rawLastPlayed),
      skipCount: this.parseNumber(get("Skips")),
      lastSkipped: rawLastSkipped,
      lastSkippedISO: this.parseAppleDateToISO(rawLastSkipped),
      rating: this.parseNumber(get("My Rating")), // iTunes often stores 0–100 in steps of 20
      location: this.cleanText(get("Location")),

      // Keep the full raw row for debugging/auditing
      originalData,
    };

    return song;
  }

  cleanText(text) {
    if (!text || typeof text !== "string") return "";
    // Normalize thin/no-break spaces that appear in dates and some metadata
    const normalized = this.normalizeUnicodeSpaces(text);
    // Trim and collapse internal whitespace but preserve content characters
    return normalized
      .replace(/^\s+/, "")
      .replace(/\s+$/, "")
      .replace(/\s+/g, " ")
      .replace(/^\uFEFF/, "");
  }

  normalizeUnicodeSpaces(s) {
    if (typeof s !== "string") return s;
    // Replace narrow no-break space (U+202F) and no-break space (U+00A0) with regular space
    return s.replace(/\u202F|\u00A0/g, " ");
  }

  parseYear(yearText) {
    if (!yearText) return null;
    const match = String(yearText).match(/(\d{4})/);
    return match ? parseInt(match[1], 10) : null;
  }

  parseDuration(durationText) {
    if (!durationText && durationText !== 0) return null;
    const s = String(durationText).trim();

    // If mm:ss or hh:mm:ss
    if (s.includes(":")) {
      const parts = s.split(":").map((p) => parseInt(p, 10) || 0);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // Otherwise assume integer seconds (Apple "Time" column) or ms
    const num = parseInt(s, 10);
    if (isNaN(num)) return null;
    if (num > 10000) return Math.round(num / 1000); // treat as ms -> s
    return num;
  }

  parseNumber(numberText) {
    if (numberText == null) return null;
    const s = String(numberText).trim();
    if (s === "") return null;
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  }

  /**
   * Parse Apple locale-style date string to ISO-8601.
   * Input examples: "3/21/21, 7:43 PM" (note: original often uses U+202F before AM/PM)
   * Returns ISO string or null if parsing fails.
   */
  parseAppleDateToISO(text) {
    if (!text) return null;
    const s = this.normalizeUnicodeSpaces(String(text).trim());
    if (s === "") return null;

    // Match M/D/YY(YY) , H:MM AM/PM
    const m = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i,
    );
    if (!m) return null;

    let [, MM, DD, Y, h, mm, ap] = m;
    let year = parseInt(Y, 10);
    if (Y.length === 2) {
      // Heuristic similar to many strptime defaults
      year += year <= 69 ? 2000 : 1900;
    }
    let hour = parseInt(h, 10);
    const minute = parseInt(mm, 10);
    const isPM = ap.toUpperCase() === "PM";
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    // Construct as local time then convert to ISO
    const monthIdx = parseInt(MM, 10) - 1;
    const day = parseInt(DD, 10);
    const d = new Date(year, monthIdx, day, hour, minute, 0, 0);

    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  async parseFile(filePath) {
    try {
      Logger.info(`Parsing Apple Music file: ${path.basename(filePath)}`);

      const stats = await fs.stat(filePath);
      Logger.debug(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      const detected = await this.detectEncoding(filePath);

      // Special case: detectEncoding may return an object if we swapped UTF-16BE to LE
      let content;
      if (
        typeof detected === "object" &&
        detected.encoding === "utf16le" &&
        detected.swapped &&
        detected.swappedBuffer
      ) {
        content = detected.swappedBuffer.toString("utf16le");
      } else {
        const encoding = typeof detected === "string" ? detected : "utf8";
        content = await fs.readFile(filePath, encoding);
      }

      const songs = this.parseTSVContent(content, filePath);
      const stats_data = this.generateStats(songs);

      Logger.success(`Parsing complete: ${songs.length} songs loaded`);

      return {
        songs,
        metadata: {
          filePath,
          fileName: path.basename(filePath),
          encoding: typeof detected === "string" ? detected : detected.encoding,
          totalSongs: songs.length,
          parsedAt: new Date().toISOString(),
          stats: stats_data,
        },
      };
    } catch (err) {
      if (err instanceof FileParsingError) {
        throw err;
      }
      throw new FileParsingError(
        `Failed to parse file: ${err.message}`,
        filePath,
      );
    }
  }

  generateStats(songs) {
    const stats = {
      totalSongs: songs.length,
      songsWithAlbum: songs.filter((s) => !!s.album).length,
      songsWithYear: songs.filter((s) => !!s.year).length,
      songsWithDuration: songs.filter((s) => s.duration != null).length,
      averageDuration: null,
      genres: {},
      years: {},
    };

    const withDur = songs.filter((s) => typeof s.duration === "number");
    if (withDur.length > 0) {
      const total = withDur.reduce((sum, s) => sum + s.duration, 0);
      stats.averageDuration = Math.round(total / withDur.length);
    }

    for (const s of songs) {
      if (s.genre) stats.genres[s.genre] = (stats.genres[s.genre] || 0) + 1;
      if (s.year) stats.years[s.year] = (stats.years[s.year] || 0) + 1;
    }

    return stats;
  }

  isValidSong(song) {
    return (
      song &&
      typeof song.title === "string" &&
      song.title.length > 0 &&
      typeof song.artist === "string" &&
      song.artist.length > 0
    );
  }
}

module.exports = AppleMusicParser;
