# Music Playlist Manager

A professional music playlist manager with a built-in audio player for local MP3 files.

## Features

- 🎵 **Music Player** - Play local MP3 files with full playback controls
- 🎨 **Beautiful UI** - Modern gradient design with dark/light themes
- 🔍 **Search** - Search through playlists and genres
- 📊 **Statistics** - View track counts and duration stats
- 🔀 **Shuffle & Repeat** - Control playback modes
- 📱 **Responsive** - Works on desktop, tablet, and mobile
- ⌨️ **Keyboard Shortcuts** - Space to play/pause, / to search

## Setup Instructions

### 1. File Structure

Organize your files like this:

```
musicPlayList/
├── playlist.html
├── styles.css
├── script.js
├── playlist-data.json
└── music/
    ├── classic-rock/
    │   ├── stairway-to-heaven.mp3
    │   ├── bohemian-rhapsody.mp3
    │   └── ...
    ├── 80s-rock/
    │   └── ...
    ├── 90s-grunge/
    │   └── ...
    ├── electronic/
    │   └── ...
    ├── ambient/
    │   └── ...
    ├── jazz/
    │   └── ...
    └── hip-hop/
        └── ...
```

### 2. Add Your MP3 Files

1. Create a `music` folder in the same directory as `playlist.html`
2. Create subfolders for each genre (classic-rock, 80s-rock, etc.)
3. Add your MP3 files to the appropriate folders
4. The file paths in `playlist-data.json` should match your folder structure

### 3. Open the App

Simply open `playlist.html` in a modern web browser (Chrome, Firefox, Safari, or Edge).

**Note:** Due to browser security restrictions with local files, you may need to run a local server:

```bash
# Using Python 3
python -m http.server 8000

# Using Python 2
python -m SimpleHTTPServer 8000

# Using Node.js (if you have npx)
npx http-server

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000` in your browser.

## How to Use

### Playing Music

1. **Browse playlists** - Click on a genre to see its playlists
2. **Start playback** - Hover over a playlist card and click the play button
3. **Control playback** - Use the player at the bottom of the screen

### Player Controls

- **Play/Pause** - Click the center button or press `Space`
- **Next/Previous** - Skip between tracks
- **Progress bar** - Click to seek to a specific time
- **Volume** - Adjust or mute using the volume slider
- **Shuffle** - Randomize track order
- **Repeat** - Loop playlist or single track
  - Click once: Repeat all tracks
  - Click twice: Repeat current track
  - Click third time: Turn off repeat

### Keyboard Shortcuts

- `Space` - Play/Pause
- `/` - Focus search box
- `Esc` - Unfocus search box

## Customization

### Adding New Playlists

Edit `playlist-data.json` to add new playlists and tracks:

```json
{
  "id": 21,
  "title": "Your Song Title",
  "artist": "Artist Name",
  "album": "Album Name",
  "duration": "3:45",
  "file": "music/your-folder/your-song.mp3",
  "cover": "https://your-image-url.jpg"
}
```

### Themes

Click the moon/sun icon in the top right to toggle between dark and light themes.

## Troubleshooting

### Music Won't Play

1. **Check file paths** - Ensure MP3 files exist at the paths specified in `playlist-data.json`
2. **Use a local server** - Browsers block file access without a server
3. **Check console** - Open browser DevTools (F12) to see error messages

### Files Not Found

- Make sure all file paths in `playlist-data.json` are relative to the HTML file
- Check that folder names match exactly (case-sensitive on some systems)

## Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

## Technologies Used

- HTML5 Audio API
- CSS3 (Grid, Flexbox, Custom Properties)
- Vanilla JavaScript (ES6+)
- Font Awesome Icons
- Google Fonts (Inter)

## License

Free to use for personal projects.

---

Enjoy your music! 🎵