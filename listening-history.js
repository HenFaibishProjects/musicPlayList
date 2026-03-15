// Listening History Calendar
const LISTENING_HISTORY_STORAGE_KEY = 'musicvault_listening_history_v1';
const MAX_HISTORY_DAYS = 365; // Keep 1 year of history

let listeningHistory = new Map(); // Date string -> array of plays
let currentHistoryView = 'month'; // 'month' or 'year'
let currentHistoryDate = new Date();

// Initialize listening history from localStorage
function loadListeningHistory() {
    try {
        const raw = localStorage.getItem(LISTENING_HISTORY_STORAGE_KEY);
        if (!raw) {
            listeningHistory = new Map();
            return;
        }
        
        const parsed = JSON.parse(raw);
        listeningHistory = new Map(Object.entries(parsed));
        
        // Clean up old entries (older than MAX_HISTORY_DAYS)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_DAYS);
        const cutoffString = formatDateKey(cutoffDate);
        
        for (const [dateKey] of listeningHistory) {
            if (dateKey < cutoffString) {
                listeningHistory.delete(dateKey);
            }
        }
        
        saveListeningHistory();
    } catch (error) {
        console.warn('Failed to load listening history:', error);
        listeningHistory = new Map();
    }
}

// Save listening history to localStorage
function saveListeningHistory() {
    try {
        const obj = Object.fromEntries(listeningHistory);
        localStorage.setItem(LISTENING_HISTORY_STORAGE_KEY, JSON.stringify(obj));
    } catch (error) {
        console.warn('Failed to save listening history:', error);
    }
}

// Format date to YYYY-MM-DD
function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Add a play event to history
function trackPlayInHistory(track, context = {}) {
    if (!track) return;
    
    const dateKey = formatDateKey(new Date());
    const playData = {
        trackId: track.id || track.file || `${track.title}::${track.artist}`,
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.album || '',
        duration: track.duration || '--:--',
        cover: track.cover || DEFAULT_COVER,
        playlistName: context.playlistName || track.playlistName || '',
        genreName: context.genreName || track.genreName || '',
        timestamp: Date.now()
    };
    
    if (!listeningHistory.has(dateKey)) {
        listeningHistory.set(dateKey, []);
    }
    
    const dayHistory = listeningHistory.get(dateKey);
    dayHistory.push(playData);
    
    saveListeningHistory();
}

// Get play count for a specific date
function getPlayCountForDate(date) {
    const dateKey = formatDateKey(date);
    const plays = listeningHistory.get(dateKey);
    return plays ? plays.length : 0;
}

// Get all plays for a specific date
function getPlaysForDate(date) {
    const dateKey = formatDateKey(date);
    return listeningHistory.get(dateKey) || [];
}

// Get total plays for date range
function getTotalPlaysInRange(startDate, endDate) {
    let total = 0;
    const current = new Date(startDate);
    
    while (current <= endDate) {
        total += getPlayCountForDate(current);
        current.setDate(current.getDate() + 1);
    }
    
    return total;
}

// Get listening statistics
function getListeningStats() {
    let totalPlays = 0;
    let uniqueTracks = new Set();
    let genreStats = new Map();
    let mostPlayedTracks = new Map();
    
    for (const [, plays] of listeningHistory) {
        totalPlays += plays.length;
        
        plays.forEach(play => {
            uniqueTracks.add(play.trackId);
            
            // Genre stats
            if (play.genreName) {
                genreStats.set(play.genreName, (genreStats.get(play.genreName) || 0) + 1);
            }
            
            // Track play count
            const key = `${play.title}::${play.artist}`;
            mostPlayedTracks.set(key, (mostPlayedTracks.get(key) || 0) + 1);
        });
    }
    
    // Sort most played tracks
    const sortedTracks = Array.from(mostPlayedTracks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => {
            const [title, artist] = key.split('::');
            return { title, artist, count };
        });
    
    // Sort genres
    const sortedGenres = Array.from(genreStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, count]) => ({ genre, count }));
    
    return {
        totalPlays,
        uniqueTracks: uniqueTracks.size,
        daysActive: listeningHistory.size,
        topGenres: sortedGenres,
        mostPlayed: sortedTracks
    };
}

// Render the history calendar view
function renderHistoryCalendar() {
    const folderGrid = document.getElementById('folderGrid');
    if (!folderGrid) return;
    
    const stats = getListeningStats();
    
    // Create calendar HTML
    let html = `
        <div class="history-calendar-container">
            <div class="history-header">
                <div class="history-title-section">
                    <h2><i class="fas fa-calendar-days"></i> Your Listening Journey</h2>
                    <p class="history-subtitle">Track your music evolution over time</p>
                </div>
                
                <div class="history-stats-row">
                    <div class="history-stat-card">
                        <i class="fas fa-headphones"></i>
                        <div class="stat-content">
                            <span class="stat-value">${stats.totalPlays.toLocaleString()}</span>
                            <span class="stat-label">Total Plays</span>
                        </div>
                    </div>
                    <div class="history-stat-card">
                        <i class="fas fa-music"></i>
                        <div class="stat-content">
                            <span class="stat-value">${stats.uniqueTracks.toLocaleString()}</span>
                            <span class="stat-label">Unique Tracks</span>
                        </div>
                    </div>
                    <div class="history-stat-card">
                        <i class="fas fa-calendar-check"></i>
                        <div class="stat-content">
                            <span class="stat-value">${stats.daysActive}</span>
                            <span class="stat-label">Days Active</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="history-view-controls">
                <button class="view-mode-btn ${currentHistoryView === 'month' ? 'active' : ''}" data-view="month">
                    <i class="fas fa-calendar"></i> Month View
                </button>
                <button class="view-mode-btn ${currentHistoryView === 'year' ? 'active' : ''}" data-view="year">
                    <i class="fas fa-calendar-days"></i> Year View
                </button>
            </div>
            
            <div class="history-navigation">
                <button class="history-nav-btn" id="historyPrevBtn">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <h3 id="historyDateTitle">${formatHistoryTitle()}</h3>
                <button class="history-nav-btn" id="historyNextBtn">
                    <i class="fas fa-chevron-right"></i>
                </button>
                <button class="history-nav-btn" id="historyTodayBtn">
                    <i class="fas fa-calendar-day"></i> Today
                </button>
            </div>
            
            <div class="calendar-view" id="historyCalendarView">
                ${currentHistoryView === 'month' ? renderMonthCalendar() : renderYearCalendar()}
            </div>
            
            <div class="history-insights">
                <div class="insight-section">
                    <h4><i class="fas fa-trophy"></i> Most Played Tracks</h4>
                    <div class="top-tracks-list">
                        ${stats.mostPlayed.length > 0 ? stats.mostPlayed.map((track, index) => `
                            <div class="top-track-item">
                                <span class="track-rank">#${index + 1}</span>
                                <div class="track-info">
                                    <div class="track-name">${escapeHtml(track.title)}</div>
                                    <div class="track-artist">${escapeHtml(track.artist)}</div>
                                </div>
                                <span class="track-plays">${track.count} plays</span>
                            </div>
                        `).join('') : '<p class="empty-state">No plays yet. Start listening!</p>'}
                    </div>
                </div>
                
                <div class="insight-section">
                    <h4><i class="fas fa-layer-group"></i> Top Genres</h4>
                    <div class="top-genres-list">
                        ${stats.topGenres.length > 0 ? stats.topGenres.map(genre => `
                            <div class="top-genre-item">
                                <span class="genre-name">${escapeHtml(genre.genre)}</span>
                                <div class="genre-bar-container">
                                    <div class="genre-bar" style="width: ${(genre.count / stats.totalPlays * 100).toFixed(1)}%"></div>
                                </div>
                                <span class="genre-count">${genre.count}</span>
                            </div>
                        `).join('') : '<p class="empty-state">No genre data yet.</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    folderGrid.innerHTML = html;
    
    // Add event listeners
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentHistoryView = btn.dataset.view;
            renderHistoryCalendar();
        });
    });
    
    const prevBtn = document.getElementById('historyPrevBtn');
    const nextBtn = document.getElementById('historyNextBtn');
    const todayBtn = document.getElementById('historyTodayBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            navigateHistory(-1);
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            navigateHistory(1);
        });
    }
    
    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            currentHistoryDate = new Date();
            renderHistoryCalendar();
        });
    }
    
    // Add click handlers to calendar days
    document.querySelectorAll('.calendar-day').forEach(day => {
        day.addEventListener('click', () => {
            const dateStr = day.dataset.date;
            if (dateStr) {
                showDayDetails(dateStr);
            }
        });
    });
}

// Format the title for current view
function formatHistoryTitle() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (currentHistoryView === 'month') {
        return `${months[currentHistoryDate.getMonth()]} ${currentHistoryDate.getFullYear()}`;
    } else {
        return `${currentHistoryDate.getFullYear()}`;
    }
}

// Navigate through history
function navigateHistory(direction) {
    if (currentHistoryView === 'month') {
        currentHistoryDate.setMonth(currentHistoryDate.getMonth() + direction);
    } else {
        currentHistoryDate.setFullYear(currentHistoryDate.getFullYear() + direction);
    }
    renderHistoryCalendar();
}

// Render month calendar
function renderMonthCalendar() {
    const year = currentHistoryDate.getFullYear();
    const month = currentHistoryDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = lastDay.getDate();
    
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    let html = '<div class="month-calendar">';
    
    // Week day headers
    html += '<div class="calendar-weekdays">';
    weekDays.forEach(day => {
        html += `<div class="weekday-label">${day}</div>`;
    });
    html += '</div>';
    
    // Calendar days
    html += '<div class="calendar-days">';
    
    // Empty cells for days before month starts
    for (let i = 0; i < startDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // Days of the month
    const today = new Date();
    const todayKey = formatDateKey(today);
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateKey = formatDateKey(date);
        const playCount = getPlayCountForDate(date);
        const isToday = dateKey === todayKey;
        const isFuture = date > today;
        
        const intensity = playCount > 0 ? Math.min(Math.ceil(playCount / 5), 5) : 0;
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''} ${playCount > 0 ? 'has-plays' : ''}" 
                 data-date="${dateKey}" 
                 data-plays="${playCount}"
                 data-intensity="${intensity}"
                 title="${playCount} plays on ${dateKey}">
                <span class="day-number">${day}</span>
                ${playCount > 0 ? `<span class="play-indicator">${playCount}</span>` : ''}
            </div>
        `;
    }
    
    html += '</div></div>';
    
    return html;
}

// Render year calendar (12 mini months)
function renderYearCalendar() {
    const year = currentHistoryDate.getFullYear();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    let html = '<div class="year-calendar">';
    
    for (let month = 0; month < 12; month++) {
        html += `<div class="mini-month">`;
        html += `<div class="mini-month-title">${months[month]}</div>`;
        html += '<div class="mini-month-grid">';
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        
        // Empty cells
        for (let i = 0; i < startDay; i++) {
            html += '<div class="mini-day empty"></div>';
        }
        
        // Days
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateKey = formatDateKey(date);
            const playCount = getPlayCountForDate(date);
            const isToday = formatDateKey(today) === dateKey;
            const isFuture = date > today;
            
            const intensity = playCount > 0 ? Math.min(Math.ceil(playCount / 5), 5) : 0;
            
            html += `
                <div class="mini-day calendar-day ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}" 
                     data-date="${dateKey}"
                     data-plays="${playCount}"
                     data-intensity="${intensity}"
                     title="${playCount} plays on ${dateKey}">
                </div>
            `;
        }
        
        html += '</div></div>';
    }
    
    html += '</div>';
    
    return html;
}

// Show details for a specific day
function showDayDetails(dateKey) {
    const plays = listeningHistory.get(dateKey) || [];
    
    if (plays.length === 0) {
        showNotification('No Plays', `No listening activity on ${dateKey}`, 'info');
        return;
    }
    
    const [year, month, day] = dateKey.split('-');
    const date = new Date(year, parseInt(month) - 1, parseInt(day));
    const dateStr = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    // Group by track
    const trackMap = new Map();
    plays.forEach(play => {
        const key = `${play.title}::${play.artist}`;
        if (!trackMap.has(key)) {
            trackMap.set(key, { ...play, playCount: 0, timestamps: [] });
        }
        const track = trackMap.get(key);
        track.playCount++;
        track.timestamps.push(play.timestamp);
    });
    
    const tracks = Array.from(trackMap.values())
        .sort((a, b) => b.playCount - a.playCount);
    
    let html = `
        <div class="day-details-overlay" id="dayDetailsOverlay">
            <div class="day-details-modal">
                <div class="day-details-header">
                    <div>
                        <h3><i class="fas fa-calendar-day"></i> ${dateStr}</h3>
                        <p>${plays.length} plays • ${tracks.length} unique tracks</p>
                    </div>
                    <button class="modal-close" onclick="closeDayDetails()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="day-details-body">
                    ${tracks.map(track => `
                        <div class="day-track-item">
                            <img src="${sanitizeImageUrl(track.cover)}" alt="Cover" class="day-track-cover">
                            <div class="day-track-info">
                                <div class="day-track-title">${escapeHtml(track.title)}</div>
                                <div class="day-track-artist">${escapeHtml(track.artist)}</div>
                                ${track.genreName ? `<div class="day-track-genre"><i class="fas fa-tag"></i> ${escapeHtml(track.genreName)}</div>` : ''}
                            </div>
                            <div class="day-track-count">
                                <i class="fas fa-repeat"></i> ${track.playCount}×
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    
    // Close on overlay click
    const overlay = document.getElementById('dayDetailsOverlay');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeDayDetails();
        }
    });
}

// Close day details modal
function closeDayDetails() {
    const overlay = document.getElementById('dayDetailsOverlay');
    if (overlay) {
        overlay.remove();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadListeningHistory();
});