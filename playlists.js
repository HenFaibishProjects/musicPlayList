// Playlist & Smart Playlist Management
let currentView = 'all';
let selectedGenre = null;
let currentSort = 'name';
let nameSortDirection = 'asc';
let trackSortDirection = 'desc';
let searchQuery = '';
let viewMode = 'grid';
let isGlobalSearchActive = false;
let currentGlobalSearchTracks = [];
let currentRecentViewTracks = [];
let currentSmartPlaylistTracks = [];

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
        case 'title':
        case 'artist':
            const trackVal = String(track[field] || '').toLowerCase();
            if (operator === 'contains') return trackVal.includes(String(value || '').toLowerCase());
            break;
        case 'tags':
            const trackTags = Array.isArray(track.tags) ? track.tags.join(' ').toLowerCase() : '';
            if (operator === 'contains') return trackTags.includes(String(value || '').toLowerCase());
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