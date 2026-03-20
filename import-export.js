// Import/Export functionality - M3U import, imported playlist records, track normalization

// M3U Import State
let currentImportMethod = 'file';
let importedTracks = [];

// Tracks a server-side file path chosen via the folder-browser modal (file mode).
// null means no file has been selected via the browser yet (native input will be used instead).
let selectedM3UFilePath = null;

/**
 * Read an M3U/M3U8/PLS file from the server by absolute path.
 * Uses the /api/read-m3u endpoint and the existing parseM3U() parser.
 */
async function readM3UFileByPath(filePath) {
    const response = await fetch(
        `http://localhost:3000/api/read-m3u?path=${encodeURIComponent(filePath)}`
    );
    if (!response.ok) {
        let errMsg = 'Failed to read M3U file';
        try {
            const err = await response.json();
            errMsg = err.error || errMsg;
        } catch { /* ignore */ }
        throw new Error(errMsg);
    }
    const content = await response.text();
    return parseM3U(content);
}

/**
 * Open the amazing folder-browser modal in file-selection mode so the user can
 * pick an M3U/M3U8/PLS file from the filesystem instead of using the native
 * OS file picker.  Falls back to the native input if the API is offline.
 */
function openFileBrowserForM3U() {
    if (!apiAvailable) {
        // API offline – fall back to the native file input
        document.getElementById('m3uFileInput').click();
        return;
    }

    openModernFolderBrowser(null, null, {
        mode: 'file',
        fileExtensions: ['.m3u', '.m3u8', '.pls'],
        onFileSelect: (filePath) => {
            // Store the chosen path so importM3UPlaylist() can use it
            selectedM3UFilePath = filePath;

            // Update the visual "Choose a file…" display
            const display = document.getElementById('fileInputDisplay');
            if (display) {
                const fileName = filePath.split(/[\\/]/).pop();
                display.innerHTML = `<i class="fas fa-file-audio"></i><span>${fileName}</span>`;
                display.classList.add('has-file');
            }

            // Clear the native file input so it doesn't interfere
            const fileInput = document.getElementById('m3uFileInput');
            if (fileInput) fileInput.value = '';
        }
    });
}

// Imported playlist management
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
            
            // Send ONE playlist per request with name, tracks, and genre info
            await apiRequest('http://localhost:3000/api/imported-playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: playlist.name || 'Imported Playlist',
                    tracks: playlist.tracks || [],
                    genreId: record.genreId || '',
                    genreName: record.genreName || 'Imported'
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
            // Ensure playlist has all UI-required properties
            const playlist = JSON.parse(JSON.stringify(record.playlist));
            const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
            
            // Add missing UI properties
            if (!playlist.trackCount) {
                playlist.trackCount = tracks.length;
            }
            if (!playlist.duration) {
                playlist.duration = calculateTotalDuration(tracks);
            }
            if (!playlist.artists) {
                playlist.artists = 'Imported from M3U';
            }
            if (!playlist.images || !Array.isArray(playlist.images) || playlist.images.length === 0) {
                playlist.images = extractCovers(tracks);
            }
            if (!playlist.link) {
                playlist.link = `imported://m3u/${playlist.name || 'playlist'}`;
            }
            playlist.isImported = true;
            
            genre.subfolders.push(playlist);
        }
    });

    return normalized;
}

// Track source normalization
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

// M3U Import Functions
function openImportM3UModal() {
    const modal = document.getElementById('importM3UModal');
    if (!modal) return;
    
    // Reset form state including the server-side path tracker
    selectedM3UFilePath = null;
    document.getElementById('importM3UForm').reset();
    document.getElementById('fileInputDisplay').innerHTML = '<i class="fas fa-file-audio"></i><span>Choose a file...</span>';
    document.getElementById('fileInputDisplay').classList.remove('has-file');
    document.getElementById('importProgress').classList.add('hidden');
    
    // Load genres into dropdown
    populateImportGenreSelect();
    
    // Add event listener for genre select change
    const importGenreSelect = document.getElementById('importGenreSelect');
    const newGenreNameRow = document.getElementById('newGenreNameRow');
    if (importGenreSelect && newGenreNameRow) {
        importGenreSelect.addEventListener('change', (e) => {
            if (e.target.value === '__new__') {
                newGenreNameRow.classList.remove('hidden');
            } else {
                newGenreNameRow.classList.add('hidden');
            }
        });
    }
    
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
    while (select.options.length > 2) {
        select.remove(2);
    }

    // Add "Create new genre" option
    const newGenreOption = document.createElement('option');
    newGenreOption.value = '__new__';
    newGenreOption.textContent = '➕ Create new genre...';
    if (select.options.length === 1) {
        select.appendChild(newGenreOption);
    }

    // Add genre options from existing genres
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
        // Clear the server-side file path and reset display
        selectedM3UFilePath = null;
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
            if (selectedM3UFilePath) {
                // Chosen via the folder-browser modal — read from server
                tracks = await readM3UFileByPath(selectedM3UFilePath);
            } else {
                // Fall back to native <input type="file">
                const fileInput = document.getElementById('m3uFileInput');
                const file = fileInput.files[0];
                if (!file) {
                    throw new Error('Please select a file');
                }
                tracks = await readM3UFile(file);
            }
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
        
        // Handle new genre creation
        let targetGenreId = genreValue;
        if (genreValue === '__new__') {
            const newGenreName = document.getElementById('newGenreNameInput').value.trim();
            if (!newGenreName) {
                throw new Error('Please enter a name for the new genre');
            }
            
            // Create new genre
            progressText.textContent = 'Creating new genre...';
            targetGenreId = await createGenreForImport(newGenreName);
        }
        
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
    
    // Refresh library data to include the new genre
    try {
        const freshLibraryData = await fetchLibraryData({ forceRescan: false });
        libraryData = await mergeImportedPlaylistsIntoLibrary(freshLibraryData);
    } catch (error) {
        console.warn('Failed to refresh library data after creating genre:', error);
    }
    
    return payload.genre.id;
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

    // Refresh library data from server to ensure UI is in sync
    try {
        const freshLibraryData = await fetchLibraryData({ forceRescan: false });
        apiAvailable = true;
        setRescanButtonState();
        
        // Merge imported playlists into the fresh library data
        libraryData = await mergeImportedPlaylistsIntoLibrary(freshLibraryData);
    } catch (error) {
        console.warn('Failed to refresh library data after import:', error);
        // Continue with local data if refresh fails
        // Still try to merge imported playlists with current library data
        try {
            libraryData = await mergeImportedPlaylistsIntoLibrary(libraryData);
        } catch (mergeError) {
            console.warn('Failed to merge imported playlists:', mergeError);
        }
    }
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
