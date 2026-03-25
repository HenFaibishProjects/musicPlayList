// lyrics.js — Lyrics Panel Controller
// Handles fetching, rendering, and syncing lyrics with the current track

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────────
    let lyricsOpen = false;
    let syncedLines = [];       // [{ time: seconds, text, el }]
    let currentLyricsTrack = null;
    let syncInterval = null;
    let isPlainLyrics = false;

    // ── DOM refs (resolved after DOMContentLoaded) ─────────────────────────
    let panel, lyricsBtn, closeBtn, loadingEl, notFoundEl, contentEl, coverEl,
        titleEl, artistEl, sourceBadgeEl, lyricsDotEl;

    // ── Init ───────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        panel        = document.getElementById('lyricsPanel');
        lyricsBtn    = document.getElementById('lyricsBtn');
        closeBtn     = document.getElementById('lyricsCloseBtn');
        loadingEl    = document.getElementById('lyricsLoading');
        notFoundEl   = document.getElementById('lyricsNotFound');
        contentEl    = document.getElementById('lyricsContent');
        coverEl      = document.getElementById('lyricsCover');
        titleEl      = document.getElementById('lyricsTrackTitle');
        artistEl     = document.getElementById('lyricsTrackArtist');
        sourceBadgeEl = document.getElementById('lyricsSourceBadge');
        lyricsDotEl   = document.getElementById('lyricsBtnDot');

        if (!panel || !lyricsBtn) return;

        lyricsBtn.addEventListener('click', toggleLyricsPanel);
        closeBtn.addEventListener('click', closeLyricsPanel);

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lyricsOpen) closeLyricsPanel();
        });
    });

    // ── Public API: called by player.js when a new track starts ───────────
    window.onLyricsTrackChange = function (track) {
        if (!track) return;
        // Always reset lyrics for the new track
        currentLyricsTrack = track;
        if (lyricsOpen) {
            loadLyrics(track);
        }
    };

    // ── Toggle ─────────────────────────────────────────────────────────────
    function toggleLyricsPanel() {
        if (lyricsOpen) {
            closeLyricsPanel();
        } else {
            openLyricsPanel();
        }
    }

    function openLyricsPanel() {
        lyricsOpen = true;
        panel.classList.add('open');
        lyricsBtn.classList.add('lyrics-active');
        lyricsBtn.title = 'Hide Lyrics';

        // Load for the currently playing track
        const track = currentLyricsTrack || (typeof currentPlaylist !== 'undefined' ? currentPlaylist[currentTrackIndex] : null);
        if (track) {
            currentLyricsTrack = track;
            loadLyrics(track);
        } else {
            showState('notfound');
        }
    }

    function closeLyricsPanel() {
        lyricsOpen = false;
        panel.classList.remove('open');
        lyricsBtn.classList.remove('lyrics-active');
        lyricsBtn.title = 'Show Lyrics';
        stopSync();
    }

    // ── Load lyrics for a track ────────────────────────────────────────────
    async function loadLyrics(track) {
        if (!track) return;

        showState('loading');
        updateHeader(track);
        stopSync();
        syncedLines = [];

        // Build query params — let server-side do the sanitization
        const params = new URLSearchParams();
        if (track.artist) params.set('artist', track.artist);
        if (track.title)  params.set('title',  track.title);
        if (track.file)   params.set('filePath', track.file);

        // Duration in seconds from format "m:ss" or "mm:ss"
        if (track.duration && track.duration !== '--:--') {
            const parts = track.duration.split(':').map(Number);
            const secs = parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
            if (secs > 0) params.set('duration', secs);
        }

        console.log('[Lyrics] Fetching:', Object.fromEntries(params));

        try {
            // Use relative URL — works regardless of port
            const res = await fetch(`/api/lyrics?${params.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            console.log('[Lyrics] Response:', data.source, data.synced ? `(${data.lines?.length} synced lines)` : '(plain)');

            if (data.source === 'none' || !data.plain) {
                showState('notfound');
                setLyricsDot(false);
                return;
            }

            setLyricsDot(true);
            renderLyrics(data);
        } catch (err) {
            console.warn('[Lyrics] Fetch failed:', err.message);
            showState('notfound');
            setLyricsDot(false);
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function renderLyrics(data) {
        contentEl.innerHTML = '';
        isPlainLyrics = !data.synced;

        // Source badge
        const sourceLabels = {
            'embedded': '🎵 Embedded',
            'lrclib': '⚡ Synced',
            'lyrics.ovh': '📝 Lyrics.OVH',
            'none': ''
        };
        sourceBadgeEl.textContent = sourceLabels[data.source] || data.source;
        sourceBadgeEl.dataset.source = data.source;

        if (data.synced && data.lines && data.lines.length > 0) {
            // Karaoke / synced mode
            syncedLines = data.lines.map((line, i) => {
                const el = document.createElement('div');
                el.className = 'lyric-line';
                el.textContent = line.text;
                el.dataset.index = i;
                contentEl.appendChild(el);
                return { ...line, el };
            });
            showState('content');
            startSync();
        } else {
            // Plain text mode
            const pre = document.createElement('div');
            pre.className = 'lyrics-plain';
            pre.textContent = data.plain;
            contentEl.appendChild(pre);
            showState('content');
        }
    }

    // ── Synced lyrics: real-time line highlighting ─────────────────────────
    function startSync() {
        stopSync();
        if (syncedLines.length === 0) return;

        syncInterval = setInterval(() => {
            const audio = getActiveAudio();
            if (!audio) return;
            const t = audio.currentTime;
            updateActiveLine(t);
        }, 250);
    }

    function stopSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }

    function updateActiveLine(currentTime) {
        if (syncedLines.length === 0) return;

        // Find the last line whose time <= currentTime
        let activeIdx = -1;
        for (let i = 0; i < syncedLines.length; i++) {
            if (syncedLines[i].time <= currentTime) {
                activeIdx = i;
            } else {
                break;
            }
        }

        syncedLines.forEach((line, i) => {
            line.el.classList.remove('active', 'near-active');
            if (i === activeIdx) {
                line.el.classList.add('active');
            } else if (i === activeIdx - 1 || i === activeIdx + 1) {
                line.el.classList.add('near-active');
            }
        });

        // Auto-scroll the active line into view
        if (activeIdx >= 0 && syncedLines[activeIdx].el) {
            const body = document.getElementById('lyricsBody');
            if (!body) return;
            const lineEl = syncedLines[activeIdx].el;
            const lineTop = lineEl.offsetTop;
            const panelHeight = body.clientHeight;
            const targetScroll = lineTop - panelHeight / 2 + lineEl.offsetHeight / 2;
            body.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        }
    }

    // ── UI state helpers ───────────────────────────────────────────────────
    function showState(state) {
        loadingEl.style.display  = state === 'loading'  ? 'flex' : 'none';
        notFoundEl.style.display = state === 'notfound' ? 'flex' : 'none';
        contentEl.style.display  = state === 'content'  ? 'flex' : 'none';
    }

    function updateHeader(track) {
        titleEl.textContent  = track.title  || 'Unknown Track';
        artistEl.textContent = track.artist || 'Unknown Artist';
        coverEl.src = track.cover
            || (typeof DEFAULT_COVER !== 'undefined' ? DEFAULT_COVER : '')
            || 'https://www.lidasoftware.online/logo.png';
    }

    // ── Lyrics availability dot ────────────────────────────────────
    function setLyricsDot(hasLyrics) {
        if (!lyricsDotEl) return;
        lyricsDotEl.classList.toggle('visible', hasLyrics);
        if (lyricsBtn) {
            lyricsBtn.title = hasLyrics
                ? (lyricsOpen ? 'Hide Lyrics' : 'Lyrics available — click to show')
                : (lyricsOpen ? 'Hide Lyrics' : 'Show Lyrics');
        }
    }

    // ── Helper: get whichever audio player is currently active ────────────
    function getActiveAudio() {
        if (typeof activePlayer !== 'undefined') {
            return activePlayer === 'B'
                ? document.getElementById('audioPlayerB')
                : document.getElementById('audioPlayer');
        }
        return document.getElementById('audioPlayer');
    }

})();
