// Library Management - Genre and playlist CRUD operations, modals, form handling

// State variables
let folderBrowserState = {
    isOpen: false,
    currentPath: '',
    selectedPath: null,
    targetInputId: null,
    statusFieldId: null,
    mode: 'folder',        // 'folder' | 'file'
    fileExtensions: [],    // e.g. ['.m3u', '.m3u8', '.pls']
    onFileSelect: null     // callback(filePath) used in file mode
};

// IMPORTED_PLAYLISTS_STORAGE_KEY and STREAM_PROXY_PATH are declared in app.js (loaded first)

// Form state management
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

// Modal open/close functions
function openAddGenreModal() {
    const modal = document.getElementById('addGenreModal');
    if (!modal) return;

    resetAddGenreColorUI();

    modal.classList.add('show');
    rememberModalFormState('addGenre', 'addGenreForm');
    syncLibraryModalBackgroundLock();
}

function resetAddGenreColorUI() {
    const defaultColor = '#6366f1';
    const valueInput = document.getElementById('addGenreColorValue');
    const container = document.getElementById('addGenreColorSwatches');
    if (!valueInput || !container) return;

    valueInput.value = defaultColor;
    container.querySelectorAll('.genre-swatch').forEach(btn => {
        const isDefault = btn.dataset.color === defaultColor;
        btn.classList.toggle('active', isDefault);
    });

    const customLabel = container.querySelector('.genre-swatch-custom');
    if (customLabel) {
        customLabel.classList.remove('active');
        customLabel.style.backgroundColor = '';
        customLabel.style.borderColor = '';
    }
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

// Genre icon and color utilities
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
    const valueInput = document.getElementById('editGenreColorInput');
    const container = document.getElementById('editGenreColorSwatches');
    if (!valueInput || !container) return;

    const color = String(colorValue || valueInput.value || '#6366f1').trim() || '#6366f1';
    valueInput.value = color;

    // Reset swatches
    container.querySelectorAll('.genre-swatch').forEach(btn => btn.classList.remove('active'));
    
    // Find matching swatch
    const matchingSwatch = Array.from(container.querySelectorAll('.genre-swatch:not(.genre-swatch-custom)'))
        .find(swatch => swatch.dataset.color.toLowerCase() === color.toLowerCase());

    const customLabel = container.querySelector('.genre-swatch-custom');
    const customInput = document.getElementById('editGenreColorCustom');

    if (matchingSwatch) {
        matchingSwatch.classList.add('active');
        if (customLabel) {
            customLabel.style.backgroundColor = '';
            customLabel.style.borderColor = '';
        }
    } else if (customLabel && customInput) {
        // Must be a custom color
        customLabel.classList.add('active');
        customLabel.style.backgroundColor = color;
        customLabel.style.borderColor = '#fff';
        customInput.value = color;
    }
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
    // Support both imageUrl and coverImage for backward compatibility
    if (coverInput) coverInput.value = playlist.imageUrl || playlist.coverImage || '';
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

// Genre selection utilities
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

    // Add "Create new genre" option
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '➕ Create new genre...';
    select.appendChild(newOption);

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

// Form submission handlers
async function addGenreFromUI(event) {
    event.preventDefault();

    if (!apiAvailable) {
        showNotification('API Offline', 'Start the server first (npm start) to edit genre and playlist library structure.', 'warning');
        return;
    }

    const name = document.getElementById('genreNameInput')?.value?.trim();
    const imageUrl = document.getElementById('genreImageInput')?.value?.trim();
    const description = document.getElementById('genreDescriptionInput')?.value?.trim();
    const color = document.getElementById('addGenreColorValue')?.value?.trim() || '#6366f1';

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
                description,
                color
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
        closeAddGenreModal();
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

    let genreId = document.getElementById('playlistGenreSelect')?.value?.trim();
    const name = document.getElementById('playlistNameInput')?.value?.trim();
    const artists = document.getElementById('playlistArtistsInput')?.value?.trim();
    const folderPath = document.getElementById('playlistPathInput')?.value?.trim();
    const coverImage = document.getElementById('playlistCoverInput')?.value?.trim();
    const isFavorite = Boolean(document.getElementById('playlistFavoriteInput')?.checked);

    if (genreId === '__new__') {
        const newGenreName = document.getElementById('playlistNewGenreNameInput')?.value?.trim();
        const newGenreColor = document.getElementById('playlistNewGenreColorValue')?.value?.trim() || '#6366f1';
        
        if (!newGenreName) {
            showNotification('Missing Genre Name', 'Please enter a name for the new genre.', 'warning');
            return;
        }

        try {
            const payload = await apiRequest('http://localhost:3000/api/genres', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newGenreName,
                    color: newGenreColor
                })
            });
            
            if (payload?.genre?.id) {
                genreId = payload.genre.id;
            } else {
                throw new Error('Failed to retrieve new genre ID');
            }
        } catch (error) {
            console.error('Failed to create genre during playlist add:', error);
            showNotification('Genre Creation Failed', error.message || 'Unable to create the new genre.', 'error');
            return;
        }
    }

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

        showNotification('Playlist Added', `Playlist "${name}" was created and scanned successfully.`, 'success');
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

/**
 * Open the modern folder/file browser modal.
 * @param {string|null} targetInputId - ID of the <input> to populate on selection (folder mode)
 * @param {string|null} statusFieldId  - ID of status element to update (folder mode)
 * @param {object}      options        - Optional config:
 *   options.mode            {string}   'folder' (default) | 'file'
 *   options.fileExtensions  {string[]} e.g. ['.m3u', '.m3u8', '.pls']
 *   options.onFileSelect    {Function} callback(filePath) called when a file is confirmed (file mode)
 */
async function openModernFolderBrowser(targetInputId, statusFieldId = null, options = {}) {
    const mode = options.mode || 'folder';
    folderBrowserState = {
        isOpen: true,
        currentPath: '',
        selectedPath: null,
        targetInputId,
        statusFieldId,
        mode,
        fileExtensions: options.fileExtensions || [],
        onFileSelect: options.onFileSelect || null
    };

    const modal = document.getElementById('folderBrowserModal');
    if (!modal) return;

    // Update modal header text to match the current mode
    const heading     = modal.querySelector('.folder-browser-heading h3');
    const description = modal.querySelector('.folder-browser-heading p');
    const kicker      = modal.querySelector('.folder-browser-heading .library-modal-kicker');
    const selectBtn   = document.getElementById('folderBrowserSelectBtn');
    const selectedPathDisplay = document.getElementById('folderBrowserSelectedPath');

    if (mode === 'file') {
        if (heading)     heading.innerHTML   = '<i class="fas fa-file-audio"></i> Select Playlist File';
        if (description) description.textContent = 'Navigate your filesystem and choose the M3U/M3U8/PLS file to import';
        if (kicker)      kicker.textContent  = 'File Selection';
        if (selectBtn)   selectBtn.innerHTML = '<i class="fas fa-check"></i><span>Select File</span>';
        if (selectedPathDisplay) selectedPathDisplay.textContent = 'No file selected';
    } else {
        if (heading)     heading.innerHTML   = '<i class="fas fa-folder-tree"></i> Select Playlist Folder';
        if (description) description.textContent = 'Navigate your filesystem and choose the folder containing your music files';
        if (kicker)      kicker.textContent  = 'Folder Selection';
        if (selectBtn)   selectBtn.innerHTML = '<i class="fas fa-check"></i><span>Select Folder</span>';
        if (selectedPathDisplay) selectedPathDisplay.textContent = 'No folder selected';
    }

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
        statusFieldId: null,
        mode: 'folder',
        fileExtensions: [],
        onFileSelect: null
    };
}

async function loadFolderBrowserDirectory(dirPath) {
    const container = document.getElementById('folderBrowserContainer');
    const pathInput = document.getElementById('folderBrowserPathInput');
    const selectBtn = document.getElementById('folderBrowserSelectBtn');
    const selectedPathDisplay = document.getElementById('folderBrowserSelectedPath');
    
    if (!container) return;

    const isFileMode = folderBrowserState.mode === 'file';
    const loadingLabel = isFileMode ? 'Loading files...' : 'Loading folders...';

    // Show loading state
    container.innerHTML = `
        <div class="folder-browser-loading">
            <div class="spinner"></div>
            <p>${loadingLabel}</p>
        </div>
    `;

    try {
        // Build API URL — include files when in file-selection mode
        let apiUrl = `http://localhost:3000/api/browse-directories?path=${encodeURIComponent(dirPath)}`;
        if (isFileMode) {
            apiUrl += '&includeFiles=true';
            if (folderBrowserState.fileExtensions.length) {
                apiUrl += `&extensions=${encodeURIComponent(folderBrowserState.fileExtensions.join(','))}`;
            }
        }

        const data = await apiRequest(apiUrl);
        
        folderBrowserState.currentPath = data.path || '';
        pathInput.value = data.path || (isFileMode ? 'Select a drive or folder' : 'Select a drive or folder');
        
        // Keep select button enabled if a path is still selected after navigation
        if (folderBrowserState.selectedPath && folderBrowserState.selectedPath === data.path && data.path) {
            selectBtn.disabled = false;
        }

        // Render item list
        const items = data.items || [];
        
        if (items.length === 0) {
            const emptyMsg = isFileMode
                ? `<h4>No Matching Files Found</h4><p>This folder doesn't contain any ${folderBrowserState.fileExtensions.join('/') || 'supported'} files. Try navigating to another folder.</p>`
                : `<h4>No Subfolders Found</h4><p>This folder doesn't contain any subfolders. You can still select it if it contains music files.</p>`;
            container.innerHTML = `
                <div class="folder-browser-empty">
                    <i class="fas fa-folder-open"></i>
                    ${emptyMsg}
                </div>
            `;
            return;
        }

        const listDiv = document.createElement('div');
        listDiv.className = 'folder-browser-list';

        items.forEach(item => {
            const isFile = item.isFile === true || item.type === 'file';
            const folderItem = document.createElement('div');
            folderItem.className = 'folder-item';
            if (item.type === 'drive') folderItem.classList.add('drive');
            if (isFile)               folderItem.classList.add('file-item');
            if (folderBrowserState.selectedPath === item.path) folderItem.classList.add('selected');

            let iconClass;
            if (item.type === 'drive') {
                iconClass = 'fa-hard-drive';
            } else if (isFile) {
                iconClass = 'fa-file-audio';
            } else {
                iconClass = 'fa-folder';
            }
            
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

            // Single click — always selects the item
            folderItem.addEventListener('click', () => {
                listDiv.querySelectorAll('.folder-item').forEach(f => f.classList.remove('selected'));
                folderItem.classList.add('selected');
                folderBrowserState.selectedPath = item.path;
                selectBtn.disabled = false;
                selectedPathDisplay.textContent = item.name || item.path;
            });

            // Double click — navigate into folders only (files don't navigate)
            if (!isFile) {
                folderItem.addEventListener('dblclick', () => {
                    loadFolderBrowserDirectory(item.path);
                });
            } else {
                // Double-click on a file immediately confirms the selection
                folderItem.addEventListener('dblclick', () => {
                    folderBrowserState.selectedPath = item.path;
                    folderBrowserSelectFolder();
                });
            }

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
    const selectedPath = folderBrowserState.selectedPath;

    // --- File mode: invoke callback, skip input update ---
    if (folderBrowserState.mode === 'file') {
        if (selectedPath && typeof folderBrowserState.onFileSelect === 'function') {
            folderBrowserState.onFileSelect(selectedPath);
        }
        closeFolderBrowser();
        return;
    }

    // --- Folder mode: populate the target input field ---
    const targetInput = document.getElementById(folderBrowserState.targetInputId);
    const statusFieldId = folderBrowserState.statusFieldId;
    
    if (!targetInput) {
        closeFolderBrowser();
        return;
    }

    if (selectedPath) {
        targetInput.value = selectedPath;
        
        if (statusFieldId) {
            setFieldStatus(statusFieldId, `Selected: ${selectedPath}`, 'success');
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
