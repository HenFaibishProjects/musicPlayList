const fs = require('fs');
const src = fs.readFileSync('c:/Projects/musicPlayList/script_backup.js','utf8');
const lines = src.split('\n');

function extractFn(name) {
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(new RegExp('^(async )?function ' + name + '\\b'))) {
      startLine = i; break;
    }
  }
  if (startLine < 0) return null;
  let depth = 0, started = false, result = [];
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);
    for (const ch of line) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') depth--;
    }
    if (started && depth === 0) break;
  }
  return result.join('\n');
}

const playerFns = ['playNext','playPrevious','handleTrackEnd','toggleShuffle','toggleRepeat','updateProgress','updateDuration','seekTo'];
const playlistFns = ['refreshLibraryUI','updateWorkspaceStatus','setRescanButtonState','showAllGenres','showFavorites','showRecentlyPlayed','renderRecentlyPlayed','playTrackFromRecent','showGenre','renderFavoritesPlaylists','renderAllGenres','renderGenrePlaylists','showPlaylistTracks','playTrackFromList','createGenreCard','createPlaylistCard','togglePlaylistFavoriteFromUI','updateBreadcrumb','updateStats','updateStatsForGenre','updateStatsForFavorites','showError','renderGenreList','setActiveGenreItem','setActiveMainNav','getTrackSortIconClass','getTrackSortDirectionLabel','getNameSortIconClass','getNameSortDirectionLabel','updateSortButtonsUI'];
const uiFns = ['setupEventListeners','setSortMode','setViewMode','toggleTheme','clearGlobalSearchState','matchesSearchText','getGlobalSearchResults','createGlobalSearchSectionTitle','updateStatsForGlobalSearch','renderGlobalSearchResults','playTrackFromGlobalSearch'];

let playerOut = '\n// === Missing player functions extracted from script.js ===\n';
playerFns.forEach(fn => {
  const f = extractFn(fn);
  if (f) { playerOut += '\n' + f + '\n'; console.log('✓ player: ' + fn); }
  else { playerOut += '// MISSING: ' + fn + '\n'; console.log('✗ player: ' + fn); }
});

let playlistOut = '\n// === Missing playlist/UI functions extracted from script.js ===\n';
playlistFns.forEach(fn => {
  const f = extractFn(fn);
  if (f) { playlistOut += '\n' + f + '\n'; console.log('✓ playlist: ' + fn); }
  else { playlistOut += '// MISSING: ' + fn + '\n'; console.log('✗ playlist: ' + fn); }
});

let uiOut = '\n// === Missing UI/event functions extracted from script.js ===\n';
uiFns.forEach(fn => {
  const f = extractFn(fn);
  if (f) { uiOut += '\n' + f + '\n'; console.log('✓ ui: ' + fn); }
  else { uiOut += '// MISSING: ' + fn + '\n'; console.log('✗ ui: ' + fn); }
});

fs.appendFileSync('c:/Projects/musicPlayList/player.js', playerOut);
fs.appendFileSync('c:/Projects/musicPlayList/playlists.js', playlistOut);
fs.appendFileSync('c:/Projects/musicPlayList/ui-utilities.js', uiOut);

console.log('\nDONE');
