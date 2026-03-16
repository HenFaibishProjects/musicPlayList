// Playlist  Management
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