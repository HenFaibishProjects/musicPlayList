// Main script.js - Entry point that imports functionality from split files

// Global state variables (shared across all modules)
let libraryData = null;
let apiAvailable = false;
let isRescanningLibrary = false;
let currentView = 'all';
let selectedGenre = null;
let searchQuery = '';
let isGlobalSearchActive = false;
let currentGlobalSearchTracks = [];
let currentSort = 'name';
let nameSortDirection = 'asc';
let trackSortDirection = 'asc';
let viewMode = 'grid';
let currentPlaylist = [];
let currentTrackIndex = 0;
let currentPlaylistContext = {};
let playbackOrder = [];
let playbackOrderPosition = 0;
let isShuffle = false;
let repeatMode = 0; // 0: off, 1: all, 2: one
let crossfadeEnabled = false;
let crossfadeDuration = 3; // seconds
let crossfadeTimer = null;
let fadeIntervals = { A: null, B: null };
let activePlayer = 'A';
let isPlaying = false;
let currentVolume = 0.7;
let currentPlaybackSpeed = 1.0;
let isDraggingVolume = false;
let isQueuePanelOpen = false;
let pendingDeletePlaylist = null;
let editingGenreContext = null;
let modalFormBaseline = {};
let systemVolumeSyncSupported = true;
let lastSyncedSystemVolume = null;
let isSyncingSystemVolume = false;
let pendingVolumePushTimer = null;
let queuedSystemVolumeValue = null;
let systemVolumePollIntervalId = null;

// Constants unique to app.js (DEFAULT_COVER is in data.js)
const IMPORTED_PLAYLISTS_STORAGE_KEY = 'lidaplay_imported_playlists';
const STREAM_PROXY_PATH = '/api/stream-proxy?url=';

// Audio elements (will be initialized in initializePlayer)
let audioPlayer = null;
let audioPlayerB = null;

// Note: escapeHtml, sanitizeColor, sanitizeImageUrl, sanitizeClassList are defined in data.js
// Note: formatTime is defined in player.js

// Initialize app
async function init() {
    try {
        createBackgroundParticles();
        loadPlaybackSpeedFromStorage();
        loadListeningSession();
        loadPinnedPlaylists();
        setupEventListeners();
        initializePlayer();

        await syncVolumeFromSystem({ silent: true });
        startSystemVolumePolling();
        setupSystemVolumeSyncTriggers();

        try {
            libraryData = await fetchLibraryData({ forceRescan: false });
            apiAvailable = true;
            console.log('✅ Loaded from API with folder-based scanning');
        } catch (apiError) {
            console.log('⚠️ API not available, starting with empty library structure');
            libraryData = await mergeImportedPlaylistsIntoLibrary(getEmptyLibraryData());
            apiAvailable = false;
            showNotification(
                'Server Not Connected',
                'Start the Node server (`npm start`) to edit your genre and playlist libraries and scan local music folders.',
                'warning'
            );
        }

        setRescanButtonState();
        refreshLibraryUI();
        
        // Clear any loading spinners
        const grid = document.getElementById('folderGrid');
        const loadingDiv = grid?.querySelector('.loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError();
    }
}

// Initialize Music Player
function initializePlayer() {
    audioPlayer = document.getElementById('audioPlayer');
    audioPlayerB = document.getElementById('audioPlayerB');
    
    if (!audioPlayer || !audioPlayerB) {
        console.error('Audio players not found in DOM');
        return;
    }
    
    audioPlayer.volume = currentVolume;
    audioPlayerB.volume = currentVolume;
    
    initializeVolumeSlider();
    updateVolumeIcon();
    
    // Initialize visualizer safely
    if (typeof initVisualizer === 'function') {
        initVisualizer();
    }
    
    // Resize canvas to fit container
    window.addEventListener('resize', resizeVisualizerCanvas);
    resizeVisualizerCanvas();
    startVisualizerPlayback().then(() => {
        if (typeof updateVisualizerToggleButton === 'function') {
            updateVisualizerToggleButton(true);
        }
    }).catch(() => {});
    
    // Player controls
    document.getElementById('playBtn').addEventListener('click', togglePlay);
    document.getElementById('prevBtn').addEventListener('click', playPrevious);
    document.getElementById('nextBtn').addEventListener('click', playNext);
    document.getElementById('shuffleBtn').addEventListener('click', toggleShuffle);
    document.getElementById('repeatBtn').addEventListener('click', toggleRepeat);
    document.getElementById('crossfadeBtn').addEventListener('click', toggleCrossfade);
    document.getElementById('playlistBtn').addEventListener('click', toggleQueuePanel);
    document.getElementById('queueCloseBtn').addEventListener('click', closeQueuePanel);
    document.getElementById('queuePlayAllBtn').addEventListener('click', playQueueFromTop);
    document.getElementById('queueShuffleNowBtn').addEventListener('click', shuffleCurrentQueue);
    document.getElementById('queueClearBtn').addEventListener('click', clearCurrentQueue);

    document.getElementById('queueTrackContainer').addEventListener('click', handleQueueTrackActions);
    
    // Progress bar
    const progressBar = document.getElementById('progressBar');
    progressBar.addEventListener('click', seekTo);
    
    // Volume controls
    document.getElementById('volumeBtn').addEventListener('click', toggleMute);
    
    // Audio events for both players
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', handleTrackEnd);
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
    
    audioPlayerB.addEventListener('timeupdate', () => {
        if (activePlayer === 'B') updateProgress();
    });
    audioPlayerB.addEventListener('ended', handleTrackEnd);
    audioPlayerB.addEventListener('loadedmetadata', () => {
        if (activePlayer === 'B') updateDuration();
    });
    
    audioPlayer.addEventListener('play', () => {
        // Keep visualizer running when playback starts
        startVisualizerPlayback().then(() => {
            if (typeof updateVisualizerToggleButton === 'function') {
                updateVisualizerToggleButton(true);
            }
        }).catch(() => {});
    });
    audioPlayer.addEventListener('pause', () => {
        // Keep visualizer running even when paused
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            togglePlay();
        }
    });
}

// Resize visualizer canvas
function resizeVisualizerCanvas() {
    const canvas = document.getElementById('visualizerCanvas');
    const container = document.getElementById('visualizerContainer');
    if (!canvas || !container) return;

    if (window.getComputedStyle(container).display === 'none') return;

    const headerHeight = container.querySelector('.visualizer-header')?.offsetHeight || 0;
    const nextWidth = Math.max(320, container.clientWidth);
    const nextHeight = Math.max(120, container.clientHeight - headerHeight);

    canvas.width = nextWidth;
    canvas.height = nextHeight;
}

// Show error state
function showError() {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-circle"></i>
            <h3>Failed to Load Genre & Playlist Libraries</h3>
            <p>Could not connect to the backend API. Start the server with <strong>npm start</strong> and reload.</p>
        </div>
    `;
}

// Initialize waveform on load
document.addEventListener('DOMContentLoaded', () => {
    if (typeof initializeProgressWaveform === 'function') {
        setTimeout(initializeProgressWaveform, 100);
    }
});

window.addEventListener('beforeunload', () => {
    releaseQuickPlayObjectUrl();
});

// Initialize on page load
window.onload = init;