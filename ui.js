// UI Management - Modals, Notifications, Breadcrumbs
// modalFormBaseline, isQueuePanelOpen, pendingDeletePlaylist, editingGenreContext
// are declared in app.js (loaded first)
let notificationAutoCloseTimer = null;

function showNotification(title, message, type = 'info', actions = null) {
    const overlay = document.getElementById('notificationOverlay');
    const icon = document.getElementById('notificationIcon');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const actionsEl = document.getElementById('notificationActions');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    icon.className = 'notification-icon';
    if (type === 'warning') {
        icon.classList.add('warning');
        icon.querySelector('i').className = 'fas fa-exclamation-triangle';
    } else if (type === 'error') {
        icon.classList.add('warning');
        icon.querySelector('i').className = 'fas fa-times-circle';
    } else if (type === 'success') {
        icon.classList.add('success');
        icon.querySelector('i').className = 'fas fa-check-circle';
    } else {
        icon.querySelector('i').className = 'fas fa-music';
    }
    
    actionsEl.innerHTML = '';
    if (Array.isArray(actions) && actions.length) {
        actions.forEach(action => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `notification-btn ${sanitizeClassList(action?.className || '')}`.trim();
            if (!button.className.includes('notification-btn')) button.className = 'notification-btn';
            button.textContent = String(action?.label || 'Action');
            if (typeof action?.onClick === 'function') button.addEventListener('click', action.onClick);
            actionsEl.appendChild(button);
        });
    } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'notification-btn primary';
        button.textContent = 'Got it';
        button.addEventListener('click', closeNotification);
        actionsEl.appendChild(button);
    }
    overlay.classList.add('show');
}

function closeNotification() {
    document.getElementById('notificationOverlay').classList.remove('show');
}

function renderBreadcrumb(items = []) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;
    breadcrumb.innerHTML = '';
    items.forEach((item, index) => {
        if (index > 0) {
            const separator = document.createElement('span');
            separator.className = 'separator';
            separator.textContent = '›';
            breadcrumb.appendChild(separator);
        }
        const part = document.createElement('span');
        part.textContent = String(item?.label || '');
        if (item?.current) part.classList.add('current');
        if (item?.action) {
            part.dataset.breadcrumbAction = item.action;
            if (item.value !== undefined && item.value !== null) {
                part.dataset.breadcrumbValue = String(item.value);
            }
            part.style.cursor = 'pointer';
        }
        breadcrumb.appendChild(part);
    });
}

function toggleQueuePanel() {
    isQueuePanelOpen ? closeQueuePanel() : openQueuePanel();
}

function openQueuePanel() {
    isQueuePanelOpen = true;
    document.getElementById('queuePanelOverlay').classList.add('show');
    document.getElementById('playlistBtn').classList.add('active');
    document.body.classList.add('queue-panel-open');
}

function closeQueuePanel() {
    isQueuePanelOpen = false;
    document.getElementById('queuePanelOverlay').classList.remove('show');
    document.getElementById('playlistBtn').classList.remove('active');
    document.body.classList.remove('queue-panel-open');
}

function createBackgroundParticles() {
    const bgAnimation = document.getElementById('bgAnimation');
    if (!bgAnimation) return;
    
    const particleCount = 15;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * 200 + 50 + 'px';
        particle.style.width = size;
        particle.style.height = size;
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.animationDuration = Math.random() * 20 + 10 + 's';
        bgAnimation.appendChild(particle);
    }
}

// ── About Modal ──────────────────────────────────────
function showAboutModal() {
    const overlay = document.getElementById('aboutModalOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    document.body.classList.add('modal-locked');
}

function closeAboutModal() {
    const overlay = document.getElementById('aboutModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    document.body.classList.remove('modal-locked');
}

// App Menu Dropdown Logic
document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('appMenuTrigger');
    const dropdown = document.getElementById('appMenuDropdown');
    const aboutBtn = document.getElementById('appMenuAbout');
    const exitBtn = document.getElementById('appMenuExit');
    const exportConfigBtn = document.getElementById('appMenuExportConfig');
    const importConfigBtn = document.getElementById('appMenuImportConfig');
    const importConfigInput = document.getElementById('importConfigInput');

    if (trigger && dropdown) {
        // Toggle dropdown
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });

        // About Button — show in-page modal
        if (aboutBtn) {
            aboutBtn.addEventListener('click', () => {
                dropdown.classList.remove('active');
                showAboutModal();
            });
        }

        // About Modal close button & backdrop
        const aboutOverlay = document.getElementById('aboutModalOverlay');
        const aboutCloseBtn = document.getElementById('aboutModalClose');
        if (aboutCloseBtn) aboutCloseBtn.addEventListener('click', closeAboutModal);
        if (aboutOverlay) {
            aboutOverlay.addEventListener('click', (e) => {
                if (e.target === aboutOverlay) closeAboutModal();
            });
        }
        // Escape key closes about modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAboutModal();
        });

        // Export Library Config
        if (exportConfigBtn) {
            exportConfigBtn.addEventListener('click', () => {
                dropdown.classList.remove('active');
                window.location.href = 'http://localhost:3950/api/export-structure';
            });
        }

        // Import Library Config
        if (importConfigBtn && importConfigInput) {
            importConfigBtn.addEventListener('click', () => {
                dropdown.classList.remove('active');
                importConfigInput.click();
            });

            importConfigInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const json = JSON.parse(text);

                    const response = await fetch('http://localhost:3950/api/import-structure', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(json)
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to import structure');
                    }

                    // Show a full-screen loading overlay while the library scans
                    const importOverlay = document.createElement('div');
                    importOverlay.id = 'importScanOverlay';
                    importOverlay.style.cssText = `
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(15, 23, 42, 0.92);
                        z-index: 99999;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        backdrop-filter: blur(12px);
                    `;

                    // Animated progress bar
                    importOverlay.innerHTML = `
                        <div style="font-size: 52px; color: #22d3ee; margin-bottom: 28px;">
                            <i class="fas fa-compact-disc fa-spin"></i>
                        </div>
                        <h2 style="margin: 0 0 8px 0; font-weight: 700; font-size: 26px; color: white; letter-spacing: -0.5px;">Importing Library...</h2>
                        <p style="color: #94a3b8; margin: 0 0 32px 0; font-size: 15px;">Scanning your music folders. Please wait.</p>
                        <div style="width: 340px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 99px; overflow: hidden;">
                            <div id="importProgressBar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #22d3ee, #a78bfa); border-radius: 99px; transition: width 0.4s ease;"></div>
                        </div>
                        <p id="importProgressLabel" style="color: #64748b; font-size: 13px; margin-top: 12px;">Connecting to server...</p>
                    `;
                    document.body.appendChild(importOverlay);

                    // Animate the progress bar while scanning
                    const progressBar = importOverlay.querySelector('#importProgressBar');
                    const progressLabel = importOverlay.querySelector('#importProgressLabel');
                    let fakeProgress = 0;
                    const progressMessages = [
                        'Reading folder structure...',
                        'Scanning music files...',
                        'Extracting metadata...',
                        'Building library cache...',
                        'Organizing playlists...',
                        'Finalizing...'
                    ];
                    let msgIndex = 0;
                    const progressTimer = setInterval(() => {
                        if (fakeProgress < 88) {
                            fakeProgress += Math.random() * 6;
                            if (progressBar) progressBar.style.width = Math.min(88, fakeProgress) + '%';
                            msgIndex = Math.min(progressMessages.length - 1, Math.floor(fakeProgress / 16));
                            if (progressLabel) progressLabel.textContent = progressMessages[msgIndex];
                        }
                    }, 500);

                    try {
                        await fetch('http://localhost:3950/api/library?forceRescan=true');
                    } catch (_) { /* ignore, reload anyway */ }

                    clearInterval(progressTimer);
                    if (progressBar) progressBar.style.width = '100%';
                    if (progressLabel) progressLabel.textContent = 'Done! Refreshing...';

                    setTimeout(() => { window.location.reload(); }, 600);

                } catch (err) {
                    console.error('Import Error:', err);
                    const existingOverlay = document.getElementById('importScanOverlay');
                    if (existingOverlay) existingOverlay.remove();
                    showNotification('Import Failed', err.message || 'Invalid JSON format', 'error');
                } finally {
                    e.target.value = '';
                }
            });
        }

        // Exit Button
        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                dropdown.classList.remove('active');
                if (typeof require !== 'undefined') {
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('exit-app');
                } else {
                    // Fallback
                    window.close();
                }
            });
        }
    }
});

// ── Display Mode System ──────────────────────────────────────────────────────
// Storage key — consistent with the project's "lidaplay_*" namespace
const DM_STORAGE_KEY = 'lidaplay_display_mode';

/**
 * Auto-detect heuristic for large TV / high-DPI setups.
 * Returns true when:
 *   - devicePixelRatio >= 2 (Windows scale 200%+ or Retina)
 *   - AND either the CSS logical viewport is very wide (≥1800px)
 *     OR the raw screen physical width suggests a 4K panel (≥2560px)
 */
function _dmShouldUseTv() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const physW = window.screen && window.screen.width ? window.screen.width : 0;
    return dpr >= 2 && (cssW >= 1800 || physW >= 2560);
}

/**
 * Write the resolved data-display-mode attribute to <body>.
 * Safe to call before DOMContentLoaded — only touches body, not child elements.
 * "default" → removes the attribute (zero CSS override).
 * "auto"    → resolves to "tv" or removes the attribute.
 * "tv" / "compact" → sets the attribute.
 */
function _dmApplyAttribute(mode) {
    const body = document.body;
    const resolved = mode === 'auto'
        ? (_dmShouldUseTv() ? 'tv' : 'default')
        : mode;

    if (resolved === 'default') {
        body.removeAttribute('data-display-mode');
    } else {
        body.setAttribute('data-display-mode', resolved);
    }
}

/**
 * Sync the active/inactive state on the four Display Mode menu buttons.
 * Must only be called after DOMContentLoaded.
 */
function _dmUpdateButtons(savedMode) {
    document.querySelectorAll('.display-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === savedMode);
    });
}

/**
 * Full apply: write attribute + update buttons.
 * Safe to call at any time after DOMContentLoaded.
 */
function applyDisplayMode(mode) {
    _dmApplyAttribute(mode);
    _dmUpdateButtons(mode);
}

/** Persist and apply a new mode. */
function setDisplayMode(mode) {
    try { localStorage.setItem(DM_STORAGE_KEY, mode); } catch (_) {}
    applyDisplayMode(mode);
}

/** Read saved mode from localStorage (defaults to 'default'). */
function getSavedDisplayMode() {
    try {
        return localStorage.getItem(DM_STORAGE_KEY) || 'default';
    } catch (_) {
        return 'default';
    }
}

// ── Apply body attribute IMMEDIATELY (before DOMContentLoaded)
// This prevents any flash of unstyled layout on page load.
// _dmUpdateButtons is NOT called here — the menu buttons don't exist yet.
_dmApplyAttribute(getSavedDisplayMode());

document.addEventListener('DOMContentLoaded', () => {
    // Now that the DOM is ready, sync button highlight to the saved mode.
    _dmUpdateButtons(getSavedDisplayMode());

    // Wire up the four Display Mode buttons in the app menu.
    document.querySelectorAll('.display-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setDisplayMode(btn.dataset.mode);
            // Close the dropdown after selecting.
            const dd = document.getElementById('appMenuDropdown');
            if (dd) dd.classList.remove('active');
        });
    });

    // Debounced resize handler — only relevant when mode is "auto".
    // Debounce prevents setAttribute being called hundreds of times per second
    // during a window drag.
    let _dmResizeTimer = null;
    window.addEventListener('resize', () => {
        if (getSavedDisplayMode() !== 'auto') return;
        clearTimeout(_dmResizeTimer);
        _dmResizeTimer = setTimeout(() => {
            _dmApplyAttribute('auto'); // attribute only; no button re-render needed
        }, 150);
    });
});
