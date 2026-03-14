// Global state
let libraryData = null;
let currentView = 'all';
let selectedGenre = null;
let currentSort = 'name';
let nameSortDirection = 'asc';
let trackSortDirection = 'desc';
let searchQuery = '';
let viewMode = 'grid';
let isGlobalSearchActive = false;
let currentGlobalSearchTracks = [];

// Player state
let audioPlayer = null;
let currentPlaylist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0; // 0: off, 1: repeat all, 2: repeat one
let currentVolume = 0.7;
let isQueuePanelOpen = false;
let playbackOrder = [];
let playbackOrderPosition = 0;
let isDraggingVolume = false;
let systemVolumeSyncSupported = true;
let isSyncingSystemVolume = false;
let systemVolumePollIntervalId = null;
let queuedSystemVolumeValue = null;
let apiAvailable = false;
let isRescanningLibrary = false;
let pendingDeletePlaylist = null;
let editingGenreContext = null;
let recentTracks = [];
let currentRecentViewTracks = [];
let currentPlaylistContext = { playlistName: '', genreName: '' };
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';
const RECENT_TRACKS_STORAGE_KEY = 'musicvault_recent_tracks_v1';
const MAX_RECENT_TRACKS = 100;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
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
    if (
        lower.startsWith('http://') ||
        lower.startsWith('https://') ||
        lower.startsWith('data:image/') ||
        lower.startsWith('blob:') ||
        lower.startsWith('/api/')
    ) {
        return candidate;
    }

    return fallback;
}

function sanitizeClassList(value, fallback = '') {
    const tokens = String(value || '')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => /^[a-z0-9-]+$/i.test(token));

    if (tokens.length) {
        return tokens.join(' ');
    }

    return fallback;
}

function renderBreadcrumb(items = []) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    breadcrumb.innerHTML = '';

    items.forEach((item, index) => {
        if (index > 0) {
            const separator = document.createElement('span');
            separator.className = 'separator';
            separator.textContent = '›';
            breadcrumb.appendChild(separator);
        }

        const part = document.createElement('span');
        part.textContent = String(item?.label || '');

        if (item?.current) {
            part.classList.add('current');
        }

        if (item?.action) {
            part.dataset.breadcrumbAction = item.action;
            if (item.value !== undefined && item.value !== null) {
                part.dataset.breadcrumbValue = String(item.value);
            }
            part.style.cursor = 'pointer';
        }

        breadcrumb.appendChild(part);
    });
}

function getTrackSortIconClass() {
    return trackSortDirection === 'asc' ? 'fas fa-arrow-up-1-9' : 'fas fa-arrow-down-9-1';
}

function getTrackSortDirectionLabel() {
    return trackSortDirection === 'asc' ? 'Asc' : 'Desc';
}

function getNameSortIconClass() {
    return nameSortDirection === 'asc' ? 'fas fa-arrow-down-a-z' : 'fas fa-arrow-up-z-a';
}

function getNameSortDirectionLabel() {
    return nameSortDirection === 'asc' ? 'A-Z' : 'Z-A';
}

function updateSortButtonsUI() {
    const sortNameBtn = document.getElementById('sortName');
    const sortTracksBtn = document.getElementById('sortTracks');

    document.querySelectorAll('.toolbar-left .btn').forEach(btn => btn.classList.remove('active'));

    if (currentSort === 'tracks') {
        sortTracksBtn?.classList.add('active');
    } else {
        sortNameBtn?.classList.add('active');
    }

    const sortNameIcon = sortNameBtn?.querySelector('i');
    if (sortNameIcon) {
        sortNameIcon.className = getNameSortIconClass();
    }

    const sortTracksIcon = sortTracksBtn?.querySelector('i');
    if (sortTracksIcon) {
        sortTracksIcon.className = getTrackSortIconClass();
    }

    if (sortNameBtn) {
        sortNameBtn.title = `Sort by name (${getNameSortDirectionLabel()})`;
    }

    if (sortTracksBtn) {
        sortTracksBtn.title = `Sort by track count (${getTrackSortDirectionLabel()})`;
    }
}

function getEmptyLibraryData() {
    return {
        library: {
            name: 'My Music Collection',
            folders: []
        },
        summary: {
            totalGenres: 0,
            totalPlaylists: 0,
            totalTracks: 0
        }
    };
}

function normalizeLibraryPayload(payload) {
    if (!payload) {
        return { library: { folders: [] } };
    }

    if (payload.library) {
        return payload;
    }

    return { library: payload };
}

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

async function apiRequest(url, options = {}) {
    const response = await fetch(url, options);
    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

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

function refreshLibraryUI() {
    if (!libraryData || !libraryData.library) {
        libraryData = getEmptyLibraryData();
    }

    renderGenreList();

    if (currentView === 'genre' && selectedGenre) {
        const updatedGenre = (libraryData.library.folders || []).find(folder => folder.id === selectedGenre.id);
        if (updatedGenre) {
            selectedGenre = updatedGenre;
            renderGenrePlaylists(updatedGenre);
            updateStatsForGenre(updatedGenre);
        } else {
            showAllGenres();
        }
    } else if (currentView === 'favorites') {
        showFavorites();
    } else if (currentView === 'recent') {
        showRecentlyPlayed();
    } else {
        showAllGenres();
    }

    if (isQueuePanelOpen) {
        renderQueuePanel();
    }

    updateWorkspaceStatus();
}

function updateWorkspaceStatus() {
    const apiChip = document.getElementById('apiStatusChip');
    const viewChip = document.getElementById('viewStatusChip');
    const sortChip = document.getElementById('sortStatusChip');
    const sizeChip = document.getElementById('librarySizeChip');

    if (!apiChip && !viewChip && !sortChip && !sizeChip) return;

    if (apiChip) {
        const apiIcon = apiChip.querySelector('i');
        const apiText = apiChip.querySelector('span');
        apiChip.classList.toggle('online', apiAvailable);
        apiChip.classList.toggle('offline', !apiAvailable);
        if (apiIcon) apiIcon.className = apiAvailable ? 'fas fa-circle-check' : 'fas fa-plug-circle-xmark';
        if (apiText) apiText.textContent = apiAvailable ? 'API Online' : 'API Offline';
    }

    if (viewChip) {
        const viewIcon = viewChip.querySelector('i');
        const viewText = viewChip.querySelector('span');

        if (searchQuery.trim()) {
            if (viewIcon) viewIcon.className = 'fas fa-magnifying-glass';
            if (viewText) {
                const compactQuery = searchQuery.trim().length > 24
                    ? `${searchQuery.trim().slice(0, 24)}…`
                    : searchQuery.trim();
                viewText.textContent = `Search: "${compactQuery}"`;
            }
        } else if (currentView === 'favorites') {
            if (viewIcon) viewIcon.className = 'fas fa-star';
            if (viewText) viewText.textContent = 'Favorites';
        } else if (currentView === 'recent') {
            if (viewIcon) viewIcon.className = 'fas fa-clock';
            if (viewText) viewText.textContent = 'Recently Played';
        } else if (currentView === 'genre' && selectedGenre?.name) {
            if (viewIcon) viewIcon.className = 'fas fa-folder-open';
            if (viewText) viewText.textContent = `Genre: ${selectedGenre.name}`;
        } else {
            if (viewIcon) viewIcon.className = 'fas fa-th-large';
            if (viewText) viewText.textContent = 'All Genres';
        }
    }

    if (sortChip) {
        const sortIcon = sortChip.querySelector('i');
        const sortText = sortChip.querySelector('span');
        if (sortIcon) sortIcon.className = currentSort === 'tracks' ? getTrackSortIconClass() : getNameSortIconClass();
        if (sortText) {
            const sortLabel = currentSort === 'tracks'
                ? `Tracks (${getTrackSortDirectionLabel()})`
                : `Name (${getNameSortDirectionLabel()})`;
            const layoutLabel = viewMode === 'list' ? 'List' : 'Grid';
            sortText.textContent = `Sort: ${sortLabel} · ${layoutLabel}`;
        }
    }

    updateSortButtonsUI();

    if (sizeChip) {
        const sizeText = sizeChip.querySelector('span');
        const folders = libraryData?.library?.folders || [];
        const totalPlaylists = folders.reduce((sum, folder) => sum + (folder.subfolders?.length || 0), 0);
        const totalTracks = folders.reduce((sum, folder) => sum + (folder.subfolders || []).reduce((inner, pl) => inner + (pl.trackCount || 0), 0), 0);
        if (sizeText) sizeText.textContent = `${totalPlaylists} Playlists · ${totalTracks} Tracks`;
    }
}

function openLibraryManager() {
    const modal = document.getElementById('libraryManagerModal');
    if (!modal) return;
    modal.classList.add('show');
}

function closeLibraryManager() {
    const modal = document.getElementById('libraryManagerModal');
    if (!modal) return;
    modal.classList.remove('show');
}

function resolveFontAwesomeIconClass(iconValue, fallback = 'fa-music') {
    const candidate = String(iconValue || '').trim() || String(fallback || '').trim() || 'fa-music';
    const hasStylePrefix = /\b(?:fa-solid|fa-regular|fa-brands|fa-sharp|fas|far|fab)\b/.test(candidate);

    if (hasStylePrefix) {
        return candidate;
    }

    if (candidate.startsWith('fa-')) {
        return `fa-solid ${candidate}`;
    }

    return 'fa-solid fa-music';
}

function updateEditGenreColorInputUI(colorValue) {
    const colorInput = document.getElementById('editGenreColorInput');
    if (!colorInput) return;

    const resolved = String(colorValue || colorInput.value || '#6366f1').trim() || '#6366f1';
    const isHexColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(resolved);
    const accent = isHexColor ? resolved : '#6366f1';
    const accentSoft = `${accent}33`;

    colorInput.value = accent;
    colorInput.style.borderColor = accent;
    colorInput.style.boxShadow = `0 0 0 3px ${accentSoft}`;
}

function setGenreIconSelection(iconClass = 'fa-music') {
    const hiddenInput = document.getElementById('editGenreIconInput');
    if (!hiddenInput) return;

    // New pro dropdown support
    const dropdownItems = document.querySelectorAll('#dropdownMenu .pro-dropdown-item');
    if (dropdownItems.length) {
        let selectedItem = null;

        dropdownItems.forEach(item => {
            const isSelected = item.dataset.value === iconClass;
            item.classList.toggle('selected', isSelected);
            if (isSelected) selectedItem = item;
        });

        if (!selectedItem) {
            selectedItem = dropdownItems[0];
            selectedItem.classList.add('selected');
        }

        const value = selectedItem?.dataset?.value || 'fa-music';
        const text = selectedItem?.dataset?.text || 'Music';
        const selectedIconDisplay = document.getElementById('selectedIconDisplay');
        const selectedTextDisplay = document.getElementById('selectedTextDisplay');

        hiddenInput.value = value;
        if (selectedIconDisplay) selectedIconDisplay.className = resolveFontAwesomeIconClass(value);
        if (selectedTextDisplay) selectedTextDisplay.textContent = text;
        return;
    }

    // Backward compatibility: old icon grid picker
    const options = document.querySelectorAll('#genreIconPicker .genre-icon-option');
    if (!options.length) return;

    let matched = false;
    options.forEach(option => {
        const isActive = option.dataset.icon === iconClass;
        option.classList.toggle('active', isActive);
        if (isActive) {
            hiddenInput.value = option.dataset.icon;
            matched = true;
        }
    });

    if (!matched) {
        const fallback = options[0];
        fallback.classList.add('active');
        hiddenInput.value = fallback.dataset.icon || 'fa-music';
    }
}

function openEditGenreModal(genre) {
    const modal = document.getElementById('editGenreModal');
    if (!modal || !genre) return;

    editingGenreContext = genre;

    const idInput = document.getElementById('editGenreId');
    const nameInput = document.getElementById('editGenreNameInput');
    const iconInput = document.getElementById('editGenreIconInput');
    const colorInput = document.getElementById('editGenreColorInput');
    const descriptionInput = document.getElementById('editGenreDescriptionInput');

    if (idInput) idInput.value = genre.id || '';
    if (nameInput) nameInput.value = genre.name || '';
    if (iconInput) iconInput.value = genre.icon || 'fa-music';
    if (colorInput) colorInput.value = genre.color || '#6366f1';
    if (descriptionInput) descriptionInput.value = genre.description || '';

    setGenreIconSelection((iconInput && iconInput.value) || 'fa-music');
    updateEditGenreColorInputUI((colorInput && colorInput.value) || '#6366f1');

    modal.classList.add('show');
}

function closeEditGenreModal() {
    const modal = document.getElementById('editGenreModal');
    if (!modal) return;
    modal.classList.remove('show');
    const colorInput = document.getElementById('editGenreColorInput');
    if (colorInput) {
        colorInput.style.removeProperty('border-color');
        colorInput.style.removeProperty('box-shadow');
    }
    editingGenreContext = null;
}

function openEditPlaylistModal(playlist, genreName = '') {
    const modal = document.getElementById('editPlaylistModal');
    if (!modal) return;

    const idInput = document.getElementById('editPlaylistId');
    const genreInput = document.getElementById('editPlaylistGenreInput');
    const nameInput = document.getElementById('editPlaylistNameInput');
    const artistsInput = document.getElementById('editPlaylistArtistsInput');
    const pathInput = document.getElementById('editPlaylistPathInput');
    const coverInput = document.getElementById('editPlaylistCoverInput');
    const favoriteInput = document.getElementById('editPlaylistFavoriteInput');

    if (idInput) idInput.value = playlist.id || '';
    if (genreInput) genreInput.value = genreName || '';
    if (nameInput) nameInput.value = playlist.name || '';
    if (artistsInput) artistsInput.value = playlist.artists || '';
    if (pathInput) pathInput.value = playlist.path || playlist.link || '';
    if (coverInput) coverInput.value = playlist.coverImage || '';
    if (favoriteInput) favoriteInput.checked = Boolean(playlist.isFavorite);

    modal.classList.add('show');
}

function closeEditPlaylistModal() {
    const modal = document.getElementById('editPlaylistModal');
    if (!modal) return;
    modal.classList.remove('show');
}

function openDeletePlaylistModal(playlist) {
    const modal = document.getElementById('deletePlaylistModal');
    const message = document.getElementById('deletePlaylistMessage');
    if (!modal || !message) return;

    pendingDeletePlaylist = playlist;
    message.textContent = `Delete playlist "${playlist.name}"? This removes the mapping from the library manager.`;
    modal.classList.add('show');
}

function closeDeletePlaylistModal() {
    const modal = document.getElementById('deletePlaylistModal');
    if (!modal) return;
    modal.classList.remove('show');
    pendingDeletePlaylist = null;
}

async function addPlaylistFromUI(event) {
    event.preventDefault();

    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit library structure.', 'warning');
        return;
    }

    const genre = document.getElementById('playlistGenreInput')?.value?.trim();
    const name = document.getElementById('playlistNameInput')?.value?.trim();
    const artists = document.getElementById('playlistArtistsInput')?.value?.trim();
    const folderPath = document.getElementById('playlistPathInput')?.value?.trim();
    const coverImage = document.getElementById('playlistCoverInput')?.value?.trim();
    const isFavorite = Boolean(document.getElementById('playlistFavoriteInput')?.checked);

    if (!genre) {
        showNotification('Missing Genre', 'Please enter a genre for this playlist.', 'warning');
        return;
    }
    if (!name || !folderPath) {
        showNotification('Missing Data', 'Playlist name and folder path are required.', 'warning');
        return;
    }

    try {
        await apiRequest('http://localhost:3000/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                genre,
                name,
                artists,
                folderPath,
                coverImage,
                isFavorite
            })
        });

        libraryData = await fetchLibraryData({ forceRescan: true });
        apiAvailable = true;
        setRescanButtonState();
        refreshLibraryUI();

        event.target.reset();
        closeLibraryManager();

        showNotification('Playlist Added', `Playlist "${name}" was created and scanned successfully. Refreshing page...`, 'success');
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (error) {
        console.error('Failed to add playlist mapping:', error);
        showNotification('Add Playlist Failed', error.message || 'Unable to add playlist mapping right now.', 'error');
    }
}

async function editPlaylistFromUI(playlist, genreName = '') {
    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit playlists.', 'warning');
        return;
    }

    openEditPlaylistModal(playlist, genreName);
}

async function editGenreFromUI(genre) {
    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit genres.', 'warning');
        return;
    }

    openEditGenreModal(genre);
}

async function deletePlaylistFromUI(playlist) {
    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to delete playlists.', 'warning');
        return;
    }

    openDeletePlaylistModal(playlist);
}

async function submitEditPlaylistFromUI(event) {
    event.preventDefault();

    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit playlists.', 'warning');
        return;
    }

    const playlistId = document.getElementById('editPlaylistId')?.value?.trim();
    const nextName = document.getElementById('editPlaylistNameInput')?.value?.trim() || '';
    const nextArtists = document.getElementById('editPlaylistArtistsInput')?.value?.trim() || '';
    const nextFolderPath = document.getElementById('editPlaylistPathInput')?.value?.trim() || '';
    const nextCoverImage = document.getElementById('editPlaylistCoverInput')?.value?.trim() || '';
    const nextIsFavorite = Boolean(document.getElementById('editPlaylistFavoriteInput')?.checked);

    if (!playlistId || !nextName || !nextFolderPath) {
        showNotification('Missing Data', 'Playlist name and folder path are required.', 'warning');
        return;
    }

    try {
        await apiRequest(`http://localhost:3000/api/playlists/${encodeURIComponent(playlistId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nextName,
                artists: nextArtists,
                folderPath: nextFolderPath,
                coverImage: nextCoverImage,
                isFavorite: nextIsFavorite
            })
        });

        libraryData = await fetchLibraryData({ forceRescan: true });
        apiAvailable = true;
        setRescanButtonState();
        refreshLibraryUI();
        closeEditPlaylistModal();

        showNotification('Playlist Updated', `Playlist "${nextName}" was updated successfully.`, 'success');
    } catch (error) {
        console.error('Failed to update playlist mapping:', error);
        showNotification('Update Failed', error.message || 'Unable to update this playlist right now.', 'error');
    }
}

async function confirmDeletePlaylistFromUI() {
    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to delete playlists.', 'warning');
        return;
    }

    const playlist = pendingDeletePlaylist;
    if (!playlist?.id) {
        closeDeletePlaylistModal();
        return;
    }

    try {
        await apiRequest(`http://localhost:3000/api/playlists/${encodeURIComponent(playlist.id)}`, {
            method: 'DELETE'
        });

        libraryData = await fetchLibraryData({ forceRescan: true });
        apiAvailable = true;
        setRescanButtonState();
        refreshLibraryUI();
        closeDeletePlaylistModal();

        showNotification('Playlist Deleted', `Playlist "${playlist.name}" was deleted.`, 'success');
    } catch (error) {
        console.error('Failed to delete playlist mapping:', error);
        showNotification('Delete Failed', error.message || 'Unable to delete this playlist right now.', 'error');
    }
}

async function submitEditGenreFromUI(event) {
    event.preventDefault();

    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit genres.', 'warning');
        return;
    }

    const genreId = document.getElementById('editGenreId')?.value?.trim();
    const nextName = document.getElementById('editGenreNameInput')?.value?.trim() || '';
    const nextIcon = document.getElementById('editGenreIconInput')?.value?.trim() || 'fa-music';
    const nextColor = document.getElementById('editGenreColorInput')?.value?.trim() || '#6366f1';
    const nextDescription = document.getElementById('editGenreDescriptionInput')?.value?.trim() || '';

    if (!genreId || !nextName) {
        showNotification('Missing Data', 'Genre id and genre name are required.', 'warning');
        return;
    }

    try {
        await apiRequest(`http://localhost:3000/api/genres/${encodeURIComponent(genreId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nextName,
                icon: nextIcon,
                color: nextColor,
                description: nextDescription
            })
        });

        const wasViewingEditedGenre = selectedGenre && selectedGenre.id === genreId;

        libraryData = await fetchLibraryData({ forceRescan: true });
        apiAvailable = true;
        setRescanButtonState();
        refreshLibraryUI();
        closeEditGenreModal();

        if (wasViewingEditedGenre) {
            const updatedGenre = (libraryData.library.folders || []).find(folder => folder.id === genreId);
            if (updatedGenre) {
                showGenre(updatedGenre);
            }
        }

        showNotification('Genre Updated', `Genre "${nextName}" was updated successfully.`, 'success');
    } catch (error) {
        console.error('Failed to update genre:', error);
        showNotification('Update Failed', error.message || 'Unable to update this genre right now.', 'error');
    }
}

async function browseEditFolderPath() {
    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to browse for folders.', 'warning');
        return;
    }

    const input = document.getElementById('editPlaylistPathInput');
    const browseBtn = document.getElementById('editBrowseFolderPathBtn');
    if (!input || !browseBtn) return;

    const originalLabel = browseBtn.innerHTML;
    browseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Opening...</span>';
    browseBtn.classList.add('disabled');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        const data = await apiRequest('http://localhost:3000/api/select-folder', {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const selectedPath = data?.path;

        if (selectedPath) {
            input.value = selectedPath;
            showNotification('Folder Selected', selectedPath, 'success');
        } else if (data?.cancelled) {
            showNotification('Folder Selection Cancelled', 'No folder was selected.', 'info');
        }
    } catch (error) {
        console.error('Folder browse failed:', error);
        if (error?.name === 'AbortError') {
            showNotification(
                'Folder Picker Timeout',
                'The picker stayed open too long (5 minutes). Please try again and select the folder sooner, or paste the path manually.',
                'warning'
            );
            return;
        }

        const msg = String(error?.message || 'Unable to open folder browser.');
        const hint = msg.includes('404')
            ? 'Folder browser API not found. Please restart the server (stop npm start, then run npm start again).'
            : msg;
        showNotification('Folder Browser Failed', hint, 'error');
    } finally {
        browseBtn.innerHTML = originalLabel;
        browseBtn.classList.remove('disabled');
    }
}

async function browseFolderPath() {
    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to browse for folders.', 'warning');
        return;
    }

    const input = document.getElementById('playlistPathInput');
    const browseBtn = document.getElementById('browseFolderPathBtn');
    if (!input || !browseBtn) return;

    const originalLabel = browseBtn.innerHTML;
    browseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Opening...</span>';
    browseBtn.classList.add('disabled');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        const data = await apiRequest('http://localhost:3000/api/select-folder', {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const selectedPath = data?.path;

        if (selectedPath) {
            input.value = selectedPath;
            showNotification('Folder Selected', selectedPath, 'success');
        } else if (data?.cancelled) {
            showNotification('Folder Selection Cancelled', 'No folder was selected.', 'info');
        }
    } catch (error) {
        console.error('Folder browse failed:', error);
        if (error?.name === 'AbortError') {
            showNotification(
                'Folder Picker Timeout',
                'The picker stayed open too long (5 minutes). Please try again and select the folder sooner, or paste the path manually.',
                'warning'
            );
            return;
        }

        const msg = String(error?.message || 'Unable to open folder browser.');
        const hint = msg.includes('404')
            ? 'Folder browser API not found. Please restart the server (stop npm start, then run npm start again).'
            : msg;
        showNotification('Folder Browser Failed', hint, 'error');
    } finally {
        browseBtn.innerHTML = originalLabel;
        browseBtn.classList.remove('disabled');
    }
}

function setRescanButtonState() {
    const rescanBtn = document.getElementById('rescanBtn');
    if (!rescanBtn) return;

    const icon = rescanBtn.querySelector('i');
    const text = rescanBtn.querySelector('span');

    if (isRescanningLibrary) {
        rescanBtn.classList.add('disabled');
        if (icon) icon.className = 'fas fa-spinner fa-spin';
        if (text) text.textContent = 'Rescanning...';
        updateWorkspaceStatus();
        return;
    }

    rescanBtn.classList.remove('disabled');

    if (!apiAvailable) {
        if (icon) icon.className = 'fas fa-plug-circle-xmark';
        if (text) text.textContent = 'Connect & Rescan';
        updateWorkspaceStatus();
        return;
    }

    if (icon) icon.className = 'fas fa-rotate';
    if (text) text.textContent = 'Rescan Library';
    updateWorkspaceStatus();
}

async function rescanLibrary() {
    if (isRescanningLibrary) return;

    isRescanningLibrary = true;
    setRescanButtonState();

    try {
        const payload = await fetchLibraryData({ forceRescan: true });
        libraryData = payload;
        apiAvailable = true;
        setRescanButtonState();
        refreshLibraryUI();

        const summary = payload.summary;
        const tracks = summary?.totalTracks;
        const playlists = summary?.totalPlaylists;

        showNotification(
            'Library Rescanned',
            (typeof tracks === 'number' && typeof playlists === 'number')
                ? `Scan complete: ${tracks} songs found across ${playlists} playlists.`
                : 'Scan complete. Playlist folders were refreshed from disk.',
            'success'
        );
    } catch (error) {
        console.error('Rescan failed:', error);
        apiAvailable = false;
        showNotification(
            'Rescan Failed',
            'Unable to connect to the scan API. Please start the Node server (npm start) and try again.',
            'error'
        );
    } finally {
        isRescanningLibrary = false;
        setRescanButtonState();
    }
}

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
    actionsEl.innerHTML = '';
    if (Array.isArray(actions) && actions.length) {
        actions.forEach(action => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `notification-btn ${sanitizeClassList(action?.className || '')}`.trim();
            if (!button.className.includes('notification-btn')) {
                button.className = 'notification-btn';
            }
            button.textContent = String(action?.label || 'Action');
            if (typeof action?.onClick === 'function') {
                button.addEventListener('click', action.onClick);
            }
            actionsEl.appendChild(button);
        });
    } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'notification-btn primary';
        button.textContent = 'Got it';
        button.addEventListener('click', closeNotification);
        actionsEl.appendChild(button);
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
        loadRecentTracksFromStorage();
        setupEventListeners();
        initializePlayer();

        await syncVolumeFromSystem({ silent: true });
        startSystemVolumePolling();

        try {
            libraryData = await fetchLibraryData({ forceRescan: false });
            apiAvailable = true;
            console.log('✅ Loaded from API with folder-based scanning');
        } catch (apiError) {
            console.log('⚠️ API not available, starting with empty library structure');
            libraryData = getEmptyLibraryData();
            apiAvailable = false;
            showNotification(
                'Server Not Connected',
                'Start the Node server (npm start) to add genres/playlists and scan local music folders.',
                'warning'
            );
        }

        setRescanButtonState();
        refreshLibraryUI();
    } catch (error) {
        console.error('Error loading data:', error);
        showError();
    }
}

// Initialize Music Player
function initializePlayer() {
    audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.volume = currentVolume;
    document.getElementById('volumeFill').style.width = (currentVolume * 100) + '%';
    updateVolumeIcon();
    
    // Initialize visualizer
    initVisualizer();
    
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
    const volumeBar = document.getElementById('volumeBar');
    volumeBar.addEventListener('click', setVolume);
    volumeBar.addEventListener('mousedown', startVolumeDrag);
    volumeBar.addEventListener('touchstart', startVolumeDrag, { passive: false });

    document.addEventListener('mousemove', onVolumeDrag);
    document.addEventListener('touchmove', onVolumeDrag, { passive: false });
    document.addEventListener('mouseup', stopVolumeDrag);
    document.addEventListener('touchend', stopVolumeDrag);
    document.addEventListener('touchcancel', stopVolumeDrag);
    
    // Audio events
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', handleTrackEnd);
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
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

function getPointerClientX(e) {
    if (e.touches && e.touches.length > 0) {
        return e.touches[0].clientX;
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
        return e.changedTouches[0].clientX;
    }
    return e.clientX;
}

function setVolumeFromClientX(clientX) {
    const volumeBar = document.getElementById('volumeBar');
    if (!volumeBar || typeof clientX !== 'number') return;

    const rect = volumeBar.getBoundingClientRect();
    const percent = (clientX - rect.left) / rect.width;
    currentVolume = Math.max(0, Math.min(1, percent));
    audioPlayer.volume = currentVolume;
    document.getElementById('volumeFill').style.width = (currentVolume * 100) + '%';
    updateVolumePercentage(currentVolume);
    updateVolumeIcon();

    syncVolumeToSystem();
}

function startVolumeDrag(e) {
    isDraggingVolume = true;
    if (e.cancelable) {
        e.preventDefault();
    }
    setVolumeFromClientX(getPointerClientX(e));
}

function onVolumeDrag(e) {
    if (!isDraggingVolume) return;
    if (e.cancelable) {
        e.preventDefault();
    }
    setVolumeFromClientX(getPointerClientX(e));
}

function stopVolumeDrag() {
    isDraggingVolume = false;
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

// Load and play playlist
function loadPlaylist(playlist, genreName = '') {
    if (!playlist.tracks || playlist.tracks.length === 0) {
        showNotification(
            'No Media Files Available',
            'This playlist is currently empty. To enjoy your music, please add some MP3 files to the corresponding folder in your music library.',
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

// Load a specific track
function loadTrack(track) {
    audioPlayer.src = track.file;
    document.getElementById('playerTitle').textContent = track.title;
    document.getElementById('playerArtist').textContent = track.artist;
    const playerCover = document.getElementById('playerCover');
    if (playerCover) {
        playerCover.src = track.cover || DEFAULT_COVER;
    }
    if (isQueuePanelOpen) {
        renderQueuePanel();
    }
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
    const currentTrack = currentPlaylist[currentTrackIndex];
    if (currentTrack) {
        addTrackToRecentlyPlayed(currentTrack, currentPlaylistContext);
    }
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
    moveToNextTrack({ autoplay: isPlaying, allowWrap: repeatMode === 1 });
}

// Play previous track
function playPrevious() {
    if (currentPlaylist.length === 0) return;
    
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
    } else {
        moveToPreviousTrack({ autoplay: isPlaying, allowWrap: repeatMode === 1 });
    }
}

// Handle track end
function handleTrackEnd() {
    if (repeatMode === 2) {
        // Repeat one
        audioPlayer.currentTime = 0;
        playTrack();
    } else {
        const moved = moveToNextTrack({ autoplay: true, allowWrap: repeatMode === 1 });
        if (!moved) {
            // End of playlist
            isPlaying = false;
            updatePlayButton();
        }
    }
}

// Toggle shuffle
function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById('shuffleBtn');
    btn.classList.toggle('active', isShuffle);

    if (currentPlaylist.length > 0) {
        rebuildPlaybackOrder(currentTrackIndex);
    }
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
    setVolumeFromClientX(getPointerClientX(e));
}

// Toggle mute
function toggleMute() {
    if (audioPlayer.volume > 0) {
        audioPlayer.volume = 0;
        currentVolume = 0;
        document.getElementById('volumeFill').style.width = '0%';
        updateVolumePercentage(0);
    } else {
        if (currentVolume <= 0) {
            currentVolume = 0.5;
        }
        audioPlayer.volume = currentVolume;
        document.getElementById('volumeFill').style.width = (currentVolume * 100) + '%';
        updateVolumePercentage(currentVolume);
    }
    updateVolumeIcon();
    syncVolumeToSystem();
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

function updateVolumePercentage(volume = audioPlayer?.volume ?? currentVolume) {
    const volumePercent = document.getElementById('volumePercent');
    if (!volumePercent) return;

    const next = Math.max(0, Math.min(1, Number(volume) || 0));
    volumePercent.textContent = `${Math.round(next * 100)}%`;
}

function applyVolumeToUI(volume) {
    const next = Math.max(0, Math.min(1, Number(volume) || 0));
    currentVolume = next;
    audioPlayer.volume = next;
    document.getElementById('volumeFill').style.width = (next * 100) + '%';
    updateVolumePercentage(next);
    updateVolumeIcon();
}

async function fetchSystemVolume() {
    if (!systemVolumeSyncSupported) return null;

    const response = await fetch('http://localhost:3000/api/system-volume');
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.supported === false) {
        const message = data?.error || `HTTP ${response.status}`;
        throw new Error(message);
    }

    const volume = Number(data?.volume);
    if (!Number.isFinite(volume)) {
        throw new Error('Invalid system volume value from API');
    }

    return Math.max(0, Math.min(1, volume));
}

async function pushSystemVolume(volume) {
    if (!systemVolumeSyncSupported) return null;

    const response = await fetch('http://localhost:3000/api/system-volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.supported === false) {
        const message = data?.error || `HTTP ${response.status}`;
        throw new Error(message);
    }

    const resolved = Number(data?.volume);
    if (!Number.isFinite(resolved)) {
        throw new Error('Invalid system volume value after set');
    }

    return Math.max(0, Math.min(1, resolved));
}

async function syncVolumeFromSystem({ silent = false } = {}) {
    if (!systemVolumeSyncSupported || isDraggingVolume || isSyncingSystemVolume) return;

    try {
        isSyncingSystemVolume = true;
        const systemVolume = await fetchSystemVolume();
        if (typeof systemVolume === 'number') {
            applyVolumeToUI(systemVolume);
        }
    } catch (error) {
        systemVolumeSyncSupported = false;
        if (systemVolumePollIntervalId) {
            clearInterval(systemVolumePollIntervalId);
            systemVolumePollIntervalId = null;
        }

        if (!silent) {
            console.warn('System volume sync disabled:', error.message || error);
        }
    } finally {
        isSyncingSystemVolume = false;
    }
}

async function syncVolumeToSystem() {
    if (!systemVolumeSyncSupported) return;

    const targetVolume = Math.max(0, Math.min(1, Number(audioPlayer.volume) || 0));

    if (isSyncingSystemVolume) {
        queuedSystemVolumeValue = targetVolume;
        return;
    }

    try {
        isSyncingSystemVolume = true;
        const resolvedVolume = await pushSystemVolume(targetVolume);
        if (typeof resolvedVolume === 'number') {
            applyVolumeToUI(resolvedVolume);
        }
    } catch (error) {
        systemVolumeSyncSupported = false;
        if (systemVolumePollIntervalId) {
            clearInterval(systemVolumePollIntervalId);
            systemVolumePollIntervalId = null;
        }

        console.warn('System volume sync disabled:', error.message || error);
    } finally {
        isSyncingSystemVolume = false;

        if (systemVolumeSyncSupported && queuedSystemVolumeValue !== null) {
            const queued = queuedSystemVolumeValue;
            queuedSystemVolumeValue = null;
            audioPlayer.volume = queued;
            currentVolume = queued;
            syncVolumeToSystem();
        }
    }
}

function startSystemVolumePolling() {
    if (!systemVolumeSyncSupported || systemVolumePollIntervalId) return;

    systemVolumePollIntervalId = setInterval(() => {
        syncVolumeFromSystem({ silent: true }).catch(() => {});
    }, 400);
}

function setupSystemVolumeSyncTriggers() {
    window.addEventListener('focus', () => {
        syncVolumeFromSystem({ silent: true }).catch(() => {});
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            syncVolumeFromSystem({ silent: true }).catch(() => {});
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'AudioVolumeUp' || e.code === 'AudioVolumeDown' || e.code === 'AudioVolumeMute') {
            setTimeout(() => {
                syncVolumeFromSystem({ silent: true }).catch(() => {});
            }, 80);
        }
    });
}

// Format time (seconds to mm:ss)
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
                <p>Select a playlist, then press play to populate your enterprise queue.</p>
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
    showNotification('Queue Cleared', 'Playback queue has been reset.', 'success');
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

    const allGenresNav = document.getElementById('allGenresNav');
    if (allGenresNav) {
        allGenresNav.addEventListener('click', showAllGenres);
    }

    const favoritesNav = document.getElementById('favoritesNav');
    if (favoritesNav) {
        favoritesNav.addEventListener('click', showFavorites);
    }

    const recentlyPlayedNav = document.getElementById('recentlyPlayedNav');
    if (recentlyPlayedNav) {
        recentlyPlayedNav.addEventListener('click', showRecentlyPlayed);
    }

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // View mode
    document.getElementById('gridViewBtn').addEventListener('click', () => setViewMode('grid'));
    document.getElementById('listViewBtn').addEventListener('click', () => setViewMode('list'));

    // Sort buttons
    document.getElementById('sortName').addEventListener('click', () => setSortMode('name'));
    document.getElementById('sortTracks').addEventListener('click', () => setSortMode('tracks'));
    updateSortButtonsUI();
    const rescanBtn = document.getElementById('rescanBtn');
    if (rescanBtn) {
        rescanBtn.addEventListener('click', rescanLibrary);
    }

    const manageLibraryBtn = document.getElementById('manageLibraryBtn');
    if (manageLibraryBtn) {
        manageLibraryBtn.addEventListener('click', openLibraryManager);
    }

    const libraryManagerCloseBtn = document.getElementById('libraryManagerCloseBtn');
    if (libraryManagerCloseBtn) {
        libraryManagerCloseBtn.addEventListener('click', closeLibraryManager);
    }

    const addPlaylistForm = document.getElementById('addPlaylistForm');
    if (addPlaylistForm) {
        addPlaylistForm.addEventListener('submit', addPlaylistFromUI);
    }

    const browseFolderPathBtn = document.getElementById('browseFolderPathBtn');
    if (browseFolderPathBtn) {
        browseFolderPathBtn.addEventListener('click', browseFolderPath);
    }

    const editGenreCloseBtn = document.getElementById('editGenreCloseBtn');
    if (editGenreCloseBtn) {
        editGenreCloseBtn.addEventListener('click', closeEditGenreModal);
    }

    const editGenreForm = document.getElementById('editGenreForm');
    if (editGenreForm) {
        editGenreForm.addEventListener('submit', submitEditGenreFromUI);
    }

    const editGenreColorInput = document.getElementById('editGenreColorInput');
    if (editGenreColorInput) {
        editGenreColorInput.addEventListener('input', () => {
            updateEditGenreColorInputUI(editGenreColorInput.value);
        });
    }

    const genreDropdown = document.getElementById('genreDropdown');
    const dropdownTrigger = document.getElementById('dropdownTrigger');
    const dropdownMenu = document.getElementById('dropdownMenu');
    if (genreDropdown && dropdownTrigger && dropdownMenu) {
        dropdownTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            genreDropdown.classList.toggle('open');
        });

        dropdownMenu.querySelectorAll('.pro-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setGenreIconSelection(item.dataset.value || 'fa-music');
                genreDropdown.classList.remove('open');
            });
        });

        document.addEventListener('click', (e) => {
            if (!genreDropdown.contains(e.target)) {
                genreDropdown.classList.remove('open');
            }
        });
    }

    document.querySelectorAll('#genreIconPicker .genre-icon-option').forEach(option => {
        option.addEventListener('click', () => {
            setGenreIconSelection(option.dataset.icon || 'fa-music');
        });
    });

    const editPlaylistCloseBtn = document.getElementById('editPlaylistCloseBtn');
    if (editPlaylistCloseBtn) {
        editPlaylistCloseBtn.addEventListener('click', closeEditPlaylistModal);
    }

    const editPlaylistForm = document.getElementById('editPlaylistForm');
    if (editPlaylistForm) {
        editPlaylistForm.addEventListener('submit', submitEditPlaylistFromUI);
    }

    const editBrowseFolderPathBtn = document.getElementById('editBrowseFolderPathBtn');
    if (editBrowseFolderPathBtn) {
        editBrowseFolderPathBtn.addEventListener('click', browseEditFolderPath);
    }

    const deletePlaylistCloseBtn = document.getElementById('deletePlaylistCloseBtn');
    if (deletePlaylistCloseBtn) {
        deletePlaylistCloseBtn.addEventListener('click', closeDeletePlaylistModal);
    }

    const cancelDeletePlaylistBtn = document.getElementById('cancelDeletePlaylistBtn');
    if (cancelDeletePlaylistBtn) {
        cancelDeletePlaylistBtn.addEventListener('click', closeDeletePlaylistModal);
    }

    const confirmDeletePlaylistBtn = document.getElementById('confirmDeletePlaylistBtn');
    if (confirmDeletePlaylistBtn) {
        confirmDeletePlaylistBtn.addEventListener('click', confirmDeletePlaylistFromUI);
    }

    const libraryManagerModal = document.getElementById('libraryManagerModal');
    if (libraryManagerModal) {
        libraryManagerModal.addEventListener('click', (e) => {
            if (e.target === libraryManagerModal) {
                closeLibraryManager();
            }
        });
    }

    const editGenreModal = document.getElementById('editGenreModal');
    if (editGenreModal) {
        editGenreModal.addEventListener('click', (e) => {
            if (e.target === editGenreModal) {
                closeEditGenreModal();
            }
        });
    }

    const editPlaylistModal = document.getElementById('editPlaylistModal');
    if (editPlaylistModal) {
        editPlaylistModal.addEventListener('click', (e) => {
            if (e.target === editPlaylistModal) {
                closeEditPlaylistModal();
            }
        });
    }

    const deletePlaylistModal = document.getElementById('deletePlaylistModal');
    if (deletePlaylistModal) {
        deletePlaylistModal.addEventListener('click', (e) => {
            if (e.target === deletePlaylistModal) {
                closeDeletePlaylistModal();
            }
        });
    }

    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) {
        breadcrumb.addEventListener('click', (e) => {
            const target = e.target.closest('[data-breadcrumb-action]');
            if (!target) return;

            const action = target.dataset.breadcrumbAction;
            if (action === 'show-all') {
                showAllGenres();
            } else if (action === 'show-favorites') {
                showFavorites();
            } else if (action === 'show-recent') {
                showRecentlyPlayed();
            } else if (action === 'show-selected-genre') {
                const genreId = target.dataset.breadcrumbValue;
                const genre = (libraryData?.library?.folders || []).find(folder => folder.id === genreId) || selectedGenre;
                if (genre) {
                    showGenre(genre);
                }
            }
        });
    }

    const folderGrid = document.getElementById('folderGrid');
    if (folderGrid) {
        folderGrid.addEventListener('click', (e) => {
            const playBtn = e.target.closest('.track-play-btn[data-action][data-track-index]');
            if (!playBtn) return;

            const index = Number(playBtn.dataset.trackIndex);
            if (!Number.isFinite(index)) return;

            const action = playBtn.dataset.action;
            if (action === 'play-global-search') {
                playTrackFromGlobalSearch(index);
            } else if (action === 'play-recent') {
                playTrackFromRecent(index);
            } else if (action === 'play-list') {
                playTrackFromList(index);
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key.toLowerCase() === 'q' && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            toggleQueuePanel();
        }
        if (e.key === 'Escape' && isQueuePanelOpen) {
            closeQueuePanel();
        }
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.blur();
        }
        if (e.key === 'Escape') {
            document.getElementById('genreDropdown')?.classList.remove('open');
            closeLibraryManager();
            closeEditGenreModal();
            closeEditPlaylistModal();
            closeDeletePlaylistModal();
        }
    });
}

// Search functionality
function performSearch() {
    if (searchQuery.trim()) {
        renderGlobalSearchResults();
        updateWorkspaceStatus();
        return;
    }

    isGlobalSearchActive = false;
    currentGlobalSearchTracks = [];

    if (currentView === 'all') {
        showAllGenres();
    } else if (currentView === 'favorites') {
        showFavorites();
    } else if (currentView === 'recent') {
        showRecentlyPlayed();
    } else {
        if (selectedGenre) {
            showGenre(selectedGenre);
        } else {
            showAllGenres();
        }
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
        const direction = nameSortDirection === 'asc' ? 1 : -1;
        sorted.sort((a, b) => {
            const nameDiff = (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base', numeric: true });
            return nameDiff * direction;
        });
    } else if (currentSort === 'tracks' && !isGenre) {
        const direction = trackSortDirection === 'asc' ? 1 : -1;
        sorted.sort((a, b) => {
            const countDiff = (Number(a.trackCount) || 0) - (Number(b.trackCount) || 0);
            if (countDiff !== 0) {
                return countDiff * direction;
            }
            return (a.name || '').localeCompare(b.name || '');
        });
    }
    return sorted;
}

// Set sort mode
function setSortMode(mode) {
    if (mode === 'tracks') {
        if (currentSort === 'tracks') {
            trackSortDirection = trackSortDirection === 'asc' ? 'desc' : 'asc';
        }
        currentSort = 'tracks';
    } else {
        if (currentSort === 'name') {
            nameSortDirection = nameSortDirection === 'asc' ? 'desc' : 'asc';
        }
        currentSort = 'name';
    }

    updateSortButtonsUI();
    updateWorkspaceStatus();
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

    updateWorkspaceStatus();
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
        genreItem.dataset.genreId = folder.id;

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';

        const icon = document.createElement('i');
        icon.className = `${resolveFontAwesomeIconClass(folder.icon)} genre-icon`;
        icon.style.color = sanitizeColor(folder.color);

        const name = document.createElement('span');
        name.textContent = folder.name || 'Unnamed Genre';

        row.appendChild(icon);
        row.appendChild(name);

        const count = document.createElement('span');
        count.className = 'genre-count';
        count.textContent = String(folder.subfolders?.length || 0);

        genreItem.appendChild(row);
        genreItem.appendChild(count);
        genreItem.addEventListener('click', () => showGenre(folder));
        genreList.appendChild(genreItem);
    });
}

function setActiveGenreItem(genreId) {
    document.querySelectorAll('.genre-item').forEach(item => {
        item.classList.toggle('active', Boolean(genreId) && item.dataset.genreId === genreId);
    });
}

function setActiveMainNav(navId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (navId) {
        document.getElementById(navId)?.classList.add('active');
    }
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

function clearGlobalSearchState() {
    isGlobalSearchActive = false;
    currentGlobalSearchTracks = [];
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

function matchesSearchText(value, query) {
    return String(value || '').toLowerCase().includes(query);
}

function getGlobalSearchResults(query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const folders = libraryData?.library?.folders || [];

    if (!normalizedQuery) {
        return { genres: [], playlists: [], tracks: [] };
    }

    const genres = folders.filter(folder => {
        const haystack = `${folder.name || ''} ${folder.description || ''}`.toLowerCase();
        return haystack.includes(normalizedQuery);
    });

    const playlists = getAllPlaylistsWithGenre().filter(playlist => {
        const haystack = `${playlist.name || ''} ${playlist.artists || ''} ${playlist.__genreName || ''}`.toLowerCase();
        return haystack.includes(normalizedQuery);
    });

    const tracks = getAllTracksWithContext().filter(track => {
        const tags = Array.isArray(track.tags) ? track.tags.join(' ') : '';
        const haystack = `${
            track.title || ''
        } ${
            track.artist || ''
        } ${
            track.album || ''
        } ${
            track.__playlistName || ''
        } ${
            track.__genreName || ''
        } ${
            tags
        } ${
            track.mood || ''
        } ${
            track.year || ''
        } ${
            track.bpm || ''
        }`;

        return haystack.toLowerCase().includes(normalizedQuery);
    });

    const sortedGenres = sortItems(genres, true);
    const sortedPlaylists = sortItems(playlists, false);
    const sortedTracks = [...tracks].sort((a, b) => {
        if (currentSort === 'tracks') {
            const direction = trackSortDirection === 'asc' ? 1 : -1;
            return (a.__playlistName || '').localeCompare(b.__playlistName || '') * direction;
        }
        const direction = nameSortDirection === 'asc' ? 1 : -1;
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base', numeric: true }) * direction;
    });

    return {
        genres: sortedGenres,
        playlists: sortedPlaylists,
        tracks: sortedTracks
    };
}

function createGlobalSearchSectionTitle(title, count) {
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'global-search-section-title';
    sectionTitle.innerHTML = `
        <span>${title}</span>
        <small>${count}</small>
    `;
    return sectionTitle;
}

function updateStatsForGlobalSearch(results) {
    const statsBar = document.getElementById('statsBar');
    if (!statsBar) return;

    const genres = results?.genres?.length || 0;
    const playlists = results?.playlists?.length || 0;
    const tracks = results?.tracks?.length || 0;

    statsBar.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-layer-group"></i>
            <div>
                <div class="stat-value">${genres}</div>
                <div class="stat-label">Matched Genres</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-list"></i>
            <div>
                <div class="stat-value">${playlists}</div>
                <div class="stat-label">Matched Playlists</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-music"></i>
            <div>
                <div class="stat-value">${tracks}</div>
                <div class="stat-label">Matched Tracks</div>
            </div>
        </div>
    `;
}

function renderGlobalSearchResults() {
    const grid = document.getElementById('folderGrid');
    const trimmedQuery = searchQuery.trim();
    const results = getGlobalSearchResults(trimmedQuery);

    isGlobalSearchActive = true;
    currentGlobalSearchTracks = results.tracks;

    renderBreadcrumb([
        { label: 'Library', action: 'show-all' },
        { label: 'Global Search', current: true }
    ]);
    document.getElementById('pageTitle').textContent = `Search: "${trimmedQuery}"`;
    document.getElementById('pageSubtitle').textContent = 'Results across all genres, playlists, and tracks';

    updateStatsForGlobalSearch(results);
    grid.innerHTML = '';

    const totalMatches = results.genres.length + results.playlists.length + results.tracks.length;
    if (!totalMatches) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No global matches found</h3>
                <p>Try another keyword (genre, playlist, artist, album, or track name).</p>
            </div>
        `;
        return;
    }

    if (results.genres.length) {
        grid.appendChild(createGlobalSearchSectionTitle('Genres', results.genres.length));
        results.genres.forEach((folder, index) => {
            grid.appendChild(createGenreCard(folder, index));
        });
    }

    if (results.playlists.length) {
        grid.appendChild(createGlobalSearchSectionTitle('Playlists', results.playlists.length));
        results.playlists.forEach((playlist, index) => {
            grid.appendChild(
                createPlaylistCard(
                    playlist,
                    playlist.__genreColor || '#6366f1',
                    index,
                    playlist.__genreName || ''
                )
            );
        });
    }

    if (results.tracks.length) {
        grid.appendChild(createGlobalSearchSectionTitle('Tracks', results.tracks.length));

        const tracksWrapper = document.createElement('div');
        tracksWrapper.className = 'global-search-track-wrapper';

        const trackList = document.createElement('div');
        trackList.className = 'track-list-view';

        results.tracks.forEach((track, index) => {
            const trackItem = document.createElement('div');
            trackItem.className = 'track-row fade-in';
            trackItem.style.animationDelay = `${index * 0.02}s`;

            const tags = [track.__playlistName, track.__genreName].filter(Boolean);
            const tagsHTML = tags.length
                ? tags.map(tag => `<span class="track-tag">${escapeHtml(tag)}</span>`).join('')
                : '<span class="track-tag">Track</span>';

            trackItem.innerHTML = `
                <div class="track-number">${index + 1}</div>
                <img src="${sanitizeImageUrl(track.cover || DEFAULT_COVER)}" alt="${escapeHtml(track.title || 'Track cover')}" class="track-thumb">
                <div class="track-info">
                    <div class="track-title">${escapeHtml(track.title || 'Unknown Title')}</div>
                    <div class="track-artist">${escapeHtml(track.artist || 'Unknown Artist')}</div>
                </div>
                <div class="track-album">${escapeHtml(track.album || track.__playlistName || '—')}</div>
                <div class="track-meta">
                    ${track.year ? `<span><i class="fas fa-calendar"></i> ${escapeHtml(track.year)}</span>` : ''}
                    ${track.bpm ? `<span><i class="fas fa-drum"></i> ${escapeHtml(track.bpm)} BPM</span>` : ''}
                </div>
                <div class="track-tags">${tagsHTML}</div>
                <div class="track-duration">${escapeHtml(track.duration || '--:--')}</div>
                <button type="button" class="track-play-btn" data-action="play-global-search" data-track-index="${index}">
                    <i class="fas fa-play"></i>
                </button>
            `;

            trackList.appendChild(trackItem);
        });

        tracksWrapper.appendChild(trackList);
        grid.appendChild(tracksWrapper);
    }
}

function playTrackFromGlobalSearch(index) {
    if (index < 0 || index >= currentGlobalSearchTracks.length) return;

    currentPlaylist = currentGlobalSearchTracks.map(track => ({ ...track }));
    rebuildPlaybackOrder(index);

    const selectedTrack = currentPlaylist[currentTrackIndex];
    currentPlaylistContext = {
        playlistName: selectedTrack?.__playlistName || selectedTrack?.playlistName || 'Global Search',
        genreName: selectedTrack?.__genreName || selectedTrack?.genreName || ''
    };

    loadTrack(selectedTrack);
    playTrack();
}

// Show all genres view
function showAllGenres() {
    currentView = 'all';
    selectedGenre = null;
    
    setActiveMainNav('allGenresNav');
    setActiveGenreItem(null);

    if (searchQuery.trim()) {
        performSearch();
        updateWorkspaceStatus();
        return;
    }

    clearGlobalSearchState();

    renderBreadcrumb([{ label: 'Library', current: true }]);
    document.getElementById('pageTitle').textContent = 'All Genres';
    document.getElementById('pageSubtitle').textContent = 'Explore your music collection';

    renderAllGenres();
    updateStats();
    updateWorkspaceStatus();
}

function showFavorites() {
    currentView = 'favorites';
    selectedGenre = null;

    setActiveMainNav('favoritesNav');
    setActiveGenreItem(null);

    if (searchQuery.trim()) {
        performSearch();
        updateWorkspaceStatus();
        return;
    }

    clearGlobalSearchState();

    renderBreadcrumb([
        { label: 'Library', action: 'show-all' },
        { label: 'Favorites', current: true }
    ]);
    document.getElementById('pageTitle').textContent = 'Favorite Playlists';
    document.getElementById('pageSubtitle').textContent = 'Your starred playlists in one place';

    renderFavoritesPlaylists();
    updateStatsForFavorites();
    updateWorkspaceStatus();
}

function showRecentlyPlayed() {
    currentView = 'recent';
    selectedGenre = null;

    setActiveMainNav('recentlyPlayedNav');
    setActiveGenreItem(null);

    if (searchQuery.trim()) {
        performSearch();
        updateWorkspaceStatus();
        return;
    }

    clearGlobalSearchState();

    renderBreadcrumb([
        { label: 'Library', action: 'show-all' },
        { label: 'Recently Played', current: true }
    ]);
    document.getElementById('pageTitle').textContent = 'Recently Played';
    document.getElementById('pageSubtitle').textContent = 'Quickly return to your latest playback history';

    renderRecentlyPlayed();
    updateStatsForRecentlyPlayed();
    updateWorkspaceStatus();
}

function renderRecentlyPlayed() {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';

    let tracks = [...recentTracks];

    if (searchQuery) {
        tracks = tracks.filter(track => {
            const haystack = `${track.title} ${track.artist} ${track.album || ''} ${track.playlistName || ''} ${track.genreName || ''}`.toLowerCase();
            return haystack.includes(searchQuery);
        });
    }

    if (currentSort === 'name') {
        const direction = nameSortDirection === 'asc' ? 1 : -1;
        tracks.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base', numeric: true }) * direction);
    } else {
        tracks.sort((a, b) => Number(b.playedAt || 0) - Number(a.playedAt || 0));
    }

    currentRecentViewTracks = tracks;

    if (!tracks.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clock-rotate-left"></i>
                <h3>No recently played tracks yet</h3>
                <p>Play songs from any playlist and they will appear here automatically.</p>
            </div>
        `;
        return;
    }

    const trackList = document.createElement('div');
    trackList.className = 'track-list-view';

    tracks.forEach((track, index) => {
        const trackItem = document.createElement('div');
        trackItem.className = 'track-row fade-in';
        trackItem.style.animationDelay = `${index * 0.04}s`;

        const tags = [track.playlistName, track.genreName].filter(Boolean);
        const tagsHTML = tags.length
            ? tags.map(tag => `<span class="track-tag">${escapeHtml(tag)}</span>`).join('')
            : '<span class="track-tag">Recently Played</span>';

        trackItem.innerHTML = `
            <div class="track-number">${index + 1}</div>
            <img src="${sanitizeImageUrl(track.cover || DEFAULT_COVER)}" alt="${escapeHtml(track.title || 'Track cover')}" class="track-thumb">
            <div class="track-info">
                <div class="track-title">${escapeHtml(track.title || 'Unknown Title')}</div>
                <div class="track-artist">${escapeHtml(track.artist || 'Unknown Artist')}</div>
            </div>
            <div class="track-album">${escapeHtml(track.album || track.playlistName || '—')}</div>
            <div class="track-meta">
                <span><i class="fas fa-clock"></i> ${formatRelativeTime(track.playedAt)}</span>
                ${track.genreName ? `<span><i class="fas fa-layer-group"></i> ${escapeHtml(track.genreName)}</span>` : ''}
            </div>
            <div class="track-tags">${tagsHTML}</div>
            <div class="track-duration">${escapeHtml(track.duration || '--:--')}</div>
            <button type="button" class="track-play-btn" data-action="play-recent" data-track-index="${index}">
                <i class="fas fa-play"></i>
            </button>
        `;

        trackList.appendChild(trackItem);
    });

    grid.appendChild(trackList);
}

function playTrackFromRecent(index) {
    if (index < 0 || index >= currentRecentViewTracks.length) return;

    currentPlaylist = currentRecentViewTracks.map(track => ({ ...track }));
    rebuildPlaybackOrder(index);

    const selectedTrack = currentPlaylist[currentTrackIndex];
    currentPlaylistContext = {
        playlistName: selectedTrack?.playlistName || 'Recently Played',
        genreName: selectedTrack?.genreName || ''
    };

    loadTrack(selectedTrack);
    playTrack();
}

// Show specific genre
function showGenre(folder) {
    currentView = 'genre';
    selectedGenre = folder;

    setActiveMainNav(null);
    setActiveGenreItem(folder.id);

    if (searchQuery.trim()) {
        performSearch();
        updateWorkspaceStatus();
        return;
    }

    clearGlobalSearchState();

    renderBreadcrumb([
        { label: 'Library', action: 'show-all' },
        { label: folder.name || 'Genre', current: true }
    ]);
    document.getElementById('pageTitle').textContent = folder.name;
    document.getElementById('pageSubtitle').textContent = folder.description;

    renderGenrePlaylists(folder);
    updateStatsForGenre(folder);
    updateWorkspaceStatus();
}

function renderFavoritesPlaylists() {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';

    let favorites = getAllPlaylistsWithGenre().filter(playlist => Boolean(playlist.isFavorite));
    favorites = filterBySearch(favorites, false);
    favorites = sortItems(favorites, false);

    if (favorites.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-star"></i>
                <h3>No favorite playlists yet</h3>
                <p>Mark playlists as favorite from Add/Edit Playlist to show them here.</p>
            </div>
        `;
        return;
    }

    favorites.forEach((playlist, index) => {
        const card = createPlaylistCard(
            playlist,
            playlist.__genreColor || '#6366f1',
            index,
            playlist.__genreName || ''
        );
        grid.appendChild(card);
    });
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
        const card = createPlaylistCard(playlist, folder.color, index, folder.name);
        grid.appendChild(card);
    });
}

// Show playlist tracks
function showPlaylistTracks(playlist, genreColor, genreName = '') {
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
            `<span class="track-tag">${escapeHtml(tag)}</span>`
        ).join('') : '';
        
        trackItem.innerHTML = `
            <div class="track-number">${index + 1}</div>
            <img src="${sanitizeImageUrl(track.cover || DEFAULT_COVER)}" alt="${escapeHtml(track.title || 'Track cover')}" class="track-thumb">
            <div class="track-info">
                <div class="track-title">${escapeHtml(track.title || 'Unknown Title')}</div>
                <div class="track-artist">${escapeHtml(track.artist || 'Unknown Artist')}</div>
            </div>
            <div class="track-album">${escapeHtml(track.album || '')}</div>
            <div class="track-meta">
                ${track.year ? `<span><i class="fas fa-calendar"></i> ${escapeHtml(track.year)}</span>` : ''}
                ${track.bpm ? `<span><i class="fas fa-drum"></i> ${escapeHtml(track.bpm)} BPM</span>` : ''}
                ${track.mood ? `<span><i class="far fa-smile"></i> ${escapeHtml(track.mood)}</span>` : ''}
            </div>
            <div class="track-tags">${tagsHTML}</div>
            <div class="track-duration">${escapeHtml(track.duration || '--:--')}</div>
            <button type="button" class="track-play-btn" data-action="play-list" data-track-index="${index}">
                <i class="fas fa-play"></i>
            </button>
        `;
        
        trackList.appendChild(trackItem);
    });
    
    grid.appendChild(trackList);
    
    // Store current playlist for playback
    currentPlaylist = playlist.tracks;
    currentPlaylistContext = {
        playlistName: playlist?.name || '',
        genreName: genreName || selectedGenre?.name || playlist?.__genreName || ''
    };
    if (currentTrackIndex >= currentPlaylist.length) {
        currentTrackIndex = 0;
    }
    rebuildPlaybackOrder(currentTrackIndex);
    if (isQueuePanelOpen) {
        renderQueuePanel();
    }
}

// Play track from list view
function playTrackFromList(index) {
    rebuildPlaybackOrder(index);
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
        <div class="playlist-card-actions">
            <button class="playlist-action-btn edit-genre-btn" title="Edit Genre">
                <i class="fas fa-pen"></i>
            </button>
        </div>
        <div class="card-icon" style="background: linear-gradient(135deg, ${folder.color}22, ${folder.color}11);">
            <i class="${resolveFontAwesomeIconClass(folder.icon)}" style="color: ${folder.color}"></i>
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

    const editGenreBtn = card.querySelector('.edit-genre-btn');
    if (editGenreBtn) {
        editGenreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editGenreFromUI(folder);
        });
    }
    
    card.onclick = (e) => {
        if (!e.target.closest('.playlist-card-actions')) {
            if (isGlobalSearchActive) {
                const searchInput = document.getElementById('searchInput');
                const clearSearch = document.getElementById('clearSearch');
                searchQuery = '';
                if (searchInput) searchInput.value = '';
                if (clearSearch) clearSearch.classList.remove('visible');
            }
            showGenre(folder);
        }
    };
    return card;
}

// Create playlist card
function createPlaylistCard(playlist, color, index, genreName = '') {
    const card = document.createElement('div');
    card.className = 'playlist-card fade-in';
    card.style.animationDelay = `${index * 0.1}s`;
    card.style.setProperty('--card-color', color);

    const playlistImages = Array.isArray(playlist.images) ? playlist.images : [];
    const safeImages = (playlistImages.length ? playlistImages : [DEFAULT_COVER, DEFAULT_COVER, DEFAULT_COVER, DEFAULT_COVER]).slice(0, 4);
    const imagesHTML = safeImages.map(img => `<img src="${img}" alt="Album cover">`).join('');
    
    card.innerHTML = `
        <div class="playlist-card-actions">
            <button class="playlist-action-btn favorite-playlist-btn ${playlist.isFavorite ? 'active' : ''}" title="Toggle Favorite">
                <i class="${playlist.isFavorite ? 'fas' : 'far'} fa-star"></i>
            </button>
            <button class="playlist-action-btn edit-playlist-btn" title="Edit Playlist Folder">
                <i class="fas fa-pen"></i>
            </button>
            <button class="playlist-action-btn delete-playlist-btn" title="Delete Playlist Folder">
                <i class="fas fa-trash"></i>
            </button>
        </div>
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
        loadPlaylist(playlist, genreName);
    });

    const editBtn = card.querySelector('.edit-playlist-btn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editPlaylistFromUI(playlist, genreName);
        });
    }

    const deleteBtn = card.querySelector('.delete-playlist-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deletePlaylistFromUI(playlist);
        });
    }

    const favoriteBtn = card.querySelector('.favorite-playlist-btn');
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlaylistFavoriteFromUI(playlist);
        });
    }
    
    // Card click handler - show tracks
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.play-overlay')) {
            showPlaylistTracks(playlist, color, genreName);
            updateBreadcrumb(playlist.name);
        }
    });
    
    return card;
}

async function togglePlaylistFavoriteFromUI(playlist) {
    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit playlists.', 'warning');
        return;
    }

    if (!playlist?.id) return;

    try {
        await apiRequest(`http://localhost:3000/api/playlists/${encodeURIComponent(playlist.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                isFavorite: !Boolean(playlist.isFavorite)
            })
        });

        libraryData = await fetchLibraryData({ forceRescan: true });
        apiAvailable = true;
        setRescanButtonState();
        refreshLibraryUI();
    } catch (error) {
        console.error('Failed to toggle playlist favorite:', error);
        showNotification('Update Failed', error.message || 'Unable to update favorite status right now.', 'error');
    }
}

// Update breadcrumb for track view
function updateBreadcrumb(playlistName) {
    if (isGlobalSearchActive) {
        renderBreadcrumb([
            { label: 'Library', action: 'show-all' },
            { label: 'Search', current: true },
            { label: playlistName || 'Playlist', current: true }
        ]);
        document.getElementById('pageTitle').textContent = playlistName;
        document.getElementById('pageSubtitle').textContent = 'Opened from global search results';
        return;
    }

    if (currentView === 'recent') {
        renderBreadcrumb([
            { label: 'Library', action: 'show-all' },
            { label: 'Recently Played', action: 'show-recent' },
            { label: playlistName || 'Playlist', current: true }
        ]);
        document.getElementById('pageTitle').textContent = playlistName;
        document.getElementById('pageSubtitle').textContent = 'Playback started from Recently Played';
        return;
    }

    if (currentView === 'favorites') {
        renderBreadcrumb([
            { label: 'Library', action: 'show-all' },
            { label: 'Favorites', action: 'show-favorites' },
            { label: playlistName || 'Playlist', current: true }
        ]);
        document.getElementById('pageTitle').textContent = playlistName;
        document.getElementById('pageSubtitle').textContent = 'Click any track to play';
        return;
    }

    renderBreadcrumb([
        { label: 'Library', action: 'show-all' },
        {
            label: selectedGenre?.name || 'Genre',
            action: 'show-selected-genre',
            value: selectedGenre?.id || ''
        },
        { label: playlistName || 'Playlist', current: true }
    ]);
    document.getElementById('pageTitle').textContent = playlistName;
    document.getElementById('pageSubtitle').textContent = 'Click any track to play';
}

function updateStatsForFavorites() {
    const statsBar = document.getElementById('statsBar');
    const favoritePlaylists = getAllPlaylistsWithGenre().filter(playlist => Boolean(playlist.isFavorite));
    const totalTracks = favoritePlaylists.reduce((sum, playlist) => sum + (playlist.trackCount || 0), 0);
    const totalGenres = new Set(favoritePlaylists.map(playlist => playlist.__genreName || '')).size;

    statsBar.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-star"></i>
            <div>
                <div class="stat-value">${favoritePlaylists.length}</div>
                <div class="stat-label">Favorite Playlists</div>
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
            <i class="fas fa-layer-group"></i>
            <div>
                <div class="stat-value">${totalGenres}</div>
                <div class="stat-label">Genres</div>
            </div>
        </div>
    `;
}

function updateStatsForRecentlyPlayed() {
    const statsBar = document.getElementById('statsBar');
    const totalTracks = recentTracks.length;
    const uniqueArtists = new Set(recentTracks.map(track => track.artist).filter(Boolean)).size;
    const uniquePlaylists = new Set(recentTracks.map(track => track.playlistName).filter(Boolean)).size;

    statsBar.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-clock"></i>
            <div>
                <div class="stat-value">${totalTracks}</div>
                <div class="stat-label">Recent Tracks</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-user-music"></i>
            <div>
                <div class="stat-value">${uniqueArtists}</div>
                <div class="stat-label">Artists</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-list-music"></i>
            <div>
                <div class="stat-value">${uniquePlaylists}</div>
                <div class="stat-label">Playlists</div>
            </div>
        </div>
    `;
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
            <p>Could not connect to the backend API. Start the server with <strong>npm start</strong> and reload.</p>
        </div>
    `;
}

// Initialize on page load
window.onload = init;