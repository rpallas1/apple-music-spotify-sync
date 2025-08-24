const inquirer = require("inquirer");
const Logger = require("../utils/logger");

/**
 * Create a new playlist on the user's account.
 * Returns the created playlist object.
 */
async function createPlaylist(spotifyApi, name, description = "") {
  Logger.debug(
    `Creating playlist with name: ${name}, description: ${description}`,
  );
  let response;
  try {
    response = await spotifyApi.createPlaylist(name, {
      description,
      public: false,
    });
  } catch (err) {
    Logger.error(`Spotify API error when creating playlist: ${err.message}`);
    throw err;
  }
  const playlist = response && (response.body || response);
  if (!playlist) {
    Logger.error(
      "Spotify API returned unexpected response for createPlaylist:",
      response,
    );
    throw new Error("Spotify createPlaylist failed: No playlist data returned");
  }
  Logger.info(`Created new playlist: "${playlist.name}"`);
  return playlist;
}

/**
 * Fetches all of the user's playlists (handles paging).
 */
async function fetchAllUserPlaylists(spotifyApi) {
  const playlists = [];
  let offset = 0;
  const limit = 50;
  let total = null;

  try {
    do {
      const resp = await spotifyApi.getUserPlaylists({ offset, limit });
      const items = (resp.body && resp.body.items) || [];
      playlists.push(...items);
      total = resp.body && resp.body.total;
      offset += items.length;
    } while (total !== null && offset < total);
  } catch (err) {
    Logger.error(`Error fetching Spotify playlists: ${err.message}`);
    throw err;
  }
  return playlists;
}

/**
 * Interactive flow for selecting or creating a Spotify playlist, with search for existing.
 * Returns the selected or created playlist object.
 */
async function selectOrCreatePlaylistFlow(
  spotifyApi,
  playlistNameSuggestion = "Imported Playlist",
) {
  let playlists;
  try {
    playlists = await fetchAllUserPlaylists(spotifyApi);
  } catch (err) {
    Logger.error(`Error fetching Spotify playlists: ${err.message}`);
    return null;
  }

  // Prompt user for action
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message:
        "Do you want to sync with an existing Spotify playlist or create a new one?",
      choices: [
        { name: "Create a new playlist", value: "create" },
        { name: "Use/search for an existing playlist", value: "existing" },
      ],
    },
  ]);

  if (action === "create") {
    // Prompt for new playlist info
    const { newName, newDesc } = await inquirer.prompt([
      {
        type: "input",
        name: "newName",
        message: "Enter a name for your new Spotify playlist:",
        default: playlistNameSuggestion,
      },
      {
        type: "input",
        name: "newDesc",
        message: "Enter an optional playlist description:",
        default: "",
      },
    ]);
    const playlist = await createPlaylist(spotifyApi, newName, newDesc);
    return playlist;
  } else {
    // Search for existing playlists by name
    let filtered = playlists;
    while (true) {
      const { search } = await inquirer.prompt([
        {
          type: "input",
          name: "search",
          message:
            "Enter a search term for your playlist (leave blank to show all):",
          default: "",
        },
      ]);
      if (search.trim() !== "") {
        filtered = playlists.filter((p) =>
          p.name.toLowerCase().includes(search.trim().toLowerCase()),
        );
      } else {
        filtered = playlists;
      }
      if (filtered.length === 0) {
        Logger.info("No playlists found matching your search. Try again.");
        continue; // Prompt again
      }
      break;
    }
    const { selectedId } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedId",
        message: "Select an existing playlist:",
        choices: filtered.map((p) => ({
          name: `${p.name} (${p.tracks.total} tracks)`,
          value: p.id,
        })),
      },
    ]);
    const selected = playlists.find((p) => p.id === selectedId);
    Logger.info(`Using existing playlist: "${selected.name}"`);
    return selected;
  }
}

module.exports = {
  createPlaylist,
  selectOrCreatePlaylistFlow,
};
