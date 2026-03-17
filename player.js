// Audio Player Management
let audioPlayer = null;
let audioPlayerB = null;
let activePlayer = 'A';
let currentPlaylist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0;
let currentVolume = 0.7;
let crossfadeEnabled = false;
let crossfadeDuration = 3;
let crossfadeTimer = null;
let fadeIntervals = { A: null, B: null };
let playbackOrder = [];
let playbackOrderPosition = 0;
let isDraggingVolume = false;
let systemVolumeSyncSupported = true;
let isSyncingSystemVolume = false;
let systemVolumePollIntervalId = null;
let queuedSystemVolumeValue = null;
let pendingVolumePushTimer = null;
let lastSyncedSystemVolume = null;
let currentPlaylistContext = { playlistName: '', genreName: '' };
let currentPlaybackSpeed = 1.0;

function shuffleArrayInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function rebuildPlaybackOrder(startIndex = currentTrackIndex) {
    const total = currentPlaylist.length;
    if (!total) {
        playbackOrder = []; playbackOrderPosition = 0; currentTrackIndex = 0;
        return;
    }
    const safeIndex = Math.max(0, Math.min(total - 1, Number(startIndex) || 0));
    const indices = Array.from({ length: total }, (_, index) => index);
    if (isShuffle) {
        const remaining = indices.filter(index => index !== safeIndex);
        shuffleArrayInPlace(remaining);
        playbackOrder = [safeIndex, ...remaining];
        playbackOrderPosition = 0;
    } else {
        playbackOrder = indices;
        playbackOrderPosition = safeIndex;
    }
    currentTrackIndex = safeIndex;
}

function getActivePlayer() { return activePlayer === 'A' ? audioPlayer : audioPlayerB; }
function getInactivePlayer() { return activePlayer === 'A' ? audioPlayerB : audioPlayer; }

function loadTrack(track) {
    if (crossfadeTimer) { clearTimeout(crossfadeTimer); crossfadeTimer = null; }
    if (fadeIntervals.A) { clearInterval(fadeIntervals.A); fadeIntervals.A = null; }
    if (fadeIntervals.B) { clearInterval(fadeIntervals.B); fadeIntervals.B = null; }
    audioPlayer.pause(); audioPlayerB.pause();
    audioPlayer.currentTime = 0; audioPlayerB.currentTime = 0;
    audioPlayer.volume = currentVolume; audioPlayerB.volume = currentVolume;
    audioPlayer.playbackRate = currentPlaybackSpeed;
    audioPlayerB.playbackRate = currentPlaybackSpeed;
    audioPlayer.src = track.file;
    activePlayer = 'A';
    document.getElementById('playerTitle').textContent = track.title;
    document.getElementById('playerArtist').textContent = track.artist;
    const playerCover = document.getElementById('playerCover');
    if (playerCover) {
        playerCover.src = track.cover || DEFAULT_COVER;
    }
    initializeProgressWaveform();
    
    // For streaming URLs, set up metadata monitoring
    if (track.file && track.file.startsWith('http')) {
        setupStreamMetadataMonitoring(track);
    }
}

// Monitor stream metadata for live updates (radio stations)
let metadataMonitorInterval = null;

function setupStreamMetadataMonitoring(track) {
    // Clear any existing monitor
    if (metadataMonitorInterval) {
        clearInterval(metadataMonitorInterval);
        metadataMonitorInterval = null;
    }
    
    // Check for metadata updates every 30 seconds
    metadataMonitorInterval = setInterval(async () => {
        if (!isPlaying || !track.file.startsWith('http')) {
            clearInterval(metadataMonitorInterval);
            metadataMonitorInterval = null;
            return;
        }
        
        try {
            if (typeof fetchStreamMetadata === 'function') {
                const metadata = await fetchStreamMetadata(track.file);
                if (metadata && metadata.title) {
                    // Update UI with live metadata
                    const titleEl = document.getElementById('playerTitle');
                    const artistEl = document.getElementById('playerArtist');
                    
                    if (titleEl && metadata.title !== titleEl.textContent) {
                        titleEl.textContent = metadata.title;
                    }
                    if (artistEl && metadata.artist) {
                        artistEl.textContent = metadata.artist;
                    }
                }
            }
        } catch (e) {
            // Metadata fetch failed, continue with current info
        }
    }, 30000);
}

function playTrack() {
    const currentPlayer = getActivePlayer();
    currentPlayer.play().catch(err => console.error('Error playing audio:', err));
    isPlaying = true;
    const currentTrack = currentPlaylist[currentTrackIndex];
    if (currentTrack) {
        // Track in listening history calendar
        if (typeof trackPlayInHistory === 'function') {
            trackPlayInHistory(currentTrack, currentPlaylistContext);
        }
    }
    updatePlayButton();
}

function pauseTrack() {
    audioPlayer.pause(); audioPlayerB.pause(); isPlaying = false;
    if (crossfadeTimer) { clearTimeout(crossfadeTimer); crossfadeTimer = null; }
    updatePlayButton();
}

function togglePlay() {
    if (currentPlaylist.length === 0) return;
    isPlaying ? pauseTrack() : playTrack();
}

function updatePlayButton() {
    const playBtn = document.getElementById('playBtn');
    const icon = playBtn.querySelector('i');
    icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
    document.body.classList.toggle('is-playing', isPlaying);
}

function toggleCrossfade() {
    crossfadeEnabled = !crossfadeEnabled;
    const btn = document.getElementById('crossfadeBtn');
    btn.classList.toggle('active', crossfadeEnabled);
    btn.title = crossfadeEnabled ? `Crossfade: ${crossfadeDuration}s` : 'Crossfade: Off';
}

// Playback Speed Control
function setPlaybackSpeed(speed) {
    const validSpeed = Math.max(0.25, Math.min(2.0, Number(speed) || 1.0));
    currentPlaybackSpeed = validSpeed;
    
    // Apply to both players
    if (audioPlayer) audioPlayer.playbackRate = validSpeed;
    if (audioPlayerB) audioPlayerB.playbackRate = validSpeed;
    
    // Update UI
    updateSpeedButton();
    
    // Save to localStorage
    savePlaybackSpeedToStorage();
}

function updateSpeedButton() {
    const speedBtn = document.getElementById('speedBtn');
    const speedIndicator = speedBtn?.querySelector('.speed-indicator');
    
    if (speedBtn) {
        speedBtn.title = `Playback Speed: ${currentPlaybackSpeed.toFixed(2)}x`;
        speedBtn.classList.toggle('active', currentPlaybackSpeed !== 1.0);
    }
    
    if (speedIndicator) {
        speedIndicator.textContent = `${currentPlaybackSpeed.toFixed(1)}x`;
    }
}

function savePlaybackSpeedToStorage() {
    try {
        localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, String(currentPlaybackSpeed));
    } catch (error) {
        console.warn('Failed to save playback speed:', error);
    }
}

function loadPlaybackSpeedFromStorage() {
    try {
        const raw = localStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY);
        if (raw) {
            const speed = Number(raw);
            if (Number.isFinite(speed) && speed >= 0.25 && speed <= 2.0) {
                currentPlaybackSpeed = speed;
                updateSpeedButton();
            }
        }
    } catch (error) {
        console.warn('Failed to load playback speed:', error);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Waveform Visualization on Progress Bar
function initializeProgressWaveform() {
    const canvas = document.getElementById('progressWaveform');
    if (!canvas) return;
    
    const progressBar = document.getElementById('progressBar');
    if (!progressBar) return;
    
    const rect = progressBar.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    
    canvas.width = Math.max(1, rect.width);
    canvas.height = Math.max(1, rect.height);
    
    drawProgressWaveform();
}

function drawProgressWaveform() {
    const canvas = document.getElementById('progressWaveform');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    if (!width || !height) return;
    
    ctx.clearRect(0, 0, width, height);
    
    // Generate waveform pattern
    const bars = 100;
    const barWidth = width / bars;
    
    if (barWidth <= 0) return;
    
    ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
    
    for (let i = 0; i < bars; i++) {
        // Create pseudo-random but consistent waveform
        const seed = (i * 7919) % 1000;
        const barHeight = (Math.sin(seed * 0.01) * 0.5 + 0.5) * height * 0.7;
        const x = i * barWidth;
        const y = (height - barHeight) / 2;
        
        ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }
}

// Resize waveform canvas when window resizes
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const canvas = document.getElementById('progressWaveform');
        const progressBar = document.getElementById('progressBar');
        if (canvas && progressBar) {
            const rect = progressBar.getBoundingClientRect();
            if (rect && rect.width && rect.height) {
                canvas.width = Math.max(1, rect.width);
                canvas.height = Math.max(1, rect.height);
                drawProgressWaveform();
            }
        }
    }, 150);
});
