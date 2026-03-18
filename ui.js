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
