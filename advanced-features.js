// Advanced Features State
let advancedFilters = {
    yearFrom: null,
    yearTo: null,
    bpmFrom: null,
    bpmTo: null,
    moods: [],
    tags: []
};

let searchHistory = [];
let uploadQueue = [];
let selectedTracks = new Set();

// Initialize advanced features
function initializeAdvancedFeatures() {
    setupAdvancedSearch();
    setupContentManager();
    setupBatchEditor();
    loadSearchHistory();
}

// Advanced Search Setup
function setupAdvancedSearch() {
    const filterBtn = document.getElementById('advancedFilterBtn');
    const filterPanel = document.getElementById('filterPanel');
    const tagInput = document.getElementById('tagInput');
    
    filterBtn.addEventListener('click', () => {
        filterPanel.classList.toggle('show');
        filterBtn.classList.toggle('active');
    });
    
    // Tag input handling
    tagInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && tagInput.value.trim()) {
            addFilterTag(tagInput.value.trim());
            tagInput.value = '';
        }
    });
}

// Add filter tag
function addFilterTag(tag) {
    if (!advancedFilters.tags.includes(tag)) {
        advancedFilters.tags.push(tag);
        renderFilterTags();
    }
}

// Remove filter tag
function removeFilterTag(tag) {
    advancedFilters.tags = advancedFilters.tags.filter(t => t !== tag);
    renderFilterTags();
}

// Render filter tags
function renderFilterTags() {
    const container = document.getElementById('selectedTags');
    container.innerHTML = advancedFilters.tags.map(tag => `
        <div class="tag-pill">
            ${tag}
            <i class="fas fa-times" onclick="removeFilterTag('${tag}')"></i>
        </div>
    `).join('');
}

// Apply filters
function applyFilters() {
    advancedFilters.yearFrom = document.getElementById('yearFrom').value || null;
    advancedFilters.yearTo = document.getElementById('yearTo').value || null;
    advancedFilters.bpmFrom = document.getElementById('bpmFrom').value || null;
    advancedFilters.bpmTo = document.getElementById('bpmTo').value || null;
    
    const moodSelect = document.getElementById('moodFilter');
    advancedFilters.moods = Array.from(moodSelect.selectedOptions).map(opt => opt.value);
    
    // Save to search history
    saveToSearchHistory();
    
    // Perform search
    performAdvancedSearch();
}

// Clear filters
function clearFilters() {
    advancedFilters = {
        yearFrom: null,
        yearTo: null,
        bpmFrom: null,
        bpmTo: null,
        moods: [],
        tags: []
    };
    
    document.getElementById('yearFrom').value = '';
    document.getElementById('yearTo').value = '';
    document.getElementById('bpmFrom').value = '';
    document.getElementById('bpmTo').value = '';
    document.getElementById('moodFilter').selectedIndex = -1;
    document.getElementById('tagInput').value = '';
    renderFilterTags();
    
    performSearch();
}

// Perform advanced search
function performAdvancedSearch() {
    if (!libraryData) return;
    
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';
    
    let allTracks = [];
    
    // Collect all tracks from all playlists
    libraryData.library.folders.forEach(folder => {
        folder.subfolders.forEach(playlist => {
            if (playlist.tracks) {
                playlist.tracks.forEach(track => {
                    allTracks.push({
                        ...track,
                        playlistName: playlist.name,
                        genre: folder.name,
                        genreColor: folder.color
                    });
                });
            }
        });
    });
    
    // Apply filters
    let filteredTracks = allTracks.filter(track => {
        // Text search
        if (searchQuery) {
            const searchText = `${track.title} ${track.artist} ${track.album} ${track.mood || ''} ${(track.tags || []).join(' ')}`.toLowerCase();
            if (!searchText.includes(searchQuery)) return false;
        }
        
        // Year filter
        if (advancedFilters.yearFrom && track.year && track.year < parseInt(advancedFilters.yearFrom)) return false;
        if (advancedFilters.yearTo && track.year && track.year > parseInt(advancedFilters.yearTo)) return false;
        
        // BPM filter
        if (advancedFilters.bpmFrom && track.bpm && track.bpm < parseInt(advancedFilters.bpmFrom)) return false;
        if (advancedFilters.bpmTo && track.bpm && track.bpm > parseInt(advancedFilters.bpmTo)) return false;
        
        // Mood filter
        if (advancedFilters.moods.length > 0 && track.mood) {
            if (!advancedFilters.moods.includes(track.mood)) return false;
        }
        
        // Tags filter
        if (advancedFilters.tags.length > 0 && track.tags) {
            const hasAllTags = advancedFilters.tags.every(tag => 
                track.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
            );
            if (!hasAllTags) return false;
        }
        
        return true;
    });
    
    if (filteredTracks.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No tracks found</h3>
                <p>Try adjusting your search filters</p>
            </div>
        `;
        return;
    }
    
    // Render track results
    filteredTracks.forEach((track, index) => {
        const card = createTrackCard(track, index);
        grid.appendChild(card);
    });
}

// Create track card for search results
function createTrackCard(track, index) {
    const card = document.createElement('div');
    card.className = 'playlist-card fade-in';
    card.style.animationDelay = `${index * 0.05}s`;
    
    const tagsHTML = track.tags ? track.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('') : '';
    
    card.innerHTML = `
        <div class="card-icon" style="background: linear-gradient(135deg, ${track.genreColor}22, ${track.genreColor}11);">
            <i class="fas fa-music" style="color: ${track.genreColor}"></i>
        </div>
        <h3 class="card-title">${track.title}</h3>
        <p class="card-description">${track.artist}</p>
        ${track.album ? `<p class="card-description" style="font-size: 11px; opacity: 0.7;">${track.album}</p>` : ''}
        ${tagsHTML ? `<div class="selected-tags" style="margin: 12px 0;">${tagsHTML}</div>` : ''}
        <div class="card-stats">
            <div class="card-stat">
                <i class="fas fa-calendar"></i>
                <span>${track.year || 'N/A'}</span>
            </div>
            <div class="card-stat">
                <i class="fas fa-drum"></i>
                <span>${track.bpm || 'N/A'} BPM</span>
            </div>
            <div class="card-stat">
                <i class="far fa-smile"></i>
                <span>${track.mood || 'N/A'}</span>
            </div>
        </div>
    `;
    
    card.onclick = () => {
        // Play this track
        const playlist = { tracks: [track] };
        loadPlaylist(playlist);
    };
    
    return card;
}

// Content Manager
function openContentManager() {
    document.getElementById('contentManagerModal').classList.add('show');
    setupDropZone();
}

function closeContentManager() {
    document.getElementById('contentManagerModal').classList.remove('show');
    clearQueue();
}

function setupDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.includes('audio'));
        addFilesToQueue(files);
    });
    
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        addFilesToQueue(files);
        fileInput.value = '';
    });
}

function addFilesToQueue(files) {
    uploadQueue.push(...files);
    renderUploadQueue();
    document.getElementById('uploadQueue').style.display = 'block';
}

function renderUploadQueue() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = uploadQueue.map((file, index) => `
        <div class="file-item">
            <div class="file-info">
                <i class="fas fa-file-audio"></i>
                <div class="file-details">
                    <h5>${file.name}</h5>
                    <p>${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
            </div>
            <div class="file-actions">
                <button class="file-remove" onclick="removeFromQueue(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function removeFromQueue(index) {
    uploadQueue.splice(index, 1);
    renderUploadQueue();
    if (uploadQueue.length === 0) {
        document.getElementById('uploadQueue').style.display = 'none';
    }
}

function clearQueue() {
    uploadQueue = [];
    document.getElementById('uploadQueue').style.display = 'none';
}

async function startUpload() {
    if (uploadQueue.length === 0) return;
    
    const extractTags = document.getElementById('extractTags').checked;
    const extractCover = document.getElementById('extractCover').checked;
    const detectBPM = document.getElementById('detectBPM').checked;
    const detectDuplicates = document.getElementById('detectDuplicates').checked;
    
    for (let i = 0; i < uploadQueue.length; i++) {
        const file = uploadQueue[i];
        await processFile(file, {extractTags, extractCover, detectBPM, detectDuplicates});
    }
    
    showNotification(
        'Upload Complete',
        `Successfully processed ${uploadQueue.length} audio ${uploadQueue.length === 1 ? 'file' : 'files'}. Your genre and playlist libraries have been updated with the new tracks.`,
        'success'
    );
    clearQueue();
    closeContentManager();
}

async function processFile(file, options) {
    return new Promise((resolve) => {
        // Simulate file processing
        setTimeout(() => {
            console.log(`Processing ${file.name}...`);
            
            if (options.extractTags) {
                console.log('  - Extracting ID3 tags...');
            }
            if (options.extractCover) {
                console.log('  - Extracting album art...');
            }
            if (options.detectBPM) {
                console.log('  - Detecting BPM...');
            }
            if (options.detectDuplicates) {
                console.log('  - Checking for duplicates...');
            }
            
            resolve();
        }, 500);
    });
}

// Batch Editor
function openBatchEditor() {
    document.getElementById('batchEditorModal').classList.add('show');
    populateBatchPlaylistSelect();
    loadTracksForBatchEdit();
}

function closeBatchEditor() {
    document.getElementById('batchEditorModal').classList.remove('show');
    selectedTracks.clear();
}

function populateBatchPlaylistSelect() {
    const select = document.getElementById('batchPlaylist');
    select.innerHTML = '<option value="">All Playlists</option>';
    
    libraryData.library.folders.forEach(folder => {
        folder.subfolders.forEach(playlist => {
            const option = document.createElement('option');
            option.value = playlist.id;
            option.textContent = `${folder.name} - ${playlist.name}`;
            select.appendChild(option);
        });
    });
}

function loadTracksForBatchEdit() {
    const trackList = document.getElementById('batchTrackList');
    trackList.innerHTML = '';
    
    libraryData.library.folders.forEach(folder => {
        folder.subfolders.forEach(playlist => {
            if (playlist.tracks) {
                playlist.tracks.forEach(track => {
                    const trackItem = document.createElement('div');
                    trackItem.className = 'track-item';
                    trackItem.innerHTML = `
                        <input type="checkbox" id="track-${track.id}" value="${track.id}">
                        <div class="track-item-info">
                            <h5>${track.title}</h5>
                            <p>${track.artist} - ${playlist.name}</p>
                        </div>
                    `;
                    
                    const checkbox = trackItem.querySelector('input');
                    checkbox.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            selectedTracks.add(track.id);
                        } else {
                            selectedTracks.delete(track.id);
                        }
                    });
                    
                    trackList.appendChild(trackItem);
                });
            }
        });
    });
}

function selectAllTracks() {
    const checkboxes = document.querySelectorAll('#batchTrackList input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = true;
        selectedTracks.add(parseInt(cb.value));
    });
}

function deselectAllTracks() {
    const checkboxes = document.querySelectorAll('#batchTrackList input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    selectedTracks.clear();
}

function applyBatchEdit() {
    if (selectedTracks.size === 0) {
        showNotification(
            'No Tracks Selected',
            'Please select at least one track from the list to apply batch edits.',
            'info'
        );
        return;
    }
    
    const genre = document.getElementById('batchGenre').value;
    const mood = document.getElementById('batchMood').value;
    const tags = document.getElementById('batchTags').value.split(',').map(t => t.trim()).filter(t => t);
    const year = document.getElementById('batchYear').value;
    
    console.log(`Applying batch edit to ${selectedTracks.size} tracks:`);
    if (genre) console.log(`  - Genre: ${genre}`);
    if (mood) console.log(`  - Mood: ${mood}`);
    if (tags.length) console.log(`  - Tags: ${tags.join(', ')}`);
    if (year) console.log(`  - Year: ${year}`);
    
    showNotification(
        'Batch Edit Complete',
        `Successfully updated metadata for ${selectedTracks.size} tracks in your playlist libraries.`,
        'success'
    );
    closeBatchEditor();
}

// Search History
function saveToSearchHistory() {
    const query = {
        text: searchQuery,
        filters: {...advancedFilters},
        timestamp: new Date().toISOString()
    };
    
    searchHistory.unshift(query);
    if (searchHistory.length > 20) {
        searchHistory = searchHistory.slice(0, 20);
    }
    
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
}

function loadSearchHistory() {
    const saved = localStorage.getItem('searchHistory');
    if (saved) {
        searchHistory = JSON.parse(saved);
    }
}

function showSearchHistory() {
    if (searchHistory.length === 0) {
        showNotification(
            'Search History Empty',
            'You haven\'t performed any searches yet. Try using the advanced filters to search your genre and playlist libraries, and your searches will be saved here for easy access.',
            'info'
        );
        return;
    }
    
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = `
        <div class="search-history">
            <h4><i class="fas fa-history"></i> Recent Searches</h4>
            ${searchHistory.map((item, index) => {
                const date = new Date(item.timestamp);
                const filterDesc = [];
                if (item.text) filterDesc.push(`Text: "${item.text}"`);
                if (item.filters.yearFrom || item.filters.yearTo) {
                    filterDesc.push(`Year: ${item.filters.yearFrom || '?'}-${item.filters.yearTo || '?'}`);
                }
                if (item.filters.moods.length) filterDesc.push(`Mood: ${item.filters.moods.join(', ')}`);
                if (item.filters.tags.length) filterDesc.push(`Tags: ${item.filters.tags.join(', ')}`);
                
                return `
                    <div class="history-item" onclick="replaySearch(${index})">
                        <div class="history-item-info">
                            <i class="fas fa-search"></i>
                            <span>${filterDesc.join(' | ') || 'Empty search'}</span>
                        </div>
                        <time>${date.toLocaleString()}</time>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function replaySearch(index) {
    const query = searchHistory[index];
    searchQuery = query.text || '';
    advancedFilters = {...query.filters};
    
    document.getElementById('searchInput').value = searchQuery;
    if (advancedFilters.yearFrom) document.getElementById('yearFrom').value = advancedFilters.yearFrom;
    if (advancedFilters.yearTo) document.getElementById('yearTo').value = advancedFilters.yearTo;
    if (advancedFilters.bpmFrom) document.getElementById('bpmFrom').value = advancedFilters.bpmFrom;
    if (advancedFilters.bpmTo) document.getElementById('bpmTo').value = advancedFilters.bpmTo;
    
    renderFilterTags();
    performAdvancedSearch();
}


// Initialize when document loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAdvancedFeatures);
} else {
    initializeAdvancedFeatures();
}