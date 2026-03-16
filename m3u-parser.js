// M3U/M3U8 Playlist Parser
// Supports both Extended M3U (#EXTINF) and simple M3U formats

/**
 * Parse M3U/M3U8 playlist content
 * @param {string} content - Raw M3U file content
 * @param {string} baseUrl - Base URL for relative paths (optional)
 * @returns {Array} Array of track objects
 */
function parseM3U(content, baseUrl = '') {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const tracks = [];
    let currentTrack = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines and comments (except EXTINF)
        if (!line || (line.startsWith('#') && !line.startsWith('#EXTINF'))) {
            continue;
        }
        
        // Parse #EXTINF metadata
        if (line.startsWith('#EXTINF')) {
            currentTrack = parseExtinf(line);
        }
        // Parse track URL/path
        else if (!line.startsWith('#')) {
            const trackUrl = resolveUrl(line, baseUrl);
            
            if (currentTrack) {
                // We have metadata from #EXTINF
                currentTrack.file = trackUrl;
                currentTrack.id = tracks.length + 1;
                tracks.push(currentTrack);
                currentTrack = null;
            } else {
                // No metadata, create basic track from URL
                tracks.push(createTrackFromUrl(trackUrl, tracks.length + 1));
            }
        }
    }
    
    return tracks;
}

/**
 * Parse #EXTINF line
 * Format: #EXTINF:duration,Artist - Title
 * Extended: #EXTINF:-1 tvg-name="Name" tvg-logo="URL" group-title="Genre",Title
 */
function parseExtinf(line) {
    const track = {
        title: '',
        artist: '',
        album: '',
        duration: '',
        cover: '',
        year: 0,
        mood: '',
        tags: [],
        genre: '',
        tvgName: '',
        groupTitle: ''
    };
    
    // Remove #EXTINF: prefix
    const content = line.substring(8);
    
    // Split on first comma to separate duration+attributes from display name
    const commaIndex = content.indexOf(',');
    if (commaIndex === -1) return track;
    
    const metaPart = content.substring(0, commaIndex);
    const displayPart = content.substring(commaIndex + 1).trim();
    
    // Parse extended attributes (tvg-name, tvg-logo, group-title, etc.)
    const attributes = parseAttributes(metaPart);
    
    // Extract duration (first number before any attributes)
    const durationMatch = metaPart.match(/^(-?\d+)/);
    if (durationMatch) {
        const seconds = parseInt(durationMatch[1]);
        if (seconds > 0) {
            track.duration = formatDuration(seconds);
        }
    }
    
    // Apply extended attributes
    if (attributes['tvg-name']) {
        track.tvgName = attributes['tvg-name'];
    }
    if (attributes['tvg-logo']) {
        track.cover = attributes['tvg-logo'];
    }
    if (attributes['group-title']) {
        track.groupTitle = attributes['group-title'];
        track.genre = attributes['group-title'];
    }
    
    // Parse display name (Artist - Title format)
    if (displayPart.includes(' - ')) {
        const parts = displayPart.split(' - ');
        track.artist = parts[0].trim();
        track.title = parts.slice(1).join(' - ').trim();
    } else {
        track.title = displayPart || track.tvgName || 'Unknown Title';
        track.artist = track.groupTitle || 'Unknown Artist';
    }
    
    return track;
}

/**
 * Parse extended M3U attributes
 * Example: tvg-name="Station" tvg-logo="http://..."
 */
function parseAttributes(text) {
    const attributes = {};
    const regex = /(\w+(?:-\w+)*)="([^"]*)"/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        attributes[match[1]] = match[2];
    }
    
    return attributes;
}

/**
 * Create track object from URL when no metadata available
 */
function createTrackFromUrl(url, id) {
    const track = {
        id,
        file: url,
        title: extractTitleFromUrl(url),
        artist: 'Unknown Artist',
        album: '',
        duration: '',
        cover: '',
        year: 0,
        mood: '',
        tags: [],
        genre: ''
    };
    
    return track;
}

/**
 * Extract title from URL or filename
 */
function extractTitleFromUrl(url) {
    try {
        // Get filename from URL
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();
        
        if (filename) {
            // Remove extension
            return filename.replace(/\.(mp3|m4a|aac|ogg|flac|wav|m3u8?)$/i, '');
        }
    } catch (e) {
        // Not a valid URL, treat as filename
        const filename = url.split(/[/\\]/).pop();
        return filename.replace(/\.(mp3|m4a|aac|ogg|flac|wav|m3u8?)$/i, '');
    }
    
    return 'Unknown Track';
}

/**
 * Resolve URL (handle relative paths)
 */
function resolveUrl(url, baseUrl) {
    // Already absolute URL
    if (url.match(/^https?:\/\//i)) {
        return url;
    }
    
    // Absolute file path
    if (url.match(/^[a-z]:\\/i) || url.startsWith('/')) {
        return url;
    }
    
    // Relative URL - combine with base
    if (baseUrl) {
        try {
            const base = new URL(baseUrl);
            return new URL(url, base).href;
        } catch (e) {
            // If base URL is invalid, return original
            return url;
        }
    }
    
    return url;
}

/**
 * Format duration from seconds to mm:ss
 */
function formatDuration(seconds) {
    if (seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Fetch and parse M3U from URL
 */
async function fetchM3U(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const content = await response.text();
        return parseM3U(content, url);
    } catch (error) {
        throw new Error(`Failed to fetch M3U: ${error.message}`);
    }
}

/**
 * Read M3U file from File object
 */
async function readM3UFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const tracks = parseM3U(content);
                resolve(tracks);
            } catch (error) {
                reject(new Error(`Failed to parse M3U file: ${error.message}`));
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsText(file);
    });
}

/**
 * Validate M3U content
 */
function isValidM3U(content) {
    if (!content || typeof content !== 'string') {
        return false;
    }
    
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    // Check for M3U header or at least one valid line
    const hasHeader = lines.some(line => line.trim() === '#EXTM3U');
    const hasExtinf = lines.some(line => line.trim().startsWith('#EXTINF'));
    const hasUrl = lines.some(line => !line.startsWith('#') && line.trim().length > 0);
    
    return hasHeader || hasExtinf || hasUrl;
}

/**
 * Fetch live stream metadata (for radio stations)
 * Uses server-side proxy to avoid CORS issues with external streaming servers
 */
async function fetchStreamMetadata(streamUrl, signal, timeoutMs = 4000) {
    // Use server-side proxy to fetch stream metadata (avoids CORS)
    const proxyUrl = `/api/stream-metadata?url=${encodeURIComponent(streamUrl)}`;

    const requestController = new AbortController();
    const safeTimeout = Number.isFinite(timeoutMs) ? Math.max(1000, timeoutMs) : 4000;

    const abortRequest = () => {
        try {
            requestController.abort();
        } catch {
            // no-op
        }
    };

    let cleanupParentAbort = null;
    if (signal) {
        if (signal.aborted) {
            abortRequest();
        } else {
            signal.addEventListener('abort', abortRequest, { once: true });
            cleanupParentAbort = () => signal.removeEventListener('abort', abortRequest);
        }
    }

    let timeoutId = null;
    try {
        const metadataPromise = fetch(proxyUrl, { signal: requestController.signal })
            .then(async response => {
                if (!response.ok) return null;

                const data = await response.json();
                if (!data) return null;

                return {
                    title: data.title || '',
                    artist: data.artist || '',
                    genre: data.genre || '',
                    bitrate: data.bitrate || '',
                    listeners: data.listeners || 0
                };
            })
            .catch(error => {
                if (error?.name === 'AbortError') return null;
                console.log('Stream metadata fetch failed:', error?.message || error);
                return null;
            });

        const timeoutPromise = new Promise(resolve => {
            timeoutId = setTimeout(() => {
                abortRequest();
                resolve(null);
            }, safeTimeout);
        });

        return await Promise.race([metadataPromise, timeoutPromise]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        if (cleanupParentAbort) {
            cleanupParentAbort();
        }
    }
}
