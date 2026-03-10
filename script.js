// Global state
let libraryData = null;
let currentView = 'all';
let selectedGenre = null;
let currentSort = 'name';
let searchQuery = '';
let viewMode = 'grid';

// Player state
let audioPlayer = null;
let currentPlaylist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0; // 0: off, 1: repeat all, 2: repeat one
let currentVolume = 0.7;

// Notification System
function showNotification(title, message, type = 'info', actions = null) {
    const overlay = document.getElementById('notificationOverlay');
    const icon = document.getElementById('notificationIcon');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const actionsEl = document.getElementById('notificationActions');
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Set icon based on type
    icon.className = 'notification-icon';
    if (type === 'warning') {
        icon.classList.add('warning');
        icon.querySelector('i').className = 'fas fa-exclamation-triangle';
    } else if (type === 'error') {
        icon.classList.add('warning');
        icon.querySelector('i').className = 'fas fa-times-circle';
    } else if (type === 'success') {
        icon.classList.add('success');
        icon.querySelector('i').className = 'fas fa-check-circle';
    } else {
        icon.querySelector('i').className = 'fas fa-music';
    }
    
    // Set actions or use default
    if (actions) {
        actionsEl.innerHTML = actions;
    } else {
        actionsEl.innerHTML = '<button class="notification-btn primary" onclick="closeNotification()">Got it</button>';
    }
    
    // Show notification
    overlay.classList.add('show');
}

function closeNotification() {
    document.getElementById('notificationOverlay').classList.remove('show');
}

// Close notification on overlay click
document.addEventListener('click', (e) => {
    if (e.target.id === 'notificationOverlay') {
        closeNotification();
    }
});

// Initialize app
async function init() {
    try {
        createBackgroundParticles();
        
        // Try to fetch from API first, fall back to static JSON
        let response;
        try {
            response = await fetch('http://localhost:3000/api/library');
            const data = await response.json();
            libraryData = data;
            console.log('✅ Loaded from API with auto-scanned tracks');
        } catch (apiError) {
            console.log('⚠️ API not available, falling back to static JSON');
            response = await fetch('playlist-data.json');
            libraryData = await response.json();
        }
        
        setupEventListeners();
        initializePlayer();
        renderGenreList();
        renderAllGenres();
        updateStats();
    } catch (error) {
        console.error('Error loading data:', error);
        showError();
    }
}

// Initialize Music Player
function initializePlayer() {
    audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.volume = currentVolume;
    
    // Initialize visualizer
    initVisualizer();
    
    // Resize canvas to fit container
    window.addEventListener('resize', resizeVisualizerCanvas);
    resizeVisualizerCanvas();
    
    // Player controls
    document.getElementById('playBtn').addEventListener('click', togglePlay);
    document.getElementById('prevBtn').addEventListener('click', playPrevious);
    document.getElementById('nextBtn').addEventListener('click', playNext);
    document.getElementById('shuffleBtn').addEventListener('click', toggleShuffle);
    document.getElementById('repeatBtn').addEventListener('click', toggleRepeat);
    
    // Progress bar
    const progressBar = document.getElementById('progressBar');
    progressBar.addEventListener('click', seekTo);
    
    // Volume controls
    document.getElementById('volumeBtn').addEventListener('click', toggleMute);
    const volumeBar = document.getElementById('volumeBar');
    volumeBar.addEventListener('click', setVolume);
    
    // Audio events
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', handleTrackEnd);
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
    audioPlayer.addEventListener('play', () => {
        // Auto-start visualizer when music plays
        const vizContainer = document.getElementById('visualizerContainer');
        if (vizContainer.style.display !== 'none' && visualizer) {
            visualizer.startVisualization();
        }
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
    if (canvas) {
        const container = document.getElementById('visualizerContainer');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight - 80; // Account for header
    }
}

// Load and play playlist
function loadPlaylist(playlist) {
    if (!playlist.tracks || playlist.tracks.length === 0) {
        showNotification(
            'No Media Files Available',
            'This playlist is currently empty. To enjoy your music, please add some MP3 files to the corresponding folder in your music library.',
            'info'
        );
        return;
    }
    
    currentPlaylist = playlist.tracks;
    currentTrackIndex = 0;
    loadTrack(currentPlaylist[currentTrackIndex]);
    playTrack();
}

// Load a specific track
function loadTrack(track) {
    audioPlayer.src = track.file;
    document.getElementById('playerTitle').textContent = track.title;
    document.getElementById('playerArtist').textContent = track.artist;
    document.getElementById('playerCover').src = track.cover;
}

// Play track
function playTrack() {
    audioPlayer.play().catch(err => {
        console.error('Error playing audio:', err);
        showNotification(
            'Unable to Play Track',
            'It seems this audio file is currently unavailable. Please check that the MP3 file exists in your music library folder.',
            'warning'
        );
    });
    isPlaying = true;
    updatePlayButton();
}

// Pause track
function pauseTrack() {
    audioPlayer.pause();
    isPlaying = false;
    updatePlayButton();
}

// Toggle play/pause
function togglePlay() {
    if (currentPlaylist.length === 0) {
        showNotification(
            'No Playlist Selected',
            'To start enjoying your music, please select a playlist from the library and click the play button on any playlist card.',
            'info'
        );
        return;
    }
    
    if (isPlaying) {
        pauseTrack();
    } else {
        playTrack();
    }
}

// Update play button icon
function updatePlayButton() {
    const playBtn = document.getElementById('playBtn');
    const icon = playBtn.querySelector('i');
    icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
}

// Play next track
function playNext() {
    if (currentPlaylist.length === 0) return;
    
    if (isShuffle) {
        currentTrackIndex = Math.floor(Math.random() * currentPlaylist.length);
    } else {
        currentTrackIndex = (currentTrackIndex + 1) % currentPlaylist.length;
    }
    
    loadTrack(currentPlaylist[currentTrackIndex]);
    if (isPlaying) playTrack();
}

// Play previous track
function playPrevious() {
    if (currentPlaylist.length === 0) return;
    
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
    } else {
        currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
        loadTrack(currentPlaylist[currentTrackIndex]);
        if (isPlaying) playTrack();
    }
}

// Handle track end
function handleTrackEnd() {
    if (repeatMode === 2) {
        // Repeat one
        audioPlayer.currentTime = 0;
        playTrack();
    } else if (repeatMode === 1 || currentTrackIndex < currentPlaylist.length - 1) {
        // Repeat all or not last track
        playNext();
    } else {
        // End of playlist
        isPlaying = false;
        updatePlayButton();
    }
}

// Toggle shuffle
function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById('shuffleBtn');
    btn.classList.toggle('active', isShuffle);
}

// Toggle repeat mode
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

// Update progress bar
function updateProgress() {
    if (!audioPlayer.duration) return;
    
    const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressHandle').style.left = percent + '%';
    document.getElementById('currentTime').textContent = formatTime(audioPlayer.currentTime);
}

// Update duration display
function updateDuration() {
    document.getElementById('totalTime').textContent = formatTime(audioPlayer.duration);
}

// Seek to position
function seekTo(e) {
    if (!audioPlayer.duration) return;
    
    const progressBar = document.getElementById('progressBar');
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = percent * audioPlayer.duration;
}

// Set volume
function setVolume(e) {
    const volumeBar = document.getElementById('volumeBar');
    const rect = volumeBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    currentVolume = Math.max(0, Math.min(1, percent));
    audioPlayer.volume = currentVolume;
    document.getElementById('volumeFill').style.width = (currentVolume * 100) + '%';
    updateVolumeIcon();
}

// Toggle mute
function toggleMute() {
    if (audioPlayer.volume > 0) {
        audioPlayer.volume = 0;
        document.getElementById('volumeFill').style.width = '0%';
    } else {
        audioPlayer.volume = currentVolume;
        document.getElementById('volumeFill').style.width = (currentVolume * 100) + '%';
    }
    updateVolumeIcon();
}

// Update volume icon
function updateVolumeIcon() {
    const icon = document.querySelector('#volumeBtn i');
    const volume = audioPlayer.volume;
    
    if (volume === 0) {
        icon.className = 'fas fa-volume-mute';
    } else if (volume < 0.5) {
        icon.className = 'fas fa-volume-down';
    } else {
        icon.className = 'fas fa-volume-up';
    }
}

// Format time (seconds to mm:ss)
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Setup event listeners
function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        clearSearch.classList.toggle('visible', searchQuery.length > 0);
        performSearch();
    });

    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearch.classList.remove('visible');
        performSearch();
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // View mode
    document.getElementById('gridViewBtn').addEventListener('click', () => setViewMode('grid'));
    document.getElementById('listViewBtn').addEventListener('click', () => setViewMode('list'));

    // Sort buttons
    document.getElementById('sortName').addEventListener('click', () => setSortMode('name'));
    document.getElementById('sortTracks').addEventListener('click', () => setSortMode('tracks'));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.blur();
        }
    });
}

// Search functionality
function performSearch() {
    if (currentView === 'all') {
        renderAllGenres();
    } else {
        renderGenrePlaylists(selectedGenre);
    }
}

// Filter items based on search
function filterBySearch(items, isGenre = false) {
    if (!searchQuery) return items;
    
    return items.filter(item => {
        if (isGenre) {
            return item.name.toLowerCase().includes(searchQuery) ||
                   item.description.toLowerCase().includes(searchQuery);
        } else {
            return item.name.toLowerCase().includes(searchQuery) ||
                   item.artists.toLowerCase().includes(searchQuery);
        }
    });
}

// Sort items
function sortItems(items, isGenre = false) {
    const sorted = [...items];
    if (currentSort === 'name') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentSort === 'tracks' && !isGenre) {
        sorted.sort((a, b) => b.trackCount - a.trackCount);
    }
    return sorted;
}

// Set sort mode
function setSortMode(mode) {
    currentSort = mode;
    document.querySelectorAll('.toolbar-left .btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(mode === 'name' ? 'sortName' : 'sortTracks').classList.add('active');
    performSearch();
}

// Set view mode
function setViewMode(mode) {
    viewMode = mode;
    const grid = document.getElementById('folderGrid');
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    
    if (mode === 'grid') {
        grid.classList.remove('list-view');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    } else {
        grid.classList.add('list-view');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
    }
}

// Toggle theme
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const icon = document.querySelector('#themeToggle i');
    if (document.body.classList.contains('light-theme')) {
        icon.className = 'fas fa-sun';
        localStorage.setItem('theme', 'light');
    } else {
        icon.className = 'fas fa-moon';
        localStorage.setItem('theme', 'dark');
    }
}

// Load saved theme
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    document.querySelector('#themeToggle i').className = 'fas fa-sun';
}

// Create animated background particles
function createBackgroundParticles() {
    const bgAnimation = document.getElementById('bgAnimation');
    const particleCount = 15;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.width = Math.random() * 200 + 50 + 'px';
        particle.style.height = particle.style.width;
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.animationDuration = Math.random() * 20 + 10 + 's';
        bgAnimation.appendChild(particle);
    }
}

// Render genre list in sidebar
function renderGenreList() {
    const genreList = document.getElementById('genreList');
    genreList.innerHTML = '';

    libraryData.library.folders.forEach(folder => {
        const genreItem = document.createElement('div');
        genreItem.className = 'genre-item';
        genreItem.innerHTML = `
            <div style="display: flex; align-items: center;">
                <i class="fas ${folder.icon} genre-icon" style="color: ${folder.color}"></i>
                <span>${folder.name}</span>
            </div>
            <span class="genre-count">${folder.subfolders.length}</span>
        `;
        genreItem.onclick = () => showGenre(folder);
        genreList.appendChild(genreItem);
    });
}

// Show all genres view
function showAllGenres() {
    currentView = 'all';
    selectedGenre = null;
    
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector('.nav-item').classList.add('active');
    document.querySelectorAll('.genre-item').forEach(item => item.classList.remove('active'));

    document.getElementById('breadcrumb').innerHTML = '<span>Library</span>';
    document.getElementById('pageTitle').textContent = 'All Genres';
    document.getElementById('pageSubtitle').textContent = 'Explore your music collection';

    renderAllGenres();
    updateStats();
}

// Show specific genre
function showGenre(folder) {
    currentView = 'genre';
    selectedGenre = folder;

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.genre-item').forEach(item => item.classList.remove('active'));
    event.currentTarget.classList.add('active');

    document.getElementById('breadcrumb').innerHTML = `
        <span style="cursor: pointer;" onclick="showAllGenres()">Library</span>
        <span class="separator">›</span>
        <span class="current">${folder.name}</span>
    `;
    document.getElementById('pageTitle').textContent = folder.name;
    document.getElementById('pageSubtitle').textContent = folder.description;

    renderGenrePlaylists(folder);
    updateStatsForGenre(folder);
}

// Render all genres as cards
function renderAllGenres() {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';

    let folders = filterBySearch(libraryData.library.folders, true);
    folders = sortItems(folders, true);

    if (folders.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No results found</h3>
                <p>Try adjusting your search terms</p>
            </div>
        `;
        return;
    }

    folders.forEach((folder, index) => {
        const card = createGenreCard(folder, index);
        grid.appendChild(card);
    });
}

// Render playlists for a specific genre
function renderGenrePlaylists(folder) {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';

    let playlists = filterBySearch(folder.subfolders, false);
    playlists = sortItems(playlists, false);

    if (playlists.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No results found</h3>
                <p>Try adjusting your search terms</p>
            </div>
        `;
        return;
    }

    playlists.forEach((playlist, index) => {
        const card = createPlaylistCard(playlist, folder.color, index);
        grid.appendChild(card);
    });
}

// Show playlist tracks
function showPlaylistTracks(playlist, genreColor) {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';
    
    if (!playlist.tracks || playlist.tracks.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-music"></i>
                <h3>No tracks in this playlist</h3>
                <p>Add MP3 files to see them here</p>
            </div>
        `;
        return;
    }
    
    // Create track list view
    const trackList = document.createElement('div');
    trackList.className = 'track-list-view';
    
    playlist.tracks.forEach((track, index) => {
        const trackItem = document.createElement('div');
        trackItem.className = 'track-row fade-in';
        trackItem.style.animationDelay = `${index * 0.05}s`;
        
        const tagsHTML = track.tags ? track.tags.map(tag => 
            `<span class="track-tag">${tag}</span>`
        ).join('') : '';
        
        trackItem.innerHTML = `
            <div class="track-number">${index + 1}</div>
            <img src="${track.cover}" alt="${track.title}" class="track-thumb">
            <div class="track-info">
                <div class="track-title">${track.title}</div>
                <div class="track-artist">${track.artist}</div>
            </div>
            <div class="track-album">${track.album || ''}</div>
            <div class="track-meta">
                ${track.year ? `<span><i class="fas fa-calendar"></i> ${track.year}</span>` : ''}
                ${track.bpm ? `<span><i class="fas fa-drum"></i> ${track.bpm} BPM</span>` : ''}
                ${track.mood ? `<span><i class="far fa-smile"></i> ${track.mood}</span>` : ''}
            </div>
            <div class="track-tags">${tagsHTML}</div>
            <div class="track-duration">${track.duration}</div>
            <button class="track-play-btn" onclick="playTrackFromList(${index})">
                <i class="fas fa-play"></i>
            </button>
        `;
        
        trackList.appendChild(trackItem);
    });
    
    grid.appendChild(trackList);
    
    // Store current playlist for playback
    currentPlaylist = playlist.tracks;
}

// Play track from list view
function playTrackFromList(index) {
    currentTrackIndex = index;
    loadTrack(currentPlaylist[currentTrackIndex]);
    playTrack();
}

// Create genre card
function createGenreCard(folder, index) {
    const card = document.createElement('div');
    card.className = 'playlist-card fade-in';
    card.style.animationDelay = `${index * 0.1}s`;
    card.style.setProperty('--card-color', folder.color);
    
    const totalTracks = folder.subfolders.reduce((sum, sub) => sum + sub.trackCount, 0);
    
    card.innerHTML = `
        <div class="play-overlay">
            <div class="play-btn">
                <i class="fas fa-play"></i>
            </div>
        </div>
        <div class="card-icon" style="background: linear-gradient(135deg, ${folder.color}22, ${folder.color}11);">
            <i class="fas ${folder.icon}" style="color: ${folder.color}"></i>
        </div>
        <h3 class="card-title">${folder.name}</h3>
        <p class="card-description">${folder.description}</p>
        <div class="card-stats">
            <div class="card-stat">
                <i class="fas fa-folder"></i>
                <span>${folder.subfolders.length} playlists</span>
            </div>
            <div class="card-stat">
                <i class="fas fa-music"></i>
                <span>${totalTracks} tracks</span>
            </div>
        </div>
    `;
    
    card.onclick = (e) => {
        if (!e.target.closest('.play-btn')) {
            showGenre(folder);
        }
    };
    return card;
}

// Create playlist card
function createPlaylistCard(playlist, color, index) {
    const card = document.createElement('div');
    card.className = 'playlist-card fade-in';
    card.style.animationDelay = `${index * 0.1}s`;
    card.style.setProperty('--card-color', color);
    
    const imagesHTML = playlist.images.map(img => `<img src="${img}" alt="Album cover">`).join('');
    
    card.innerHTML = `
        <div class="play-overlay">
            <div class="play-btn">
                <i class="fas fa-play"></i>
            </div>
        </div>
        <div class="card-icon" style="background: linear-gradient(135deg, ${color}22, ${color}11);">
            <i class="fas fa-compact-disc" style="color: ${color}"></i>
        </div>
        <h3 class="card-title">${playlist.name}</h3>
        <p class="card-description">${playlist.artists}</p>
        <div class="image-grid">
            ${imagesHTML}
        </div>
        <div class="card-stats">
            <div class="card-stat">
                <i class="fas fa-music"></i>
                <span>${playlist.trackCount} tracks</span>
            </div>
            <div class="card-stat">
                <i class="far fa-clock"></i>
                <span>${playlist.duration}</span>
            </div>
        </div>
    `;
    
    // Play button click handler
    const playOverlay = card.querySelector('.play-overlay');
    playOverlay.addEventListener('click', (e) => {
        e.stopPropagation();
        loadPlaylist(playlist);
    });
    
    // Card click handler - show tracks
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.play-overlay')) {
            showPlaylistTracks(playlist, color);
            updateBreadcrumb(playlist.name);
        }
    });
    
    return card;
}

// Update breadcrumb for track view
function updateBreadcrumb(playlistName) {
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = `
        <span style="cursor: pointer;" onclick="showAllGenres()">Library</span>
        <span class="separator">›</span>
        <span style="cursor: pointer;" onclick="showGenre(selectedGenre)">${selectedGenre.name}</span>
        <span class="separator">›</span>
        <span class="current">${playlistName}</span>
    `;
    document.getElementById('pageTitle').textContent = playlistName;
    document.getElementById('pageSubtitle').textContent = 'Click any track to play';
}

// Update stats bar
function updateStats() {
    const statsBar = document.getElementById('statsBar');
    const totalGenres = libraryData.library.folders.length;
    const totalPlaylists = libraryData.library.folders.reduce((sum, f) => sum + f.subfolders.length, 0);
    const totalTracks = libraryData.library.folders.reduce((sum, f) => 
        sum + f.subfolders.reduce((s, sub) => s + sub.trackCount, 0), 0);

    statsBar.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-layer-group"></i>
            <div>
                <div class="stat-value">${totalGenres}</div>
                <div class="stat-label">Genres</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-list"></i>
            <div>
                <div class="stat-value">${totalPlaylists}</div>
                <div class="stat-label">Playlists</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-music"></i>
            <div>
                <div class="stat-value">${totalTracks.toLocaleString()}</div>
                <div class="stat-label">Total Tracks</div>
            </div>
        </div>
    `;
}

// Update stats for specific genre
function updateStatsForGenre(folder) {
    const statsBar = document.getElementById('statsBar');
    const totalPlaylists = folder.subfolders.length;
    const totalTracks = folder.subfolders.reduce((sum, sub) => sum + sub.trackCount, 0);
    const totalDuration = folder.subfolders.reduce((sum, sub) => {
        const [hours] = sub.duration.split('h');
        return sum + parseInt(hours);
    }, 0);

    statsBar.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-list"></i>
            <div>
                <div class="stat-value">${totalPlaylists}</div>
                <div class="stat-label">Playlists</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-music"></i>
            <div>
                <div class="stat-value">${totalTracks.toLocaleString()}</div>
                <div class="stat-label">Tracks</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="far fa-clock"></i>
            <div>
                <div class="stat-value">${totalDuration}h+</div>
                <div class="stat-label">Total Duration</div>
            </div>
        </div>
    `;
}

// Show error state
function showError() {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-circle"></i>
            <h3>Failed to Load Library</h3>
            <p>Please check that playlist-data.json is in the same directory.</p>
        </div>
    `;
}

// Initialize on page load
window.onload = init;