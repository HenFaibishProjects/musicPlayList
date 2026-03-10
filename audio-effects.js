// Advanced Audio Effects System (FxSound-style)
class AudioEffectsEngine {
    constructor(audioContext, sourceNode) {
        this.context = audioContext;
        this.source = sourceNode;
        
        // Effect nodes
        this.bassBoost = null;
        this.clarity = null;
        this.ambience = null;
        this.compressor = null;
        this.limiter = null;
        this.surroundPanner = null;
        this.fidelityFilter = null;
        
        // Effect values
        this.effects = {
            bassBoost: 0,      // 0-100
            clarity: 0,        // 0-100
            ambience: 0,       // 0-100
            dynamicBoost: 0,   // 0-100
            surround: 0,       // 0-100
            fidelity: 100      // 0-100
        };
        
        this.initializeEffects();
    }
    
    initializeEffects() {
        // Bass Boost - Low shelf filter
        this.bassBoost = this.context.createBiquadFilter();
        this.bassBoost.type = 'lowshelf';
        this.bassBoost.frequency.value = 200;
        this.bassBoost.gain.value = 0;
        
        // Clarity - High shelf filter
        this.clarity = this.context.createBiquadFilter();
        this.clarity.type = 'highshelf';
        this.clarity.frequency.value = 4000;
        this.clarity.gain.value = 0;
        
        // Ambience - Reverb simulation with delay + feedback
        this.ambience = this.context.createDelay();
        this.ambience.delayTime.value = 0;
        
        this.ambienceFeedback = this.context.createGain();
        this.ambienceFeedback.gain.value = 0;
        
        this.ambienceMix = this.context.createGain();
        this.ambienceMix.gain.value = 0;
        
        // Dynamic Boost - Compressor
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;
        
        // Limiter - Prevent clipping
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.value = -1;
        this.limiter.knee.value = 0;
        this.limiter.ratio.value = 20;
        this.limiter.attack.value = 0.001;
        this.limiter.release.value = 0.01;
        
        // Surround - Stereo widener with panner
        this.surroundL = this.context.createStereoPanner();
        this.surroundR = this.context.createStereoPanner();
        this.surroundL.pan.value = -0.5;
        this.surroundR.pan.value = 0.5;
        
        this.surroundGain = this.context.createGain();
        this.surroundGain.gain.value = 0;
        
        // Fidelity - Bandwidth limiter
        this.fidelityFilter = this.context.createBiquadFilter();
        this.fidelityFilter.type = 'lowpass';
        this.fidelityFilter.frequency.value = 20000;
        this.fidelityFilter.Q.value = 0.7;
    }
    
    // Connect effects chain
    connectChain(destination) {
        // Main chain: source -> bass -> clarity -> compressor -> limiter -> destination
        this.source.connect(this.bassBoost);
        this.bassBoost.connect(this.clarity);
        this.clarity.connect(this.fidelityFilter);
        this.fidelityFilter.connect(this.compressor);
        this.compressor.connect(this.limiter);
        this.limiter.connect(destination);
        
        // Ambience (reverb) - parallel wet/dry mix
        this.clarity.connect(this.ambience);
        this.ambience.connect(this.ambienceFeedback);
        this.ambienceFeedback.connect(this.ambience);
        this.ambience.connect(this.ambienceMix);
        this.ambienceMix.connect(this.limiter);
    }
    
    // Set Bass Boost (0-100)
    setBassBoost(value) {
        this.effects.bassBoost = value;
        // Map 0-100 to 0-15 dB
        const gain = (value / 100) * 15;
        this.bassBoost.gain.value = gain;
    }
    
    // Set Clarity/Treble (0-100)
    setClarity(value) {
        this.effects.clarity = value;
        // Map 0-100 to 0-12 dB
        const gain = (value / 100) * 12;
        this.clarity.gain.value = gain;
    }
    
    // Set Ambience/Reverb (0-100)
    setAmbience(value) {
        this.effects.ambience = value;
        // Map 0-100 to delay time and mix
        const delayTime = (value / 100) * 0.05; // Max 50ms delay
        const mix = (value / 100) * 0.3; // Max 30% wet signal
        const feedback = (value / 100) * 0.4; // Max 40% feedback
        
        this.ambience.delayTime.value = delayTime;
        this.ambienceMix.gain.value = mix;
        this.ambienceFeedback.gain.value = feedback;
    }
    
    // Set Dynamic Boost (0-100)
    setDynamicBoost(value) {
        this.effects.dynamicBoost = value;
        // Map 0-100 to compression ratio and makeup gain
        const ratio = 1 + (value / 100) * 19; // 1:1 to 20:1
        const threshold = -50 + (value / 100) * 30; // -50 to -20 dB
        
        this.compressor.ratio.value = ratio;
        this.compressor.threshold.value = threshold;
    }
    
    // Set Surround Sound (0-100)
    setSurround(value) {
        this.effects.surround = value;
        // Map 0-100 to stereo width
        const width = (value / 100);
        this.surroundGain.gain.value = width;
        this.surroundL.pan.value = -width;
        this.surroundR.pan.value = width;
    }
    
    // Set Fidelity (0-100)
    setFidelity(value) {
        this.effects.fidelity = value;
        // Map 0-100 to frequency cutoff (8kHz to 20kHz)
        const freq = 8000 + (value / 100) * 12000;
        this.fidelityFilter.frequency.value = freq;
    }
    
    // Load preset
    loadPreset(preset) {
        const presets = {
            music: {
                bassBoost: 40,
                clarity: 50,
                ambience: 20,
                dynamicBoost: 30,
                surround: 40,
                fidelity: 100
            },
            cinema: {
                bassBoost: 60,
                clarity: 40,
                ambience: 50,
                dynamicBoost: 50,
                surround: 70,
                fidelity: 90
            },
            gaming: {
                bassBoost: 50,
                clarity: 70,
                ambience: 30,
                dynamicBoost: 60,
                surround: 80,
                fidelity: 100
            },
            voice: {
                bassBoost: 10,
                clarity: 80,
                ambience: 10,
                dynamicBoost: 40,
                surround: 20,
                fidelity: 85
            },
            bass: {
                bassBoost: 80,
                clarity: 30,
                ambience: 20,
                dynamicBoost: 40,
                surround: 50,
                fidelity: 100
            },
            neutral: {
                bassBoost: 0,
                clarity: 0,
                ambience: 0,
                dynamicBoost: 0,
                surround: 0,
                fidelity: 100
            }
        };
        
        const values = presets[preset];
        if (values) {
            this.setBassBoost(values.bassBoost);
            this.setClarity(values.clarity);
            this.setAmbience(values.ambience);
            this.setDynamicBoost(values.dynamicBoost);
            this.setSurround(values.surround);
            this.setFidelity(values.fidelity);
            
            this.effects = {...values};
        }
    }
    
    // Get current settings
    getSettings() {
        return {...this.effects};
    }
}

// Global effects engine
let effectsEngine = null;

// Initialize effects engine
function initAudioEffects() {
    if (visualizer && visualizer.audioContext && !effectsEngine) {
        // Create effects engine
        effectsEngine = new AudioEffectsEngine(
            visualizer.audioContext,
            visualizer.gainNode  // Connect after EQ
        );
        
        // Disconnect gainNode from analyser first
        visualizer.gainNode.disconnect();
        
        // New chain: gainNode -> effects -> analyser -> destination
        effectsEngine.connectChain(visualizer.analyser);
        visualizer.analyser.connect(visualizer.audioContext.destination);
        
        console.log('🎛️ Audio Effects Engine initialized');
        
        // Load default music preset
        setTimeout(() => {
            effectsEngine.loadPreset('music');
            updateEffectSlidersFromEngine();
        }, 100);
    }
}

// Update UI sliders from engine state
function updateEffectSlidersFromEngine() {
    if (!effectsEngine) return;
    
    const settings = effectsEngine.getSettings();
    Object.keys(settings).forEach(key => {
        const sliderMap = {
            'bassBoost': 'bass',
            'clarity': 'clarity',
            'ambience': 'ambience',
            'dynamicBoost': 'dynamic',
            'surround': 'surround',
            'fidelity': 'fidelity'
        };
        
        const sliderId = sliderMap[key];
        if (sliderId) {
            const slider = document.getElementById(`${sliderId}-slider`);
            const value = document.getElementById(`${sliderId}-value`);
            if (slider && value) {
                slider.value = settings[key];
                value.textContent = settings[key];
            }
        }
    });
}

// Update effect sliders
function updateEffectSlider(effect, value) {
    if (!effectsEngine) {
        initAudioEffects();
    }
    
    if (effectsEngine) {
        switch(effect) {
            case 'bass':
                effectsEngine.setBassBoost(value);
                break;
            case 'clarity':
                effectsEngine.setClarity(value);
                break;
            case 'ambience':
                effectsEngine.setAmbience(value);
                break;
            case 'dynamic':
                effectsEngine.setDynamicBoost(value);
                break;
            case 'surround':
                effectsEngine.setSurround(value);
                break;
            case 'fidelity':
                effectsEngine.setFidelity(value);
                break;
        }
        
        // Update display
        document.getElementById(`${effect}-value`).textContent = value;
    }
}

// Load effects preset
function loadEffectsPreset(preset) {
    if (!effectsEngine) {
        initAudioEffects();
    }
    
    if (effectsEngine) {
        effectsEngine.loadPreset(preset);
        
        // Update UI sliders
        const settings = effectsEngine.getSettings();
        document.getElementById('bass-slider').value = settings.bassBoost;
        document.getElementById('bass-value').textContent = settings.bassBoost;
        document.getElementById('clarity-slider').value = settings.clarity;
        document.getElementById('clarity-value').textContent = settings.clarity;
        document.getElementById('ambience-slider').value = settings.ambience;
        document.getElementById('ambience-value').textContent = settings.ambience;
        document.getElementById('dynamic-slider').value = settings.dynamicBoost;
        document.getElementById('dynamic-value').textContent = settings.dynamicBoost;
        document.getElementById('surround-slider').value = settings.surround;
        document.getElementById('surround-value').textContent = settings.surround;
        document.getElementById('fidelity-slider').value = settings.fidelity;
        document.getElementById('fidelity-value').textContent = settings.fidelity;
        
        // Highlight active preset
        document.querySelectorAll('.fx-preset-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
    }
}

// Toggle FX panel
function toggleFXPanel() {
    const panel = document.getElementById('fxPanel');
    panel.classList.toggle('show');
    
    // Initialize effects if not already done
    if (!effectsEngine && panel.classList.contains('show')) {
        initAudioEffects();
    }
}