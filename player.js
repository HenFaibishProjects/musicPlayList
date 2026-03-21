// Audio Player Management
// All global state variables are declared in app.js (loaded first).
// shuffleArrayInPlace, rebuildPlaybackOrder, getActivePlayer, getInactivePlayer
// are defined in playback-control.js.

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
    
    saveLastPlayedTrack();
}

function saveLastPlayedTrack() {
    try {
        const dataToSave = {
            currentPlaylist,
            currentTrackIndex,
            currentPlaylistContext,
            playbackOrder,
            playbackOrderPosition,
            isShuffle,
            repeatMode
        };
        localStorage.setItem('lidaplay_last_played_state', JSON.stringify(dataToSave));
    } catch (e) {
        console.warn('Failed to save last played to local storage:', e);
    }
}

function restoreLastPlayedTrack() {
    try {
        const firstLaunchKey = 'lidaplay_has_launched_once';
        const isFirstLaunch = !localStorage.getItem(firstLaunchKey);

        if (isFirstLaunch) {
            localStorage.removeItem('lidaplay_last_played_state');
            localStorage.setItem(firstLaunchKey, '1');
            return;
        }

        const stored = localStorage.getItem('lidaplay_last_played_state');
        if (stored) {
            const data = JSON.parse(stored);
            if (data && data.currentPlaylist && data.currentPlaylist.length > 0) {
                currentPlaylist = data.currentPlaylist;
                currentTrackIndex = data.currentTrackIndex || 0;
                currentPlaylistContext = data.currentPlaylistContext || {};
                playbackOrder = data.playbackOrder || Array.from({length: currentPlaylist.length}, (_, i) => i);
                playbackOrderPosition = data.playbackOrderPosition || 0;
                isShuffle = Boolean(data.isShuffle);
                repeatMode = Number(data.repeatMode) || 0;
                
                const shuffleBtn = document.getElementById('shuffleBtn');
                if (shuffleBtn) shuffleBtn.classList.toggle('active', isShuffle);
                
                const repeatBtn = document.getElementById('repeatBtn');
                const repeatIcon = repeatBtn?.querySelector('i');
                if (repeatBtn && repeatIcon) {
                    if (repeatMode === 0) {
                        repeatBtn.classList.remove('active');
                        repeatIcon.className = 'fas fa-repeat';
                    } else if (repeatMode === 1) {
                        repeatBtn.classList.add('active');
                        repeatIcon.className = 'fas fa-repeat';
                    } else {
                        repeatBtn.classList.add('active');
                        repeatIcon.className = 'fas fa-repeat-1';
                    }
                }
                
                const trackToLoad = currentPlaylist[currentTrackIndex];
                if (trackToLoad) {
                    loadTrack(trackToLoad);
                    audioPlayer.pause();
                    if (audioPlayerB) audioPlayerB.pause();
                    isPlaying = false;
                    updatePlayButton();
                }
            }
        }
    } catch (e) {
        console.warn('Failed to restore last played from local storage:', e);
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
    
    console.log(`[player.js] Setting playback speed to ${validSpeed}x`);
    console.log(`[player.js] audioPlayer exists: ${!!audioPlayer}, audioPlayerB exists: ${!!audioPlayerB}`);
    
    // Apply to both players
    if (audioPlayer) {
        console.log(`[player.js] Setting audioPlayer.playbackRate to ${validSpeed}`);
        audioPlayer.playbackRate = validSpeed;
        console.log(`[player.js] audioPlayer.playbackRate is now ${audioPlayer.playbackRate}`);
    }
    if (audioPlayerB) {
        console.log(`[player.js] Setting audioPlayerB.playbackRate to ${validSpeed}`);
        audioPlayerB.playbackRate = validSpeed;
        console.log(`[player.js] audioPlayerB.playbackRate is now ${audioPlayerB.playbackRate}`);
    }
    
    // Update UI
    updateSpeedButton();
    
    // Also update modal UI if open
    updateSpeedModalUI(validSpeed);
    
    // Save to localStorage
    savePlaybackSpeedToStorage();
}

function updateSpeedModalUI(speed) {
    // Update modal slider and display if modal is open
    const speedSlider = document.getElementById('speedSlider');
    const speedValueDisplay = document.getElementById('speedValueDisplay');
    
    if (speedSlider) {
        speedSlider.value = speed;
    }
    if (speedValueDisplay) {
        speedValueDisplay.textContent = `${speed.toFixed(2)}x`;
    }
    
    // Update active preset buttons in modal
    document.querySelectorAll('.speed-preset-btn').forEach(btn => {
        const btnSpeed = parseFloat(btn.dataset.speed);
        btn.classList.toggle('active', Math.abs(btnSpeed - speed) < 0.01);
    });
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
        localStorage.setItem('lidaplay_playback_speed', String(currentPlaybackSpeed));
    } catch (error) {
        console.warn('Failed to save playback speed:', error);
    }
}

function loadPlaybackSpeedFromStorage() {
    try {
        const raw = localStorage.getItem('lidaplay_playback_speed');
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

// === Missing player functions extracted from script.js ===

function playNext() {
    moveToNextTrack({ autoplay: isPlaying, allowWrap: repeatMode === 1 });
}

function playPrevious() {
    if (currentPlaylist.length === 0) return;
    
    const currentPlayer = getActivePlayer();
    if (!currentPlayer) return;
    
    // If more than 3 seconds into track, restart current track
    if (currentPlayer.currentTime > 3) {
        currentPlayer.currentTime = 0;
    } else {
        // Otherwise go to previous track
        moveToPreviousTrack({ autoplay: isPlaying, allowWrap: repeatMode === 1 });
    }
}

function handleTrackEnd(event) {
    const activeTrack = currentPlaylist[currentTrackIndex];
    if (isQuickPlayTrack(activeTrack)) {
        const currentPlayer = getActivePlayer();
        if (currentPlayer) {
            currentPlayer.pause();
            currentPlayer.currentTime = 0;
        }
        isPlaying = false;
        updatePlayButton();
        updateProgress();
        return;
    }

    // Only handle if the ended player is the active one
    const endedPlayer = event?.target || audioPlayer;
    const currentPlayer = getActivePlayer();
    
    // If crossfade is enabled and already transitioning, ignore this event
    if (crossfadeEnabled && endedPlayer !== currentPlayer) {
        return;
    }
    
    if (repeatMode === 2) {
        // Repeat one
        currentPlayer.currentTime = 0;
        playTrack();
    } else if (!crossfadeEnabled) {
        // Normal transition (no crossfade)
        const moved = moveToNextTrack({ autoplay: true, allowWrap: repeatMode === 1 });
        if (!moved) {
            // End of playlist
            isPlaying = false;
            updatePlayButton();
        }
    } else {
        // Crossfade enabled - transition should have already happened
        // If we get here, it means crossfade didn't trigger properly
        const moved = moveToNextTrack({ autoplay: true, allowWrap: repeatMode === 1 });
        if (!moved) {
            isPlaying = false;
            updatePlayButton();
        }
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById('shuffleBtn');
    btn.classList.toggle('active', isShuffle);

    if (currentPlaylist.length > 0) {
        rebuildPlaybackOrder(currentTrackIndex);
    }
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    const btn = document.getElementById('repeatBtn');
    const icon = btn.querySelector('i');
    
    if (repeatMode === 0) {
        btn.classList.remove('active');
        icon.className = 'fas fa-repeat';
    } else if (repeatMode === 1) {
        btn.classList.add('active');
        icon.className = 'fas fa-repeat';
    } else {
        btn.classList.add('active');
        icon.className = 'fas fa-repeat-1';
    }
}

function updateProgress() {
    const currentPlayer = getActivePlayer();
    if (!currentPlayer || !currentPlayer.duration || !isFinite(currentPlayer.duration)) return;
    
    const percent = Math.min(100, Math.max(0, (currentPlayer.currentTime / currentPlayer.duration) * 100));
    
    const progressFill = document.getElementById('progressFill');
    const progressHandle = document.getElementById('progressHandle');
    const currentTime = document.getElementById('currentTime');
    
    if (progressFill) progressFill.style.width = percent + '%';
    if (progressHandle) progressHandle.style.left = percent + '%';
    if (currentTime) currentTime.textContent = formatTime(currentPlayer.currentTime);
    
    // Monitor for crossfade trigger point
    if (crossfadeEnabled && isPlaying) {
        monitorForCrossfade();
    }
}

function updateDuration() {
    const currentPlayer = getActivePlayer();
    const formatted = formatTime(currentPlayer.duration);
    document.getElementById('totalTime').textContent = formatted;

    const currentTrack = currentPlaylist[currentTrackIndex];
    if (currentTrack && isFinite(currentPlayer.duration)) {
        currentTrack.duration = formatted;

        if (isQuickPlayTrack(currentTrack)) {
            const playerArtist = document.getElementById('playerArtist');
            if (playerArtist) {
                playerArtist.textContent = `Duration: ${formatted}`;
            }
        }

        if (isQueuePanelOpen) {
            renderQueuePanel();
        }
    }
}

function seekTo(e) {
    const currentPlayer = getActivePlayer();
    if (!currentPlayer || !currentPlayer.duration || !isFinite(currentPlayer.duration)) return;
    
    const progressBar = document.getElementById('progressBar');
    if (!progressBar) return;
    
    const rect = progressBar.getBoundingClientRect();
    if (!rect || !rect.width) return;
    
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * currentPlayer.duration;
    
    if (isFinite(newTime)) {
        currentPlayer.currentTime = newTime;
    }
}

// === loadPlaylist + updateVolumeUI ===

function loadPlaylist(playlist, genreName = '') {
    if (!playlist.tracks || playlist.tracks.length === 0) {
        showNotification(
            'No Media Files Available',
            'This playlist is currently empty. Add audio files to its folder, then click Rescan Playlist Libraries.',
            'info'
        );
        return;
    }

    currentPlaylistContext = {
        playlistName: playlist?.name || '',
        genreName: genreName || selectedGenre?.name || playlist?.__genreName || ''
    };
    
    currentPlaylist = playlist.tracks;
    currentTrackIndex = 0;
    rebuildPlaybackOrder(currentTrackIndex);
    renderQueuePanel();
    loadTrack(currentPlaylist[currentTrackIndex]);
    playTrack();
}

function updateVolumeUI(volume) {
    const nextVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    if (Math.abs(nextVolume - lastVolume) < 0.005) return;

    lastVolume = nextVolume;

    if (volumeSliderInstance && !isUpdatingVolumeSlider) {
        isUpdatingVolumeSlider = true;
        volumeSliderInstance.set(Math.round(nextVolume * 100));
        isUpdatingVolumeSlider = false;
    }

    updateVolumePercentage(nextVolume);
    updateVolumeIcon();
}
