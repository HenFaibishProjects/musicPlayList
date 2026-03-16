// Data Management & API
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';
const RECENT_TRACKS_STORAGE_KEY = 'lidaplay_recent_tracks_v1';
const SESSION_STORAGE_KEY = 'lidaplay_listening_session_v1';
const PINNED_PLAYLISTS_STORAGE_KEY = 'lidaplay_pinned_playlists_v1';
const PLAYBACK_SPEED_STORAGE_KEY = 'lidaplay_playback_speed_v1';
const MAX_RECENT_TRACKS = 100;
const MAX_PINNED_PLAYLISTS = 10;

// Global state
let libraryData = null;
let apiAvailable = false;
let isRescanningLibrary = false;
let recentTracks = [];
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