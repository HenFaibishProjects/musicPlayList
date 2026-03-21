// Data Management & API
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';
const SESSION_STORAGE_KEY = 'lidaplay_listening_session_v1';
const PINNED_PLAYLISTS_STORAGE_KEY = 'lidaplay_pinned_playlists_v1';
const PLAYBACK_SPEED_STORAGE_KEY = 'lidaplay_playback_speed_v1';
const MAX_PINNED_PLAYLISTS = 10;

// Global state (libraryData, apiAvailable, and isRescanningLibrary are declared in app.js)
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

// ─── Listening Session ───────────────────────────────────────────────────────

function loadListeningSession() {
    try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
            listeningSession = JSON.parse(raw);
        }
    } catch (e) {
        console.warn('Failed to load listening session:', e);
        listeningSession = null;
    }
}

function saveListeningSession() {
    try {
        if (listeningSession) {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(listeningSession));
        } else {
            localStorage.removeItem(SESSION_STORAGE_KEY);
        }
    } catch (e) {
        console.warn('Failed to save listening session:', e);
    }
}

// ─── Pinned Playlists ─────────────────────────────────────────────────────────

function loadPinnedPlaylists() {
    try {
        const raw = localStorage.getItem(PINNED_PLAYLISTS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                pinnedPlaylists = parsed.slice(0, MAX_PINNED_PLAYLISTS);
            }
        }
    } catch (e) {
        console.warn('Failed to load pinned playlists:', e);
        pinnedPlaylists = [];
    }
}

function savePinnedPlaylists() {
    try {
        localStorage.setItem(PINNED_PLAYLISTS_STORAGE_KEY, JSON.stringify(pinnedPlaylists));
    } catch (e) {
        console.warn('Failed to save pinned playlists:', e);
    }
}

function isPinned(id) {
    return Array.isArray(pinnedPlaylists) && pinnedPlaylists.some(p => p.id === id);
}

function togglePinned(id, name, type = 'playlist') {
    if (!Array.isArray(pinnedPlaylists)) pinnedPlaylists = [];
    const idx = pinnedPlaylists.findIndex(p => p.id === id);
    if (idx >= 0) {
        pinnedPlaylists.splice(idx, 1);
    } else {
        if (pinnedPlaylists.length >= MAX_PINNED_PLAYLISTS) {
            pinnedPlaylists.shift(); // remove oldest
        }
        pinnedPlaylists.push({ id, name, type });
    }
    savePinnedPlaylists();
}

// === Recent tracks functions ===

function normalizeRecentTrack(track = {}) {
    const title = track.title || 'Unknown Title';
    const artist = track.artist || 'Unknown Artist';
    const file = track.file || '';
    const id = track.id || file || `${title}::${artist}`;

    return {
        id,
        title,
        artist,
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
        if (!raw) {
            recentTracks = [];
            return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            recentTracks = [];
            return;
        }

        recentTracks = parsed
            .map(normalizeRecentTrack)
            .filter(track => track.file || track.title)
            .slice(0, MAX_RECENT_TRACKS);
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
    if (
        latestTrack &&
        latestTrack.id === normalizedTrack.id &&
        Date.now() - Number(latestTrack.playedAt || 0) < 15000
    ) {
        return;
    }

    const dedupeIndex = recentTracks.findIndex(item => item.id === normalizedTrack.id);
    if (dedupeIndex >= 0) {
        recentTracks.splice(dedupeIndex, 1);
    }

    recentTracks.unshift(normalizedTrack);
    recentTracks = recentTracks.slice(0, MAX_RECENT_TRACKS);
    saveRecentTracksToStorage();

    if (currentView === 'recent') {
        renderRecentlyPlayed();
        updateStatsForRecentlyPlayed();
        updateWorkspaceStatus();
    }
}
