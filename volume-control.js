// Volume Control - Volume slider, system volume sync, mute functionality

// Volume state (currentVolume is declared in app.js which loads first)
let isMuted = false;
let preMuteVolume = 0.7; // matches default currentVolume; updated at runtime by setVolume/toggleMute

// Volume slider functionality
function updateVolumeSlider(value) {
    const slider = document.getElementById('volumeSlider');
    const fill = document.getElementById('volumeSliderFill');
    const thumb = document.getElementById('volumeSliderThumb');
    
    if (!slider || !fill || !thumb) return;
    
    const percent = Math.max(0, Math.min(100, value * 100));
    fill.style.width = `${percent}%`;
    thumb.style.left = `calc(${percent}% - 8px)`;
}

function updateVolumeIcon() {
    const icon = document.getElementById('volumeIcon');
    if (!icon) return;
    
    if (isMuted || currentVolume === 0) {
        icon.className = 'fas fa-volume-mute';
        return;
    }
    
    if (currentVolume < 0.33) {
        icon.className = 'fas fa-volume-off';
    } else if (currentVolume < 0.66) {
        icon.className = 'fas fa-volume-down';
    } else {
        icon.className = 'fas fa-volume-up';
    }
}

function setVolume(value, updateSystem = true) {
    const clamped = Math.max(0, Math.min(1, value));
    
    if (clamped === currentVolume) return;
    
    currentVolume = clamped;
    
    // Update audio players
    audioPlayer.volume = currentVolume;
    audioPlayerB.volume = currentVolume;
    
    // Update UI
    updateVolumeSlider(currentVolume);
    updateVolumeIcon();
    
    // Save to localStorage
    localStorage.setItem('playerVolume', currentVolume.toString());
    
    // Update system volume if enabled
    if (updateSystem && apiAvailable) {
        updateSystemVolume(currentVolume);
    }
    
    // Update mute state
    if (currentVolume === 0) {
        isMuted = true;
    } else if (isMuted) {
        isMuted = false;
        preMuteVolume = currentVolume;
    }
}

function toggleMute() {
    if (isMuted) {
        // Unmute
        setVolume(preMuteVolume > 0 ? preMuteVolume : 0.7);
        isMuted = false;
    } else {
        // Mute
        preMuteVolume = currentVolume;
        setVolume(0);
        isMuted = true;
    }
    
    updateVolumeIcon();
}

function handleVolumeSliderInput(e) {
    const value = parseFloat(e.target.value);
    setVolume(value);
}

function handleVolumeSliderClick(e) {
    const slider = document.getElementById('volumeSlider');
    if (!slider) return;
    
    const rect = slider.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    
    setVolume(percent);
}

function handleVolumeWheel(e) {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newVolume = Math.max(0, Math.min(1, currentVolume + delta));
    
    setVolume(newVolume);
}

// System volume sync
async function updateSystemVolume(volume) {
    if (!apiAvailable) return;
    
    try {
        await apiRequest('http://localhost:3000/api/system-volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volume })
        });
    } catch (error) {
        console.warn('Failed to update system volume:', error);
    }
}

async function syncSystemVolume() {
    if (!apiAvailable) return;
    
    try {
        const response = await apiRequest('http://localhost:3000/api/system-volume');
        const systemVolume = response?.volume;
        
        if (typeof systemVolume === 'number' && !isNaN(systemVolume)) {
            const clamped = Math.max(0, Math.min(1, systemVolume));
            
            // Only update if significantly different
            if (Math.abs(clamped - currentVolume) > 0.05) {
                setVolume(clamped, false);
            }
        }
    } catch (error) {
        console.warn('Failed to sync system volume:', error);
    }
}

// Volume initialization
function initializeVolume() {
    // Load saved volume
    const savedVolume = localStorage.getItem('playerVolume');
    if (savedVolume !== null) {
        const volume = parseFloat(savedVolume);
        if (!isNaN(volume) && volume >= 0 && volume <= 1) {
            currentVolume = volume;
        }
    }
    
    // Apply volume to players
    audioPlayer.volume = currentVolume;
    audioPlayerB.volume = currentVolume;
    
    // Update UI
    updateVolumeSlider(currentVolume);
    updateVolumeIcon();
    
    // Sync with system volume
    syncSystemVolume();
}

// ─── Volume Slider Initialization ────────────────────────────────────────────

function updateVolumePercent(volume) {
    const el = document.getElementById('volumePercent');
    if (el) el.textContent = Math.round(volume * 100) + '%';
}

function initializeVolumeSlider() {
    const volumeBar = document.getElementById('volumeBar');
    if (!volumeBar) return;

    updateVolumePercent(currentVolume);
    updateVolumeIcon();

    if (typeof noUiSlider !== 'undefined') {
        try {
            noUiSlider.create(volumeBar, {
                start: currentVolume * 100,
                connect: [true, false],
                range: { min: 0, max: 100 },
                tooltips: false
            });
            volumeBar.noUiSlider.on('update', (values) => {
                const vol = parseFloat(values[0]) / 100;
                if (Math.abs(vol - currentVolume) > 0.005) {
                    currentVolume = vol;
                    if (audioPlayer) audioPlayer.volume = vol;
                    if (audioPlayerB) audioPlayerB.volume = vol;
                    updateVolumePercent(vol);
                    updateVolumeIcon();
                    localStorage.setItem('playerVolume', vol.toString());
                    if (apiAvailable) updateSystemVolume(vol);
                }
            });
        } catch (e) {
            // noUiSlider already initialized or unavailable
        }
    } else {
        // Fallback: click on volume bar
        volumeBar.style.cursor = 'pointer';
        volumeBar.addEventListener('click', (e) => {
            const rect = volumeBar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setVolume(pct);
            updateVolumePercent(pct);
        });
    }

    // Restore saved volume
    const saved = localStorage.getItem('playerVolume');
    if (saved !== null) {
        const vol = parseFloat(saved);
        if (!isNaN(vol) && vol >= 0 && vol <= 1) {
            currentVolume = vol;
            if (volumeBar.noUiSlider) volumeBar.noUiSlider.set(vol * 100);
        }
    }
    updateVolumePercent(currentVolume);
    updateVolumeIcon();
}

// ─── System Volume Sync ───────────────────────────────────────────────────────

async function syncVolumeFromSystem({ silent = false } = {}) {
    if (!systemVolumeSyncSupported || isSyncingSystemVolume) return;

    try {
        isSyncingSystemVolume = true;
        const response = await fetch('http://localhost:3000/api/system-volume');
        if (!response.ok) { systemVolumeSyncSupported = false; return; }

        const data = await response.json();
        const vol = data?.volume;
        if (typeof vol === 'number' && !isNaN(vol)) {
            const clamped = Math.max(0, Math.min(1, vol));
            lastSyncedSystemVolume = clamped;
            if (Math.abs(clamped - currentVolume) > 0.05) {
                setVolume(clamped, false);
                updateVolumePercent(clamped);
            }
        }
    } catch (e) {
        if (!silent) console.warn('Failed to sync system volume:', e);
        systemVolumeSyncSupported = false;
    } finally {
        isSyncingSystemVolume = false;
    }
}

function startSystemVolumePolling() {
    if (systemVolumePollIntervalId) {
        clearInterval(systemVolumePollIntervalId);
        systemVolumePollIntervalId = null;
    }
    systemVolumePollIntervalId = setInterval(() => {
        if (apiAvailable && systemVolumeSyncSupported) {
            syncVolumeFromSystem({ silent: true });
        }
    }, 5000);
}

function setupSystemVolumeSyncTriggers() {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && apiAvailable) syncVolumeFromSystem({ silent: true });
    });
    window.addEventListener('focus', () => {
        if (apiAvailable) syncVolumeFromSystem({ silent: true });
    });
}

// Volume keyboard shortcuts
function handleVolumeKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    switch (e.key) {
        case 'ArrowUp':
        case 'ArrowRight':
            e.preventDefault();
            setVolume(Math.min(1, currentVolume + 0.05));
            break;
            
        case 'ArrowDown':
        case 'ArrowLeft':
            e.preventDefault();
            setVolume(Math.max(0, currentVolume - 0.05));
            break;
            
        case 'm':
        case 'M':
            e.preventDefault();
            toggleMute();
            break;
    }
}
