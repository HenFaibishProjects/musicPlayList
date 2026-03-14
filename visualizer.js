// Audio Visualizer System (Modernized)
class AudioVisualizer {
    constructor(audioElement) {
        this.audio = audioElement;
        this.audioContext = null;
        this.analyser = null;
        this.source = null;

        this.dataArray = null;
        this.timeDataArray = null;
        this.bufferLength = 0;

        this.isInitialized = false;
        this.visualizationType = 'bars'; // bars, wave, circular, particles

        this.canvas = null;
        this.canvasCtx = null;
        this.animationId = null;
        this.isStopped = true;

        this.width = 0;
        this.height = 0;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.lastResizeCheck = 0;

        this.smoothedBins = null;
        this.peakBins = null;
        this.hueOffset = 0;
        this.energy = 0;

        this.particles = [];
        this.maxParticles = 90;
    }

    initialize() {
        if (this.isInitialized) return true;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.source = this.audioContext.createMediaElementSource(this.audio);
            this.analyser = this.audioContext.createAnalyser();

            this.analyser.fftSize = 1024;
            this.analyser.smoothingTimeConstant = 0.84;
            this.analyser.minDecibels = -92;
            this.analyser.maxDecibels = -8;

            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            this.timeDataArray = new Uint8Array(this.analyser.fftSize);
            this.smoothedBins = new Float32Array(this.bufferLength);
            this.peakBins = new Float32Array(this.bufferLength);

            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.isInitialized = true;
            console.log('🎵 Audio Visualizer initialized (modern profile)');
            return true;
        } catch (error) {
            console.error('Error initializing audio visualizer:', error);
            return false;
        }
    }

    setCanvas(canvas) {
        this.canvas = canvas;
        this.canvasCtx = canvas.getContext('2d', { alpha: true, desynchronized: true });
        this.syncCanvasSize();
        this.seedParticles();
    }

    syncCanvasSize() {
        if (!this.canvas || !this.canvasCtx) return;

        const rect = this.canvas.getBoundingClientRect();
        const nextWidth = Math.max(320, Math.floor(rect.width));
        const nextHeight = Math.max(120, Math.floor(rect.height));
        const nextDpr = Math.min(window.devicePixelRatio || 1, 2);

        if (
            nextWidth === this.width &&
            nextHeight === this.height &&
            nextDpr === this.dpr
        ) {
            return;
        }

        this.width = nextWidth;
        this.height = nextHeight;
        this.dpr = nextDpr;

        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);
        this.canvasCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    updateAudioSnapshot() {
        if (!this.analyser || !this.dataArray || !this.timeDataArray) return;

        this.analyser.getByteFrequencyData(this.dataArray);
        this.analyser.getByteTimeDomainData(this.timeDataArray);

        let energyAccumulator = 0;
        const energyBins = Math.min(52, this.bufferLength);

        for (let i = 0; i < this.bufferLength; i++) {
            const value = this.dataArray[i] / 255;
            this.smoothedBins[i] = this.smoothedBins[i] * 0.76 + value * 0.24;
            this.peakBins[i] = Math.max(this.peakBins[i] * 0.94, this.smoothedBins[i]);

            if (i < energyBins) {
                energyAccumulator += this.smoothedBins[i];
            }
        }

        const nextEnergy = energyAccumulator / energyBins;
        this.energy = this.energy * 0.82 + nextEnergy * 0.18;
        this.hueOffset = (this.hueOffset + 0.55 + this.energy * 2.8) % 360;
    }

    startVisualization() {
        const ready = this.initialize();
        if (!ready || !this.canvas || !this.canvasCtx || !this.analyser) return;

        this.isStopped = false;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        const draw = (timestamp = 0) => {
            if (this.isStopped) {
                this.animationId = null;
                return;
            }

            this.animationId = requestAnimationFrame(draw);

            if (!this.lastResizeCheck || timestamp - this.lastResizeCheck > 280) {
                this.syncCanvasSize();
                this.lastResizeCheck = timestamp;
            }

            this.updateAudioSnapshot();
            this.drawBackground(timestamp);

            switch (this.visualizationType) {
                case 'wave':
                    this.drawWave(timestamp);
                    break;
                case 'circular':
                    this.drawCircular(timestamp);
                    break;
                case 'particles':
                    this.drawParticles(timestamp);
                    break;
                case 'bars':
                default:
                    this.drawBars(timestamp);
                    break;
            }
        };

        draw();
    }

    stopVisualization() {
        this.isStopped = true;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.canvasCtx && this.canvas) {
            this.canvasCtx.clearRect(0, 0, this.width || this.canvas.width, this.height || this.canvas.height);
        }
    }

    drawBackground(timestamp) {
        const ctx = this.canvasCtx;

        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(4, 8, 20, 0.24)';
        ctx.fillRect(0, 0, this.width, this.height);

        const baseGradient = ctx.createLinearGradient(0, 0, this.width, this.height);
        baseGradient.addColorStop(0, 'rgba(0, 245, 255, 0.08)');
        baseGradient.addColorStop(0.45, 'rgba(124, 58, 237, 0.10)');
        baseGradient.addColorStop(1, 'rgba(255, 45, 149, 0.07)');
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, this.width, this.height);

        const pulseRadius = Math.max(this.width, this.height) * (0.18 + this.energy * 0.5);
        const pulseX = this.width * (0.25 + Math.sin(timestamp * 0.00035) * 0.08);
        const pulseY = this.height * (0.4 + Math.cos(timestamp * 0.00027) * 0.09);
        const pulseGradient = ctx.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, pulseRadius);
        pulseGradient.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
        pulseGradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

        ctx.fillStyle = pulseGradient;
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        const step = 36;
        for (let x = 0; x <= this.width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        }
    }

    roundedBar(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    drawBars() {
        const ctx = this.canvasCtx;
        const bars = Math.min(96, Math.max(36, Math.floor(this.width / 10)));
        const gap = 3;
        const barWidth = (this.width - gap * (bars - 1)) / bars;
        const baseY = this.height * 0.84;

        for (let i = 0; i < bars; i++) {
            const index = Math.floor(Math.pow(i / bars, 1.65) * (this.bufferLength * 0.95));
            const value = this.smoothedBins[index] || 0;
            const peak = this.peakBins[index] || value;

            const barHeight = Math.max(2, Math.pow(value, 1.18) * this.height * 0.76);
            const peakHeight = Math.max(2, Math.pow(peak, 1.12) * this.height * 0.76);
            const x = i * (barWidth + gap);
            const y = baseY - barHeight;

            const hue = (this.hueOffset + i * 1.75) % 360;
            const gradient = ctx.createLinearGradient(0, y, 0, baseY);
            gradient.addColorStop(0, `hsla(${hue}, 100%, 72%, 0.95)`);
            gradient.addColorStop(0.55, `hsla(${(hue + 45) % 360}, 96%, 63%, 0.9)`);
            gradient.addColorStop(1, `hsla(${(hue + 95) % 360}, 92%, 58%, 0.82)`);

            ctx.fillStyle = gradient;
            this.roundedBar(ctx, x, y, barWidth, barHeight, 4);
            ctx.fill();

            // Reflection
            ctx.globalAlpha = 0.24;
            this.roundedBar(ctx, x, baseY + 5, barWidth, barHeight * 0.34, 3);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Peak marker
            const peakY = baseY - peakHeight;
            ctx.fillStyle = `hsla(${hue}, 100%, 82%, 0.95)`;
            ctx.fillRect(x, peakY - 2, barWidth, 2);
        }
    }

    drawWave(timestamp) {
        const ctx = this.canvasCtx;
        const midY = this.height * 0.52;
        const amplitude = this.height * (0.2 + this.energy * 0.45);

        const lineGradient = ctx.createLinearGradient(0, 0, this.width, 0);
        lineGradient.addColorStop(0, '#22d3ee');
        lineGradient.addColorStop(0.5, '#8b5cf6');
        lineGradient.addColorStop(1, '#f472b6');

        ctx.beginPath();
        const points = 220;
        for (let i = 0; i <= points; i++) {
            const t = i / points;
            const idx = Math.floor(t * (this.timeDataArray.length - 1));
            const sample = (this.timeDataArray[idx] - 128) / 128;
            const x = t * this.width;
            const y = midY + sample * amplitude;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                const prevT = (i - 1) / points;
                const prevX = prevT * this.width;
                const ctrlX = (prevX + x) * 0.5;
                ctx.quadraticCurveTo(ctrlX, y, x, y);
            }
        }

        ctx.strokeStyle = lineGradient;
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(34, 211, 238, 0.45)';
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Secondary line for depth
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
            const t = i / points;
            const idx = Math.floor(t * (this.timeDataArray.length - 1));
            const sample = (this.timeDataArray[idx] - 128) / 128;
            const drift = Math.sin(timestamp * 0.0015 + t * 10) * 6;
            const x = t * this.width;
            const y = midY + sample * (amplitude * 0.62) + drift;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    drawCircular(timestamp) {
        const ctx = this.canvasCtx;
        const cx = this.width / 2;
        const cy = this.height / 2;
        const baseRadius = Math.min(this.width, this.height) * 0.18;

        const bars = 160;
        const rotation = timestamp * 0.00028;

        for (let i = 0; i < bars; i++) {
            const idx = Math.floor(Math.pow(i / bars, 1.3) * (this.bufferLength * 0.9));
            const value = this.smoothedBins[idx] || 0;
            const boost = Math.pow(value, 1.25);
            const length = boost * Math.min(this.width, this.height) * 0.26;

            const angle = (i / bars) * Math.PI * 2 + rotation;
            const inner = baseRadius;
            const outer = inner + length;

            const x1 = cx + Math.cos(angle) * inner;
            const y1 = cy + Math.sin(angle) * inner;
            const x2 = cx + Math.cos(angle) * outer;
            const y2 = cy + Math.sin(angle) * outer;

            const hue = (this.hueOffset + i * 2.1) % 360;
            ctx.strokeStyle = `hsla(${hue}, 95%, 66%, 0.95)`;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        const pulse = baseRadius * (0.85 + this.energy * 0.75);
        const ringGradient = ctx.createRadialGradient(cx, cy, pulse * 0.2, cx, cy, pulse);
        ringGradient.addColorStop(0, 'rgba(34, 211, 238, 0.35)');
        ringGradient.addColorStop(1, 'rgba(34, 211, 238, 0)');
        ctx.fillStyle = ringGradient;
        ctx.beginPath();
        ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    seedParticles() {
        this.particles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push(this.createParticle(true));
        }
    }

    createParticle(initial = false) {
        const centerBand = this.height * (0.3 + Math.random() * 0.4);
        return {
            x: Math.random() * Math.max(this.width, 1),
            y: initial ? centerBand : this.height + Math.random() * 20,
            size: 1.2 + Math.random() * 3.4,
            speedX: (Math.random() - 0.5) * 0.6,
            speedY: 0.35 + Math.random() * 1.2,
            alpha: 0.14 + Math.random() * 0.5,
            hue: Math.random() * 360,
            life: 0.4 + Math.random() * 1.1
        };
    }

    drawParticles(timestamp) {
        const ctx = this.canvasCtx;
        const bassEnergy = this.smoothedBins[4] || this.energy;
        const lift = 0.35 + bassEnergy * 2.8;

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];

            p.x += p.speedX + Math.sin((timestamp * 0.001) + i) * 0.08;
            p.y -= p.speedY * lift;
            p.hue = (p.hue + 0.45 + this.energy * 3.2) % 360;
            p.alpha *= 0.992;
            p.life -= 0.007;

            if (p.y < -20 || p.x < -20 || p.x > this.width + 20 || p.life <= 0.05) {
                this.particles[i] = this.createParticle(false);
                continue;
            }

            const glow = 8 + bassEnergy * 26;
            ctx.fillStyle = `hsla(${p.hue}, 95%, 67%, ${Math.max(0.04, p.alpha)})`;
            ctx.shadowColor = `hsla(${(p.hue + 20) % 360}, 96%, 70%, 0.52)`;
            ctx.shadowBlur = glow;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size + bassEnergy * 1.8, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;

        // Low-end spectrum line for grounding
        ctx.beginPath();
        const pointCount = 80;
        for (let i = 0; i <= pointCount; i++) {
            const t = i / pointCount;
            const idx = Math.floor(t * Math.min(120, this.bufferLength - 1));
            const v = this.smoothedBins[idx] || 0;
            const x = t * this.width;
            const y = this.height * 0.88 - v * this.height * 0.26;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
    }

    setVisualizationType(type) {
        const allowed = new Set(['bars', 'wave', 'circular', 'particles']);
        if (!allowed.has(type)) return;
        this.visualizationType = type;
    }
}

// Global visualizer instance
let visualizer = null;

function initVisualizer() {
    if (!visualizer) {
        const audio = document.getElementById('audioPlayer');
        visualizer = new AudioVisualizer(audio);
    }
}

async function ensureVisualizerReady() {
    initVisualizer();
    if (!visualizer) return false;

    const initialized = visualizer.initialize();
    if (!initialized) return false;

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
    } else {
        visualizer.syncCanvasSize();
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

function setVisualizationType(type) {
    if (!visualizer) return;

    visualizer.setVisualizationType(type);

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
