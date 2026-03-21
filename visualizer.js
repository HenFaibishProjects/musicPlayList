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

    isLightTheme() {
        return document.body?.classList.contains('light-theme');
    }

    getThemePalette() {
        if (this.isLightTheme()) {
            return {
                motionBlur: 'rgba(248, 250, 252, 0.45)',
                glowStart: 'rgba(59, 130, 246, 0.1)',
                glowMid: 'rgba(168, 85, 247, 0.07)',
                glowEnd: 'rgba(226, 232, 240, 0.22)',
                pulseColor: '59, 130, 246',
                gridLine: 'rgba(15, 23, 42, 0.08)',
                ringStroke: 'rgba(15, 23, 42, 0.2)',
                accentDot: 'rgba(15, 23, 42, 0.8)'
            };
        }

        return {
            motionBlur: 'rgba(8, 12, 24, 0.22)',
            glowStart: 'rgba(34, 211, 238, 0.06)',
            glowMid: 'rgba(124, 58, 237, 0.04)',
            glowEnd: 'rgba(10, 14, 26, 0.1)',
            pulseColor: '56, 189, 248',
            gridLine: 'rgba(255, 255, 255, 0.03)',
            ringStroke: 'rgba(255, 255, 255, 0.15)',
            accentDot: 'white'
        };
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
            this.smoothedBins[i] = this.smoothedBins[i] * 0.68 + value * 0.32;
            this.peakBins[i] = Math.max(this.peakBins[i] * 0.945, this.smoothedBins[i]);

            if (i < energyBins) {
                energyAccumulator += this.smoothedBins[i];
            }
        }

        const nextEnergy = energyAccumulator / energyBins;
        this.energy = this.energy * 0.74 + nextEnergy * 0.26;
        this.hueOffset = (this.hueOffset + 0.45 + this.energy * 3.5) % 360;
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
        const palette = this.getThemePalette();

        ctx.globalCompositeOperation = 'source-over';
        // Motion blur layer adapted to current theme
        ctx.fillStyle = palette.motionBlur;
        ctx.fillRect(0, 0, this.width, this.height);

        // Animated ambient glow
        const gradientX = this.width * (0.5 + Math.sin(timestamp * 0.0004) * 0.2);
        const gradientY = this.height * (0.5 + Math.cos(timestamp * 0.0003) * 0.2);
        const baseGradient = ctx.createRadialGradient(gradientX, gradientY, 0, gradientX, gradientY, this.width * 0.8);
        baseGradient.addColorStop(0, palette.glowStart);
        baseGradient.addColorStop(0.5, palette.glowMid);
        baseGradient.addColorStop(1, palette.glowEnd);
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, this.width, this.height);

        // Pulse core - reacts to bass/energy
        const pulseRadius = Math.max(this.width, this.height) * (0.15 + this.energy * 0.6);
        const pulseGradient = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, pulseRadius);
        pulseGradient.addColorStop(0, `rgba(${palette.pulseColor}, ${0.12 + this.energy * 0.15})`);
        pulseGradient.addColorStop(1, `rgba(${palette.pulseColor}, 0)`);
        ctx.fillStyle = pulseGradient;
        ctx.fillRect(0, 0, this.width, this.height);

        // Grid lines with perspective-like fade
        ctx.strokeStyle = palette.gridLine;
        ctx.lineWidth = 1;
        const step = 48;
        const offset = (timestamp * 0.02) % step;
        for (let x = offset; x <= this.width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        }
    }

    roundedBar(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        if (h <= 0) return;
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
        // Increase bars for more detail, mirrored from center
        const totalBars = Math.min(110, Math.max(40, Math.floor(this.width / 8)));
        const halfBars = Math.floor(totalBars / 2);
        const gap = 3;
        const barWidth = (this.width / 2 - gap * halfBars) / halfBars;
        const baseY = this.height * 0.85;
        const centerX = this.width / 2;

        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < halfBars; i++) {
            // Logarithmic index for natural spectrum distribution
            const index = Math.floor(Math.pow(i / halfBars, 1.4) * (this.bufferLength * 0.85));
            const value = this.smoothedBins[index] || 0;
            const peak = this.peakBins[index] || value;

            // Height with dynamic ooomph
            const barHeight = Math.max(3, Math.pow(value, 1.1) * (this.height * 0.72));
            const peakHeight = Math.max(3, Math.pow(peak, 1.05) * (this.height * 0.72));
            
            const hue = (this.hueOffset + i * 2.5) % 360;
            const mainColor = `hsla(${hue}, 95%, 68%, 0.9)`;
            const glowColor = `hsla(${hue}, 95%, 68%, 0.3)`;

            // Draw right side
            const rx = centerX + i * (barWidth + gap);
            this.drawSymmetricalBar(ctx, rx, baseY, barWidth, barHeight, peakHeight, hue, mainColor, glowColor);

            // Draw left side (mirrored)
            const lx = centerX - (i + 1) * (barWidth + gap);
            this.drawSymmetricalBar(ctx, lx, baseY, barWidth, barHeight, peakHeight, hue, mainColor, glowColor);
        }
        
        ctx.globalCompositeOperation = 'source-over';
    }

    drawSymmetricalBar(ctx, x, baseY, w, h, peakH, hue, mainColor, glowColor) {
        const y = baseY - h;
        
        // Glow layer
        ctx.shadowBlur = 15;
        ctx.shadowColor = glowColor;
        
        const grad = ctx.createLinearGradient(x, y, x, baseY);
        grad.addColorStop(0, mainColor);
        grad.addColorStop(1, `hsla(${(hue + 40) % 360}, 90%, 50%, 0.4)`);
        
        ctx.fillStyle = grad;
        this.roundedBar(ctx, x, y, w, h, 6);
        ctx.fill();
        
        ctx.shadowBlur = 0;

        // Peak marker
        const py = baseY - peakH;
        ctx.fillStyle = `hsla(${hue}, 100%, 85%, 0.9)`;
        ctx.fillRect(x, py - 3, w, 2);

        // Subtle Reflection
        ctx.globalAlpha = 0.15;
        this.roundedBar(ctx, x, baseY + 6, w, h * 0.25, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    drawWave(timestamp) {
        const ctx = this.canvasCtx;
        const midY = this.height * 0.5;
        const points = 180;
        const sliceWidth = this.width / points;
        
        ctx.globalCompositeOperation = 'lighter';

        // Background Wave (Shadow/Glow)
        ctx.shadowBlur = 25;
        ctx.shadowColor = 'rgba(124, 58, 237, 0.5)';
        this.renderWavePath(ctx, points, sliceWidth, midY, 1.2, timestamp, 0.002, 12, 'rgba(139, 92, 246, 0.2)');
        ctx.shadowBlur = 0;

        // Primary Wave
        const gradient = ctx.createLinearGradient(0, 0, this.width, 0);
        gradient.addColorStop(0, `hsla(${this.hueOffset}, 100%, 70%, 1)`);
        gradient.addColorStop(0.5, `hsla(${(this.hueOffset + 60) % 360}, 100%, 75%, 1)`);
        gradient.addColorStop(1, `hsla(${(this.hueOffset + 120) % 360}, 100%, 70%, 1)`);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        this.renderWavePath(ctx, points, sliceWidth, midY, 1.0, timestamp, 0, 0, null, true);

        // Accent Wave (Faster oscillation)
        ctx.strokeStyle = `hsla(${(this.hueOffset + 180) % 360}, 100%, 80%, 0.5)`;
        ctx.lineWidth = 1.5;
        this.renderWavePath(ctx, points, sliceWidth, midY, 0.6, timestamp, 0.005, 8, null, true);
        
        ctx.globalCompositeOperation = 'source-over';
    }

    renderWavePath(ctx, points, sliceWidth, midY, ampMod, timestamp, speed, drift, fillColor, isStroke = false) {
        ctx.beginPath();
        const amplitude = this.height * (0.22 + this.energy * 0.5) * ampMod;

        for (let i = 0; i <= points; i++) {
            const t = i / points;
            const idx = Math.floor(t * (this.timeDataArray.length / 2));
            const val = (this.timeDataArray[idx] - 128) / 128;
            
            const x = t * this.width;
            const d = speed ? Math.sin(timestamp * speed + i * 0.1) * drift : 0;
            const y = midY + val * amplitude + d;

            if (i === 0) ctx.moveTo(x, y);
            else {
                // Bezier smoothing
                const prevT = (i - 1) / points;
                const prevX = prevT * this.width;
                const cp1x = (prevX + x) / 2;
                ctx.quadraticCurveTo(cp1x, y, x, y);
            }
        }

        if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.lineTo(this.width, this.height);
            ctx.lineTo(0, this.height);
            ctx.fill();
        }
        if (isStroke) ctx.stroke();
    }

    drawCircular(timestamp) {
        const ctx = this.canvasCtx;
        const palette = this.getThemePalette();
        const cx = this.width / 2;
        const cy = this.height / 2;
        const dim = Math.min(this.width, this.height);
        const baseRadius = dim * 0.22;
        
        ctx.globalCompositeOperation = 'lighter';
        
        // Inner Core Glow
        const innerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * (1 + this.energy));
        innerGlow.addColorStop(0, `hsla(${this.hueOffset}, 90%, 60%, ${0.15 + this.energy * 0.2})`);
        innerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = innerGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Reactive Kaleidoscope Bars
        const bars = 180;
        const rotation = timestamp * 0.0003;

        for (let i = 0; i < bars; i++) {
            const angle = (i / bars) * Math.PI * 2 + rotation;
            const index = Math.floor(Math.pow(i / bars, 1.4) * (this.bufferLength * 0.9));
            const value = this.smoothedBins[index] || 0;
            
            const barLen = Math.max(4, Math.pow(value, 1.1) * dim * 0.32);
            const hue = (this.hueOffset + i * (360 / bars)) % 360;

            const x1 = cx + Math.cos(angle) * baseRadius;
            const y1 = cy + Math.sin(angle) * baseRadius;
            const x2 = cx + Math.cos(angle) * (baseRadius + barLen);
            const y2 = cy + Math.sin(angle) * (baseRadius + barLen);

            ctx.strokeStyle = `hsla(${hue}, 100%, 75%, ${0.6 + value * 0.4})`;
            ctx.lineWidth = 1.5 + value * 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            
            // Accent dots at the end of bars
            if (value > 0.6) {
                ctx.fillStyle = palette.accentDot;
                ctx.beginPath();
                ctx.arc(x2, y2, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Floating Outer Ring
        ctx.strokeStyle = palette.ringStroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 10]);
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius + 10 + this.energy * 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.globalCompositeOperation = 'source-over';
    }

    seedParticles() {
        this.particles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push(this.createParticle(true));
        }
    }

    createParticle(initial = false) {
        return {
            x: Math.random() * this.width,
            y: initial ? Math.random() * this.height : this.height + 50,
            size: 1.5 + Math.random() * 4,
            speedX: (Math.random() - 0.5) * 1.5,
            speedY: 0.8 + Math.random() * 2.5,
            hue: Math.random() * 360,
            life: 1.0,
            decay: 0.002 + Math.random() * 0.008,
            freqIdx: Math.floor(Math.random() * 128)
        };
    }

    drawParticles(timestamp) {
        const ctx = this.canvasCtx;
        ctx.globalCompositeOperation = 'lighter';

        this.particles.forEach((p, i) => {
            const freqVal = this.smoothedBins[p.freqIdx] || 0;
            const lift = 0.5 + freqVal * 3;
            
            p.x += p.speedX + Math.sin(timestamp * 0.001 + i) * 0.5;
            p.y -= p.speedY * lift;
            p.life -= p.decay;
            p.hue = (p.hue + 1) % 360;

            if (p.life <= 0 || p.y < -50) {
                this.particles[i] = this.createParticle(false);
                return;
            }

            const alpha = p.life * (0.3 + freqVal * 0.7);
            const size = p.size * (1 + freqVal);
            
            ctx.shadowBlur = 10 * freqVal;
            ctx.shadowColor = `hsla(${p.hue}, 100%, 70%, 1)`;
            ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
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
