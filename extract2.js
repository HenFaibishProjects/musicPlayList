const fs = require('fs');
const src = fs.readFileSync('c:/Projects/musicPlayList/script_backup.js','utf8');
// Handle Windows line endings
const lines = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

function extractFn(name) {
  let startLine = -1;
  const pat = new RegExp('^(async )?function ' + name + '\\b');
  for (let i = 0; i < lines.length; i++) {
    if (pat.test(lines[i])) {
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

// Functions missing from all split files - append to appropriate files
const toPlaylists = [
  'rescanLibrary', 'loadSmartPlaylists', 'saveSmartPlaylists',
  'getDefaultSmartPlaylists', 'evaluateSmartPlaylistRule', 'evaluateSmartPlaylist',
  'showSmartPlaylists', 'renderSmartPlaylists', 'playSmartPlaylist',
  'showSmartPlaylistTracks', 'playTrackFromSmart', 'deleteSmartPlaylist',
  'openSmartPlaylistModal', 'closeSmartPlaylistModal', 'addSmartPlaylistRule',
  'createSmartPlaylist', 'updateStatsForSmartPlaylists'
];

const toData = [
  'normalizeRecentTrack', 'loadRecentTracksFromStorage',
  'saveRecentTracksToStorage', 'addTrackToRecentlyPlayed'
];

const toPlayer = ['loadPlaylist', 'updateVolumeUI'];

let playlistOut = '\n// === Smart playlist + rescan functions ===\n';
toPlaylists.forEach(fn => {
  const f = extractFn(fn);
  if (f) { playlistOut += '\n' + f + '\n'; console.log('v playlists: ' + fn); }
  else { console.log('x playlists: ' + fn); }
});

let dataOut = '\n// === Recent tracks functions ===\n';
toData.forEach(fn => {
  const f = extractFn(fn);
  if (f) { dataOut += '\n' + f + '\n'; console.log('v data: ' + fn); }
  else { console.log('x data: ' + fn); }
});

let playerOut = '\n// === loadPlaylist + updateVolumeUI ===\n';
toPlayer.forEach(fn => {
  const f = extractFn(fn);
  if (f) { playerOut += '\n' + f + '\n'; console.log('v player: ' + fn); }
  else { console.log('x player: ' + fn); }
});

fs.appendFileSync('c:/Projects/musicPlayList/playlists.js', playlistOut);
fs.appendFileSync('c:/Projects/musicPlayList/data.js', dataOut);
fs.appendFileSync('c:/Projects/musicPlayList/player.js', playerOut);

// Syntax check
['playlists.js', 'data.js', 'player.js'].forEach(f => {
  try {
    new Function(fs.readFileSync('c:/Projects/musicPlayList/'+f,'utf8'));
    console.log('OK: ' + f);
  } catch(e) { console.log('ERR ' + f + ': ' + e.message); }
});
console.log('Done');
