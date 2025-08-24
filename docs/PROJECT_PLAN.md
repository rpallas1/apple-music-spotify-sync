# 🎵 Apple Music to Spotify Sync - Detailed Project Plan

> **Project Start Date**: August 24, 2025  
> **Developer**: @rpallas1  
> **Estimated Timeline**: 12 days

## 🎯 Project Overview

Build a local Node.js CLI tool that syncs Apple Music playlists to Spotify with interactive song matching, progress tracking, and manual conflict resolution.

### Core Features

- Parse Apple Music TSV exports
- Smart Spotify song matching with fuzzy search
- Interactive CLI with progress bars and album art
- Manual song selection for uncertain matches
- Playlist sync and update capabilities

### Tech Stack

- **Runtime**: Node.js
- **APIs**: Spotify Web API
- **Dependencies**:
  - `spotify-web-api-node` - Spotify API wrapper
  - `dotenv` - Environment variable management
  - `inquirer` - Interactive CLI prompts
  - `cli-progress` - Progress bars
  - `chalk` - Colored terminal output

---

## 📋 Phase Breakdown

## Phase 1: Foundation & Authentication (Days 1-2)

### 1.1 Project Structure Setup

- [x] ✅ Git repository created
- [x] ✅ Environment variables configured
- [x] Create main project structure
- [x] Set up package.json scripts
- [x] Add basic error handling utilities

### 1.2 Spotify OAuth Implementation

- [x] **Task 1.2.1**: Create OAuth server for authorization code flow
  - Set up Express server on port 8888
  - Handle `/callback` route
  - Implement PKCE for security
- [x] **Task 1.2.2**: Token management system
  - Save/load refresh tokens securely
  - Automatic token refresh logic
  - Token validation
- [x] **Task 1.2.3**: First-time authentication flow
  - Browser opening automation
  - User consent handling
  - Token storage

**🎯 Milestone 1**: Successfully authenticate with Spotify and store tokens

---

## Phase 2: Data Processing & Parsing (Days 3-4)

### 2.1 Apple Music File Parser

- [x] **Task 2.1.1**: TSV file reader
  - Handle different export formats
  - Parse columns (Name, Artist, Album, etc.)
  - Data validation and cleaning
- [x] **Task 2.1.2**: Song data normalization
  - Clean up artist names (remove "feat.", "ft.", etc.)
  - Handle special characters
  - Normalize track titles

### 2.2 Spotify Search Implementation

- [x] **Task 2.2.1**: Basic search functionality
  - Simple track + artist search
  - Handle API rate limiting
  - Error handling for failed searches
- [x] **Task 2.2.2**: Smart matching algorithm
  - Fuzzy string matching for titles
  - Multiple search strategies (exact, loose, artist-only)
  - Confidence scoring system

**🎯 Milestone 2**: Parse Apple Music files and perform basic Spotify searches

---

## Phase 3: Core Playlist Management (Days 5-6)

### 3.1 Spotify Playlist Operations

- [x] **Task 3.1.1**: Playlist discovery
  - Search for existing playlists by name
  - Handle duplicate playlist names
- [x] **Task 3.1.2**: Playlist creation
  - Create new playlists with metadata
  - Set playlist descriptions
- [x] **Task 3.1.3**: Track management
  - Add tracks to playlists
  - Handle duplicate tracks
  - Batch operations for efficiency

### 3.2 Sync Logic Implementation

- [x] **Task 3.2.1**: Sync strategy
  - Compare existing vs. new track lists
  - Handle additions, removals, reordering
  - Preserve manually added tracks option
- [ ] **Task 3.2.2**: Conflict resolution
  - Handle tracks that no longer exist
  - Deal with region restrictions
  - Backup strategies

**🎯 Milestone 3**: Successfully create and update Spotify playlists

---

## Phase 4: Interactive CLI Experience (Days 7-8)

### 4.1 Progress Tracking

- [ ] **Task 4.1.1**: Progress bars implementation
  - Overall progress (songs processed)
  - Individual search progress
  - Time estimates
- [ ] **Task 4.1.2**: Real-time feedback
  - Success/failure indicators
  - Current song being processed
  - Match confidence display

### 4.2 Manual Resolution Interface

- [ ] **Task 4.2.1**: Search results display
  - Show multiple match options
  - Display album art URLs
  - Show track metadata (duration, album, etc.)
- [ ] **Task 4.2.2**: User decision interface
  - Interactive selection menus
  - Skip/retry options
  - Bulk decision options ("skip all low confidence")

**🎯 Milestone 4**: Fully interactive CLI with manual song selection

---

## Phase 5: Polish & Features (Days 9-10)

### 5.1 Enhanced User Experience

- [ ] **Task 5.1.1**: Configuration system
  - Save user preferences
  - Default playlist naming schemes
  - Match confidence thresholds
- [ ] **Task 5.1.2**: Logging and reporting
  - Detailed sync reports
  - Success/failure statistics
  - Export failed matches for manual review

### 5.2 Advanced Features

- [ ] **Task 5.2.1**: Batch processing
  - Process multiple playlists at once
  - Queue management
- [ ] **Task 5.2.2**: Smart features
  - Learn from user decisions
  - Improved matching over time
  - Playlist metadata sync (descriptions, images)

**🎯 Milestone 5**: Production-ready tool with advanced features

---

## Phase 6: Testing & Documentation (Days 11-12)

### 6.1 Testing

- [ ] **Task 6.1.1**: Unit tests
  - Parser functions
  - Matching algorithms
  - API wrapper functions
- [ ] **Task 6.1.2**: Integration tests
  - End-to-end playlist sync
  - OAuth flow testing
  - Error handling scenarios

### 6.2 Documentation

- [ ] **Task 6.2.1**: User documentation
  - Setup instructions
  - Usage examples
  - Troubleshooting guide
- [ ] **Task 6.2.2**: Developer documentation
  - Code documentation
  - API reference
  - Contributing guidelines

**🎯 Final Milestone**: Fully tested and documented tool ready for use

---

## 📁 Project Structure

```
apple-music-to-spotify-sync/
├── src/
│   ├── auth/
│   │   ├── spotify-auth.js      # OAuth implementation
│   │   └── token-manager.js     # Token storage/refresh
│   ├── parsers/
│   │   ├── apple-music.js       # TSV file parsing
│   │   └── normalizer.js        # Data cleaning
│   ├── spotify/
│   │   ├── api-client.js        # Spotify API wrapper
│   │   ├── search.js            # Search algorithms
│   │   └── playlist-manager.js  # Playlist operations
│   ├── cli/
│   │   ├── interactive.js       # User prompts
│   │   ├── progress.js          # Progress tracking
│   │   └── display.js           # Output formatting
│   ├── utils/
│   │   ├── config.js            # Configuration management
│   │   ├── logger.js            # Logging utilities
│   │   └── helpers.js           # Common utilities
│   └── index.js                 # Main entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── setup.md
│   ├── usage.md
│   └── api.md
├── examples/
│   └── sample-playlist.txt      # Example Apple Music export
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── PROJECT_PLAN.md
```

---

## 🛠️ Development Approach

### 1. **Start Simple**

- Get basic OAuth working before adding complexity
- Build MVP first, then add interactive features

### 2. **Test Early**

- Test each component with real data as you build
- Use sample Apple Music exports for development

### 3. **Iterate**

- Implement core functionality first
- Add polish and advanced features later

### 4. **Error Handling**

- Plan for API failures, network issues, bad data
- Graceful degradation when services are unavailable

### 5. **User Experience**

- Prioritize clear feedback and error messages
- Make the CLI intuitive and forgiving

---

## ⚠️ Risk Mitigation

| Risk                  | Mitigation Strategy                                      |
| --------------------- | -------------------------------------------------------- |
| **API Rate Limits**   | Implement exponential backoff and respect Spotify limits |
| **Token Expiry**      | Robust refresh token handling with automatic renewal     |
| **Data Quality**      | Handle malformed Apple Music exports gracefully          |
| **Network Issues**    | Retry logic and offline mode considerations              |
| **User Errors**       | Clear error messages and recovery options                |
| **Large Playlists**   | Batch processing and progress tracking                   |
| **Matching Accuracy** | Multiple search strategies and manual override           |

---

## 🎯 Success Criteria

### Phase Completion Criteria

- [ ] **Phase 1**: Can authenticate with Spotify and store tokens persistently
- [ ] **Phase 2**: Can parse Apple Music files and search Spotify successfully
- [ ] **Phase 3**: Can create and update Spotify playlists programmatically
- [ ] **Phase 4**: Has interactive CLI with progress bars and manual selection
- [ ] **Phase 5**: Includes advanced features and user preferences
- [ ] **Phase 6**: Fully tested with comprehensive documentation

### Final Success Metrics

- Successful sync of a 100+ song playlist
- <5% manual intervention needed for well-matched songs
- Complete sync process in <5 minutes for typical playlist
- Intuitive CLI that requires minimal learning
- Robust error handling with helpful messages

---

## 📅 Timeline

| Phase | Days | Start Date | End Date | Key Deliverable                |
| ----- | ---- | ---------- | -------- | ------------------------------ |
| 1     | 2    | Aug 24     | Aug 25   | Working Spotify authentication |
| 2     | 2    | Aug 26     | Aug 27   | File parsing and basic search  |
| 3     | 2    | Aug 28     | Aug 29   | Playlist management            |
| 4     | 2    | Aug 30     | Aug 31   | Interactive CLI                |
| 5     | 2    | Sep 1      | Sep 2    | Advanced features              |
| 6     | 2    | Sep 3      | Sep 4    | Testing and documentation      |

---

## 🚀 Getting Started

Ready to begin? Let's start with **Phase 1: Foundation & Authentication**

**Next Steps:**

1. Set up the basic project structure
2. Implement Spotify OAuth flow
3. Test authentication with your Spotify account

**First Task:** Create the main project structure and implement basic OAuth server.
