const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const mm = require('music-metadata');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Cache for metadata
let metadataCache = {};
let lastScanTime = null;

// Load playlist configuration
async function loadConfig() {
    try {
        const data = await fs.readFile('playlist-config.json', 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading config:', error);
        return null;
    }
}

// Scan directory for MP3 files
async function scanDirectory(dirPath) {
    const tracks = [];
    
    try {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isFile() && (file.endsWith('.mp3') || file.endsWith('.MP3'))) {
                const trackData = await extractMetadata(filePath, file);
                if (trackData) {
                    tracks.push(trackData);
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error.message);
    }
    
    return tracks;
}

// Extract metadata from MP3 file
async function extractMetadata(filePath, fileName) {
    try {
        // Check cache first
        if (metadataCache[filePath]) {
            return metadataCache[filePath];
        }
        
        const metadata = await mm.parseFile(filePath);
        const common = metadata.common;
        const format = metadata.format;
        
        const track = {
            file: filePath.replace(/\\/g, '/'),
            title: common.title || fileName.replace('.mp3', '').replace('.MP3', ''),
            artist: common.artist || 'Unknown Artist',
            album: common.album || 'Unknown Album',
            year: common.year || null,
            duration: formatDuration(format.duration),
            bpm: metadata.common.bpm || null,
            genre: common.genre ? common.genre[0] : null,
            tags: common.genre || [],
            cover: null
        };
        
        // Extract album art
        if (common.picture && common.picture.length > 0) {
            const picture = common.picture[0];
            track.cover = `data:${picture.format};base64,${picture.data.toString('base64')}`;
        }
        
        // Detect mood from genre/tags (simple heuristic)
        track.mood = detectMood(track.genre, track.tags);
        
        // Cache the result
        metadataCache[filePath] = track;
        
        return track;
    } catch (error) {
        console.error(`Error extracting metadata from ${filePath}:`, error.message);
        
        // Return basic info even if metadata extraction fails
        return {
            file: filePath.replace(/\\/g, '/'),
            title: fileName.replace('.mp3', '').replace('.MP3', ''),
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: '0:00',
            year: null,
            bpm: null,
            mood: null,
            tags: [],
            cover: null
        };
    }
}

// Format duration from seconds to mm:ss
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Detect mood from genre/tags (simple heuristic)
function detectMood(genre, tags) {
    const allText = `${genre} ${tags.join(' ')}`.toLowerCase();
    
    if (allText.includes('aggressive') || allText.includes('metal') || allText.includes('punk')) {
        return 'Aggressive';
    } else if (allText.includes('calm') || allText.includes('ambient') || allText.includes('chill')) {
        return 'Calm';
    } else if (allText.includes('happy') || allText.includes('upbeat') || allText.includes('dance')) {
        return 'Happy';
    } else if (allText.includes('sad') || allText.includes('melancholic') || allText.includes('ballad')) {
        return 'Melancholic';
    } else if (allText.includes('energetic') || allText.includes('rock') || allText.includes('high')) {
        return 'Energetic';
    } else if (allText.includes('epic') || allText.includes('orchestral')) {
        return 'Epic';
    }
    
    return 'Calm';
}

// API: Get all library data with scanned tracks
app.get('/api/library', async (req, res) => {
    try {
        const config = await loadConfig();
        if (!config) {
            return res.status(500).json({ error: 'Failed to load configuration' });
        }
        
        const library = { ...config.library };
        
        // Scan each subfolder for MP3 files
        for (const folder of library.folders) {
            for (const subfolder of folder.subfolders) {
                console.log(`Scanning ${subfolder.path}...`);
                const tracks = await scanDirectory(subfolder.path);
                
                subfolder.tracks = tracks;
                subfolder.trackCount = tracks.length;
                
                // Calculate total duration
                const totalSeconds = tracks.reduce((sum, track) => {
                    const [mins, secs] = track.duration.split(':').map(Number);
                    return sum + (mins * 60) + secs;
                }, 0);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                subfolder.duration = `${hours}h ${minutes}m`;
                
                // Use first 4 tracks' covers as images (or fallback to coverImage)
                subfolder.images = tracks
                    .slice(0, 4)
                    .map(t => t.cover)
                    .filter(c => c)
                    .concat([subfolder.coverImage, subfolder.coverImage, subfolder.coverImage, subfolder.coverImage])
                    .slice(0, 4);
            }
        }
        
        lastScanTime = new Date();
        res.json({ library, lastScan: lastScanTime });
        
    } catch (error) {
        console.error('Error getting library:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Rescan library (force refresh)
app.post('/api/rescan', async (req, res) => {
    try {
        metadataCache = {};
        res.json({ message: 'Cache cleared, next request will rescan' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Get tracks for specific playlist
app.get('/api/playlist/:id', async (req, res) => {
    try {
        const config = await loadConfig();
        const playlistId = req.params.id;
        
        let targetPlaylist = null;
        let targetPath = null;
        
        // Find the playlist
        for (const folder of config.library.folders) {
            for (const subfolder of folder.subfolders) {
                if (subfolder.id === playlistId) {
                    targetPlaylist = subfolder;
                    targetPath = subfolder.path;
                    break;
                }
            }
            if (targetPlaylist) break;
        }
        
        if (!targetPlaylist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        
        const tracks = await scanDirectory(targetPath);
        res.json({ playlist: targetPlaylist, tracks });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Upload new tracks
app.post('/api/upload', async (req, res) => {
    // This would handle file uploads in a real implementation
    res.json({ message: 'Upload endpoint - implement with multer for file uploads' });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🎵 Music Playlist Manager Server`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`\nAPI Endpoints:`);
    console.log(`  GET  /api/library       - Get full library with scanned tracks`);
    console.log(`  GET  /api/playlist/:id  - Get specific playlist tracks`);
    console.log(`  POST /api/rescan        - Clear cache and rescan on next request`);
    console.log(`  POST /api/upload        - Upload new MP3 files\n`);
});