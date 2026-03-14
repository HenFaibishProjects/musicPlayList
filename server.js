const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { execFile } = require('child_process');
const { promisify } = require('util');

const app = express();
const PORT = 3000;
const LIBRARY_STRUCTURE_FILE = 'library-structure.json';
const execFileAsync = promisify(execFile);

const WINDOWS_AUDIO_CORE_SCRIPT = `
if (-not ("Audio.AudioManager" -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace Audio {
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
        int GetMute(out bool pbMute);
        int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        int VolumeStepUp(Guid pguidEventContext);
        int VolumeStepDown(Guid pguidEventContext);
        int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int NotImpl1();
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator {
    }

    public static class AudioManager {
        private static IAudioEndpointVolume GetVolumeObject() {
            IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
            IMMDevice device;
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));

            Guid iid = typeof(IAudioEndpointVolume).GUID;
            IAudioEndpointVolume endpointVolume;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpointVolume));
            return endpointVolume;
        }

        public static float GetMasterVolume() {
            float level;
            Marshal.ThrowExceptionForHR(GetVolumeObject().GetMasterVolumeLevelScalar(out level));
            return level;
        }

        public static void SetMasterVolume(float level) {
            if (level < 0f) level = 0f;
            if (level > 1f) level = 1f;
            Marshal.ThrowExceptionForHR(GetVolumeObject().SetMasterVolumeLevelScalar(level, Guid.Empty));
        }
    }
}
"@
}
`;

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Cache for metadata
let metadataCache = {};
let lastScanTime = null;
let musicMetadataModulePromise = null;
let libraryCache = null;
let scanInProgressPromise = null;
let libraryStructureCache = null;

const MEDIA_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac']);

async function getMusicMetadata() {
    if (!musicMetadataModulePromise) {
        musicMetadataModulePromise = import('music-metadata');
    }
    return musicMetadataModulePromise;
}

function isMediaFile(fileName) {
    return MEDIA_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function getPlaylistScanPath(subfolder) {
    if (subfolder?.path && typeof subfolder.path === 'string' && subfolder.path.trim()) {
        return subfolder.path.trim();
    }

    if (subfolder?.link && typeof subfolder.link === 'string' && subfolder.link.trim() && subfolder.link !== '#') {
        return subfolder.link.trim();
    }

    return null;
}

function toPublicMediaUrl(filePath) {
    return `/api/media?path=${encodeURIComponent(filePath)}`;
}

function normalizePathForComparison(targetPath) {
    const resolved = path.normalize(path.resolve(String(targetPath || '')));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInsideRoot(targetPath, rootPath) {
    const normalizedTarget = normalizePathForComparison(targetPath);
    const normalizedRoot = normalizePathForComparison(rootPath);

    if (!normalizedTarget || !normalizedRoot) {
        return false;
    }

    if (normalizedTarget === normalizedRoot) {
        return true;
    }

    const rootWithSeparator = normalizedRoot.endsWith(path.sep)
        ? normalizedRoot
        : `${normalizedRoot}${path.sep}`;

    return normalizedTarget.startsWith(rootWithSeparator);
}

async function getAllowedMediaRoots() {
    const structure = await loadLibraryStructure();
    const folders = structure?.library?.folders || [];
    const rootsByKey = new Map();

    for (const folder of folders) {
        for (const subfolder of folder.subfolders || []) {
            const scanPath = getPlaylistScanPath(subfolder);
            if (!scanPath || typeof scanPath !== 'string') continue;

            const resolvedRoot = path.resolve(scanPath.trim());

            try {
                const rootStat = await fs.stat(resolvedRoot);
                if (!rootStat.isDirectory()) {
                    continue;
                }
            } catch {
                continue;
            }

            const compareKey = normalizePathForComparison(resolvedRoot);
            if (!rootsByKey.has(compareKey)) {
                rootsByKey.set(compareKey, resolvedRoot);
            }
        }
    }

    return Array.from(rootsByKey.values());
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'item';
}

function createId(prefix, value) {
    return `${prefix}-${slugify(value)}-${Date.now().toString(36)}`;
}

function getEmptyLibraryStructure() {
    return {
        library: {
            name: 'My Music Collection',
            folders: []
        }
    };
}

function normalizeLibraryStructure(input) {
    const libraryName = input?.library?.name || 'My Music Collection';
    const folders = Array.isArray(input?.library?.folders) ? input.library.folders : [];

    return {
        library: {
            name: libraryName,
            folders: folders.map(folder => ({
                id: folder.id || createId('genre', folder.name || 'genre'),
                name: folder.name || 'Unnamed Genre',
                icon: folder.icon || 'fa-music',
                color: folder.color || '#6366f1',
                imageUrl: (typeof folder.imageUrl === 'string' && folder.imageUrl.trim()) ? folder.imageUrl.trim() : null,
                description: folder.description || '',
                subfolders: (Array.isArray(folder.subfolders) ? folder.subfolders : []).map(subfolder => ({
                    id: subfolder.id || createId('playlist', subfolder.name || 'playlist'),
                    name: subfolder.name || 'Unnamed Playlist',
                    artists: subfolder.artists || subfolder.name || 'Various Artists',
                    path: subfolder.path || subfolder.link || '',
                    link: subfolder.path || subfolder.link || '',
                    isFavorite: (typeof subfolder.isFavorite === 'boolean')
                        ? subfolder.isFavorite
                        : String(subfolder.isFavorite || '').toLowerCase() === 'true',
                    coverImage: subfolder.coverImage || null,
                    images: Array.isArray(subfolder.images) ? subfolder.images : (subfolder.coverImage ? [subfolder.coverImage] : [])
                }))
            }))
        }
    };
}

async function saveLibraryStructure(structure) {
    const normalized = normalizeLibraryStructure(structure);
    await fs.writeFile(LIBRARY_STRUCTURE_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
    libraryStructureCache = normalized;
    return normalized;
}

async function loadLibraryStructure() {
    if (libraryStructureCache) {
        return libraryStructureCache;
    }

    try {
        const raw = await fs.readFile(LIBRARY_STRUCTURE_FILE, 'utf-8');
        libraryStructureCache = normalizeLibraryStructure(JSON.parse(raw));
        return libraryStructureCache;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Error loading ${LIBRARY_STRUCTURE_FILE}:`, error);
            throw error;
        }

        const emptyStructure = getEmptyLibraryStructure();
        return saveLibraryStructure(emptyStructure);
    }
}

function invalidateScannedCache() {
    libraryCache = null;
    lastScanTime = null;
    metadataCache = {};
}

function summarizeLibrary(library) {
    const folders = library?.folders || [];
    const totalPlaylists = folders.reduce((sum, folder) => sum + (folder.subfolders?.length || 0), 0);
    const totalTracks = folders.reduce((sum, folder) => {
        return sum + (folder.subfolders || []).reduce((playlistSum, subfolder) => {
            return playlistSum + (subfolder.trackCount || 0);
        }, 0);
    }, 0);

    return {
        totalGenres: folders.length,
        totalPlaylists,
        totalTracks
    };
}

function findPlaylistInStructure(structure, playlistId) {
    const folders = structure?.library?.folders || [];

    for (const folder of folders) {
        const playlists = Array.isArray(folder.subfolders) ? folder.subfolders : [];
        const index = playlists.findIndex(playlist => playlist.id === playlistId);
        if (index !== -1) {
            return {
                folder,
                playlists,
                playlist: playlists[index],
                index
            };
        }
    }

    return null;
}

function findGenreInStructure(structure, genreId) {
    const folders = structure?.library?.folders || [];
    const index = folders.findIndex(folder => folder.id === genreId);

    if (index === -1) {
        return null;
    }

    return {
        folders,
        genre: folders[index],
        index
    };
}

function calculatePlaylistDuration(tracks) {
    const totalSeconds = tracks.reduce((sum, track) => {
        if (!track.duration || !track.duration.includes(':')) return sum;
        const [mins, secs] = track.duration.split(':').map(Number);
        return sum + ((mins || 0) * 60) + (secs || 0);
    }, 0);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Recursively scan directory for media files
async function scanDirectoryRecursive(dirPath) {
    const tracks = [];
    
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const filePath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                const nestedTracks = await scanDirectoryRecursive(filePath);
                tracks.push(...nestedTracks);
                continue;
            }

            if (entry.isFile() && isMediaFile(entry.name)) {
                const trackData = await extractMetadata(filePath, entry.name);
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
        
        const mm = await getMusicMetadata();
        const metadata = await mm.parseFile(filePath);
        const common = metadata.common;
        const format = metadata.format;
        
        const track = {
            file: toPublicMediaUrl(filePath),
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
            file: toPublicMediaUrl(filePath),
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

// API: Stream media file from local filesystem
app.get('/api/media', async (req, res) => {
    try {
        const requestedPath = req.query.path;
        if (!requestedPath || typeof requestedPath !== 'string') {
            return res.status(400).json({ error: 'Missing media file path' });
        }

        const normalizedPath = path.normalize(requestedPath);
        const resolvedPath = path.resolve(normalizedPath);

        if (!isMediaFile(resolvedPath)) {
            return res.status(400).json({ error: 'Unsupported media format' });
        }

        const allowedRoots = await getAllowedMediaRoots();
        if (!allowedRoots.length) {
            return res.status(403).json({ error: 'No approved media folders configured' });
        }

        const isAllowedPath = allowedRoots.some(root => isPathInsideRoot(resolvedPath, root));
        if (!isAllowedPath) {
            return res.status(403).json({ error: 'Media path is outside approved library folders' });
        }

        const stat = await fs.stat(resolvedPath);
        if (!stat.isFile()) {
            return res.status(404).json({ error: 'Media file not found' });
        }

        return res.sendFile(resolvedPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ error: 'Media file not found' });
        }
        console.error('Error serving media file:', error);
        return res.status(500).json({ error: 'Failed to load media file' });
    }
});

// Format duration from seconds to mm:ss
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function buildWindowsSystemVolumeCommand(targetLevel = null) {
    const shouldSet = Number.isFinite(targetLevel);
    const sanitizedLevel = shouldSet
        ? Math.max(0, Math.min(1, Number(targetLevel))).toFixed(4)
        : null;

    const setCommand = shouldSet
        ? `[Audio.AudioManager]::SetMasterVolume([float]${sanitizedLevel})`
        : '';

    return `
${WINDOWS_AUDIO_CORE_SCRIPT}
${setCommand}
$volume = [Audio.AudioManager]::GetMasterVolume()
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $volume
`.trim();
}

async function runPowerShellCommand(command, { timeout = 15000 } = {}) {
    const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NoLogo', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', command],
        {
            maxBuffer: 1024 * 1024,
            timeout,
            windowsHide: true
        }
    );

    return String(stdout || '').trim();
}

function parseSystemVolumeScalar(output) {
    const match = String(output || '').match(/(\d+(?:\.\d+)?)/);
    if (!match) {
        throw new Error('Unable to parse system volume response');
    }

    const value = Number(match[1]);
    if (!Number.isFinite(value)) {
        throw new Error('Invalid system volume value');
    }

    return Math.max(0, Math.min(1, value));
}

async function getWindowsSystemVolume() {
    if (process.platform !== 'win32') {
        throw new Error('System volume sync is currently supported on Windows only.');
    }

    const output = await runPowerShellCommand(buildWindowsSystemVolumeCommand(), { timeout: 20000 });
    return parseSystemVolumeScalar(output);
}

async function setWindowsSystemVolume(targetLevel) {
    if (process.platform !== 'win32') {
        throw new Error('System volume sync is currently supported on Windows only.');
    }

    const output = await runPowerShellCommand(buildWindowsSystemVolumeCommand(targetLevel), { timeout: 20000 });
    return parseSystemVolumeScalar(output);
}

async function openFolderPicker() {
    if (process.platform !== 'win32') {
        throw new Error('Folder picker is currently supported on Windows only.');
    }

    const powerShellScript = [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        '$owner = New-Object System.Windows.Forms.Form',
        "$owner.StartPosition = 'CenterScreen'",
        '$owner.Size = New-Object System.Drawing.Size(1,1)',
        '$owner.ShowInTaskbar = $false',
        '$owner.TopMost = $true',
        '$owner.Opacity = 0',
        '$owner.Show()',
        '$owner.Activate()',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        "$dialog.Description = 'Select playlist folder'",
        '$dialog.ShowNewFolderButton = $true',
        '$result = $dialog.ShowDialog($owner)',
        'if ($result -eq [System.Windows.Forms.DialogResult]::OK) {',
        '  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '  Write-Output $dialog.SelectedPath',
        '}',
        '$owner.Close()'
    ].join('; ');

    const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NoLogo', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Normal', '-Command', powerShellScript],
        {
            maxBuffer: 1024 * 1024,
            timeout: 300000,
            windowsHide: false
        }
    );

    return String(stdout || '').trim();
}

async function buildLibraryFromScan() {
    const structure = await loadLibraryStructure();
    const library = deepClone(structure.library || { name: 'My Music Collection', folders: [] });

    for (const folder of library.folders || []) {
        for (const subfolder of folder.subfolders || []) {
            const scanPath = getPlaylistScanPath(subfolder);
            let tracks = [];

            if (scanPath) {
                console.log(`Scanning ${scanPath}...`);
                tracks = await scanDirectoryRecursive(scanPath);
            }

            subfolder.tracks = tracks;
            subfolder.trackCount = tracks.length;
            subfolder.duration = calculatePlaylistDuration(tracks);

            // Use first 4 tracks' covers as images (or fallback to coverImage)
            subfolder.images = tracks
                .slice(0, 4)
                .map(t => t.cover)
                .filter(c => c)
                .concat([
                    subfolder.coverImage,
                    subfolder.coverImage,
                    subfolder.coverImage,
                    subfolder.coverImage
                ].filter(Boolean))
                .slice(0, 4);
        }
    }

    return library;
}

async function getScannedLibrary(forceRescan = false) {
    if (!forceRescan && libraryCache) {
        return {
            library: libraryCache,
            lastScan: lastScanTime,
            summary: summarizeLibrary(libraryCache),
            cached: true
        };
    }

    if (scanInProgressPromise) {
        return scanInProgressPromise;
    }

    if (forceRescan) {
        invalidateScannedCache();
    }

    scanInProgressPromise = (async () => {
        const scannedLibrary = await buildLibraryFromScan();
        libraryCache = scannedLibrary;
        lastScanTime = new Date();

        return {
            library: libraryCache,
            lastScan: lastScanTime,
            summary: summarizeLibrary(libraryCache),
            cached: false
        };
    })();

    try {
        return await scanInProgressPromise;
    } finally {
        scanInProgressPromise = null;
    }
}

// API: Get editable library structure (no scanned tracks)
app.get('/api/library-structure', async (req, res) => {
    try {
        const structure = await loadLibraryStructure();
        res.json(structure);
    } catch (error) {
        console.error('Error getting library structure:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get genre catalog for dropdowns/forms
app.get('/api/genres', async (req, res) => {
    try {
        const structure = await loadLibraryStructure();
        const genres = (structure?.library?.folders || []).map(folder => ({
            id: folder.id,
            name: folder.name,
            icon: folder.icon || 'fa-music',
            color: folder.color || '#6366f1',
            imageUrl: folder.imageUrl || null,
            description: folder.description || '',
            playlistCount: Array.isArray(folder.subfolders) ? folder.subfolders.length : 0
        }));

        res.json({ genres });
    } catch (error) {
        console.error('Error getting genres:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Open native folder picker dialog
app.get('/api/select-folder', async (req, res) => {
    try {
        const selectedPath = await openFolderPicker();

        if (!selectedPath) {
            return res.json({ cancelled: true, path: null });
        }

        return res.json({
            cancelled: false,
            path: path.normalize(selectedPath)
        });
    } catch (error) {
        console.error('Error opening folder picker:', error);
        return res.status(500).json({ error: error.message || 'Failed to open folder picker' });
    }
});

// API: Get current OS master volume (0..1)
app.get('/api/system-volume', async (req, res) => {
    try {
        if (process.platform !== 'win32') {
            return res.status(501).json({
                supported: false,
                error: 'System volume sync is currently supported on Windows only.'
            });
        }

        const volume = await getWindowsSystemVolume();
        return res.json({ supported: true, volume });
    } catch (error) {
        console.error('Error getting system volume:', error);
        return res.status(500).json({
            supported: false,
            error: error.message || 'Failed to read system volume'
        });
    }
});

// API: Set OS master volume (0..1)
app.post('/api/system-volume', async (req, res) => {
    try {
        if (process.platform !== 'win32') {
            return res.status(501).json({
                supported: false,
                error: 'System volume sync is currently supported on Windows only.'
            });
        }

        const rawVolume = req.body?.volume;
        const targetVolume = Number(rawVolume);

        if (!Number.isFinite(targetVolume)) {
            return res.status(400).json({ error: 'volume must be a number between 0 and 1' });
        }

        const volume = await setWindowsSystemVolume(targetVolume);
        return res.json({ supported: true, volume });
    } catch (error) {
        console.error('Error setting system volume:', error);
        return res.status(500).json({
            supported: false,
            error: error.message || 'Failed to set system volume'
        });
    }
});

// API: Add genre
app.post('/api/genres', async (req, res) => {
    try {
        const { name, icon, color, description, imageUrl } = req.body || {};
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'Genre name is required' });
        }

        const normalizedName = name.trim();
        const normalizedImageUrl = (typeof imageUrl === 'string') ? imageUrl.trim() : '';

        const structure = await loadLibraryStructure();
        const duplicate = (structure?.library?.folders || []).some(folder =>
            String(folder?.name || '').trim().toLowerCase() === normalizedName.toLowerCase()
        );

        if (duplicate) {
            return res.status(409).json({ error: 'A genre with this name already exists' });
        }

        const newGenre = {
            id: createId('genre', normalizedName),
            name: normalizedName,
            icon: icon || 'fa-music',
            color: color || '#6366f1',
            imageUrl: normalizedImageUrl || null,
            description: description || '',
            subfolders: []
        };

        structure.library.folders.push(newGenre);
        await saveLibraryStructure(structure);
        invalidateScannedCache();

        res.status(201).json({ message: 'Genre created', genre: newGenre });
    } catch (error) {
        console.error('Error creating genre:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Update genre metadata
app.patch('/api/genres/:id', async (req, res) => {
    try {
        const genreId = req.params.id;
        const { name, icon, color, description, imageUrl } = req.body || {};

        const structure = await loadLibraryStructure();
        const found = findGenreInStructure(structure, genreId);

        if (!found) {
            return res.status(404).json({ error: 'Genre not found' });
        }

        const hasName = typeof name === 'string';
        const hasIcon = typeof icon === 'string';
        const hasColor = typeof color === 'string';
        const hasDescription = typeof description === 'string';
        const hasImageUrl = typeof imageUrl === 'string' || imageUrl === null;

        if (!hasName && !hasIcon && !hasColor && !hasDescription && !hasImageUrl) {
            return res.status(400).json({ error: 'No genre fields provided to update' });
        }

        if (hasName) {
            const nextName = name.trim();
            if (!nextName) {
                return res.status(400).json({ error: 'Genre name cannot be empty' });
            }

            const duplicate = (structure?.library?.folders || []).some(folder =>
                folder.id !== genreId &&
                String(folder?.name || '').trim().toLowerCase() === nextName.toLowerCase()
            );

            if (duplicate) {
                return res.status(409).json({ error: 'A genre with this name already exists' });
            }

            found.genre.name = nextName;
        }

        if (hasIcon) {
            const nextIcon = icon.trim();
            found.genre.icon = nextIcon || 'fa-music';
        }

        if (hasColor) {
            const nextColor = color.trim();
            found.genre.color = nextColor || '#6366f1';
        }

        if (hasDescription) {
            found.genre.description = description.trim();
        }

        if (hasImageUrl) {
            const nextImage = typeof imageUrl === 'string' ? imageUrl.trim() : '';
            found.genre.imageUrl = nextImage || null;
        }

        await saveLibraryStructure(structure);
        invalidateScannedCache();

        return res.json({
            message: 'Genre updated',
            genre: found.genre
        });
    } catch (error) {
        console.error('Error updating genre:', error);
        return res.status(500).json({ error: error.message });
    }
});

// API: Add playlist folder mapping
app.post('/api/playlists', async (req, res) => {
    try {
        const { genreId, genre, genreName, name, artists, folderPath, coverImage, isFavorite } = req.body || {};
        const requestedGenreName = (typeof genre === 'string' && genre.trim())
            ? genre.trim()
            : ((typeof genreName === 'string' && genreName.trim()) ? genreName.trim() : null);

        if ((!genreId || typeof genreId !== 'string') && !requestedGenreName) {
            return res.status(400).json({ error: 'genre (text) or genreId is required' });
        }
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'Playlist name is required' });
        }
        if (!folderPath || typeof folderPath !== 'string' || !folderPath.trim()) {
            return res.status(400).json({ error: 'folderPath is required' });
        }

        const normalizedFolderPath = path.normalize(folderPath.trim());

        try {
            const folderStat = await fs.stat(normalizedFolderPath);
            if (!folderStat.isDirectory()) {
                return res.status(400).json({ error: 'folderPath must point to an existing directory' });
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(400).json({ error: 'folderPath does not exist' });
            }
            throw error;
        }

        const structure = await loadLibraryStructure();
        const allGenres = structure.library.folders || [];

        let targetGenre = null;

        if (genreId && typeof genreId === 'string') {
            targetGenre = allGenres.find(folder => folder.id === genreId) || null;
        }

        if (!targetGenre && requestedGenreName) {
            const normalizedRequestedName = requestedGenreName.toLowerCase();
            targetGenre = allGenres.find(folder => (folder.name || '').trim().toLowerCase() === normalizedRequestedName) || null;
        }

        if (!targetGenre) {
            if (!requestedGenreName) {
                return res.status(404).json({ error: 'Genre not found' });
            }

            targetGenre = {
                id: createId('genre', requestedGenreName),
                name: requestedGenreName,
                icon: 'fa-music',
                color: '#6366f1',
                imageUrl: null,
                description: '',
                subfolders: []
            };

            structure.library.folders.push(targetGenre);
        }

        const newPlaylist = {
            id: createId('playlist', name),
            name: name.trim(),
            artists: (artists && String(artists).trim()) || name.trim(),
            path: normalizedFolderPath,
            link: normalizedFolderPath,
            isFavorite: Boolean(isFavorite),
            coverImage: (coverImage && String(coverImage).trim()) || null,
            images: coverImage ? [coverImage] : []
        };

        targetGenre.subfolders.push(newPlaylist);
        await saveLibraryStructure(structure);
        invalidateScannedCache();

        res.status(201).json({ message: 'Playlist mapping created', playlist: newPlaylist });
    } catch (error) {
        console.error('Error creating playlist mapping:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Update playlist mapping
app.patch('/api/playlists/:id', async (req, res) => {
    try {
        const playlistId = req.params.id;
        const { name, artists, folderPath, coverImage, isFavorite } = req.body || {};

        const structure = await loadLibraryStructure();
        const found = findPlaylistInStructure(structure, playlistId);

        if (!found) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const hasName = typeof name === 'string';
        const hasArtists = typeof artists === 'string';
        const hasFolderPath = typeof folderPath === 'string';
        const hasCoverImage = typeof coverImage === 'string' || coverImage === null;
        const hasIsFavorite = typeof isFavorite === 'boolean';

        if (!hasName && !hasArtists && !hasFolderPath && !hasCoverImage && !hasIsFavorite) {
            return res.status(400).json({ error: 'No playlist fields provided to update' });
        }

        if (hasName) {
            const nextName = name.trim();
            if (!nextName) {
                return res.status(400).json({ error: 'Playlist name cannot be empty' });
            }
            found.playlist.name = nextName;
        }

        if (hasArtists) {
            const nextArtists = artists.trim();
            found.playlist.artists = nextArtists || found.playlist.name;
        }

        if (hasFolderPath) {
            const nextFolderPath = folderPath.trim();
            if (!nextFolderPath) {
                return res.status(400).json({ error: 'folderPath cannot be empty' });
            }

            const normalizedFolderPath = path.normalize(nextFolderPath);

            try {
                const folderStat = await fs.stat(normalizedFolderPath);
                if (!folderStat.isDirectory()) {
                    return res.status(400).json({ error: 'folderPath must point to an existing directory' });
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return res.status(400).json({ error: 'folderPath does not exist' });
                }
                throw error;
            }

            found.playlist.path = normalizedFolderPath;
            found.playlist.link = normalizedFolderPath;
        }

        if (hasCoverImage) {
            const nextCover = typeof coverImage === 'string' ? coverImage.trim() : '';
            found.playlist.coverImage = nextCover || null;
            found.playlist.images = nextCover ? [nextCover] : [];
        }

        if (hasIsFavorite) {
            found.playlist.isFavorite = isFavorite;
        }

        await saveLibraryStructure(structure);
        invalidateScannedCache();

        return res.json({
            message: 'Playlist updated',
            playlist: found.playlist
        });
    } catch (error) {
        console.error('Error updating playlist mapping:', error);
        return res.status(500).json({ error: error.message });
    }
});

// API: Delete playlist mapping
app.delete('/api/playlists/:id', async (req, res) => {
    try {
        const playlistId = req.params.id;

        const structure = await loadLibraryStructure();
        const found = findPlaylistInStructure(structure, playlistId);

        if (!found) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const removed = found.playlists.splice(found.index, 1)[0];

        await saveLibraryStructure(structure);
        invalidateScannedCache();

        return res.json({
            message: 'Playlist deleted',
            playlist: removed
        });
    } catch (error) {
        console.error('Error deleting playlist mapping:', error);
        return res.status(500).json({ error: error.message });
    }
});

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
        const response = await getScannedLibrary(false);
        res.json(response);
    } catch (error) {
        console.error('Error getting library:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Rescan library (force refresh)
app.post('/api/rescan', async (req, res) => {
    try {
        const response = await getScannedLibrary(true);
        res.json({
            ...response,
            message: 'Library rescanned successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Get tracks for specific playlist
app.get('/api/playlist/:id', async (req, res) => {
    try {
        const data = await getScannedLibrary(false);
        const playlistId = req.params.id;

        let targetPlaylist = null;

        // Find the playlist
        for (const folder of data.library.folders || []) {
            for (const subfolder of folder.subfolders || []) {
                if (subfolder.id === playlistId) {
                    targetPlaylist = subfolder;
                    break;
                }
            }
            if (targetPlaylist) break;
        }
        
        if (!targetPlaylist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        res.json({ playlist: targetPlaylist, tracks: targetPlaylist.tracks || [] });
        
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
    console.log(`  GET  /api/library-structure - Get editable library folder structure`);
    console.log(`  GET  /api/genres           - List existing genres for dropdowns`);
    console.log(`  POST /api/genres            - Create a genre from UI`);
    console.log(`  POST /api/playlists         - Map a playlist to a folder path`);
    console.log(`  GET  /api/library       - Get full library with scanned tracks (cached)`);
    console.log(`  GET  /api/playlist/:id  - Get specific playlist tracks from cache`);
    console.log(`  GET  /api/system-volume - Get Windows master volume (0..1)`);
    console.log(`  POST /api/system-volume - Set Windows master volume (0..1)`);
    console.log(`  POST /api/rescan        - Force immediate rescan and refresh cache`);
    console.log(`  POST /api/upload        - Upload new MP3 files\n`);

    // Ensure library structure exists and do initial scan on startup
    loadLibraryStructure()
        .then(() => getScannedLibrary(true))
        .then((result) => {
            console.log(`✅ Startup scan complete: ${result.summary.totalTracks} tracks across ${result.summary.totalPlaylists} playlists`);
        })
        .catch((error) => {
            console.error('⚠️ Startup scan failed:', error.message);
        });
});