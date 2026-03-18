// Playback Control - Queue management, crossfade, track navigation, playback order

// Playback order and navigation
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
        playbackOrder = [];
        playbackOrderPosition = 0;
        currentTrackIndex = 0;
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

function ensurePlaybackOrder() {
    const total = currentPlaylist.length;

    if (!total) {
        playbackOrder = [];
        playbackOrderPosition = 0;
        currentTrackIndex = 0;
        return;
    }

    const invalidLength = playbackOrder.length !== total;
    const invalidEntries = playbackOrder.some(index => index < 0 || index >= total);
    if (invalidLength || invalidEntries) {
        rebuildPlaybackOrder(currentTrackIndex);
        return;
    }

    const currentPosition = playbackOrder.indexOf(currentTrackIndex);
    if (currentPosition === -1) {
        rebuildPlaybackOrder(currentTrackIndex);
        return;
    }

    playbackOrderPosition = currentPosition;
}

function moveToNextTrack({ autoplay = isPlaying, allowWrap = repeatMode === 1 } = {}) {
    if (!currentPlaylist.length) return false;

    ensurePlaybackOrder();
    let nextPosition = playbackOrderPosition + 1;

    if (nextPosition >= playbackOrder.length) {
        if (!allowWrap) {
            return false;
        }

        if (isShuffle) {
            const reshuffled = Array.from({ length: currentPlaylist.length }, (_, index) => index);
            shuffleArrayInPlace(reshuffled);

            if (reshuffled.length > 1 && reshuffled[0] === currentTrackIndex) {
                [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
            }

            playbackOrder = reshuffled;
            playbackOrderPosition = 0;
            currentTrackIndex = playbackOrder[0];
        } else {
            playbackOrderPosition = 0;
            currentTrackIndex = playbackOrder[playbackOrderPosition];
        }
    } else {
        playbackOrderPosition = nextPosition;
        currentTrackIndex = playbackOrder[playbackOrderPosition];
    }

    loadTrack(currentPlaylist[currentTrackIndex]);
    if (autoplay) {
        playTrack();
    }
    return true;
}

function moveToPreviousTrack({ autoplay = isPlaying, allowWrap = repeatMode === 1 } = {}) {
    if (!currentPlaylist.length) return false;

    ensurePlaybackOrder();
    let previousPosition = playbackOrderPosition - 1;

    if (previousPosition < 0) {
        if (!allowWrap) {
            return false;
        }
        previousPosition = playbackOrder.length - 1;
    }

    playbackOrderPosition = previousPosition;
    currentTrackIndex = playbackOrder[playbackOrderPosition];

    loadTrack(currentPlaylist[currentTrackIndex]);
    if (autoplay) {
        playTrack();
    }
    return true;
}

// Crossfade functionality
function getActivePlayer() {
    return activePlayer === 'A' ? audioPlayer : audioPlayerB;
}

function getInactivePlayer() {
    return activePlayer === 'A' ? audioPlayerB : audioPlayer;
}

function fadeVolume(player, targetVolume, duration, callback) {
    const playerKey = player === audioPlayer ? 'A' : 'B';
    
    // Clear any existing fade for this player
    if (fadeIntervals[playerKey]) {
        clearInterval(fadeIntervals[playerKey]);
        fadeIntervals[playerKey] = null;
    }
    
    const startVolume = player.volume;
    const volumeDiff = targetVolume - startVolume;
    const steps = 50;
    const stepDuration = (duration * 1000) / steps;
    const volumeStep = volumeDiff / steps;
    
    let currentStep = 0;
    
    fadeIntervals[playerKey] = setInterval(() => {
        currentStep++;
        
        if (currentStep >= steps) {
            player.volume = targetVolume;
            clearInterval(fadeIntervals[playerKey]);
            fadeIntervals[playerKey] = null;
            if (callback) callback();
        } else {
            player.volume = Math.max(0, Math.min(1, startVolume + (volumeStep * currentStep)));
        }
    }, stepDuration);
}

function startCrossfade() {
    if (!crossfadeEnabled || currentPlaylist.length === 0) return;
    
    const currentPlayer = getActivePlayer();
    const nextPlayer = getInactivePlayer();
    
    // Determine next track
    const canMoveNext = moveToNextTrack({ autoplay: false, allowWrap: repeatMode === 1 });
    if (!canMoveNext) return;
    
    const nextTrack = currentPlaylist[currentTrackIndex];
    
    // Load next track into inactive player
    nextPlayer.src = nextTrack.file;
    nextPlayer.volume = 0;
    
    // Start playing next track at 0 volume
    nextPlayer.play().then(() => {
        // Fade out current player
        fadeVolume(currentPlayer, 0, crossfadeDuration, () => {
            currentPlayer.pause();
            currentPlayer.currentTime = 0;
        });
        
        // Fade in next player
        fadeVolume(nextPlayer, currentVolume, crossfadeDuration);
        
        // Switch active player
        activePlayer = activePlayer === 'A' ? 'B' : 'A';
        
        // Update UI
        document.getElementById('playerTitle').textContent = nextTrack.title;
        document.getElementById('playerArtist').textContent = nextTrack.artist;
        const playerCover = document.getElementById('playerCover');
        if (playerCover) {
            playerCover.src = nextTrack.cover || DEFAULT_COVER;
        }
        
        addTrackToListeningHistory(nextTrack, currentPlaylistContext);
        
        // Update queue if open
        if (isQueuePanelOpen) {
            renderQueuePanel();
        }
        
        updateWorkspaceStatus();
    }).catch(err => {
        console.error('Crossfade error:', err);
        // Fallback to normal track change
        loadTrack(nextTrack);
        if (isPlaying) playTrack();
    });
}

function monitorForCrossfade() {
    if (crossfadeTimer) {
        clearTimeout(crossfadeTimer);
        crossfadeTimer = null;
    }
    
    if (!crossfadeEnabled || !isPlaying || currentPlaylist.length === 0) return;
    
    const currentPlayer = getActivePlayer();
    const duration = currentPlayer.duration;
    const currentTime = currentPlayer.currentTime;
    
    if (!duration || !isFinite(duration)) return;
    
    const timeRemaining = duration - currentTime;
    
    // Start crossfade when crossfadeDuration seconds remaining
    if (timeRemaining > 0 && timeRemaining <= crossfadeDuration + 0.5) {
        const triggerTime = (timeRemaining - crossfadeDuration) * 1000;
        
        if (triggerTime > 0) {
            crossfadeTimer = setTimeout(() => {
                startCrossfade();
            }, triggerTime);
        }
    }
}

// Queue panel controls
function toggleQueuePanel() {
    if (isQueuePanelOpen) {
        closeQueuePanel();
    } else {
        openQueuePanel();
    }
}

function openQueuePanel() {
    isQueuePanelOpen = true;
    document.getElementById('queuePanelOverlay').classList.add('show');
    document.getElementById('playlistBtn').classList.add('active');
    document.body.classList.add('queue-panel-open');
    renderQueuePanel();
}

function closeQueuePanel() {
    isQueuePanelOpen = false;
    document.getElementById('queuePanelOverlay').classList.remove('show');
    document.getElementById('playlistBtn').classList.remove('active');
    document.body.classList.remove('queue-panel-open');
}

function parseTrackDurationToSeconds(duration) {
    if (!duration || typeof duration !== 'string') return 0;

    if (duration.includes(':')) {
        const parts = duration.split(':').map(part => parseInt(part, 10));
        if (parts.some(isNaN)) return 0;

        if (parts.length === 3) {
            return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        }
        if (parts.length === 2) {
            return (parts[0] * 60) + parts[1];
        }
    }

    return 0;
}

function formatQueueDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return '0m';

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function renderQueuePanel() {
    const meta = document.getElementById('queuePanelMeta');
    const container = document.getElementById('queueTrackContainer');
    if (!meta || !container) return;

    if (!currentPlaylist || currentPlaylist.length === 0) {
        meta.innerHTML = `
            <div class="queue-meta-card">
                <p>Tracks</p>
                <h4>0</h4>
            </div>
            <div class="queue-meta-card">
                <p>Total Time</p>
                <h4>0m</h4>
            </div>
            <div class="queue-meta-card wide">
                <p>Status</p>
                <h4>Waiting for playlist</h4>
            </div>
        `;

        container.innerHTML = `
            <div class="queue-empty-state">
                <i class="fas fa-compact-disc"></i>
                <h4>Queue is empty</h4>
                <p>Select a playlist, then press play to build your queue.</p>
            </div>
        `;
        return;
    }

    const totalSeconds = currentPlaylist.reduce(
        (sum, track) => sum + parseTrackDurationToSeconds(track.duration),
        0
    );
    const currentTrack = currentPlaylist[currentTrackIndex];

    meta.innerHTML = `
        <div class="queue-meta-card">
            <p>Tracks</p>
            <h4>${currentPlaylist.length}</h4>
        </div>
        <div class="queue-meta-card">
            <p>Total Time</p>
            <h4>${formatQueueDuration(totalSeconds)}</h4>
        </div>
        <div class="queue-meta-card wide">
            <p>Now Playing</p>
            <h4>${currentTrack ? currentTrack.title : 'Not started'}</h4>
        </div>
    `;

    container.innerHTML = currentPlaylist.map((track, index) => `
        <div class="queue-track-item ${index === currentTrackIndex ? 'active' : ''}" data-index="${index}">
            <div class="queue-track-number">${index + 1}</div>
            <img src="${track.cover || DEFAULT_COVER}" alt="${track.title}" class="queue-track-cover">
            <div class="queue-track-info">
                <h5>${track.title}</h5>
                <p>${track.artist}</p>
            </div>
            <span class="queue-track-duration">${track.duration || '--:--'}</span>
            <button class="queue-row-btn queue-play-btn" title="Play Track">
                <i class="fas fa-play"></i>
            </button>
            <button class="queue-row-btn queue-remove-btn" title="Remove from Queue">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function handleQueueTrackActions(e) {
    const queueRow = e.target.closest('.queue-track-item');
    if (!queueRow) return;

    const trackIndex = parseInt(queueRow.dataset.index, 10);

    if (e.target.closest('.queue-remove-btn')) {
        e.stopPropagation();
        removeTrackFromQueue(trackIndex);
        return;
    }

    if (e.target.closest('.queue-play-btn')) {
        e.stopPropagation();
        playTrackFromQueue(trackIndex);
        return;
    }

    playTrackFromQueue(trackIndex);
}

function playTrackFromQueue(index) {
    if (index < 0 || index >= currentPlaylist.length) return;

    rebuildPlaybackOrder(index);
    loadTrack(currentPlaylist[currentTrackIndex]);
    playTrack();
}

function playQueueFromTop() {
    if (!currentPlaylist.length) {
        showNotification('Queue Empty', 'Select a playlist first, then use the queue controls.', 'info');
        return;
    }

    rebuildPlaybackOrder(0);
    loadTrack(currentPlaylist[currentTrackIndex]);
    playTrack();
}

function shuffleCurrentQueue() {
    if (currentPlaylist.length < 2) {
        showNotification('Shuffle Unavailable', 'Need at least 2 tracks to shuffle the queue.', 'info');
        return;
    }

    const currentTrack = currentPlaylist[currentTrackIndex] || null;
    const shuffled = [...currentPlaylist];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    currentPlaylist = shuffled;
    currentTrackIndex = currentTrack ? Math.max(0, currentPlaylist.indexOf(currentTrack)) : 0;
    rebuildPlaybackOrder(currentTrackIndex);

    renderQueuePanel();
    showNotification('Queue Shuffled', 'Your playback queue was remixed successfully.', 'success');
}

function removeTrackFromQueue(index) {
    if (index < 0 || index >= currentPlaylist.length) return;

    const removingCurrent = index === currentTrackIndex;
    const removingBeforeCurrent = index < currentTrackIndex;

    currentPlaylist.splice(index, 1);

    if (currentPlaylist.length === 0) {
        releaseQuickPlayObjectUrl();
        pauseTrack();
        audioPlayer.removeAttribute('src');
        audioPlayer.load();
        isPlaying = false;
        playbackOrder = [];
        playbackOrderPosition = 0;
        updatePlayButton();
        document.getElementById('playerTitle').textContent = 'No track selected';
        document.getElementById('playerArtist').textContent = 'Select a track to start';
        const playerCover = document.getElementById('playerCover');
        if (playerCover) {
            playerCover.src = DEFAULT_COVER;
        }
    } else if (removingCurrent) {
        if (currentTrackIndex >= currentPlaylist.length) {
            currentTrackIndex = currentPlaylist.length - 1;
        }
        loadTrack(currentPlaylist[currentTrackIndex]);
        if (isPlaying) {
            playTrack();
        }
    } else if (removingBeforeCurrent) {
        currentTrackIndex--;
    }

    if (currentPlaylist.length > 0) {
        rebuildPlaybackOrder(currentTrackIndex);
    }

    renderQueuePanel();
}

function clearCurrentQueue() {
    if (!currentPlaylist.length) {
        showNotification('Queue Already Empty', 'Nothing to clear right now.', 'info');
        return;
    }

    currentPlaylist = [];
    currentTrackIndex = 0;
    playbackOrder = [];
    playbackOrderPosition = 0;
    releaseQuickPlayObjectUrl();
    pauseTrack();
    audioPlayer.removeAttribute('src');
    audioPlayer.load();
    isPlaying = false;
    updatePlayButton();

    document.getElementById('playerTitle').textContent = 'No track selected';
    document.getElementById('playerArtist').textContent = 'Select a track to start';
    const playerCover = document.getElementById('playerCover');
    if (playerCover) {
        playerCover.src = DEFAULT_COVER;
    }

    renderQueuePanel();
}
