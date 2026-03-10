# Enterprise Setup Guide - Auto-Scanning Music Library

This guide explains how to set up the enterprise version that **automatically scans folders** for MP3 files instead of hardcoding tracks in JSON.

## 🎯 Architecture Overview

The enterprise system uses a **Node.js backend** that:
- ✅ Automatically scans music folders for MP3 files
- ✅ Extracts metadata from ID3 tags (title, artist, album, year, BPM)
- ✅ Extracts embedded album artwork
- ✅ Auto-detects mood from genres
- ✅ Caches results for performance
- ✅ Serves data via REST API

## 📁 Folder Structure

```
musicPlayList/
├── package.json              # Dependencies
├── server.js                 # Node.js backend with auto-scanning
├── playlist-config.json      # Folder paths only (no hardcoded tracks)
├── playlist.html             # Frontend
├── script.js                 # Frontend logic (API-enabled)
├── styles.css                # Styling
├── advanced-features.html    # Enterprise UI
├── advanced-features.js      # Advanced features
├── advanced-styles.css       # Advanced styling
└── music/                    # Your MP3 files
    ├── classic-rock/
    │   ├── 70s/
    │   │   ├── stairway-to-heaven.mp3
    │   │   ├── bohemian-rhapsody.mp3
    │   │   └── ...
    │   ├── 80s/
    │   │   └── ...
    │   └── 90s-grunge/
    │       └── ...
    ├── electronic/
    │   ├── house/
    │   │   └── ...
    │   └── ambient/
    │       └── ...
    ├── jazz/
    │   ├── smooth/
    │   │   └── ...
    │   └── bebop/
    │       └── ...
    └── hip-hop/
        └── golden-age/
            └── ...
```

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
npm install
```

This installs:
- `express` - Web server
- `cors` - Cross-origin support
- `music-metadata` - MP3 metadata extraction

### Step 2: Organize Your Music

Create folders matching the structure in `playlist-config.json`:

```bash
mkdir -p music/classic-rock/{70s,80s,90s-grunge}
mkdir -p music/electronic/{house,ambient}
mkdir -p music/jazz/{smooth,bebop}
mkdir -p music/hip-hop/golden-age
```

### Step 3: Add Your MP3 Files

Copy your MP3 files into the appropriate folders:

```bash
# Example
cp ~/Music/Led\ Zeppelin/*.mp3 music/classic-rock/70s/
cp ~/Music/Daft\ Punk/*.mp3 music/electronic/house/
```

### Step 4: Start the Server

```bash
npm start
```

You should see:
```
🎵 Music Playlist Manager Server
Server running on http://localhost:3000

API Endpoints:
  GET  /api/library       - Get full library with scanned tracks
  GET  /api/playlist/:id  - Get specific playlist tracks
  POST /api/rescan        - Clear cache and rescan on next request
```

### Step 5: Open the App

Visit `http://localhost:3000/playlist.html` in your browser

The app will:
1. Try to fetch from the API (auto-scanned tracks)
2. Fall back to static JSON if API unavailable
3. Display all discovered MP3 files with extracted metadata

## 🔧 How It Works

### 1. Configuration File (`playlist-config.json`)

```json
{
  "library": {
    "folders": [
      {
        "name": "Classic Rock",
        "path": "music/classic-rock",
        "subfolders": [
          {
            "name": "70s Anthems",
            "path": "music/classic-rock/70s"
          }
        ]
      }
    ]
  }
}
```

**No hardcoded tracks!** Just folder paths.

### 2. Backend Scanning (`server.js`)

When `/api/library` is called:
1. Reads `playlist-config.json`
2. Scans each `path` for `.mp3` files
3. Extracts metadata from each file:
   - Title, Artist, Album (from ID3 tags)
   - Year, BPM (if available)
   - Album artwork (embedded images)
   - Auto-detects mood from genre
4. Returns complete library with all tracks

### 3. Frontend Integration (`script.js`)

```javascript
// Tries API first
response = await fetch('http://localhost:3000/api/library');

// Falls back to static JSON if API unavailable
response = await fetch('playlist-data.json');
```

## 📊 API Endpoints

### GET /api/library
Returns complete library with all scanned tracks

**Response:**
```json
{
  "library": {
    "folders": [
      {
        "name": "Classic Rock",
        "subfolders": [
          {
            "name": "70s Anthems",
            "tracks": [
              {
                "file": "music/classic-rock/70s/song.mp3",
                "title": "Stairway to Heaven",
                "artist": "Led Zeppelin",
                "album": "Led Zeppelin IV",
                "year": 1971,
                "bpm": 82,
                "mood": "Epic",
                "tags": ["Rock", "Classic Rock"],
                "cover": "data:image/jpeg;base64,..."
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### POST /api/rescan
Clears metadata cache and forces rescan on next request

```bash
curl -X POST http://localhost:3000/api/rescan
```

### GET /api/playlist/:id
Get tracks for specific playlist

```bash
curl http://localhost:3000/api/playlist/70s-anthems
```

## ⚙️ Configuration

### Adding New Playlists

Edit `playlist-config.json`:

```json
{
  "id": "new-playlist",
  "name": "My New Playlist",
  "path": "music/genre/subfolder",
  "description": "Description here",
  "coverImage": "https://image-url.jpg"
}
```

Then:
1. Create the folder: `mkdir -p music/genre/subfolder`
2. Add MP3 files to the folder
3. Restart server or call `/api/rescan`

### Customizing Mood Detection

Edit the `detectMood()` function in `server.js`:

```javascript
function detectMood(genre, tags) {
    const allText = `${genre} ${tags.join(' ')}`.toLowerCase();
    
    if (allText.includes('your-keyword')) {
        return 'Your Mood';
    }
    // ... more conditions
}
```

## 🎵 Metadata Extraction

The server automatically extracts:

### From ID3 Tags
- Title
- Artist
- Album
- Year
- Genre
- BPM (if present)

### Additional Processing
- Album artwork (embedded in MP3)
- Mood detection (from genre)
- Tags (from genre field)
- Duration calculation

### Fallback Behavior
If metadata is missing:
- Title: Uses filename
- Artist: "Unknown Artist"
- Album: "Unknown Album"
- Cover: Uses playlist's coverImage from config

## 🔄 Cache Management

### How Cache Works
- First request: Scans all folders and extracts metadata
- Subsequent requests: Returns cached data
- Cache persists until server restart

### Clear Cache
```bash
curl -X POST http://localhost:3000/api/rescan
```

Or restart the server:
```bash
# Stop with Ctrl+C
npm start
```

## 📤 Adding Music Files

### Option 1: Manual Copy
```bash
cp /path/to/songs/*.mp3 music/classic-rock/70s/
```

### Option 2: Upload via Content Manager
1. Open `advanced-features.html`
2. Click "Upload Music" in sidebar
3. Drag & drop MP3 files
4. Files are uploaded and metadata extracted automatically

## 🐛 Troubleshooting

### Server Won't Start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Or use a different port
PORT=8000 node server.js
```

### No Tracks Found
1. Check folder paths in `playlist-config.json` match actual folders
2. Ensure MP3 files exist in those folders
3. Check server console for error messages
4. Verify file permissions

### Metadata Not Extracted
- Ensure MP3 files have ID3 tags
- Try using a tool like MP3Tag to add/fix tags
- Check server logs for extraction errors

### Cover Images Not Showing
- Embedded artwork is extracted automatically
- If no embedded art, uses playlist's `coverImage` from config
- Falls back to placeholder if both unavailable

## 🚀 Production Deployment

### Environment Variables
```bash
export PORT=3000
export MUSIC_ROOT=/path/to/music
export NODE_ENV=production
```

### PM2 Process Manager
```bash
npm install -g pm2
pm2 start server.js --name music-manager
pm2 save
pm2 startup
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## 📈 Performance Optimization

### For Large Libraries (1000+ files)
1. Metadata cache persists in memory
2. Consider using Redis for distributed caching
3. Implement pagination for track lists
4. Add database (PostgreSQL/MongoDB) for metadata storage

### Recommended Limits
- **Development**: Up to 1,000 tracks (in-memory cache works fine)
- **Production**: 10,000+ tracks (add database + Redis)

## 🔐 Security Considerations

### Current Implementation
- Runs on localhost only
- No authentication
- Files served from local filesystem

### For Production
Add:
- User authentication (JWT)
- File path validation
- Rate limiting
- HTTPS/TLS
- Database for user data

## 🎓 Next Steps

1. **Run the server**: `npm start`
2. **Add your MP3 files** to the music folders
3. **Open the app**: http://localhost:3000/playlist.html
4. **Click on a playlist** - tracks will be auto-discovered!
5. **Upload more music** via the Content Manager

The system will automatically find and display all MP3 files with their metadata!

---

**Questions?** Check the main README.md or ENTERPRISE-README.md for additional features.