// Audio Output Device Selector
class AudioDeviceManager {
    constructor(audioElement) {
        this.audio = audioElement;
        this.devices = [];
        this.currentDeviceId = 'default';
        this.storageKey = 'lidaplay.audio.outputDeviceId';
    }

    getSavedDeviceId() {
        try {
            return localStorage.getItem(this.storageKey) || 'default';
        } catch (error) {
            console.warn('Could not read saved audio output device:', error);
            return 'default';
        }
    }

    saveDeviceId(deviceId) {
        try {
            localStorage.setItem(this.storageKey, deviceId || 'default');
        } catch (error) {
            console.warn('Could not save audio output device:', error);
        }
    }

    async applyInitialOutputDevice() {
        const preferredDevice = this.getSavedDeviceId();
        await this.setAudioDevice(preferredDevice, {
            persist: false,
            silent: true,
            allowFallback: true
        });
    }
    
    // Get all available audio output devices
    async getAudioDevices() {
        try {
            // Request permission first
            await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Get all devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            // Filter audio output devices
            this.devices = devices.filter(device => device.kind === 'audiooutput');
            
            console.log(`🔊 Found ${this.devices.length} audio output devices`);
            return this.devices;
        } catch (error) {
            console.error('Error getting audio devices:', error);
            return [];
        }
    }
    
    // Set audio output device
    async setAudioDevice(deviceId, options = {}) {
        const {
            persist = true,
            silent = false,
            allowFallback = true
        } = options;

        const targetDeviceId = deviceId || 'default';

        try {
            if (typeof this.audio.setSinkId !== 'undefined') {
                await this.audio.setSinkId(targetDeviceId);
                this.currentDeviceId = targetDeviceId;

                if (persist) {
                    this.saveDeviceId(targetDeviceId);
                }

                console.log(`✅ Audio output set to device: ${targetDeviceId}`);
                return true;
            } else {
                console.warn('setSinkId not supported in this browser');
                if (!silent) {
                    showNotification(
                        'Feature Not Supported',
                        'Audio device selection is not supported in this browser. Try using Chrome, Edge, or Opera for full audio device control.',
                        'warning'
                    );
                }
                return false;
            }
        } catch (error) {
            console.error('Error setting audio device:', error);

            if (allowFallback && targetDeviceId !== 'default' && typeof this.audio.setSinkId !== 'undefined') {
                try {
                    await this.audio.setSinkId('default');
                    this.currentDeviceId = 'default';
                    if (persist) {
                        this.saveDeviceId('default');
                    }

                    if (!silent) {
                        showNotification(
                            'Audio Output Reset',
                            'The selected device is unavailable. Switched back to System Default.',
                            'warning'
                        );
                    }
                    return true;
                } catch (fallbackError) {
                    console.error('Error falling back to default audio device:', fallbackError);
                }
            }

            if (!silent) {
                showNotification(
                    'Could Not Switch Device',
                    'Unable to switch to the selected audio device. Please check your system audio settings.',
                    'warning'
                );
            }
            return false;
        }
    }
    
    // Get friendly device name
    getDeviceName(device) {
        if (device.deviceId === 'default') {
            return 'System Default';
        }
        return device.label || `Audio Device ${device.deviceId.substring(0, 8)}`;
    }
}

// Global device manager
let deviceManager = null;

// Initialize device manager
async function initAudioDeviceManager() {
    if (!deviceManager) {
        const audio = document.getElementById('audioPlayer');
        deviceManager = new AudioDeviceManager(audio);
        await deviceManager.applyInitialOutputDevice();
    }
}

// Close device selector
function closeDeviceSelector() {
    document.getElementById('deviceSelectorModal').classList.remove('show');
}

// Load and display available audio devices
async function loadAudioDevices() {
    const deviceList = document.getElementById('deviceList');
    deviceList.innerHTML = '<div class="loading-devices"><div class="spinner"></div><p>Scanning audio devices...</p></div>';
    
    try {
        const devices = await deviceManager.getAudioDevices();
        
        if (devices.length === 0) {
            deviceList.innerHTML = `
                <div class="no-devices">
                    <i class="fas fa-volume-mute"></i>
                    <p>No audio output devices found</p>
                </div>
            `;
            return;
        }
        
        // Add default device
        const defaultDevice = {
            deviceId: 'default',
            label: 'System Default',
            kind: 'audiooutput'
        };
        
        const allDevices = [defaultDevice, ...devices];
        
        deviceList.innerHTML = '';
        
        allDevices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = 'device-item';
            if (device.deviceId === deviceManager.currentDeviceId) {
                deviceItem.classList.add('active');
            }
            
            const icon = getDeviceIcon(device.label);
            const name = deviceManager.getDeviceName(device);
            
            deviceItem.innerHTML = `
                <div class="device-info">
                    <i class="fas ${icon}"></i>
                    <div class="device-details">
                        <h5>${name}</h5>
                        <p>${device.deviceId === 'default' ? 'System default output' : device.deviceId.substring(0, 20) + '...'}</p>
                    </div>
                </div>
                ${device.deviceId === deviceManager.currentDeviceId ? 
                    '<i class="fas fa-check device-check"></i>' : 
                    '<i class="fas fa-circle device-dot"></i>'}
            `;
            
            deviceItem.addEventListener('click', () => {
                selectAudioDevice(device.deviceId, deviceItem);
            });
            deviceList.appendChild(deviceItem);
        });
        
    } catch (error) {
        deviceList.innerHTML = `
            <div class="device-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading devices. Please grant microphone permission.</p>
            </div>
        `;
    }
}

// Select audio device
async function selectAudioDevice(deviceId, deviceElement) {
    const success = await deviceManager.setAudioDevice(deviceId, {
        persist: true,
        silent: false,
        allowFallback: true
    });
    
    if (success) {
        // Update UI
        document.querySelectorAll('.device-item').forEach(item => {
            item.classList.remove('active');
            const check = item.querySelector('.device-check');
            if (check) {
                check.className = 'fas fa-circle device-dot';
            }
        });
        
        deviceElement.classList.add('active');
        const dot = deviceElement.querySelector('.device-dot');
        if (dot) {
            dot.className = 'fas fa-check device-check';
        }
        
        showNotification(
            'Audio Device Changed',
            'Your audio output has been switched successfully. The change will take effect immediately.',
            'success'
        );
    }
}

// Get icon for device type
function getDeviceIcon(label) {
    const labelLower = (label || '').toLowerCase();
    
    if (labelLower.includes('headphone') || labelLower.includes('headset')) {
        return 'fa-headphones';
    } else if (labelLower.includes('bluetooth') || labelLower.includes('wireless')) {
        return 'fa-bluetooth';
    } else if (labelLower.includes('usb') || labelLower.includes('external')) {
        return 'fa-usb';
    } else if (labelLower.includes('hdmi') || labelLower.includes('display')) {
        return 'fa-tv';
    } else if (labelLower.includes('speaker')) {
        return 'fa-volume-up';
    } else {
        return 'fa-volume-up';
    }
}

// Refresh devices list
async function refreshDevices() {
    await loadAudioDevices();
    showNotification(
        'Devices Refreshed',
        'Audio device list has been updated.',
        'success'
    );
}

window.addEventListener('DOMContentLoaded', () => {
    initAudioDeviceManager().catch(error => {
        console.warn('Audio device manager auto-init failed:', error);
    });

    const closeBtn = document.getElementById('deviceSelectorCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDeviceSelector);
    }

    const refreshBtn = document.getElementById('refreshDevicesBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshDevices().catch(error => {
                console.error('Failed to refresh audio devices:', error);
            });
        });
    }

    const modal = document.getElementById('deviceSelectorModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeDeviceSelector();
            }
        });
    }
});