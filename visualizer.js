// Audio Visualizer System
class AudioVisualizer {
    constructor(audioElement) {
        this.audio = audioElement;
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.bufferLength = null;
        this.isInitialized = false;
        
        // Visualization settings
        this.visualizationType = 'bars'; // bars, wave, circular, particles
        this.canvas = null;
        this.canvasCtx = null;
        this.animationId = null;
        this.isStopped = false;
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

            // Direct processing chain: source -> analyser -> output
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            this.isInitialized = true;
            console.log('🎵 Audio Visualizer initialized');
        } catch (error) {
            console.error('Error initializing audio visualizer:', error);
        }
    }
    
    // Set visualization canvas
    setCanvas(canvas) {
        this.canvas = canvas;
        this.canvasCtx = canvas.getContext('2d');
    }
    
    // Start visualization
    startVisualization() {
        if (!this.isInitialized) this.initialize();
        if (!this.canvas || !this.analyser || !this.dataArray) return;

        this.isStopped = false;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        const draw = () => {
            if (this.isStopped) {
                this.animationId = null;
                return;
            }

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
        this.isStopped = true;
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
        gradient.addColorStop(0, '#00f5ff');
        gradient.addColorStop(0.35, '#7c3aed');
        gradient.addColorStop(0.7, '#ff2d95');
        gradient.addColorStop(1, '#ffe066');
        
        canvasCtx.fillStyle = 'rgba(8, 10, 20, 0.22)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
            
            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

            canvasCtx.shadowColor = 'rgba(0, 245, 255, 0.45)';
            canvasCtx.shadowBlur = 10;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, Math.max(2, barHeight * 0.08));
            canvasCtx.shadowBlur = 0;
            
            x += barWidth + 1;
        }
    }
    
    // Draw waveform visualization
    drawWave() {
        const { canvasCtx, canvas, dataArray, bufferLength } = this;
        
        canvasCtx.fillStyle = 'rgba(8, 10, 20, 0.18)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        canvasCtx.lineWidth = 3.5;
        const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, '#00f5ff');
        gradient.addColorStop(0.45, '#8b5cf6');
        gradient.addColorStop(1, '#ff2d95');
        canvasCtx.strokeStyle = gradient;
        canvasCtx.shadowColor = 'rgba(139, 92, 246, 0.45)';
        canvasCtx.shadowBlur = 12;
        
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
        canvasCtx.shadowBlur = 0;
    }
    
    // Draw circular visualization
    drawCircular() {
        const { canvasCtx, canvas, dataArray, bufferLength } = this;
        
        canvasCtx.fillStyle = 'rgba(8, 10, 20, 0.18)';
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
            canvasCtx.strokeStyle = `hsla(${hue}, 92%, 62%, 0.95)`;
            canvasCtx.lineWidth = 2.6;
            canvasCtx.shadowColor = `hsla(${(hue + 40) % 360}, 90%, 60%, 0.45)`;
            canvasCtx.shadowBlur = 10;
            
            canvasCtx.beginPath();
            canvasCtx.moveTo(x1, y1);
            canvasCtx.lineTo(x2, y2);
            canvasCtx.stroke();
        }

        canvasCtx.shadowBlur = 0;
    }
    
    // Draw particles visualization
    drawParticles() {
        const { canvasCtx, canvas, dataArray, bufferLength } = this;
        
        canvasCtx.fillStyle = 'rgba(8, 10, 20, 0.14)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < bufferLength; i += 2) {
            const value = dataArray[i];
            const x = (i / bufferLength) * canvas.width;
            const y = canvas.height / 2;
            const size = (value / 255) * 20;
            
            const hue = (i / bufferLength) * 360;
            canvasCtx.fillStyle = `hsla(${hue}, 92%, 62%, ${Math.max(0.25, value / 255)})`;
            canvasCtx.shadowColor = `hsla(${(hue + 25) % 360}, 92%, 62%, 0.5)`;
            canvasCtx.shadowBlur = 14;
            
            canvasCtx.beginPath();
            canvasCtx.arc(x, y + Math.sin(Date.now() / 100 + i) * 50, size, 0, Math.PI * 2);
            canvasCtx.fill();
        }

        canvasCtx.shadowBlur = 0;
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

// Ensure Web Audio processing graph is initialized before visualization interaction
async function ensureVisualizerReady() {
    initVisualizer();

    if (!visualizer) return false;

    visualizer.initialize();

    if (visualizer.audioContext && visualizer.audioContext.state === 'suspended') {
        try {
            await visualizer.audioContext.resume();
        } catch (error) {
            console.warn('Unable to resume audio context:', error);
        }
    }

    return visualizer.isInitialized;
}

async function startVisualizerPlayback() {
    const ready = await ensureVisualizerReady();
    if (!ready) return;

    if (!visualizer.canvas) {
        visualizer.setCanvas(document.getElementById('visualizerCanvas'));
    }

    visualizer.startVisualization();
}

function updateVisualizerToggleButton(isRunning) {
    const btn = document.getElementById('vizToggleBtn');
    if (!btn) return;

    const icon = btn.querySelector('i');
    if (isRunning) {
        btn.title = 'Stop Visualizer';
        if (icon) icon.className = 'fas fa-pause';
    } else {
        btn.title = 'Start Visualizer';
        if (icon) icon.className = 'fas fa-play';
    }
}

async function toggleVisualizerPlayback() {
    if (!visualizer) {
        await startVisualizerPlayback();
        updateVisualizerToggleButton(true);
        return;
    }

    if (visualizer.isStopped) {
        await startVisualizerPlayback();
        updateVisualizerToggleButton(true);
    } else {
        visualizer.stopVisualization();
        updateVisualizerToggleButton(false);
    }
}

// Change visualization type
function setVisualizationType(type) {
    if (!visualizer) return;

    visualizer.setVisualizationType(type);

    // Update active button
    document.querySelectorAll('.viz-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const matchingButton = Array.from(document.querySelectorAll('.viz-type-btn'))
        .find(btn => btn.dataset.vizType === type);
    matchingButton?.classList.add('active');
}

window.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('vizToggleBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            toggleVisualizerPlayback().catch(error => {
                console.error('Visualizer toggle failed:', error);
            });
        });
    }

    document.querySelectorAll('.viz-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.vizType;
            if (type) {
                setVisualizationType(type);
            }
        });
    });
});