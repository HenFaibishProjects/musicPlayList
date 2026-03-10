// Audio Visualizer & Equalizer System
class AudioVisualizer {
    constructor(audioElement) {
        this.audio = audioElement;
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.bufferLength = null;
        this.isInitialized = false;
        
        // Equalizer
        this.filters = [];
        this.gainNode = null;
        
        // Visualization settings
        this.visualizationType = 'bars'; // bars, wave, circular, particles
        this.canvas = null;
        this.canvasCtx = null;
        this.animationId = null;
    }
    
    // Initialize Web Audio API
    initialize() {
        if (this.isInitialized) return;
        
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create source from audio element
            this.source = this.audioContext.createMediaElementSource(this.audio);
            
            // Create analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            
            // Create equalizer filters (10 bands)
            const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
            frequencies.forEach(freq => {
                const filter = this.audioContext.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1;
                filter.gain.value = 0;
                this.filters.push(filter);
            });
            
            // Create gain node
            this.gainNode = this.audioContext.createGain();
            
            // Don't connect to destination yet - will be done after effects engine
            let currentNode = this.source;
            this.filters.forEach(filter => {
                currentNode.connect(filter);
                currentNode = filter;
            });
            currentNode.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            
            this.isInitialized = true;
            console.log('🎵 Audio Visualizer initialized');
            
            // Initialize effects engine after visualizer
            setTimeout(() => {
                if (typeof initAudioEffects === 'function') {
                    initAudioEffects();
                }
            }, 100);
        } catch (error) {
            console.error('Error initializing audio visualizer:', error);
        }
    }
    
    // Set visualization canvas
    setCanvas(canvas) {
        this.canvas = canvas;
        this.canvasCtx = canvas.getContext('2d');
    }
    
    // Set equalizer band
    setEQBand(bandIndex, gain) {
        if (this.filters[bandIndex]) {
            this.filters[bandIndex].gain.value = gain;
        }
    }
    
    // Reset equalizer
    resetEQ() {
        this.filters.forEach(filter => {
            filter.gain.value = 0;
        });
    }
    
    // Set EQ preset
    setPreset(preset) {
        const presets = {
            flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            rock: [5, 4, 3, 1, -1, -1, 0, 2, 4, 5],
            pop: [-1, -1, 0, 2, 4, 4, 2, 0, -1, -1],
            jazz: [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
            classical: [4, 3, 2, 0, 0, 0, -1, -2, -3, -4],
            bass: [6, 5, 4, 2, 0, -1, -2, -3, -4, -4],
            treble: [-4, -4, -3, -2, -1, 0, 2, 4, 5, 6],
            vocal: [-2, -3, -2, 1, 3, 3, 2, 1, 0, -1]
        };
        
        const values = presets[preset] || presets.flat;
        values.forEach((gain, index) => {
            this.setEQBand(index, gain);
        });
    }
    
    // Start visualization
    startVisualization() {
        if (!this.isInitialized) this.initialize();
        if (!this.canvas) return;
        
        const draw = () => {
            this.animationId = requestAnimationFrame(draw);
            
            this.analyser.getByteFrequencyData(this.dataArray);
            
            switch (this.visualizationType) {
                case 'bars':
                    this.drawBars();
                    break;
                case 'wave':
                    this.drawWave();
                    break;
                case 'circular':
                    this.drawCircular();
                    break;
                case 'particles':
                    this.drawParticles();
                    break;
            }
        };
        
        draw();
    }
    
    // Stop visualization
    stopVisualization() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.canvasCtx && this.canvas) {
            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    // Draw bars visualization
    drawBars() {
        const { canvasCtx, canvas, dataArray, bufferLength } = this;
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(0.5, '#a855f7');
        gradient.addColorStop(1, '#f97316');
        
        canvasCtx.fillStyle = 'rgba(10, 10, 15, 0.3)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
            
            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    }
    
    // Draw waveform visualization
    drawWave() {
        const { canvasCtx, canvas, dataArray, bufferLength } = this;
        
        canvasCtx.fillStyle = 'rgba(10, 10, 15, 0.3)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        canvasCtx.lineWidth = 3;
        const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(0.5, '#a855f7');
        gradient.addColorStop(1, '#f97316');
        canvasCtx.strokeStyle = gradient;
        
        canvasCtx.beginPath();
        
        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 255.0;
            const y = v * canvas.height;
            
            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        canvasCtx.stroke();
    }
    
    // Draw circular visualization
    drawCircular() {
        const { canvasCtx, canvas, dataArray, bufferLength } = this;
        
        canvasCtx.fillStyle = 'rgba(10, 10, 15, 0.3)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.6;
        
        for (let i = 0; i < bufferLength; i++) {
            const angle = (i / bufferLength) * Math.PI * 2;
            const barHeight = (dataArray[i] / 255) * radius * 0.8;
            
            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);
            
            const hue = (i / bufferLength) * 360;
            canvasCtx.strokeStyle = `hsl(${hue}, 80%, 60%)`;
            canvasCtx.lineWidth = 3;
            
            canvasCtx.beginPath();
            canvasCtx.moveTo(x1, y1);
            canvasCtx.lineTo(x2, y2);
            canvasCtx.stroke();
        }
    }
    
    // Draw particles visualization
    drawParticles() {
        const { canvasCtx, canvas, dataArray, bufferLength } = this;
        
        canvasCtx.fillStyle = 'rgba(10, 10, 15, 0.2)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < bufferLength; i += 2) {
            const value = dataArray[i];
            const x = (i / bufferLength) * canvas.width;
            const y = canvas.height / 2;
            const size = (value / 255) * 20;
            
            const hue = (i / bufferLength) * 360;
            canvasCtx.fillStyle = `hsla(${hue}, 80%, 60%, ${value / 255})`;
            
            canvasCtx.beginPath();
            canvasCtx.arc(x, y + Math.sin(Date.now() / 100 + i) * 50, size, 0, Math.PI * 2);
            canvasCtx.fill();
        }
    }
    
    // Change visualization type
    setVisualizationType(type) {
        this.visualizationType = type;
    }
}

// Global visualizer instance
let visualizer = null;

// Initialize visualizer when audio is ready
function initVisualizer() {
    if (!visualizer) {
        const audio = document.getElementById('audioPlayer');
        visualizer = new AudioVisualizer(audio);
    }
}

// Toggle visualizer display
function toggleVisualizer() {
    const container = document.getElementById('visualizerContainer');
    const isVisible = container.style.display !== 'none';
    
    if (isVisible) {
        container.style.display = 'none';
        visualizer.stopVisualization();
    } else {
        container.style.display = 'flex';
        if (!visualizer.canvas) {
            visualizer.setCanvas(document.getElementById('visualizerCanvas'));
        }
        visualizer.initialize();
        visualizer.startVisualization();
    }
}

// Toggle equalizer panel
function toggleEqualizer() {
    const panel = document.getElementById('equalizerPanel');
    panel.classList.toggle('show');
}

// Set EQ preset
function setEQPreset(preset) {
    if (visualizer) {
        visualizer.setPreset(preset);
        updateEQSliders(preset);
    }
}

// Update EQ sliders to match preset
function updateEQSliders(preset) {
    const presets = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        rock: [5, 4, 3, 1, -1, -1, 0, 2, 4, 5],
        pop: [-1, -1, 0, 2, 4, 4, 2, 0, -1, -1],
        jazz: [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
        classical: [4, 3, 2, 0, 0, 0, -1, -2, -3, -4],
        bass: [6, 5, 4, 2, 0, -1, -2, -3, -4, -4],
        treble: [-4, -4, -3, -2, -1, 0, 2, 4, 5, 6],
        vocal: [-2, -3, -2, 1, 3, 3, 2, 1, 0, -1]
    };
    
    const values = presets[preset] || presets.flat;
    values.forEach((value, index) => {
        const slider = document.getElementById(`eq-band-${index}`);
        if (slider) {
            slider.value = value;
            updateEQBandDisplay(index, value);
        }
    });
}

// Update EQ band
function updateEQBand(bandIndex, value) {
    if (visualizer) {
        visualizer.setEQBand(bandIndex, value);
        updateEQBandDisplay(bandIndex, value);
    }
}

// Update EQ band display
function updateEQBandDisplay(bandIndex, value) {
    const display = document.getElementById(`eq-value-${bandIndex}`);
    if (display) {
        display.textContent = value > 0 ? `+${value}` : value;
    }
}

// Reset equalizer
function resetEQ() {
    if (visualizer) {
        visualizer.resetEQ();
        updateEQSliders('flat');
    }
}

// Change visualization type
function setVisualizationType(type) {
    if (visualizer) {
        visualizer.setVisualizationType(type);
        
        // Update active button
        document.querySelectorAll('.viz-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.closest('.viz-type-btn').classList.add('active');
    }
}