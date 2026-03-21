// Playlist Management (all variables are declared in app.js)

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
            if (countDiff !== 0) return countDiff * direction;
            return (a.name || '').localeCompare(b.name || '');
        });
    }
    return sorted;
}

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
// === Missing playlist/UI functions extracted from script.js ===

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
        { label: 'Genre Library', action: 'show-all' },
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

function playTrackFromList(index) {
    rebuildPlaybackOrder(index);
    loadTrack(currentPlaylist[currentTrackIndex]);
    playTrack();
}

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

function createPlaylistCard(playlist, color, index, genreName = '') {
    const card = document.createElement('div');
    card.className = 'playlist-card fade-in';
    card.style.animationDelay = `${index * 0.1}s`;
    card.style.setProperty('--card-color', color);

    // Check if playlist has a custom cover image URL
    const hasPlaylistImage = Boolean(String(playlist.imageUrl || playlist.coverImage || '').trim());
    const playlistImageUrl = hasPlaylistImage ? sanitizeImageUrl(playlist.imageUrl || playlist.coverImage) : '';

    const playlistImages = Array.isArray(playlist.images) ? playlist.images : [];
    const safeImages = (playlistImages.length ? playlistImages : [DEFAULT_COVER, DEFAULT_COVER, DEFAULT_COVER, DEFAULT_COVER]).slice(0, 4);
    const imagesHTML = safeImages.map(img => `<img src="${sanitizeImageUrl(img)}" alt="Album cover">`).join('');
    
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
        ${hasPlaylistImage ? `<div class="genre-cover"><img src="${playlistImageUrl}" alt="${escapeHtml(playlist.name || 'Playlist')} artwork"></div>` : ''}
        <div class="card-icon" style="background: linear-gradient(135deg, ${color}22, ${color}11);">
            <i class="fas fa-compact-disc" style="color: ${color}"></i>
        </div>
        <h3 class="card-title">${escapeHtml(playlist.name)}</h3>
        <p class="card-description">${escapeHtml(playlist.artists)}</p>
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

    if (currentView === 'recent') {
        renderBreadcrumb([
            { label: 'Genre Library', action: 'show-all' },
            { label: 'Recently Played', action: 'show-recent' },
            { label: playlistName || 'Playlist', current: true }
        ]);
        document.getElementById('pageTitle').textContent = playlistName;
        document.getElementById('pageSubtitle').textContent = 'Playback started from Recently Played';
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

// === Additional functions extracted from script.js ===

// === Smart playlist + rescan functions ===

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

function loadSmartPlaylists() {
    try {
        const raw = localStorage.getItem(SMART_PLAYLISTS_STORAGE_KEY);
        if (!raw) {
            smartPlaylists = getDefaultSmartPlaylists();
            saveSmartPlaylists();
            return;
        }
        
        const parsed = JSON.parse(raw);
        smartPlaylists = Array.isArray(parsed) ? parsed : getDefaultSmartPlaylists();
    } catch (error) {
        console.warn('Failed to load smart playlists:', error);
        smartPlaylists = getDefaultSmartPlaylists();
    }
}

function saveSmartPlaylists() {
    try {
        localStorage.setItem(SMART_PLAYLISTS_STORAGE_KEY, JSON.stringify(smartPlaylists));
    } catch (error) {
        console.warn('Failed to save smart playlists:', error);
    }
}

function getDefaultSmartPlaylists() {
    return [
        {
            id: 'smart-high-energy',
            name: 'High Energy Workout',
            icon: 'fa-dumbbell',
            color: '#f97316',
            matchType: 'all',
            rules: [
                { field: 'bpm', operator: 'greater', value: '120' }
            ]
        },
        {
            id: 'smart-classics',
            name: 'Classic Oldies',
            icon: 'fa-compact-disc',
            color: '#3b82f6',
            matchType: 'all',
            rules: [
                { field: 'year', operator: 'less', value: '1990' }
            ]
        },
        {
            id: 'smart-recent',
            name: 'Recently Added',
            icon: 'fa-clock',
            color: '#10b981',
            matchType: 'all',
            rules: [
                { field: 'addedDays', operator: 'less', value: '30' }
            ]
        }
    ];
}

function evaluateSmartPlaylistRule(track, rule) {
    const field = rule.field;
    const operator = rule.operator;
    const value = rule.value;
    
    switch (field) {
        case 'bpm':
            const trackBpm = Number(track.bpm) || 0;
            const targetBpm = Number(value) || 0;
            if (operator === 'greater') return trackBpm > targetBpm;
            if (operator === 'less') return trackBpm < targetBpm;
            if (operator === 'equals') return trackBpm === targetBpm;
            break;
            
        case 'year':
            const trackYear = Number(track.year) || 0;
            const targetYear = Number(value) || 0;
            if (operator === 'greater') return trackYear > targetYear;
            if (operator === 'less') return trackYear < targetYear;
            if (operator === 'equals') return trackYear === targetYear;
            break;
            
        case 'mood':
            if (operator === 'equals') return String(track.mood || '').toLowerCase() === String(value || '').toLowerCase();
            if (operator === 'contains') return String(track.mood || '').toLowerCase().includes(String(value || '').toLowerCase());
            break;
            
        case 'genre':
            const trackGenre = String(track.genre || '').toLowerCase();
            const targetGenre = String(value || '').toLowerCase();
            if (operator === 'equals') return trackGenre === targetGenre;
            if (operator === 'contains') return trackGenre.includes(targetGenre);
            break;
            
        case 'title':
            const trackTitle = String(track.title || '').toLowerCase();
            const targetTitle = String(value || '').toLowerCase();
            if (operator === 'contains') return trackTitle.includes(targetTitle);
            break;
            
        case 'artist':
            const trackArtist = String(track.artist || '').toLowerCase();
            const targetArtist = String(value || '').toLowerCase();
            if (operator === 'contains') return trackArtist.includes(targetArtist);
            break;
            
        case 'tags':
            const trackTags = Array.isArray(track.tags) ? track.tags.join(' ').toLowerCase() : '';
            const targetTag = String(value || '').toLowerCase();
            if (operator === 'contains') return trackTags.includes(targetTag);
            break;
    }
    
    return false;
}

function evaluateSmartPlaylist(smartPlaylist) {
    const allTracks = getAllTracksWithContext();
    const matchType = smartPlaylist.matchType || 'all';
    const rules = smartPlaylist.rules || [];
    
    if (rules.length === 0) return [];
    
    return allTracks.filter(track => {
        if (matchType === 'all') {
            return rules.every(rule => evaluateSmartPlaylistRule(track, rule));
        } else {
            return rules.some(rule => evaluateSmartPlaylistRule(track, rule));
        }
    });
}

function showSmartPlaylists() {
    currentView = 'smart';
    selectedGenre = null;
    
    setActiveMainNav('smartPlaylistsNav');
    setActiveGenreItem(null);
    
    if (searchQuery.trim()) {
        performSearch();
        updateWorkspaceStatus();
        return;
    }
    
    clearGlobalSearchState();
    
    renderBreadcrumb([
        { label: 'Genre Library', action: 'show-all' },
        { label: 'Smart Playlists', current: true }
    ]);
    document.getElementById('pageTitle').textContent = 'Smart Playlists';
    document.getElementById('pageSubtitle').textContent = 'AI-generated playlists based on your music rules';
    
    renderSmartPlaylists();
    updateStatsForSmartPlaylists();
    updateWorkspaceStatus();
}

function renderSmartPlaylists() {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';
    
    smartPlaylists.forEach((smartPlaylist, index) => {
        const matchingTracks = evaluateSmartPlaylist(smartPlaylist);
        const totalSeconds = matchingTracks.reduce((sum, track) => sum + parseTrackDurationToSeconds(track.duration), 0);
        const duration = formatQueueDuration(totalSeconds);
        
        const card = document.createElement('div');
        card.className = 'playlist-card fade-in';
        card.style.animationDelay = `${index * 0.1}s`;
        card.style.setProperty('--card-color', smartPlaylist.color || '#6366f1');
        
        const playlistImages = matchingTracks.slice(0, 4).map(t => t.cover).filter(Boolean);
        const safeImages = (playlistImages.length ? playlistImages : [DEFAULT_COVER, DEFAULT_COVER, DEFAULT_COVER, DEFAULT_COVER]).slice(0, 4);
        const imagesHTML = safeImages.map(img => `<img src="${sanitizeImageUrl(img)}" alt="Album cover">`).join('');
        
        card.innerHTML = `
            <div class="playlist-card-actions">
                <button class="playlist-action-btn delete-smart-playlist-btn" title="Delete Smart Playlist" data-smart-id="${smartPlaylist.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="play-overlay">
                <div class="play-btn">
                    <i class="fas fa-play"></i>
                </div>
            </div>
            <div class="card-icon" style="background: linear-gradient(135deg, ${smartPlaylist.color || '#6366f1'}22, ${smartPlaylist.color || '#6366f1'}11);">
                <i class="fas ${smartPlaylist.icon || 'fa-brain'}" style="color: ${smartPlaylist.color || '#6366f1'}"></i>
            </div>
            <h3 class="card-title">${escapeHtml(smartPlaylist.name)}</h3>
            <p class="card-description">${smartPlaylist.rules.length} rule${smartPlaylist.rules.length === 1 ? '' : 's'} · ${smartPlaylist.matchType === 'all' ? 'Match ALL' : 'Match ANY'}</p>
            <div class="image-grid">
                ${imagesHTML}
            </div>
            <div class="card-stats">
                <div class="card-stat">
                    <i class="fas fa-music"></i>
                    <span>${matchingTracks.length} tracks</span>
                </div>
                <div class="card-stat">
                    <i class="far fa-clock"></i>
                    <span>${duration}</span>
                </div>
            </div>
        `;
        
        const playOverlay = card.querySelector('.play-overlay');
        playOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            playSmartPlaylist(smartPlaylist);
        });
        
        const deleteBtn = card.querySelector('.delete-smart-playlist-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSmartPlaylist(smartPlaylist.id);
            });
        }
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.play-overlay') && !e.target.closest('.playlist-card-actions')) {
                showSmartPlaylistTracks(smartPlaylist);
            }
        });
        
        grid.appendChild(card);
    });
    
    // Add "Create New" card
    const createCard = document.createElement('div');
    createCard.className = 'playlist-card fade-in create-new-card';
    createCard.style.animationDelay = `${smartPlaylists.length * 0.1}s`;
    createCard.innerHTML = `
        <div class="card-icon" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.1));">
            <i class="fas fa-plus" style="color: #6366f1;"></i>
        </div>
        <h3 class="card-title">Create Smart Playlist</h3>
        <p class="card-description">Auto-updating playlists based on rules</p>
    `;
    createCard.addEventListener('click', openSmartPlaylistModal);
    grid.appendChild(createCard);
}

function playSmartPlaylist(smartPlaylist) {
    const tracks = evaluateSmartPlaylist(smartPlaylist);
    
    if (tracks.length === 0) {
        showNotification(
            'No Matching Tracks',
            'This smart playlist has no tracks matching the current rules.',
            'info'
        );
        return;
    }
    
    currentPlaylist = tracks;
    currentTrackIndex = 0;
    currentPlaylistContext = {
        playlistName: smartPlaylist.name,
        genreName: 'Smart Playlist'
    };
    rebuildPlaybackOrder(currentTrackIndex);
    loadTrack(currentPlaylist[currentTrackIndex]);
    playTrack();
}

function showSmartPlaylistTracks(smartPlaylist) {
    const tracks = evaluateSmartPlaylist(smartPlaylist);
    currentSmartPlaylistTracks = tracks;
    
    renderBreadcrumb([
        { label: 'Genre Library', action: 'show-all' },
        { label: 'Smart Playlists', action: 'show-smart' },
        { label: smartPlaylist.name, current: true }
    ]);
    document.getElementById('pageTitle').textContent = smartPlaylist.name;
    document.getElementById('pageSubtitle').textContent = `Auto-generated · ${tracks.length} matching tracks`;
    
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';
    
    if (tracks.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-brain"></i>
                <h3>No Matching Tracks</h3>
                <p>No tracks in your library match the current rules. Try adjusting the smart playlist criteria.</p>
            </div>
        `;
        return;
    }
    
    const trackList = document.createElement('div');
    trackList.className = 'track-list-view';
    
    tracks.forEach((track, index) => {
        const trackItem = document.createElement('div');
        trackItem.className = 'track-row fade-in';
        trackItem.style.animationDelay = `${index * 0.02}s`;
        
        const tags = [track.__playlistName, track.__genreName].filter(Boolean);
        const tagsHTML = tags.length
            ? tags.map(tag => `<span class="track-tag">${escapeHtml(tag)}</span>`).join('')
            : '<span class="track-tag">Smart</span>';
        
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
                ${track.mood ? `<span><i class="far fa-smile"></i> ${escapeHtml(track.mood)}</span>` : ''}
            </div>
            <div class="track-tags">${tagsHTML}</div>
            <div class="track-duration">${escapeHtml(track.duration || '--:--')}</div>
            <button type="button" class="track-play-btn" data-action="play-smart" data-track-index="${index}">
                <i class="fas fa-play"></i>
            </button>
        `;
        
        trackList.appendChild(trackItem);
    });
    
    grid.appendChild(trackList);
    
    // Store for playback
    currentPlaylist = tracks;
    currentPlaylistContext = {
        playlistName: smartPlaylist.name,
        genreName: 'Smart Playlist'
    };
    if (currentTrackIndex >= currentPlaylist.length) {
        currentTrackIndex = 0;
    }
    rebuildPlaybackOrder(currentTrackIndex);
    if (isQueuePanelOpen) {
        renderQueuePanel();
    }
}

function playTrackFromSmart(index) {
    if (index < 0 || index >= currentSmartPlaylistTracks.length) return;
    
    currentPlaylist = currentSmartPlaylistTracks;
    rebuildPlaybackOrder(index);
    loadTrack(currentPlaylist[currentTrackIndex]);
    playTrack();
}

function deleteSmartPlaylist(id) {
    smartPlaylists = smartPlaylists.filter(sp => sp.id !== id);
    saveSmartPlaylists();
    showSmartPlaylists();
    showNotification('Smart Playlist Deleted', 'The smart playlist has been removed.', 'success');
}

function openSmartPlaylistModal() {
    const modal = document.getElementById('smartPlaylistModal');
    if (!modal) return;
    
    // Reset form
    document.getElementById('smartPlaylistForm').reset();
    document.getElementById('smartPlaylistRules').innerHTML = '';
    
    // Add one default rule
    addSmartPlaylistRule();
    
    modal.classList.add('show');
}

function closeSmartPlaylistModal() {
    const modal = document.getElementById('smartPlaylistModal');
    if (!modal) return;
    modal.classList.remove('show');
}

function addSmartPlaylistRule() {
    const rulesContainer = document.getElementById('smartPlaylistRules');
    const ruleId = ++smartRuleCounter;
    
    const ruleDiv = document.createElement('div');
    ruleDiv.className = 'smart-rule';
    ruleDiv.dataset.ruleId = ruleId;
    
    ruleDiv.innerHTML = `
        <select class="smart-rule-field">
            <option value="bpm">BPM</option>
            <option value="year">Year</option>
            <option value="mood">Mood</option>
            <option value="genre">Genre</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="tags">Tags</option>
        </select>
        <select class="smart-rule-operator">
            <option value="greater">Greater than</option>
            <option value="less">Less than</option>
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
        </select>
        <input type="text" class="smart-rule-value" placeholder="Value">
        <button type="button" class="smart-rule-remove" title="Remove Rule">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    const removeBtn = ruleDiv.querySelector('.smart-rule-remove');
    removeBtn.addEventListener('click', () => {
        ruleDiv.remove();
    });
    
    rulesContainer.appendChild(ruleDiv);
}

function createSmartPlaylist(event) {
    event.preventDefault();
    
    const name = document.getElementById('smartPlaylistNameInput').value.trim();
    const icon = document.getElementById('smartPlaylistIconInput').value;
    const matchType = document.getElementById('smartPlaylistMatchType').value;
    
    if (!name) {
        showNotification('Missing Name', 'Please enter a name for the smart playlist.', 'warning');
        return;
    }
    
    const ruleElements = document.querySelectorAll('.smart-rule');
    if (ruleElements.length === 0) {
        showNotification('No Rules', 'Please add at least one rule for the smart playlist.', 'warning');
        return;
    }
    
    const rules = Array.from(ruleElements).map(ruleEl => ({
        field: ruleEl.querySelector('.smart-rule-field').value,
        operator: ruleEl.querySelector('.smart-rule-operator').value,
        value: ruleEl.querySelector('.smart-rule-value').value.trim()
    })).filter(rule => rule.value);
    
    if (rules.length === 0) {
        showNotification('Empty Rules', 'Please fill in at least one rule with a value.', 'warning');
        return;
    }
    
    const newSmartPlaylist = {
        id: `smart-${Date.now()}`,
        name,
        icon,
        color: '#6366f1',
        matchType,
        rules
    };
    
    smartPlaylists.push(newSmartPlaylist);
    saveSmartPlaylists();
    closeSmartPlaylistModal();
    showSmartPlaylists();
    
    showNotification(
        'Smart Playlist Created',
        `"${name}" will automatically update with ${evaluateSmartPlaylist(newSmartPlaylist).length} matching tracks.`,
        'success'
    );
}

function updateStatsForSmartPlaylists() {
    const statsBar = document.getElementById('statsBar');
    const totalPlaylists = smartPlaylists.length;
    const totalTracks = smartPlaylists.reduce((sum, sp) => sum + evaluateSmartPlaylist(sp).length, 0);
    
    statsBar.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-brain"></i>
            <div>
                <div class="stat-value">${totalPlaylists}</div>
                <div class="stat-label">Smart Playlists</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-music"></i>
            <div>
                <div class="stat-value">${totalTracks}</div>
                <div class="stat-label">Matching Tracks</div>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-magic"></i>
            <div>
                <div class="stat-value">Auto</div>
                <div class="stat-label">Updates</div>
            </div>
        </div>
    `;
}
