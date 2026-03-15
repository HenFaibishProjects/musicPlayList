// Data Management & API
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';
const RECENT_TRACKS_STORAGE_KEY = 'musicvault_recent_tracks_v1';
const SMART_PLAYLISTS_STORAGE_KEY = 'musicvault_smart_playlists_v1';
const SESSION_STORAGE_KEY = 'musicvault_listening_session_v1';
const PINNED_PLAYLISTS_STORAGE_KEY = 'musicvault_pinned_playlists_v1';
const MAX_RECENT_TRACKS = 100;
const MAX_PINNED_PLAYLISTS = 10;

// Global state
let libraryData = null;
let apiAvailable = false;
let isRescanningLibrary = false;
let recentTracks = [];
let smartPlaylists = [];
let listeningSession = null;
let sessionSaveTimer = null;
let pinnedPlaylists = [];

// Utility functions
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

function sanitizeColor(value, fallback = '#6366f1') {
    const candidate = String(value || '').trim();
    return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(candidate) ? candidate : fallback;
}

function sanitizeImageUrl(value, fallback = DEFAULT_COVER) {
    const candidate = String(value || '').trim();
    if (!candidate) return fallback;
    const lower = candidate.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://') || 
        lower.startsWith('data:image/') || lower.startsWith('blob:') || lower.startsWith('/api/')) {
        return candidate;
    }
    return fallback;
}

function sanitizeClassList(value, fallback = '') {
    const tokens = String(value || '').split(/\s+/).map(token => token.trim())
        .filter(token => /^[a-z0-9-]+$/i.test(token));
    return tokens.length ? tokens.join(' ') : fallback;
}

function getEmptyLibraryData() {
    return {
        library: { name: 'My Music Collection', folders: [] },
        summary: { totalGenres: 0, totalPlaylists: 0, totalTracks: 0 }
    };
}

function normalizeLibraryPayload(payload) {
    if (!payload) return { library: { folders: [] } };
    return payload.library ? payload : { library: payload };
}

// API
async function apiRequest(url, options = {}) {
    const response = await fetch(url, options);
    let data = null;
    try { data = await response.json(); } catch (error) { data = null; }
    if (!response.ok) {
        const errorMessage = data?.error || `${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
    }
    return data;
}

async function fetchLibraryData({ forceRescan = false } = {}) {
    const endpoint = forceRescan ? 'http://localhost:3000/api/rescan' : 'http://localhost:3000/api/library';
    const method = forceRescan ? 'POST' : 'GET';
    const payload = await apiRequest(endpoint, { method });
    return normalizeLibraryPayload(payload);
}

// Recent Tracks Storage
function normalizeRecentTrack(track = {}) {
    const title = track.title || 'Unknown Title';
    const artist = track.artist || 'Unknown Artist';
    const file = track.file || '';
    const id = track.id || file || `${title}::${artist}`;
    return {
        id, title, artist,
        album: track.album || '',
        duration: track.duration || '--:--',
        cover: track.cover || DEFAULT_COVER,
        file,
        playlistName: track.playlistName || '',
        genreName: track.genreName || '',
        playedAt: Number(track.playedAt) || Date.now()
    };
}

function loadRecentTracksFromStorage() {
    try {
        const raw = localStorage.getItem(RECENT_TRACKS_STORAGE_KEY);
        if (!raw) { recentTracks = []; return; }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) { recentTracks = []; return; }
        recentTracks = parsed.map(normalizeRecentTrack)
            .filter(track => track.file || track.title).slice(0, MAX_RECENT_TRACKS);
    } catch (error) {
        console.warn('Failed to load recently played tracks from storage:', error);
        recentTracks = [];
    }
}

function saveRecentTracksToStorage() {
    try {
        localStorage.setItem(RECENT_TRACKS_STORAGE_KEY, JSON.stringify(recentTracks.slice(0, MAX_RECENT_TRACKS)));
    } catch (error) {
        console.warn('Failed to persist recently played tracks:', error);
    }
}

function addTrackToRecentlyPlayed(track, context = {}) {
    if (!track) return;
    const normalizedTrack = normalizeRecentTrack({
        ...track,
        playlistName: context.playlistName || track.playlistName || '',
        genreName: context.genreName || track.genreName || '',
        playedAt: Date.now()
    });
    const latestTrack = recentTracks[0];
    if (latestTrack && latestTrack.id === normalizedTrack.id && 
        Date.now() - Number(latestTrack.playedAt || 0) < 15000) return;
    const dedupeIndex = recentTracks.findIndex(item => item.id === normalizedTrack.id);
    if (dedupeIndex >= 0) recentTracks.splice(dedupeIndex, 1);
    recentTracks.unshift(normalizedTrack);
    recentTracks = recentTracks.slice(0, MAX_RECENT_TRACKS);
    saveRecentTracksToStorage();
}

// Smart Playlists Storage
function loadSmartPlaylists() {
    try {
        const raw = localStorage.getItem(SMART_PLAYLISTS_STORAGE_KEY);
        if (!raw) {
            smartPlaylists = getDefaultSmartPlaylists();
            saveSmartPlaylists();
            return;
        }
        const parsed = JSON.parse(raw);
        smartPlaylists = Array.isArray(parsed) ? parsed : getDefaultSmartPlaylists();
    } catch (error) {
        console.warn('Failed to load smart playlists:', error);
        smartPlaylists = getDefaultSmartPlaylists();
    }
}

function saveSmartPlaylists() {
    try {
        localStorage.setItem(SMART_PLAYLISTS_STORAGE_KEY, JSON.stringify(smartPlaylists));
    } catch (error) {
        console.warn('Failed to save smart playlists:', error);
    }
}

function getDefaultSmartPlaylists() {
    return [
        {
            id: 'smart-high-energy', name: 'High Energy Workout', icon: 'fa-dumbbell',
            color: '#f97316', matchType: 'all',
            rules: [{ field: 'bpm', operator: 'greater', value: '120' }]
        },
        {
            id: 'smart-classics', name: 'Classic Oldies', icon: 'fa-compact-disc',
            color: '#3b82f6', matchType: 'all',
            rules: [{ field: 'year', operator: 'less', value: '1990' }]
        },
        {
            id: 'smart-recent', name: 'Recently Added', icon: 'fa-clock',
            color: '#10b981', matchType: 'all',
            rules: [{ field: 'addedDays', operator: 'less', value: '30' }]
        }
    ];
}

function getAllTracksWithContext() {
    const folders = libraryData?.library?.folders || [];
    return folders.flatMap(folder =>
        (folder.subfolders || []).flatMap(playlist =>
            (playlist.tracks || []).map(track => ({
                ...track,
                __genreName: folder.name,
                __genreColor: folder.color,
                __playlistName: playlist.name,
                __playlistArtists: playlist.artists
            }))
        )
    );
}

function getAllPlaylistsWithGenre() {
    const folders = libraryData?.library?.folders || [];
    return folders.flatMap(folder =>
        (folder.subfolders || []).map(playlist => ({
            ...playlist,
            __genreName: folder.name,
            __genreColor: folder.color
        }))
    );
}

function formatRelativeTime(timestamp) {
    const value = Number(timestamp);
    if (!value) return 'Just now';
    const elapsed = Date.now() - value;
    const minutes = Math.floor(elapsed / 60000);
    const hours = Math.floor(elapsed / 3600000);
    const days = Math.floor(elapsed / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// Session Management
function saveListeningSession(track, trackIndex, currentTime, playlistData, context) {
    if (!track || !playlistData) return;
    
    const session = {
        track: {
            title: track.title,
            artist: track.artist,
            file: track.file,
            cover: track.cover || DEFAULT_COVER,
            duration: track.duration
        },
        trackIndex: trackIndex,
        currentTime: currentTime || 0,
        playlist: {
            name: playlistData.name || context.playlistName || '',
            genreName: context.genreName || '',
            trackCount: playlistData.length || 0
        },
        timestamp: Date.now()
    };
    
    listeningSession = session;
    
    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
        console.warn('Failed to save listening session:', error);
    }
}

function loadListeningSession() {
    try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) {
            listeningSession = null;
            return null;
        }
        
        const session = JSON.parse(raw);
        
        // Validate session (not older than 7 days)
        const age = Date.now() - (session.timestamp || 0);
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        
        if (age > sevenDays) {
            clearListeningSession();
            return null;
        }
        
        listeningSession = session;
        return session;
    } catch (error) {
        console.warn('Failed to load listening session:', error);
        listeningSession = null;
        return null;
    }
}

function clearListeningSession() {
    listeningSession = null;
    try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear listening session:', error);
    }
}

function scheduleSessionSave(track, trackIndex, currentTime, playlistData, context) {
    if (sessionSaveTimer) {
        clearTimeout(sessionSaveTimer);
    }
    
    sessionSaveTimer = setTimeout(() => {
        saveListeningSession(track, trackIndex, currentTime, playlistData, context);
        sessionSaveTimer = null;
    }, 2000);
}

// Pinned Playlists Management
function loadPinnedPlaylists() {
    try {
        const raw = localStorage.getItem(PINNED_PLAYLISTS_STORAGE_KEY);
        if (!raw) {
            pinnedPlaylists = [];
            return;
        }
        
        const parsed = JSON.parse(raw);
        pinnedPlaylists = Array.isArray(parsed) ? parsed.slice(0, MAX_PINNED_PLAYLISTS) : [];
    } catch (error) {
        console.warn('Failed to load pinned playlists:', error);
        pinnedPlaylists = [];
    }
}

function savePinnedPlaylists() {
    try {
        localStorage.setItem(PINNED_PLAYLISTS_STORAGE_KEY, JSON.stringify(pinnedPlaylists.slice(0, MAX_PINNED_PLAYLISTS)));
    } catch (error) {
        console.warn('Failed to save pinned playlists:', error);
    }
}

function pinPlaylist(playlistId, playlistName, genreName, genreColor) {
    if (!playlistId) return false;
    
    // Check if already pinned
    const existingIndex = pinnedPlaylists.findIndex(p => p.id === playlistId);
    if (existingIndex >= 0) return false;
    
    // Check max limit
    if (pinnedPlaylists.length >= MAX_PINNED_PLAYLISTS) {
        return 'limit_reached';
    }
    
    pinnedPlaylists.push({
        id: playlistId,
        name: playlistName,
        genreName: genreName || '',
        genreColor: genreColor || '#6366f1',
        pinnedAt: Date.now()
    });
    
    savePinnedPlaylists();
    return true;
}

function unpinPlaylist(playlistId) {
    const originalLength = pinnedPlaylists.length;
    pinnedPlaylists = pinnedPlaylists.filter(p => p.id !== playlistId);
    
    if (pinnedPlaylists.length < originalLength) {
        savePinnedPlaylists();
        return true;
    }
    
    return false;
}

function isPlaylistPinned(playlistId) {
    return pinnedPlaylists.some(p => p.id === playlistId);
}
