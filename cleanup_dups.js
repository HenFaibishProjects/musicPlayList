const fs = require('fs');

// For each file, remove duplicate function definitions
// keeping only the LAST occurrence of each function (the one from script_backup.js)
const files = [
  { file: 'player.js', marker: '// === Missing player functions extracted from script.js ===' },
  { file: 'playlists.js', marker: '// === Missing playlist/UI functions extracted from script.js ===' },
  { file: 'ui-utilities.js', marker: '// === Missing UI/event functions extracted from script.js ===' }
];

files.forEach(({ file, marker }) => {
  const path = 'c:/Projects/musicPlayList/' + file;
  let content = fs.readFileSync(path, 'utf8');
  
  // Find all occurrences of the marker
  const firstIdx = content.indexOf(marker);
  if (firstIdx === -1) {
    console.log(file + ': marker not found, skipping');
    return;
  }
  
  // Find the second occurrence (if any)
  const secondIdx = content.indexOf(marker, firstIdx + marker.length);
  if (secondIdx === -1) {
    console.log(file + ': only one append found, OK');
    return;
  }
  
  // Keep content up to (but not including) the second marker
  content = content.substring(0, secondIdx).trimEnd() + '\n';
  fs.writeFileSync(path, content);
  console.log(file + ': removed duplicate append, kept first');
});

// Also fix ui-utilities.js: remove duplicate showNotification/closeNotification
// (keep ui.js versions which use correct element IDs)
const uiUtilsPath = 'c:/Projects/musicPlayList/ui-utilities.js';
let uiContent = fs.readFileSync(uiUtilsPath, 'utf8');
const lines = uiContent.split('\n');
let result = [];
let i = 0;
let skipUntilBrace = false;
let depth = 0;
let inSkipFn = false;
const skipFns = ['showNotification', 'closeNotification'];

// Simple approach: find and remove the showNotification and closeNotification
// function blocks that are in the ORIGINAL ui-utilities.js (before the marker)
// We identify them by their position (before the === Missing === marker)

// Find the marker line
const markerLine = '// === Missing UI/event functions extracted from script.js ===';
const markerIdx = lines.findIndex(l => l.trim().startsWith(markerLine.trim()));

// Process only lines before the marker
const beforeMarker = markerIdx >= 0 ? lines.slice(0, markerIdx) : lines;
const afterMarker = markerIdx >= 0 ? lines.slice(markerIdx) : [];

// Remove showNotification and closeNotification blocks from beforeMarker
const cleanedBefore = [];
i = 0;
while (i < beforeMarker.length) {
  const line = beforeMarker[i];
  const fnMatch = skipFns.find(fn => line.match(new RegExp('^function ' + fn + '\\b')));
  if (fnMatch) {
    // Skip this function block
    let d = 0, started = false;
    while (i < beforeMarker.length) {
      const l = beforeMarker[i];
      for (const ch of l) {
        if (ch === '{') { d++; started = true; }
        else if (ch === '}') d--;
      }
      i++;
      if (started && d === 0) break;
    }
    // Skip trailing empty lines
    while (i < beforeMarker.length && beforeMarker[i].trim() === '') i++;
    console.log('Removed duplicate ' + fnMatch + ' from ui-utilities.js');
    continue;
  }
  cleanedBefore.push(line);
  i++;
}

// Also remove 'let notificationTimeout = null;' from beforeMarker
const finalBefore = cleanedBefore.filter((l, idx) => {
  if (l.trim() === 'let notificationTimeout = null;' || 
      l.trim() === '// Notification system') {
    console.log('Removed: ' + l.trim());
    return false;
  }
  return true;
});

const finalContent = [...finalBefore, ...afterMarker].join('\n');
fs.writeFileSync(uiUtilsPath, finalContent);

// Final syntax check
['player.js', 'playlists.js', 'ui-utilities.js'].forEach(f => {
  try {
    const c = require('fs').readFileSync('c:/Projects/musicPlayList/'+f,'utf8');
    new Function(c);
    console.log('OK: ' + f + ' (' + c.split('\n').length + ' lines)');
  } catch(e) {
    console.log('SYNTAX ERROR in ' + f + ': ' + e.message);
  }
});

console.log('\nCleanup complete!');
