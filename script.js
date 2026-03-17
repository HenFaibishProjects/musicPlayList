// UI state variables are in playlists.js (currentView, selectedGenre, currentSort, etc.)
// Data variables are in data.js (libraryData, apiAvailable, etc.)
// Player state variables are in player.js (audioPlayer, currentPlaylist, isPlaying, etc.)

// Script-specific state (modalFormBaseline, notificationAutoCloseTimer, pendingDeletePlaylist, editingGenreContext are in ui.js)
let folderBrowserState = {
    isOpen: false,
    currentPath: '',
    selectedPath: null,
    targetInputId: null,
    onSelect: null
};

let quickPlayObjectUrl = null;
let volumeSliderInstance = null;
let isUpdatingVolumeSlider = false;
let lastVolume = -1;
const IMPORTED_PLAYLISTS_STORAGE_KEY = 'lidaplay_imported_playlists';
const STREAM_PROXY_PATH = '/api/stream-proxy?url=';

function isQuickPlayTrack(track) {
    return Boolean(track && track.__quickPlay === true);
}

function isQuickPlayModeActive() {
    return currentPlaylist.length === 1 && isQuickPlayTrack(currentPlaylist[0]);
}

function releaseQuickPlayObjectUrl({ exceptUrl = '' } = {}) {
    if (!quickPlayObjectUrl) return;
    if (exceptUrl && quickPlayObjectUrl === exceptUrl) return;

    try {
        URL.revokeObjectURL(quickPlayObjectUrl);
    } catch (error) {
        console.warn('Failed to revoke Quick Play object URL:', error);
    }

    quickPlayObjectUrl = null;
}

function getFileNameWithoutExtension(fileName = '') {
    const value = String(fileName || '').trim();
    if (!value) return 'Quick Play';

    const extensionIndex = value.lastIndexOf('.');
    if (extensionIndex <= 0) {
        return value;
    }

    return value.slice(0, extensionIndex);
}

function createQuickPlayTrack(file, fileUrl) {
    const fileName = String(file?.name || 'Quick Play').trim() || 'Quick Play';
    return {
        id: `quick-play-${Date.now()}`,
        title: getFileNameWithoutExtension(fileName),
        artist: 'Duration: --:--',
        album: '',
        duration: '--:--',
        cover: DEFAULT_COVER,
        file: fileUrl,
        __quickPlay: true,
        __quickPlayFileName: fileName
    };
}

function openQuickPlayFilePicker() {
    const fileInput = document.getElementById('quickPlayFileInput');
    if (!fileInput) return;

    // Reset so selecting the same file twice still triggers change event
    fileInput.value = '';
    fileInput.click();
}

function playQuickPlayFile(file) {
    if (!file) return;

    const isLikelyAudio = (file.type || '').startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg)$/i.test(file.name || '');
    if (!isLikelyAudio) {
        showNotification('Unsupported File', 'Please choose an audio file (mp3, wav, flac, m4a, ogg).', 'warning');
        return;
    }

    releaseQuickPlayObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    quickPlayObjectUrl = objectUrl;

    const quickTrack = createQuickPlayTrack(file, objectUrl);
    currentPlaylistContext = {
        playlistName: 'Quick Play',
        genreName: ''
    };

    currentPlaylist = [quickTrack];
    currentTrackIndex = 0;
    rebuildPlaybackOrder(0);
    loadTrack(quickTrack);
    playTrack();
}

function handleQuickPlayFileChange(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    playQuickPlayFile(file);
}

function serializeFormState(form) {
    if (!form) return '';

    return Array.from(form.querySelectorAll('input, select, textarea'))
        .filter(field => field.id || field.name)
        .map(field => {
            const key = field.id || field.name;
            if (field.type === 'checkbox' || field.type === 'radio') {
                return `${key}:${field.checked ? '1' : '0'}`;
            }
            return `${key}:${String(field.value ?? '')}`;
        })
        .join('|');
}

function rememberModalFormState(key, formId) {
    const form = document.getElementById(formId);
    modalFormBaseline[key] = serializeFormState(form);
}

function isModalFormDirty(key, formId) {
    const form = document.getElementById(formId);
    if (!form) return false;
    return serializeFormState(form) !== (modalFormBaseline[key] || '');
}

function setFieldStatus(statusId, message = '', type = 'neutral') {
    const status = document.getElementById(statusId);
    if (!status) return;

    status.textContent = String(message || '').trim();
    status.className = 'library-field-status';

    if (!status.textContent) {
        return;
    }

    status.classList.add(`is-${sanitizeClassList(type, 'neutral')}`);
}

function promptDiscardModalChanges(contextLabel, onConfirm) {
    showNotification(
        'Discard Unsaved Changes?',
        `You have unsaved updates in ${contextLabel}. If you continue, those changes will be lost.`,
        'warning',
        [
            {
                label: 'Keep Editing',
                className: 'secondary',
                onClick: closeNotification
            },
            {
                label: 'Discard & Close',
                className: 'danger',
                onClick: () => {
                    closeNotification();
                    if (typeof onConfirm === 'function') {
                        onConfirm();
                    }
                }
            }
        ]
    );
}

function requestCloseAddGenreModal() {
    if (isModalFormDirty('addGenre', 'addGenreForm')) {
        promptDiscardModalChanges('the Add Genre form', closeAddGenreModal);
        return;
    }

    closeAddGenreModal();
}

function requestCloseAddPlaylistModal() {
    if (isModalFormDirty('addPlaylist', 'addPlaylistForm')) {
        promptDiscardModalChanges('the Add Playlist form', closeAddPlaylistModal);
        return;
    }

    closeAddPlaylistModal();
}

function requestCloseEditGenreModal() {
    if (isModalFormDirty('editGenre', 'editGenreForm')) {
        promptDiscardModalChanges('the Edit Genre form', closeEditGenreModal);
        return;
    }
    closeEditGenreModal();
}

function requestCloseEditPlaylistModal() {
    if (isModalFormDirty('editPlaylist', 'editPlaylistForm')) {
        promptDiscardModalChanges('the Edit Playlist form', closeEditPlaylistModal);
        return;
    }
    closeEditPlaylistModal();
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

function setHistoryLayoutMode(isHistoryMode) {
    const mainContent = document.querySelector('.main-content');
    const folderGrid = document.getElementById('folderGrid');

    if (!mainContent || !folderGrid) return;

    mainContent.classList.toggle('history-mode', Boolean(isHistoryMode));
    folderGrid.classList.toggle('history-grid', Boolean(isHistoryMode));

    if (isHistoryMode) {
        folderGrid.classList.remove('list-view');
    }
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

function getImportedPlaylistRecordsFromLegacyPayload(payload) {
    const records = [];
    const folders = payload?.library?.folders || [];

    folders.forEach(folder => {
        (folder?.subfolders || []).forEach(playlist => {
            if (!playlist?.isImported) return;
            records.push({
                genreId: folder?.id || '',
                genreName: folder?.name || 'Imported',
                playlist
            });
        });
    });

    return records;
}

function normalizeImportedPlaylistRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const playlist = record.playlist;
    if (!playlist || typeof playlist !== 'object') return null;
    if (!playlist.id || !Array.isArray(playlist.tracks)) return null;

    const normalizedTracks = normalizeImportedTrackSources(playlist.tracks);

    return {
        genreId: String(record.genreId || '').trim(),
        genreName: String(record.genreName || '').trim() || 'Imported',
        playlist: {
            ...playlist,
            tracks: normalizedTracks,
            isImported: true
        }
    };
}

async function loadImportedPlaylistRecords() {
    try {
        if (!apiAvailable) {
            // Fallback to localStorage if API is not available
            try {
                const raw = localStorage.getItem(IMPORTED_PLAYLISTS_STORAGE_KEY);
                if (!raw) return [];

                const parsed = JSON.parse(raw);
                const records = Array.isArray(parsed)
                    ? parsed
                    : getImportedPlaylistRecordsFromLegacyPayload(parsed);

                const normalized = records
                    .map(normalizeImportedPlaylistRecord)
                    .filter(Boolean);

                if (!Array.isArray(parsed)) {
                    await saveImportedPlaylistRecords(normalized);
                }

                return normalized;
            } catch (localError) {
                console.warn('Failed to load imported playlists from localStorage:', localError);
                return [];
            }
        }

        // Use API endpoint
        const response = await apiRequest('http://localhost:3000/api/imported-playlists');
        const playlists = response?.playlists || [];
        
        // Convert API format to internal format
        const records = playlists.map(playlist => ({
            genreId: playlist.genreId || 'imported',
            genreName: playlist.genreName || 'Imported',
            playlist: {
                ...playlist,
                isImported: true,
                tracks: playlist.tracks || []
            }
        }));

        const normalized = records
            .map(normalizeImportedPlaylistRecord)
            .filter(Boolean);

        return normalized;
    } catch (error) {
        console.warn('Failed to load imported playlists from API:', error);
        // Fallback to localStorage
        try {
            const raw = localStorage.getItem(IMPORTED_PLAYLISTS_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const records = Array.isArray(parsed)
                ? parsed
                : getImportedPlaylistRecordsFromLegacyPayload(parsed);
            const normalized = records
                .map(normalizeImportedPlaylistRecord)
                .filter(Boolean);
            return normalized;
        } catch (localError) {
            console.warn('Failed to load imported playlists from localStorage fallback:', localError);
            return [];
        }
    }
}

async function saveImportedPlaylistRecords(records = []) {
    try {
        if (!apiAvailable) {
            // Fallback to localStorage if API is not available
            localStorage.setItem(IMPORTED_PLAYLISTS_STORAGE_KEY, JSON.stringify(records));
            return;
        }

        // Save each playlist individually via API
        for (const record of records) {
            const playlist = record.playlist;
            if (!playlist) continue;
            
            // Send ONE playlist per request with name and tracks
            await apiRequest('http://localhost:3000/api/imported-playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: playlist.name || 'Imported Playlist',
                    tracks: playlist.tracks || []
                })
            });
        }

        // Also save to localStorage as backup
        localStorage.setItem(IMPORTED_PLAYLISTS_STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
        console.warn('Failed to save imported playlists:', error);
        // Fallback to localStorage
        try {
            localStorage.setItem(IMPORTED_PLAYLISTS_STORAGE_KEY, JSON.stringify(records));
        } catch (localError) {
            console.warn('Failed to save imported playlists to localStorage:', localError);
        }
    }
}

async function upsertImportedPlaylistRecord(record) {
    const normalized = normalizeImportedPlaylistRecord(record);
    if (!normalized) return;

    const records = await loadImportedPlaylistRecords();
    const deduped = records.filter(item => item?.playlist?.id !== normalized.playlist.id);
    deduped.push(normalized);
    await saveImportedPlaylistRecords(deduped);
}

async function mergeImportedPlaylistsIntoLibrary(payload) {
    const normalized = normalizeLibraryPayload(payload);
    const records = await loadImportedPlaylistRecords();

    if (!records.length) {
        return normalized;
    }

    if (!normalized.library) {
        normalized.library = { name: 'My Music Collection', folders: [] };
    }
    if (!Array.isArray(normalized.library.folders)) {
        normalized.library.folders = [];
    }

    records.forEach(record => {
        let genre = normalized.library.folders.find(folder => folder.id === record.genreId);
        if (!genre) {
            genre = normalized.library.folders.find(folder =>
                String(folder?.name || '').trim().toLowerCase() === record.genreName.toLowerCase()
            );
        }

        if (!genre) {
            genre = {
                id: record.genreId || `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: record.genreName || 'Imported',
                icon: 'fa-file-import',
                color: '#10b981',
                description: 'Imported playlists',
                subfolders: []
            };
            normalized.library.folders.push(genre);
        }

        if (!Array.isArray(genre.subfolders)) {
            genre.subfolders = [];
        }

        const exists = genre.subfolders.some(playlist => playlist?.id === record.playlist.id);
        if (!exists) {
            genre.subfolders.push(JSON.parse(JSON.stringify(record.playlist)));
        }
    });

    return normalized;
}

function addTrackToListeningHistory(track, context = {}) {
    if (!track || typeof trackPlayInHistory !== 'function') return;

    const isQuickPlay = isQuickPlayTrack(track);
    const historyContext = {
        playlistName: context.playlistName || track.playlistName || (isQuickPlay ? 'Quick Play' : ''),
        genreName: context.genreName || track.genreName || (isQuickPlay ? 'Quick Play' : '')
    };

    trackPlayInHistory(track, historyContext);
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
    return await mergeImportedPlaylistsIntoLibrary(payload);
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
    const playbackChip = document.getElementById('playbackStatusChip');
    const viewChip = document.getElementById('viewStatusChip');
    const sortChip = document.getElementById('sortStatusChip');
    const sizeChip = document.getElementById('librarySizeChip');

    if (!apiChip && !playbackChip && !viewChip && !sortChip && !sizeChip) return;

    if (apiChip) {
        const apiIcon = apiChip.querySelector('i');
        const apiText = apiChip.querySelector('span');
        apiChip.classList.toggle('online', apiAvailable);
        apiChip.classList.toggle('offline', !apiAvailable);
        if (apiIcon) apiIcon.className = apiAvailable ? 'fas fa-circle-check' : 'fas fa-plug-circle-xmark';
        if (apiText) apiText.textContent = apiAvailable ? 'API Online' : 'API Offline';
    }

    if (playbackChip) {
        const playbackIcon = playbackChip.querySelector('i');
        const playbackText = playbackChip.querySelector('span');
        const activeTrack = currentPlaylist[currentTrackIndex];

        playbackChip.classList.remove('live', 'paused', 'idle');

        if (isPlaying) {
            const trackTitle = String(activeTrack?.title || 'Now Playing');
            const compactTitle = trackTitle.length > 20 ? `${trackTitle.slice(0, 20)}…` : trackTitle;
            playbackChip.classList.add('live');
            if (playbackIcon) playbackIcon.className = 'fas fa-wave-square';
            if (playbackText) playbackText.textContent = `Playing: ${compactTitle}`;
        } else if (currentPlaylist.length > 0) {
            playbackChip.classList.add('paused');
            if (playbackIcon) playbackIcon.className = 'fas fa-circle-pause';
            if (playbackText) playbackText.textContent = 'Paused';
        } else {
            playbackChip.classList.add('idle');
            if (playbackIcon) playbackIcon.className = 'fas fa-circle-play';
            if (playbackText) playbackText.textContent = 'Ready';
        }
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
        } else if (currentView === 'history') {
            if (viewIcon) viewIcon.className = 'fas fa-calendar-days';
            if (viewText) viewText.textContent = 'Listening History';
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

function openAddGenreModal() {
    const modal = document.getElementById('addGenreModal');
    if (!modal) return;

    modal.classList.add('show');
    rememberModalFormState('addGenre', 'addGenreForm');
    syncLibraryModalBackgroundLock();
}

function closeAddGenreModal() {
    const modal = document.getElementById('addGenreModal');
    if (!modal) return;
    modal.classList.remove('show');
    syncLibraryModalBackgroundLock();
}

function openAddPlaylistModal() {
    const modal = document.getElementById('addPlaylistModal');
    if (!modal) return;

    modal.classList.add('show');
    setFieldStatus('playlistPathStatus', '');
    setFieldStatus('playlistGenreStatus', '');
    rememberModalFormState('addPlaylist', 'addPlaylistForm');
    syncLibraryModalBackgroundLock();

    loadGenreOptionsForPlaylistSelect().catch(error => {
        console.warn('Failed to load genre options for playlist form:', error);
    });
}

function closeAddPlaylistModal() {
    const modal = document.getElementById('addPlaylistModal');
    if (!modal) return;
    modal.classList.remove('show');
    syncLibraryModalBackgroundLock();
}

function syncLibraryModalBackgroundLock() {
    const lockedModalIds = ['addGenreModal', 'addPlaylistModal', 'editGenreModal', 'editPlaylistModal'];
    const hasOpenLockedModal = lockedModalIds.some(id => {
        const modal = document.getElementById(id);
        return modal?.classList.contains('show');
    });

    document.body.classList.toggle('modal-locked', hasOpenLockedModal);
}

function isLockedLibraryModalOpen() {
    const lockedModalIds = ['addGenreModal', 'addPlaylistModal', 'editGenreModal', 'editPlaylistModal'];
    return lockedModalIds.some(id => document.getElementById(id)?.classList.contains('show'));
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
    const imageInput = document.getElementById('editGenreImageInput');

    if (idInput) idInput.value = genre.id || '';
    if (nameInput) nameInput.value = genre.name || '';
    if (iconInput) iconInput.value = genre.icon || 'fa-music';
    if (colorInput) colorInput.value = genre.color || '#6366f1';
    if (descriptionInput) descriptionInput.value = genre.description || '';
    if (imageInput) imageInput.value = genre.imageUrl || '';

    setGenreIconSelection((iconInput && iconInput.value) || 'fa-music');
    updateEditGenreColorInputUI((colorInput && colorInput.value) || '#6366f1');

    modal.classList.add('show');
    rememberModalFormState('editGenre', 'editGenreForm');
    syncLibraryModalBackgroundLock();
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
    syncLibraryModalBackgroundLock();
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
    setFieldStatus('editPlaylistPathStatus', '');
    rememberModalFormState('editPlaylist', 'editPlaylistForm');
    syncLibraryModalBackgroundLock();
}

function closeEditPlaylistModal() {
    const modal = document.getElementById('editPlaylistModal');
    if (!modal) return;
    modal.classList.remove('show');
    syncLibraryModalBackgroundLock();
}

function openDeletePlaylistModal(playlist) {
    const modal = document.getElementById('deletePlaylistModal');
    const message = document.getElementById('deletePlaylistMessage');
    if (!modal || !message) return;

    pendingDeletePlaylist = playlist;
    message.textContent = `Delete playlist "${playlist.name}"? This removes the mapping from the playlist library manager.`;
    modal.classList.add('show');
}

function closeDeletePlaylistModal() {
    const modal = document.getElementById('deletePlaylistModal');
    if (!modal) return;
    modal.classList.remove('show');
    pendingDeletePlaylist = null;
}


function getGenresFromLibraryState() {
    return (libraryData?.library?.folders || []).map(folder => ({
        id: folder.id,
        name: folder.name,
        icon: folder.icon || 'fa-music',
        color: folder.color || '#6366f1',
        imageUrl: folder.imageUrl || null,
        description: folder.description || '',
        playlistCount: Array.isArray(folder.subfolders) ? folder.subfolders.length : 0
    }));
}

function populatePlaylistGenreSelect(genres = [], preferredGenreId = '') {
    const select = document.getElementById('playlistGenreSelect');
    const submitBtn = document.querySelector('#addPlaylistForm .library-submit-btn');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a genre';
    select.appendChild(placeholder);

    const validGenres = Array.isArray(genres)
        ? genres.filter(item => item && item.id && item.name)
        : [];

    validGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre.id;
        option.textContent = genre.name;
        select.appendChild(option);
    });

    if (!validGenres.length) {
        select.disabled = true;
        if (submitBtn) submitBtn.classList.add('disabled');
        setFieldStatus('playlistGenreStatus', 'Add at least one genre before creating playlists.', 'warning');
        return;
    }

    select.disabled = false;
    if (submitBtn) submitBtn.classList.remove('disabled');

    const nextValue = validGenres.some(item => item.id === preferredGenreId)
        ? preferredGenreId
        : (validGenres.some(item => item.id === currentValue) ? currentValue : '');

    select.value = nextValue;

    if (!select.value) {
        setFieldStatus('playlistGenreStatus', `${validGenres.length} genre${validGenres.length === 1 ? '' : 's'} available. Select one to continue.`, 'info');
    } else {
        setFieldStatus('playlistGenreStatus', '');
    }
}

async function loadGenreOptionsForPlaylistSelect(preferredGenreId = '') {
    if (!apiAvailable) {
        populatePlaylistGenreSelect(getGenresFromLibraryState(), preferredGenreId);
        return;
    }

    try {
        const payload = await apiRequest('http://localhost:3000/api/genres');
        const genres = Array.isArray(payload?.genres) ? payload.genres : [];
        populatePlaylistGenreSelect(genres, preferredGenreId);
    } catch (error) {
        console.error('Failed to load genres catalog:', error);
        populatePlaylistGenreSelect(getGenresFromLibraryState(), preferredGenreId);
    }
}

async function addGenreFromUI(event) {
    event.preventDefault();

    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit genre and playlist library structure.', 'warning');
        return;
    }

    const name = document.getElementById('genreNameInput')?.value?.trim();
    const imageUrl = document.getElementById('genreImageInput')?.value?.trim();
    const description = document.getElementById('genreDescriptionInput')?.value?.trim();

    if (!name) {
        showNotification('Missing Genre Name', 'Please enter a genre name.', 'warning');
        return;
    }

    try {
        const payload = await apiRequest('http://localhost:3000/api/genres', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                imageUrl,
                description
            })
        });

        const createdGenre = payload?.genre;

        if (createdGenre) {
            if (!libraryData?.library) {
                libraryData = getEmptyLibraryData();
            }
            if (!Array.isArray(libraryData.library.folders)) {
                libraryData.library.folders = [];
            }

            const exists = libraryData.library.folders.some(folder => folder.id === createdGenre.id);
            if (!exists) {
                libraryData.library.folders.push({
                    ...createdGenre,
                    subfolders: Array.isArray(createdGenre.subfolders) ? createdGenre.subfolders : []
                });
            }
        }

        refreshLibraryUI();
        event.target.reset();
        rememberModalFormState('addGenre', 'addGenreForm');

        await loadGenreOptionsForPlaylistSelect(createdGenre?.id || '');

        showNotification('Genre Added', `Genre "${name}" is now available in the playlist dropdown.`, 'success');
    } catch (error) {
        console.error('Failed to add genre:', error);
        showNotification('Add Genre Failed', error.message || 'Unable to create this genre right now.', 'error');
    }
}

async function addPlaylistFromUI(event) {
    event.preventDefault();

    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit genre and playlist library structure.', 'warning');
        return;
    }

    const genreId = document.getElementById('playlistGenreSelect')?.value?.trim();
    const name = document.getElementById('playlistNameInput')?.value?.trim();
    const artists = document.getElementById('playlistArtistsInput')?.value?.trim();
    const folderPath = document.getElementById('playlistPathInput')?.value?.trim();
    const coverImage = document.getElementById('playlistCoverInput')?.value?.trim();
    const isFavorite = Boolean(document.getElementById('playlistFavoriteInput')?.checked);

    if (!genreId) {
        setFieldStatus('playlistGenreStatus', 'Please choose an existing genre before adding a playlist.', 'warning');
        showNotification('Missing Genre', 'Please choose a genre from the dropdown first.', 'warning');
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
                genreId,
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
        closeAddPlaylistModal();

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
    const nextImageUrl = document.getElementById('editGenreImageInput')?.value?.trim() || '';

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
                description: nextDescription,
                imageUrl: nextImageUrl
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

    await openModernFolderBrowser('editPlaylistPathInput', 'editPlaylistPathStatus');
}

// Modern Folder Browser Functions
async function openModernFolderBrowser(targetInputId, statusFieldId = null) {
    folderBrowserState = {
        isOpen: true,
        currentPath: '',
        selectedPath: null,
        targetInputId,
        statusFieldId
    };

    const modal = document.getElementById('folderBrowserModal');
    if (!modal) return;

    modal.classList.add('show');
    await loadFolderBrowserDirectory('');
}

function closeFolderBrowser() {
    const modal = document.getElementById('folderBrowserModal');
    if (!modal) return;

    modal.classList.remove('show');
    folderBrowserState = {
        isOpen: false,
        currentPath: '',
        selectedPath: null,
        targetInputId: null,
        statusFieldId: null
    };
}

async function loadFolderBrowserDirectory(path) {
    const container = document.getElementById('folderBrowserContainer');
    const pathInput = document.getElementById('folderBrowserPathInput');
    const selectBtn = document.getElementById('folderBrowserSelectBtn');
    const selectedPathDisplay = document.getElementById('folderBrowserSelectedPath');
    
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div class="folder-browser-loading">
            <div class="spinner"></div>
            <p>Loading folders...</p>
        </div>
    `;

    try {
        const data = await apiRequest(`http://localhost:3000/api/browse-directories?path=${encodeURIComponent(path)}`);
        
        folderBrowserState.currentPath = data.path || '';
        pathInput.value = data.path || 'Select a drive or folder';
        
        // Update UI based on selection
        if (folderBrowserState.selectedPath === data.path && data.path) {
            selectBtn.disabled = false;
            selectedPathDisplay.textContent = data.path;
        }

        // Render folder list
        const items = data.items || [];
        
        if (items.length === 0) {
            container.innerHTML = `
                <div class="folder-browser-empty">
                    <i class="fas fa-folder-open"></i>
                    <h4>No Subfolders Found</h4>
                    <p>This folder doesn't contain any subfolders. You can still select it if it contains music files.</p>
                </div>
            `;
            return;
        }

        const listDiv = document.createElement('div');
        listDiv.className = 'folder-browser-list';

        items.forEach(item => {
            const folderItem = document.createElement('div');
            folderItem.className = 'folder-item';
            if (item.type === 'drive') {
                folderItem.classList.add('drive');
            }
            if (folderBrowserState.selectedPath === item.path) {
                folderItem.classList.add('selected');
            }

            const iconClass = item.type === 'drive' ? 'fa-hard-drive' : 'fa-folder';
            
            folderItem.innerHTML = `
                <div class="folder-item-icon">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="folder-item-info">
                    <div class="folder-item-name">${escapeHtml(item.name)}</div>
                    <div class="folder-item-path">${escapeHtml(item.path)}</div>
                </div>
                <div class="folder-item-select">
                    <i class="fas fa-check"></i>
                </div>
            `;

            // Single click to select
            folderItem.addEventListener('click', () => {
                // Deselect all
                listDiv.querySelectorAll('.folder-item').forEach(f => f.classList.remove('selected'));
                // Select this one
                folderItem.classList.add('selected');
                folderBrowserState.selectedPath = item.path;
                selectBtn.disabled = false;
                selectedPathDisplay.textContent = item.path;
            });

            // Double click to navigate into folder
            folderItem.addEventListener('dblclick', () => {
                loadFolderBrowserDirectory(item.path);
            });

            listDiv.appendChild(folderItem);
        });

        container.innerHTML = '';
        container.appendChild(listDiv);

    } catch (error) {
        console.error('Failed to load directory:', error);
        container.innerHTML = `
            <div class="folder-browser-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h4>Failed to Load Directory</h4>
                <p>${escapeHtml(error.message || 'Unable to load directory contents')}</p>
                <button class="btn" onclick="loadFolderBrowserDirectory('')">
                    <i class="fas fa-home"></i>
                    <span>Go to Drives</span>
                </button>
            </div>
        `;
    }
}

async function folderBrowserGoUp() {
    const container = document.getElementById('folderBrowserContainer');
    if (!container) return;

    try {
        const data = await apiRequest(`http://localhost:3000/api/browse-directories?path=${encodeURIComponent(folderBrowserState.currentPath)}`);
        
        if (data.parent !== null && data.parent !== undefined) {
            await loadFolderBrowserDirectory(data.parent);
        } else {
            // Go to root/drives
            await loadFolderBrowserDirectory('');
        }
    } catch (error) {
        console.error('Failed to navigate up:', error);
    }
}

function folderBrowserSelectFolder() {
    const targetInput = document.getElementById(folderBrowserState.targetInputId);
    const statusFieldId = folderBrowserState.statusFieldId;
    
    if (!targetInput) {
        closeFolderBrowser();
        return;
    }

    if (folderBrowserState.selectedPath) {
        targetInput.value = folderBrowserState.selectedPath;
        
        if (statusFieldId) {
            setFieldStatus(statusFieldId, `Selected: ${folderBrowserState.selectedPath}`, 'success');
        }
    }

    closeFolderBrowser();
}

async function browseFolderPath() {
    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to browse for folders.', 'warning');
        return;
    }

    await openModernFolderBrowser('playlistPathInput', 'playlistPathStatus');
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
        if (text) text.textContent = 'Reconnect & Rescan';
        updateWorkspaceStatus();
        return;
    }

    if (icon) icon.className = 'fas fa-rotate';
    if (text) text.textContent = 'Rescan Playlist Libraries';
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
            'Playlist Libraries Rescanned',
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

// M3U Import State
let currentImportMethod = 'file';
let importedTracks = [];

// M3U Import Functions
function openImportM3UModal() {
    const modal = document.getElementById('importM3UModal');
    if (!modal) return;
    
    // Reset form
    document.getElementById('importM3UForm').reset();
    document.getElementById('fileInputDisplay').innerHTML = '<i class="fas fa-file-audio"></i><span>Choose a file...</span>';
    document.getElementById('fileInputDisplay').classList.remove('has-file');
    document.getElementById('importProgress').classList.add('hidden');
    
    // Load genres into dropdown
    populateImportGenreSelect();
    
    modal.classList.add('show');
}

function closeImportM3UModal() {
    const modal = document.getElementById('importM3UModal');
    if (!modal) return;
    modal.classList.remove('show');
}

function populateImportGenreSelect() {
    const select = document.getElementById('importGenreSelect');
    if (!select) return;

    const genres = getGenresFromLibraryState();

    // Clear existing options except the first placeholder
    while (select.options.length > 1) {
        select.remove(1);
    }

    // Add genre options from existing genres only
    genres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre.id;
        option.textContent = genre.name;
        select.appendChild(option);
    });
}

function toggleImportMethod(method) {
    currentImportMethod = method;
    
    // Update button states
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.method === method);
    });
    
    // Toggle input visibility and disable the inactive input
    const fileRow = document.getElementById('fileInputRow');
    const urlRow = document.getElementById('urlInputRow');
    const fileInput = document.getElementById('m3uFileInput');
    const urlInput = document.getElementById('m3uUrlInput');
    
    if (method === 'file') {
        fileRow.classList.remove('hidden');
        urlRow.classList.add('hidden');
        if (fileInput) fileInput.disabled = false;
        if (urlInput) { urlInput.disabled = true; urlInput.value = ''; }
    } else {
        fileRow.classList.add('hidden');
        urlRow.classList.remove('hidden');
        if (fileInput) { fileInput.disabled = true; fileInput.value = ''; }
        if (urlInput) urlInput.disabled = false;
        // Reset file display
        const display = document.getElementById('fileInputDisplay');
        if (display) {
            display.innerHTML = '<i class="fas fa-file-audio"></i><span>Choose a file...</span>';
            display.classList.remove('has-file');
        }
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    const display = document.getElementById('fileInputDisplay');
    
    if (file) {
        display.innerHTML = `<i class="fas fa-file-audio"></i><span>${file.name}</span>`;
        display.classList.add('has-file');
    } else {
        display.innerHTML = '<i class="fas fa-file-audio"></i><span>Choose a file...</span>';
        display.classList.remove('has-file');
    }
}

function normalizeImportedTrackSource(source) {
    const value = String(source || '').trim();
    if (!value) return '';

    // Already compatible with the web app
    if (value.startsWith('/api/media?')) {
        // Ensure imported tracks can be streamed even when not part of scanned playlist roots
        if (!/[?&]imported=1(?:&|$)/.test(value)) {
            return `${value}${value.includes('?') ? '&' : '?'}imported=1`;
        }
        return value;
    }
    if (value.startsWith(STREAM_PROXY_PATH)) {
        return value;
    }

    if (/^https?:\/\//i.test(value)) {
        // If the source is already a local API path exposed as absolute URL, keep it local.
        try {
            const parsed = new URL(value);
            const isLocalApi = parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
            if (isLocalApi) {
                return `${parsed.pathname}${parsed.search}${parsed.hash}`;
            }
        } catch {
            // Fall through to proxying
        }

        // Route external streams through same-origin proxy to avoid CORS and MIME issues.
        return `${STREAM_PROXY_PATH}${encodeURIComponent(value)}`;
    }

    // Handle file:// URLs
    let localPath = value;
    if (/^file:\/\//i.test(value)) {
        try {
            const parsed = new URL(value);
            localPath = decodeURIComponent(parsed.pathname || '');
            if (/^\/[a-zA-Z]:\//.test(localPath)) {
                // /C:/Music/song.mp3 -> C:\Music\song.mp3
                localPath = localPath.slice(1);
            }
            localPath = localPath.replace(/\//g, '\\');
        } catch {
            localPath = decodeURIComponent(value.replace(/^file:\/\//i, ''));
        }
    }

    const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(localPath);
    const isUncPath = /^\\\\[^\\]/.test(localPath);
    const isUnixAbsolute = localPath.startsWith('/');

    // Convert local absolute paths to backend media endpoint
    if (isWindowsAbsolute || isUncPath || isUnixAbsolute) {
        return `/api/media?imported=1&path=${encodeURIComponent(localPath)}`;
    }

    return value;
}

function normalizeImportedTrackSources(tracks = []) {
    return tracks.map(track => {
        if (!track || typeof track !== 'object') return track;

        const originalFile = track.file;
        const normalizedFile = normalizeImportedTrackSource(originalFile);
        const normalizedValue = String(normalizedFile || '').trim();
        const unresolvedRelativeImport = Boolean(
            normalizedValue &&
            !normalizedValue.startsWith('/api/media?') &&
            !normalizedValue.startsWith(STREAM_PROXY_PATH) &&
            !/^https?:\/\//i.test(normalizedValue) &&
            !/^[a-zA-Z]+:\/\//.test(normalizedValue)
        );

        return {
            ...track,
            originalFile,
            file: normalizedFile,
            unresolvedRelativeImport
        };
    });
}

async function importM3UPlaylist(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('importM3USubmitBtn');
    const progressDiv = document.getElementById('importProgress');
    const progressFill = document.getElementById('importProgressFill');
    const progressText = document.getElementById('importProgressText');
    
    try {
        // Disable form
        submitBtn.disabled = true;
        progressDiv.classList.remove('hidden');
        progressFill.style.width = '10%';
        progressText.textContent = 'Reading playlist...';
        
        // Parse M3U
        let tracks = [];
        if (currentImportMethod === 'file') {
            const fileInput = document.getElementById('m3uFileInput');
            const file = fileInput.files[0];
            
            if (!file) {
                throw new Error('Please select a file');
            }
            
            tracks = await readM3UFile(file);
        } else {
            const urlInput = document.getElementById('m3uUrlInput');
            const url = urlInput.value.trim();
            
            if (!url) {
                throw new Error('Please enter a URL');
            }
            
            tracks = await fetchM3U(url);
        }

        // Normalize source URLs/paths so imported local tracks can play via backend proxy
        tracks = normalizeImportedTrackSources(tracks);
        
        if (tracks.length === 0) {
            throw new Error('No valid tracks found in playlist');
        }
        
        progressFill.style.width = '40%';
        progressText.textContent = `Found ${tracks.length} tracks...`;
        
        // Get genre selection
        const genreSelect = document.getElementById('importGenreSelect');
        const genreValue = genreSelect.value;
        const playlistName = document.getElementById('importPlaylistName').value.trim();
        
        if (!genreValue) {
            throw new Error('Please select a genre');
        }
        
        if (!playlistName) {
            throw new Error('Please enter a playlist name');
        }
        
        let targetGenreId = genreValue;
        
        progressFill.style.width = '60%';
        progressText.textContent = 'Processing tracks...';
        
        // Fetch stream metadata if enabled
        const fetchMetadata = document.getElementById('fetchStreamMetadata').checked;
        if (fetchMetadata) {
            progressText.textContent = 'Fetching stream metadata...';
            await enrichTracksWithMetadata(tracks);
        }
        
        progressFill.style.width = '80%';
        progressText.textContent = 'Saving playlist...';
        
        // Add playlist to library
        await addImportedPlaylistToLibrary(targetGenreId, playlistName, tracks);
        
        progressFill.style.width = '100%';
        progressText.textContent = 'Import complete!';
        
        // Success
        setTimeout(() => {
            closeImportM3UModal();
            showNotification(
                'Import Successful',
                `Imported ${tracks.length} tracks into "${playlistName}"`,
                'success'
            );

            // Clear search and navigate to target genre so the imported playlist is immediately visible
            searchQuery = '';
            const searchInput = document.getElementById('searchInput');
            const clearSearch = document.getElementById('clearSearch');
            if (searchInput) searchInput.value = '';
            if (clearSearch) clearSearch.classList.remove('visible');

            const targetGenre = (libraryData?.library?.folders || []).find(folder => folder.id === targetGenreId);
            if (targetGenre) {
                showGenre(targetGenre);
            } else {
                refreshLibraryUI();
            }
        }, 1000);
        
    } catch (error) {
        console.error('Import failed:', error);
        progressDiv.classList.add('hidden');
        submitBtn.disabled = false;
        
        showNotification(
            'Import Failed',
            error.message || 'Unable to import playlist. Please check the file/URL and try again.',
            'error'
        );
    }
}

async function createGenreForImport(genreName) {
    if (!apiAvailable) {
        // Fallback: create locally
        const newGenre = {
            id: `imported-${Date.now()}`,
            name: genreName,
            icon: 'fa-file-import',
            color: '#10b981',
            description: 'Imported from M3U',
            subfolders: []
        };
        
        if (!libraryData.library) {
            libraryData.library = { folders: [] };
        }
        libraryData.library.folders.push(newGenre);
        
        return newGenre.id;
    }
    
    // Create via API
    const payload = await apiRequest('http://localhost:3000/api/genres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: genreName,
            icon: 'fa-file-import',
            color: '#10b981',
            description: 'Imported from M3U'
        })
    });
    
    return payload.genre.id;
}

let _metadataAbortController = null;

async function enrichTracksWithMetadata(tracks) {
    const progressText = document.getElementById('importProgressText');
    const progressFill = document.getElementById('importProgressFill');
    const skipBtn = document.getElementById('skipMetadataBtn');
    const httpTracks = tracks.filter(track => {
        const metadataSource = String(track?.originalFile || track?.file || '').trim();
        return /^https?:\/\//i.test(metadataSource);
    });
    const total = httpTracks.length;
    
    if (total === 0) return;
    
    // Create abort controller so user can skip
    _metadataAbortController = new AbortController();
    const signal = _metadataAbortController.signal;
    
    // Show skip button
    if (skipBtn) {
        skipBtn.classList.remove('hidden');
        skipBtn.onclick = () => {
            if (_metadataAbortController) _metadataAbortController.abort();
        };
    }
    
    let completed = 0;
    let enriched = 0;
    const maxConcurrent = 10;
    
    try {
        for (let i = 0; i < httpTracks.length; i += maxConcurrent) {
            if (signal.aborted) break;
            
            const batch = httpTracks.slice(i, i + maxConcurrent);
            await Promise.all(batch.map(async track => {
                if (signal.aborted) return;
                try {
                    const metadataSource = String(track?.originalFile || track?.file || '').trim();
                    if (!/^https?:\/\//i.test(metadataSource)) {
                        return;
                    }

                    const metadata = await fetchStreamMetadata(metadataSource, signal);
                    if (metadata && !signal.aborted) {
                        if (metadata.title) { track.title = metadata.title; enriched++; }
                        track.artist = metadata.artist || track.artist;
                        track.genre = metadata.genre || track.genre;
                    }
                } catch (e) {
                    // Metadata fetch failed, keep original
                } finally {
                    completed++;
                    if (progressText && !signal.aborted) {
                        progressText.textContent = `Fetching stream metadata... (${completed}/${total}) — ${enriched} enriched`;
                    }
                    if (progressFill && !signal.aborted) {
                        const pct = 40 + Math.round((completed / total) * 30);
                        progressFill.style.width = `${pct}%`;
                    }
                }
            }));
        }
    } catch (e) {
        // aborted or error — continue with what we have
    }
    
    // Hide skip button
    if (skipBtn) skipBtn.classList.add('hidden');
    _metadataAbortController = null;
    
    if (progressText) {
        const skipped = signal.aborted;
        progressText.textContent = skipped 
            ? `Metadata skipped — ${enriched} of ${total} streams enriched`
            : `Metadata complete — ${enriched} of ${total} streams enriched`;
    }
}

async function addImportedPlaylistToLibrary(genreId, playlistName, tracks) {
    // Find the genre
    const genre = libraryData.library.folders.find(f => f.id === genreId);
    if (!genre) {
        throw new Error('Genre not found');
    }
    
    // Create playlist object
    const newPlaylist = {
        id: `m3u-import-${Date.now()}`,
        name: playlistName,
        artists: 'Imported from M3U',
        trackCount: tracks.length,
        duration: calculateTotalDuration(tracks),
        images: extractCovers(tracks),
        link: `imported://m3u/${playlistName}`,
        tracks: tracks,
        isImported: true,
        importDate: new Date().toISOString()
    };
    
    // Add to genre
    if (!genre.subfolders) {
        genre.subfolders = [];
    }
    genre.subfolders.push(newPlaylist);

    // Persist imported playlist records so they survive reload/API refresh
    await upsertImportedPlaylistRecord({
        genreId,
        genreName: genre.name || 'Imported',
        playlist: newPlaylist
    });
}

function calculateTotalDuration(tracks) {
    let totalSeconds = 0;
    tracks.forEach(track => {
        if (track.duration) {
            const parts = track.duration.split(':');
            if (parts.length === 2) {
                totalSeconds += parseInt(parts[0]) * 60 + parseInt(parts[1]);
            }
        }
    });
    
    if (totalSeconds === 0) return 'Unknown';
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function extractCovers(tracks) {
    const covers = tracks
        .map(t => t.cover)
        .filter(c => c && c.length > 0)
        .slice(0, 4);
    
    // Pad with default covers if needed
    while (covers.length < 4) {
        covers.push(DEFAULT_COVER);
    }
    
    return covers;
}

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

function initializeVolumeSlider() {
    const volumeBar = document.getElementById('volumeBar');
    if (!volumeBar || !window.noUiSlider) return;

    if (volumeBar.noUiSlider) {
        volumeBar.noUiSlider.destroy();
    }

    noUiSlider.create(volumeBar, {
        start: Math.round(currentVolume * 100),
        range: {
            min: 0,
            max: 100
        },
        step: 1,
        connect: [true, false]
    });

    volumeSliderInstance = volumeBar.noUiSlider;

    volumeSliderInstance.on('start', () => {
        isDraggingVolume = true;
    });

    volumeSliderInstance.on('update', (values) => {
        if (isUpdatingVolumeSlider) return;

        const value = Number(values?.[0]);
        if (!Number.isFinite(value)) return;

        const volume = Math.max(0, Math.min(1, value / 100));
        const changed = Math.abs(volume - currentVolume) > 0.001;

        currentVolume = volume;
        audioPlayer.volume = volume;
        if (!fadeIntervals.B) {
            audioPlayerB.volume = volume;
        }

        updateVolumePercentage(volume);
        updateVolumeIcon();

        if (changed) {
            scheduleSystemVolumeSync();
        }
    });

    volumeSliderInstance.on('end', () => {
        isDraggingVolume = false;
        syncVolumeToSystem({ immediate: true });
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

// Load and play playlist
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

// Load a specific track
function loadTrack(track) {
    if (!isQuickPlayTrack(track)) {
        releaseQuickPlayObjectUrl();
    }

    // Cancel any ongoing crossfade
    if (crossfadeTimer) {
        clearTimeout(crossfadeTimer);
        crossfadeTimer = null;
    }
    if (fadeIntervals.A) {
        clearInterval(fadeIntervals.A);
        fadeIntervals.A = null;
    }
    if (fadeIntervals.B) {
        clearInterval(fadeIntervals.B);
        fadeIntervals.B = null;
    }
    
    // Stop and reset both players
    audioPlayer.pause();
    audioPlayerB.pause();
    audioPlayer.currentTime = 0;
    audioPlayerB.currentTime = 0;
    audioPlayer.volume = currentVolume;
    audioPlayerB.volume = currentVolume;
    audioPlayer.playbackRate = currentPlaybackSpeed;
    audioPlayerB.playbackRate = currentPlaybackSpeed;
    
    // For external streams: try without crossOrigin first so audio plays even if CORS is missing
    // (visualizer won't get data for non-CORS streams, but audio will still be audible)
    const isExternalUrl = track.file && /^https?:\/\//i.test(track.file) && !track.file.startsWith(window.location.origin);
    if (isExternalUrl) {
        audioPlayer.removeAttribute('crossorigin');
        audioPlayerB.removeAttribute('crossorigin');
    } else {
        audioPlayer.crossOrigin = 'anonymous';
        audioPlayerB.crossOrigin = 'anonymous';
    }
    
    // Load into player A and make it active
    audioPlayer.src = track.file;
    activePlayer = 'A';
    
    document.getElementById('playerTitle').textContent = track.title;
    document.getElementById('playerArtist').textContent = isQuickPlayTrack(track)
        ? `Duration: ${track.duration || '--:--'}`
        : track.artist;
    const playerCover = document.getElementById('playerCover');
    if (playerCover) {
        playerCover.src = track.cover || DEFAULT_COVER;
    }

    if (typeof initializeProgressWaveform === 'function') {
        initializeProgressWaveform();
    }

    if (track.file && track.file.startsWith('http') && typeof setupStreamMetadataMonitoring === 'function') {
        setupStreamMetadataMonitoring(track);
    }

    if (isQueuePanelOpen) {
        renderQueuePanel();
    }

    updateWorkspaceStatus();
}

// Play track
function playTrack() {
    const currentPlayer = getActivePlayer();
    if (!currentPlayer) return;

    const currentTrack = currentPlaylist[currentTrackIndex];
    const maxAttempts = Math.max(1, currentPlaylist.length || 1);
    const remainingAttempts = Number(playTrack.remainingAttempts) || maxAttempts;

    if (currentPlayer && currentPlayer.ended) {
        currentPlayer.currentTime = 0;
    }

    currentPlayer.play()
        .then(() => {
            isPlaying = true;
            if (currentTrack) {
                addTrackToListeningHistory(currentTrack, currentPlaylistContext);
            }
            updatePlayButton();
        })
        .catch(err => {
            console.error('Error playing audio:', err);

            // Try next track automatically so a broken imported URL/path won't freeze playback.
            const canRetryOnNext = currentPlaylist.length > 1 && remainingAttempts > 1;
            if (canRetryOnNext) {
                const moved = moveToNextTrack({ autoplay: false, allowWrap: repeatMode === 1 });
                if (moved) {
                    playTrack.remainingAttempts = remainingAttempts - 1;
                    playTrack();
                    return;
                }
            }

            playTrack.remainingAttempts = maxAttempts;
            isPlaying = false;
            updatePlayButton();

            const importedPathHint = currentTrack?.originalFile && currentTrack?.originalFile !== currentTrack?.file;
            const unresolvedRelativeImportHint = currentTrack?.unresolvedRelativeImport;
            const remoteStreamProxyHint = String(currentTrack?.file || '').startsWith(STREAM_PROXY_PATH);
            showNotification(
                'Unable to Play Track',
                unresolvedRelativeImportHint
                    ? 'This imported M3U entry uses a relative file path, so the app cannot resolve its real location. Use absolute paths in the M3U (or re-export it), then import again.'
                    : remoteStreamProxyHint
                    ? 'This stream is currently unavailable or uses an unsupported codec in your browser. Try another station URL, or open the stream directly in VLC to verify the source.'
                    : importedPathHint
                    ? 'Imported track points to a local path that is not accessible yet. Add that folder as a playlist source (Add Playlist), rescan, then retry.'
                    : 'This audio file is unavailable right now. Check that the file exists, then rescan your playlist libraries.',
                'warning'
            );
        })
        .finally(() => {
            if (playTrack.remainingAttempts !== maxAttempts) {
                playTrack.remainingAttempts = maxAttempts;
            }
        });
}

// Pause track
function pauseTrack() {
    // Pause both players
    audioPlayer.pause();
    audioPlayerB.pause();
    isPlaying = false;
    
    // Cancel crossfade timer
    if (crossfadeTimer) {
        clearTimeout(crossfadeTimer);
        crossfadeTimer = null;
    }
    
    updatePlayButton();
}

// Toggle play/pause
function togglePlay() {
    if (currentPlaylist.length === 0) {
        showNotification(
            'No Playlist Selected',
            'Pick a playlist and press play on any card to start listening.',
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
    document.body.classList.toggle('is-playing', isPlaying);
    updateWorkspaceStatus();
}

// Play next track
function playNext() {
    moveToNextTrack({ autoplay: isPlaying, allowWrap: repeatMode === 1 });
}

// Play previous track
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

// Handle track end
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

// Toggle crossfade
function toggleCrossfade() {
    crossfadeEnabled = !crossfadeEnabled;
    const btn = document.getElementById('crossfadeBtn');
    btn.classList.toggle('active', crossfadeEnabled);
    btn.title = crossfadeEnabled ? `Crossfade: ${crossfadeDuration}s` : 'Crossfade: Off';
    
    showNotification(
        crossfadeEnabled ? 'Crossfade Enabled' : 'Crossfade Disabled',
        crossfadeEnabled 
            ? `Tracks will smoothly blend with a ${crossfadeDuration}-second crossfade.`
            : 'Tracks will play with hard cuts between them.',
        'success'
    );
}

// Get active audio player
function getActivePlayer() {
    return activePlayer === 'A' ? audioPlayer : audioPlayerB;
}

// Get inactive audio player
function getInactivePlayer() {
    return activePlayer === 'A' ? audioPlayerB : audioPlayer;
}

// Fade audio volume
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

// Start crossfade to next track
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

// Setup crossfade monitoring
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

// Update progress bar
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

// Update duration display
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

// Seek to position
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

// Toggle mute
function toggleMute() {
    if (audioPlayer.volume > 0) {
        currentVolume = 0;
        if (!fadeIntervals.A) audioPlayer.volume = 0;
        if (!fadeIntervals.B) audioPlayerB.volume = 0;
        updateVolumeUI(0);
    } else {
        if (currentVolume <= 0) {
            currentVolume = 0.5;
        }

        if (!fadeIntervals.A) audioPlayer.volume = currentVolume;
        if (!fadeIntervals.B) audioPlayerB.volume = currentVolume;
        updateVolumeUI(currentVolume);
    }

    syncVolumeToSystem({ immediate: true });
}

// Update volume icon
function updateVolumeIcon() {
    const icon = document.querySelector('#volumeBtn i');
    if (!icon) return;
    
    const volume = currentVolume;
    
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
    
    // Update both players' base volume (active player might be fading)
    if (!fadeIntervals.A) audioPlayer.volume = next;
    if (!fadeIntervals.B) audioPlayerB.volume = next;

    updateVolumeUI(next);
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
            lastSyncedSystemVolume = systemVolume;
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

async function syncVolumeToSystem(options = {}) {
    await syncVolumeToSystemWithOptions(options);
}

function scheduleSystemVolumeSync() {
    if (!systemVolumeSyncSupported) return;

    if (pendingVolumePushTimer) {
        clearTimeout(pendingVolumePushTimer);
    }

    pendingVolumePushTimer = setTimeout(() => {
        pendingVolumePushTimer = null;
        syncVolumeToSystemWithOptions({ immediate: true }).catch(() => {});
    }, 120);
}

async function syncVolumeToSystemWithOptions({ immediate = false } = {}) {
    if (!systemVolumeSyncSupported) return;

    if (pendingVolumePushTimer && immediate) {
        clearTimeout(pendingVolumePushTimer);
        pendingVolumePushTimer = null;
    }

    const targetVolume = Math.max(0, Math.min(1, Number(audioPlayer.volume) || 0));

    if (lastSyncedSystemVolume !== null && Math.abs(targetVolume - lastSyncedSystemVolume) < 0.012) {
        return;
    }

    if (isSyncingSystemVolume) {
        queuedSystemVolumeValue = targetVolume;
        return;
    }

    try {
        isSyncingSystemVolume = true;
        const resolvedVolume = await pushSystemVolume(targetVolume);
        if (typeof resolvedVolume === 'number') {
            lastSyncedSystemVolume = resolvedVolume;
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
            syncVolumeToSystemWithOptions({ immediate: true }).catch(() => {});
        }
    }
}

function startSystemVolumePolling() {
    if (!systemVolumeSyncSupported || systemVolumePollIntervalId) return;

    systemVolumePollIntervalId = setInterval(() => {
        syncVolumeFromSystem({ silent: true }).catch(() => {});
    }, 800);
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

    const historyCalendarNav = document.getElementById('historyCalendarNav');
    if (historyCalendarNav) {
        historyCalendarNav.addEventListener('click', showHistoryCalendar);
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

    const openAddGenreBtn = document.getElementById('openAddGenreBtn');
    if (openAddGenreBtn) {
        openAddGenreBtn.addEventListener('click', openAddGenreModal);
    }

    const openAddPlaylistBtn = document.getElementById('openAddPlaylistBtn');
    if (openAddPlaylistBtn) {
        openAddPlaylistBtn.addEventListener('click', openAddPlaylistModal);
    }

    const addGenreModalCloseBtn = document.getElementById('addGenreModalCloseBtn');
    if (addGenreModalCloseBtn) {
        addGenreModalCloseBtn.addEventListener('click', requestCloseAddGenreModal);
    }

    const addPlaylistModalCloseBtn = document.getElementById('addPlaylistModalCloseBtn');
    if (addPlaylistModalCloseBtn) {
        addPlaylistModalCloseBtn.addEventListener('click', requestCloseAddPlaylistModal);
    }

    const addGenreForm = document.getElementById('addGenreForm');
    if (addGenreForm) {
        addGenreForm.addEventListener('submit', addGenreFromUI);
    }

    const addPlaylistForm = document.getElementById('addPlaylistForm');
    if (addPlaylistForm) {
        addPlaylistForm.addEventListener('submit', addPlaylistFromUI);
    }

    const playlistGenreSelect = document.getElementById('playlistGenreSelect');
    if (playlistGenreSelect) {
        playlistGenreSelect.addEventListener('change', () => {
            setFieldStatus('playlistGenreStatus', '');
        });
    }

    const browseFolderPathBtn = document.getElementById('browseFolderPathBtn');
    if (browseFolderPathBtn) {
        browseFolderPathBtn.addEventListener('click', browseFolderPath);
    }

    const editGenreCloseBtn = document.getElementById('editGenreCloseBtn');
    if (editGenreCloseBtn) {
        editGenreCloseBtn.addEventListener('click', requestCloseEditGenreModal);
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
        editPlaylistCloseBtn.addEventListener('click', requestCloseEditPlaylistModal);
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

    // Intentionally do not close library management modals on backdrop click.
    // They should only close via explicit actions (X button / submit flow).

    const deletePlaylistModal = document.getElementById('deletePlaylistModal');
    if (deletePlaylistModal) {
        deletePlaylistModal.addEventListener('click', (e) => {
            if (e.target === deletePlaylistModal) {
                closeDeletePlaylistModal();
            }
        });
    }
    
    // Speed Control event listeners
    const speedBtn = document.getElementById('speedBtn');
    if (speedBtn) {
        speedBtn.addEventListener('click', openSpeedModal);
    }

    const speedModalCloseBtn = document.getElementById('speedModalCloseBtn');
    if (speedModalCloseBtn) {
        speedModalCloseBtn.addEventListener('click', closeSpeedModal);
    }

    const speedModal = document.getElementById('speedModal');
    if (speedModal) {
        speedModal.addEventListener('click', (e) => {
            if (e.target === speedModal) {
                closeSpeedModal();
            }
        });
    }

    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            handleSpeedSliderChange(e.target.value);
        });
    }

    const speedPresetBtns = document.querySelectorAll('.speed-preset-btn');
    speedPresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const speed = Number(btn.dataset.speed);
            if (Number.isFinite(speed)) {
                handleSpeedPresetClick(speed);
            }
        });
    });

    // Modern Folder Browser Controls
    const folderBrowserCloseBtn = document.getElementById('folderBrowserCloseBtn');
    if (folderBrowserCloseBtn) {
        folderBrowserCloseBtn.addEventListener('click', closeFolderBrowser);
    }

    const folderBrowserCancelBtn = document.getElementById('folderBrowserCancelBtn');
    if (folderBrowserCancelBtn) {
        folderBrowserCancelBtn.addEventListener('click', closeFolderBrowser);
    }

    const folderBrowserSelectBtn = document.getElementById('folderBrowserSelectBtn');
    if (folderBrowserSelectBtn) {
        folderBrowserSelectBtn.addEventListener('click', folderBrowserSelectFolder);
    }

    const folderBrowserUpBtn = document.getElementById('folderBrowserUpBtn');
    if (folderBrowserUpBtn) {
        folderBrowserUpBtn.addEventListener('click', folderBrowserGoUp);
    }

    const folderBrowserRefreshBtn = document.getElementById('folderBrowserRefreshBtn');
    if (folderBrowserRefreshBtn) {
        folderBrowserRefreshBtn.addEventListener('click', () => {
            loadFolderBrowserDirectory(folderBrowserState.currentPath);
        });
    }

    // M3U Import event listeners
    const importM3UBtn = document.getElementById('importM3UBtn');
    if (importM3UBtn) {
        importM3UBtn.addEventListener('click', openImportM3UModal);
    }

    const importM3UCloseBtn = document.getElementById('importM3UCloseBtn');
    if (importM3UCloseBtn) {
        importM3UCloseBtn.addEventListener('click', closeImportM3UModal);
    }

    const importM3UForm = document.getElementById('importM3UForm');
    if (importM3UForm) {
        importM3UForm.addEventListener('submit', importM3UPlaylist);
    }

    const quickPlayBtn = document.getElementById('quickPlayBtn');
    if (quickPlayBtn) {
        quickPlayBtn.addEventListener('click', openQuickPlayFilePicker);
    }

    const quickPlayFileInput = document.getElementById('quickPlayFileInput');
    if (quickPlayFileInput) {
        quickPlayFileInput.addEventListener('change', handleQuickPlayFileChange);
    }

    const methodBtns = document.querySelectorAll('.method-btn');
    methodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleImportMethod(btn.dataset.method);
        });
    });

    const m3uFileInput = document.getElementById('m3uFileInput');
    if (m3uFileInput) {
        m3uFileInput.addEventListener('change', handleFileSelect);
    }

    const fileInputDisplay = document.getElementById('fileInputDisplay');
    if (fileInputDisplay) {
        fileInputDisplay.addEventListener('click', () => {
            document.getElementById('m3uFileInput').click();
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

            // Keep library-manager modal flows locked unless explicitly closed by UI controls.
            if (isLockedLibraryModalOpen()) {
                return;
            }

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
        { label: 'Genre Library', action: 'show-all' },
        { label: 'Search Results', current: true }
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
        playlistName: selectedTrack?.__playlistName || selectedTrack?.playlistName || 'Search Results',
        genreName: selectedTrack?.__genreName || selectedTrack?.genreName || ''
    };

    loadTrack(selectedTrack);
    playTrack();
}

// Show all genres view
function showAllGenres() {
    currentView = 'all';
    selectedGenre = null;
    setHistoryLayoutMode(false);
    
    setActiveMainNav('allGenresNav');
    setActiveGenreItem(null);

    if (searchQuery.trim()) {
        performSearch();
        updateWorkspaceStatus();
        return;
    }

    clearGlobalSearchState();

    renderBreadcrumb([{ label: 'Genre Library', current: true }]);
    document.getElementById('pageTitle').textContent = 'All Genres';
    document.getElementById('pageSubtitle').textContent = 'Explore your music collection';

    renderAllGenres();
    updateStats();
    updateWorkspaceStatus();
}

function showFavorites() {
    currentView = 'favorites';
    selectedGenre = null;
    setHistoryLayoutMode(false);

    setActiveMainNav('favoritesNav');
    setActiveGenreItem(null);

    if (searchQuery.trim()) {
        performSearch();
        updateWorkspaceStatus();
        return;
    }

    clearGlobalSearchState();

    renderBreadcrumb([
        { label: 'Genre Library', action: 'show-all' },
        { label: 'Favorites', current: true }
    ]);
    document.getElementById('pageTitle').textContent = 'Favorite Playlists';
    document.getElementById('pageSubtitle').textContent = 'Your starred playlists in one place';

    renderFavoritesPlaylists();
    updateStatsForFavorites();
    updateWorkspaceStatus();
}


// Show specific genre
function showGenre(folder) {
    currentView = 'genre';
    selectedGenre = folder;
    setHistoryLayoutMode(false);

    setActiveMainNav(null);
    setActiveGenreItem(folder.id);

    if (searchQuery.trim()) {
        performSearch();
        updateWorkspaceStatus();
        return;
    }

    clearGlobalSearchState();

    renderBreadcrumb([
        { label: 'Genre Library', action: 'show-all' },
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
    
    const totalTracks = (folder.subfolders || []).reduce((sum, sub) => sum + (Number(sub.trackCount) || 0), 0);
    const hasGenreImage = Boolean(String(folder.imageUrl || '').trim());
    const genreImageUrl = hasGenreImage ? sanitizeImageUrl(folder.imageUrl) : '';
    
    card.innerHTML = `
        <div class="playlist-card-actions">
            <button class="playlist-action-btn edit-genre-btn" title="Edit Genre">
                <i class="fas fa-pen"></i>
            </button>
        </div>
        ${hasGenreImage ? `<div class="genre-cover"><img src="${genreImageUrl}" alt="${escapeHtml(folder.name || 'Genre')} artwork"></div>` : ''}
        <div class="card-icon" style="background: linear-gradient(135deg, ${folder.color}22, ${folder.color}11);">
            <i class="${resolveFontAwesomeIconClass(folder.icon)}" style="color: ${folder.color}"></i>
        </div>
        <h3 class="card-title">${folder.name}</h3>
        <p class="card-description">${folder.description}</p>
        <div class="card-stats">
            <div class="card-stat">
                <i class="fas fa-folder"></i>
                <span>${(folder.subfolders || []).length} playlists</span>
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
            { label: 'Genre Library', action: 'show-all' },
            { label: 'Search', current: true },
            { label: playlistName || 'Playlist', current: true }
        ]);
        document.getElementById('pageTitle').textContent = playlistName;
        document.getElementById('pageSubtitle').textContent = 'Opened from global search results';
        return;
    }

    if (currentView === 'favorites') {
        renderBreadcrumb([
            { label: 'Genre Library', action: 'show-all' },
            { label: 'Favorites', action: 'show-favorites' },
            { label: playlistName || 'Playlist', current: true }
        ]);
        document.getElementById('pageTitle').textContent = playlistName;
        document.getElementById('pageSubtitle').textContent = 'Click any track to play';
        return;
    }

    renderBreadcrumb([
        { label: 'Genre Library', action: 'show-all' },
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
            <h3>Failed to Load Genre & Playlist Libraries</h3>
            <p>Could not connect to the backend API. Start the server with <strong>npm start</strong> and reload.</p>
        </div>
    `;
}

// Playback Speed Functions
function openSpeedModal() {
    const modal = document.getElementById('speedModal');
    if (!modal) return;
    
    // Set current speed in slider and display
    const speedSlider = document.getElementById('speedSlider');
    const speedValueDisplay = document.getElementById('speedValueDisplay');
    
    if (speedSlider) {
        speedSlider.value = currentPlaybackSpeed;
    }
    
    if (speedValueDisplay) {
        speedValueDisplay.textContent = `${currentPlaybackSpeed.toFixed(1)}x`;
    }
    
    // Update preset buttons
    updateSpeedPresetButtons();
    
    modal.classList.add('show');
}

function closeSpeedModal() {
    const modal = document.getElementById('speedModal');
    if (!modal) return;
    modal.classList.remove('show');
}

function updateSpeedPresetButtons() {
    const presetButtons = document.querySelectorAll('.speed-preset-btn');
    presetButtons.forEach(btn => {
        const btnSpeed = Number(btn.dataset.speed);
        const isActive = Math.abs(btnSpeed - currentPlaybackSpeed) < 0.01;
        btn.classList.toggle('active', isActive);
    });
}

function handleSpeedSliderChange(value) {
    const speed = Number(value);
    if (!Number.isFinite(speed)) return;
    
    const speedValueDisplay = document.getElementById('speedValueDisplay');
    if (speedValueDisplay) {
        speedValueDisplay.textContent = `${speed.toFixed(1)}x`;
    }
    
    setPlaybackSpeed(speed);
    updateSpeedPresetButtons();
}

function handleSpeedPresetClick(speed) {
    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
        speedSlider.value = speed;
    }
    
    handleSpeedSliderChange(speed);
}

// Session Management Functions
function loadListeningSession() {
    // Stub - feature to be fully implemented
    console.log('Session management loading...');
}

// Pinned Playlists Functions
function loadPinnedPlaylists() {
    // Stub - feature to be fully implemented
    console.log('Pinned playlists loading...');
}


function showHistoryCalendar() {
    currentView = 'history';
    selectedGenre = null;
    setHistoryLayoutMode(true);

    if (searchQuery.trim()) {
        searchQuery = '';
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        if (searchInput) searchInput.value = '';
        if (clearSearch) clearSearch.classList.remove('visible');
    }
    
    setActiveMainNav('historyCalendarNav');
    setActiveGenreItem(null);
    
    clearGlobalSearchState();
    
    renderBreadcrumb([
        { label: 'Genre Library', action: 'show-all' },
        { label: 'Listening History', current: true }
    ]);

    document.getElementById('pageTitle').textContent = 'Listening History';
    document.getElementById('pageSubtitle').textContent = 'Review daily plays, trends, and top tracks';
    
    // Call the render function from listening-history.js
    if (typeof renderHistoryCalendar === 'function') {
        renderHistoryCalendar();
    } else {
        showNotification('Feature Loading', 'Listening History Calendar is loading...', 'info');
    }
    
    updateWorkspaceStatus();
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
