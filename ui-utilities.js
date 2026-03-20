// UI Utilities - Search, sorting, view modes, notifications, UI helpers

// Search functionality (searchQuery is declared in app.js)
let searchTimeout = null;

function performSearch(query) {
    searchQuery = query.trim().toLowerCase();
    
    if (!searchQuery) {
        // Clear search - show all
        document.getElementById('clearSearch').classList.remove('visible');
        refreshLibraryUI();
        return;
    }
    
    // Show clear button
    document.getElementById('clearSearch').classList.add('visible');
    
    // Filter playlists
    const filteredPlaylists = [];
    
    (libraryData?.library?.folders || []).forEach(genre => {
        (genre?.subfolders || []).forEach(playlist => {
            const matches = (
                (playlist.name && playlist.name.toLowerCase().includes(searchQuery)) ||
                (playlist.artists && playlist.artists.toLowerCase().includes(searchQuery)) ||
                (playlist.tracks && playlist.tracks.some(track => 
                    (track.title && track.title.toLowerCase().includes(searchQuery)) ||
                    (track.artist && track.artist.toLowerCase().includes(searchQuery))
                ))
            );
            
            if (matches) {
                filteredPlaylists.push({
                    genre,
                    playlist
                });
            }
        });
    });
    
    // Render search results
    renderSearchResults(filteredPlaylists);
}

function renderSearchResults(results) {
    const container = document.getElementById('playlistContainer');
    if (!container) return;
    
    if (results.length === 0) {
        container.innerHTML = `
            <div class="search-empty-state">
                <i class="fas fa-search"></i>
                <h4>No matches found</h4>
                <p>Try a different search term or browse the library.</p>
            </div>
        `;
        return;
    }
    
    // Group by genre
    const grouped = {};
    results.forEach(({ genre, playlist }) => {
        if (!grouped[genre.id]) {
            grouped[genre.id] = {
                genre,
                playlists: []
            };
        }
        grouped[genre.id].playlists.push(playlist);
    });
    
    // Render grouped results
    container.innerHTML = Object.values(grouped).map(({ genre, playlists }) => `
        <div class="genre-section">
            <div class="genre-header">
                <div class="genre-icon" style="background-color: ${genre.color || '#6366f1'}">
                    <i class="${resolveFontAwesomeIconClass(genre.icon)}"></i>
                </div>
                <div class="genre-info">
                    <h3>${genre.name}</h3>
                    <p>${playlists.length} playlist${playlists.length === 1 ? '' : 's'} found</p>
                </div>
            </div>
            <div class="playlist-grid">
                ${playlists.map(playlist => renderPlaylistCard(playlist, genre)).join('')}
            </div>
        </div>
    `).join('');
}

function handleSearchInput(e) {
    const query = e.target.value;
    
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
        performSearch(query);
    }, 300);
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    document.getElementById('clearSearch').classList.remove('visible');
    searchQuery = '';
    refreshLibraryUI();
}

// Sorting functionality (currentSort is declared in app.js)

function sortPlaylists(playlists, sortBy = currentSort) {
    if (!Array.isArray(playlists)) return [];
    
    const [field, direction] = sortBy.split('-');
    const isAsc = direction === 'asc';
    
    return [...playlists].sort((a, b) => {
        let aVal, bVal;
        
        switch (field) {
            case 'name':
                aVal = a.name || '';
                bVal = b.name || '';
                break;
            case 'artists':
                aVal = a.artists || '';
                bVal = b.artists || '';
                break;
            case 'tracks':
                aVal = a.trackCount || 0;
                bVal = b.trackCount || 0;
                break;
            case 'duration':
                aVal = parseDurationToSeconds(a.duration || '0:00');
                bVal = parseDurationToSeconds(b.duration || '0:00');
                break;
            case 'date':
                aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                break;
            default:
                aVal = a.name || '';
                bVal = b.name || '';
        }
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return isAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        
        return isAsc ? aVal - bVal : bVal - aVal;
    });
}

function parseDurationToSeconds(duration) {
    if (!duration) return 0;
    
    if (typeof duration === 'string') {
        const parts = duration.split(':').map(Number);
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
    }
    
    return 0;
}

function updateSortUI() {
    const sortBtn = document.getElementById('sortBtn');
    if (!sortBtn) return;
    
    const [field, direction] = currentSort.split('-');
    const icon = direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
    
    sortBtn.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>Sort</span>
    `;
}

function openSortDropdown() {
    const dropdown = document.getElementById('sortDropdown');
    if (!dropdown) return;
    
    dropdown.classList.toggle('show');
}

function selectSortOption(option) {
    currentSort = option;
    updateSortUI();
    closeSortDropdown();
    refreshLibraryUI();
}

function closeSortDropdown() {
    const dropdown = document.getElementById('sortDropdown');
    if (!dropdown) return;
    
    dropdown.classList.remove('show');
}

// View mode functionality
let currentViewMode = 'grid';

function toggleViewMode() {
    currentViewMode = currentViewMode === 'grid' ? 'list' : 'grid';
    updateViewModeUI();
    refreshLibraryUI();
}

function updateViewModeUI() {
    const viewBtn = document.getElementById('viewModeBtn');
    if (!viewBtn) return;
    
    const icon = currentViewMode === 'grid' ? 'fa-list' : 'fa-grid';
    const label = currentViewMode === 'grid' ? 'List' : 'Grid';
    
    viewBtn.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${label}</span>
    `;
    
    // Update container class
    const container = document.getElementById('playlistContainer');
    if (container) {
        container.className = `playlist-container ${currentViewMode}-view`;
    }
}


// UI helper functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeClassList(value, fallback = '') {
    const safe = String(value || '').trim();
    if (!safe) return fallback;
    
    // Only allow alphanumeric and hyphens
    return safe.replace(/[^a-zA-Z0-9-]/g, '-');
}

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Loading states
function showLoading(containerId, message = 'Loading...') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
}

function hideLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const loadingState = container.querySelector('.loading-state');
    if (loadingState) {
        loadingState.remove();
    }
}

// Responsive helpers
function isMobile() {
    return window.innerWidth <= 768;
}

function isTablet() {
    return window.innerWidth > 768 && window.innerWidth <= 1024;
}

function isDesktop() {
    return window.innerWidth > 1024;
}

function updateResponsiveClasses() {
    const body = document.body;
    
    body.classList.toggle('mobile', isMobile());
    body.classList.toggle('tablet', isTablet());
    body.classList.toggle('desktop', isDesktop());
}

// Initialize UI utilities
function initializeUIUtilities() {
    // Set initial view mode
    updateViewModeUI();
    
    // Set initial sort
    updateSortUI();
    
    // Add responsive classes
    updateResponsiveClasses();
    window.addEventListener('resize', updateResponsiveClasses);
    
    // Close dropdowns on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sort-dropdown') && !e.target.closest('#sortBtn')) {
            closeSortDropdown();
        }
    });
}

// === Missing UI/event functions extracted from script.js ===

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

    const smartPlaylistsNav = document.getElementById('smartPlaylistsNav');
    if (smartPlaylistsNav) {
        smartPlaylistsNav.addEventListener('click', showSmartPlaylists);
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
        playlistGenreSelect.addEventListener('change', (e) => {
            setFieldStatus('playlistGenreStatus', '');
            
            // Handle Create New Genre fields visibility
            const newGenreRow = document.getElementById('playlistNewGenreNameRow');
            const newGenreColorRow = document.getElementById('playlistNewGenreColorRow');
            if (newGenreRow && newGenreColorRow) {
                if (e.target.value === '__new__') {
                    newGenreRow.classList.remove('hidden');
                    newGenreColorRow.classList.remove('hidden');
                } else {
                    newGenreRow.classList.add('hidden');
                    newGenreColorRow.classList.add('hidden');
                }
            }
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
    
    const smartPlaylistCloseBtn = document.getElementById('smartPlaylistCloseBtn');
    if (smartPlaylistCloseBtn) {
        smartPlaylistCloseBtn.addEventListener('click', closeSmartPlaylistModal);
    }
    
    const smartPlaylistForm = document.getElementById('smartPlaylistForm');
    if (smartPlaylistForm) {
        smartPlaylistForm.addEventListener('submit', createSmartPlaylist);
    }
    
    const addSmartRuleBtn = document.getElementById('addSmartRuleBtn');
    if (addSmartRuleBtn) {
        addSmartRuleBtn.addEventListener('click', addSmartPlaylistRule);
    }

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
        // Use the amazing folder-browser modal in file-selection mode instead of
        // the native OS file picker.  openFileBrowserForM3U() falls back to the
        // native input automatically when the API is offline.
        fileInputDisplay.addEventListener('click', openFileBrowserForM3U);
    }

    const importGenreSelect = document.getElementById('importGenreSelect');
    if (importGenreSelect) {
        importGenreSelect.addEventListener('change', (e) => {
            const newGenreRow = document.getElementById('newGenreNameRow');
            const newGenreColorRow = document.getElementById('newGenreColorRow');
            if (e.target.value === '__new__') {
                newGenreRow.classList.remove('hidden');
                newGenreColorRow.classList.remove('hidden');
            } else {
                newGenreRow.classList.add('hidden');
                newGenreColorRow.classList.add('hidden');
            }
        });
    }



    // ── Genre Color Swatch Picker Logic ────────────────────────────────────
    function setupGenreColorSwatchLogic(swatchContainerId, valueInputId, customInputId) {
        const container = document.getElementById(swatchContainerId);
        const valueInput = document.getElementById(valueInputId);
        const customInput = document.getElementById(customInputId);

        if (!container || !valueInput || !customInput) return;

        container.addEventListener('click', (e) => {
            const swatch = e.target.closest('.genre-swatch');
            if (swatch && !swatch.classList.contains('genre-swatch-custom')) {
                const color = swatch.dataset.color;
                valueInput.value = color;
                
                container.querySelectorAll('.genre-swatch').forEach(btn => btn.classList.remove('active'));
                swatch.classList.add('active');
                
                // Reset custom label if needed
                const customLabel = container.querySelector('.genre-swatch-custom');
                if (customLabel) {
                    customLabel.style.backgroundColor = '';
                    customLabel.style.borderColor = '';
                }
            }
        });

        customInput.addEventListener('input', (e) => {
            const color = e.target.value;
            valueInput.value = color;
            
            const customLabel = customInput.closest('.genre-swatch-custom');
            if (customLabel) {
                customLabel.style.backgroundColor = color;
                customLabel.style.borderColor = '#fff';
                
                container.querySelectorAll('.genre-swatch').forEach(btn => btn.classList.remove('active'));
                customLabel.classList.add('active');
            }
        });
    }

    // Initialize logic for all modals
    setupGenreColorSwatchLogic('genreColorSwatches', 'newGenreColorValue', 'newGenreColorCustom');
    setupGenreColorSwatchLogic('addGenreColorSwatches', 'addGenreColorValue', 'addGenreColorCustom');
    setupGenreColorSwatchLogic('editGenreColorSwatches', 'editGenreColorInput', 'editGenreColorCustom');
    setupGenreColorSwatchLogic('playlistNewGenreColorSwatches', 'playlistNewGenreColorValue', 'playlistNewGenreColorCustom');

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
            } else if (action === 'play-smart') {
                playTrackFromSmart(index);
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

function clearGlobalSearchState() {
    isGlobalSearchActive = false;
    currentGlobalSearchTracks = [];
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
