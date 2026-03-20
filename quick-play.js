// Quick Play functionality - handles local file playback without playlist context

let quickPlayObjectUrl = null;

function isQuickPlayTrack(track) {
    return Boolean(track && track.__quickPlay === true);
}

function isQuickPlayModeActive() {
    return currentPlaylist.length === 1 && isQuickPlayTrack(currentPlaylist[0]);
}

function releaseQuickPlayObjectUrl({ exceptUrl = '' } = {}) {
    if (!quickPlayObjectUrl) return;
    if (exceptUrl && quickPlayObjectUrl === exceptUrl) return;

    try {
        URL.revokeObjectURL(quickPlayObjectUrl);
    } catch (error) {
        console.warn('Failed to revoke Quick Play object URL:', error);
    }

    quickPlayObjectUrl = null;
}

function getFileNameWithoutExtension(fileName = '') {
    const value = String(fileName || '').trim();
    if (!value) return 'Quick Play';

    const extensionIndex = value.lastIndexOf('.');
    if (extensionIndex <= 0) {
        return value;
    }

    return value.slice(0, extensionIndex);
}

function createQuickPlayTrack(file, fileUrl) {
    const fileName = String(file?.name || 'Quick Play').trim() || 'Quick Play';
    return {
        id: `quick-play-${Date.now()}`,
        title: getFileNameWithoutExtension(fileName),
        artist: 'Duration: --:--',
        album: '',
        duration: '--:--',
        cover: DEFAULT_COVER,
        file: fileUrl,
        __quickPlay: true,
        __quickPlayFileName: fileName
    };
}

/**
 * Play a quick-play audio file chosen via the folder-browser modal.
 * Streams the local file through the server's /api/media endpoint so no
 * blob URL is needed.
 */
function playQuickPlayFromPath(filePath) {
    if (!filePath) return;

    const fileName = filePath.split(/[\\/]/).pop() || 'Quick Play';
    const isLikelyAudio = /\.(mp3|wav|flac|m4a|ogg|aac|wma|opus)$/i.test(fileName);
    if (!isLikelyAudio) {
        showNotification('Unsupported File', 'Please choose an audio file (mp3, wav, flac, m4a, ogg, aac, wma, opus).', 'warning');
        return;
    }

    // Build the server streaming URL (same endpoint used by imported playlist tracks)
    const fileUrl = `/api/media?imported=1&path=${encodeURIComponent(filePath)}`;

    const quickTrack = {
        id: `quick-play-${Date.now()}`,
        title: getFileNameWithoutExtension(fileName),
        artist: 'Duration: --:--',
        album: '',
        duration: '--:--',
        cover: DEFAULT_COVER,
        file: fileUrl,
        __quickPlay: true,
        __quickPlayFileName: fileName
    };

    currentPlaylistContext = { playlistName: 'Quick Play', genreName: '' };
    currentPlaylist = [quickTrack];
    currentTrackIndex = 0;
    rebuildPlaybackOrder(0);
    loadTrack(quickTrack);
    playTrack();
}

function openQuickPlayFilePicker() {
    if (!apiAvailable) {
        // API offline — fall back to native file input
        const fileInput = document.getElementById('quickPlayFileInput');
        if (!fileInput) return;
        fileInput.value = '';
        fileInput.click();
        return;
    }

    // Open the amazing folder-browser modal in file-selection mode
    openModernFolderBrowser(null, null, {
        mode: 'file',
        fileExtensions: ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma', '.opus'],
        onFileSelect: playQuickPlayFromPath
    });
}

function playQuickPlayFile(file) {
    if (!file) return;

    const isLikelyAudio = (file.type || '').startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg)$/i.test(file.name || '');
    if (!isLikelyAudio) {
        showNotification('Unsupported File', 'Please choose an audio file (mp3, wav, flac, m4a, ogg).', 'warning');
        return;
    }

    releaseQuickPlayObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    quickPlayObjectUrl = objectUrl;

    const quickTrack = createQuickPlayTrack(file, objectUrl);
    currentPlaylistContext = {
        playlistName: 'Quick Play',
        genreName: ''
    };

    currentPlaylist = [quickTrack];
    currentTrackIndex = 0;
    rebuildPlaybackOrder(0);
    loadTrack(quickTrack);
    playTrack();
}

function handleQuickPlayFileChange(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    playQuickPlayFile(file);
}
