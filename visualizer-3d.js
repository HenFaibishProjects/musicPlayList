// 3D Audio Visualizer with Spaceships and Particles
let scene3D, camera3D, renderer3D, spaceship, starField, audioSphere;
let particleSystem, glowRings;
let visualizer3DActive = false;
let animationFrame3D = null;

// Initialize 3D Visualizer
function init3DVisualizer() {
    const canvas = document.getElementById('visualizerCanvas');
    if (!canvas) return;
    
    // Create scene
    scene3D = new THREE.Scene();
    scene3D.fog = new THREE.FogExp2(0x000000, 0.0008);
    
    // Create camera
    camera3D = new THREE.PerspectiveCamera(
        75,
        canvas.width / canvas.height,
        0.1,
        1000
    );
    camera3D.position.z = 30;
    
    // Create renderer
    renderer3D = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });
    renderer3D.setSize(canvas.width, canvas.height);
    renderer3D.setClearColor(0x0a0e1a, 0.8);
    
    // Create spaceship
    createSpaceship();
    
    // Create star field
    createStarField();
    
    // Create audio-reactive sphere
    createAudioSphere();
    
    // Create particle systems
    createParticleSystems();
    
    // Create glow rings
    createGlowRings();
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0x60a5fa, 0.5);
    scene3D.add(ambientLight);
    
    const pointLight1 = new THREE.PointLight(0xc084fc, 2, 100);
    pointLight1.position.set(10, 10, 10);
    scene3D.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0x22d3ee, 2, 100);
    pointLight2.position.set(-10, -10, 10);
    scene3D.add(pointLight2);
    
    visualizer3DActive = true;
    animate3DVisualizer();
}

function createSpaceship() {
    // Create spaceship group
    const shipGroup = new THREE.Group();
    
    // Main body (fuselage)
    const bodyGeometry = new THREE.ConeGeometry(1.5, 6, 8);
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0x60a5fa,
        emissive: 0x60a5fa,
        emissiveIntensity: 0.3,
        shininess: 100,
        specular: 0xffffff
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI;
    shipGroup.add(body);
    
    // Wings
    const wingGeometry = new THREE.BoxGeometry(8, 0.2, 3);
    const wingMaterial = new THREE.MeshPhongMaterial({
        color: 0xc084fc,
        emissive: 0xc084fc,
        emissiveIntensity: 0.2
    });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    wings.position.y = -1;
    shipGroup.add(wings);
    
    // Cockpit
    const cockpitGeometry = new THREE.SphereGeometry(0.8, 16, 16);
    const cockpitMaterial = new THREE.MeshPhongMaterial({
        color: 0x22d3ee,
        emissive: 0x22d3ee,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.y = 2;
    shipGroup.add(cockpit);
    
    // Engine glow (back of ship)
    const engineGeometry = new THREE.CylinderGeometry(0.5, 0.8, 1.5, 16);
    const engineMaterial = new THREE.MeshPhongMaterial({
        color: 0xf472b6,
        emissive: 0xf472b6,
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.9
    });
    const engine = new THREE.Mesh(engineGeometry, engineMaterial);
    engine.position.y = -4;
    shipGroup.add(engine);
    
    spaceship = shipGroup;
    spaceship.position.set(0, 0, 10);
    scene3D.add(spaceship);
}

function createStarField() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
        
        // Random star colors (blue, cyan, purple, pink)
        const colorChoice = Math.random();
        if (colorChoice < 0.25) {
            colors[i * 3] = 0.38; colors[i * 3 + 1] = 0.65; colors[i * 3 + 2] = 0.98; // Blue
        } else if (colorChoice < 0.5) {
            colors[i * 3] = 0.13; colors[i * 3 + 1] = 0.83; colors[i * 3 + 2] = 0.93; // Cyan
        } else if (colorChoice < 0.75) {
            colors[i * 3] = 0.75; colors[i * 3 + 1] = 0.52; colors[i * 3 + 2] = 0.99; // Purple
        } else {
            colors[i * 3] = 0.96; colors[i * 3 + 1] = 0.45; colors[i * 3 + 2] = 0.71; // Pink
        }
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const starMaterial = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    
    starField = new THREE.Points(starGeometry, starMaterial);
    scene3D.add(starField);
}

function createAudioSphere() {
    const geometry = new THREE.IcosahedronGeometry(5, 4);
    const material = new THREE.MeshPhongMaterial({
        color: 0x60a5fa,
        emissive: 0x60a5fa,
        emissiveIntensity: 0.5,
        wireframe: true,
        transparent: true,
        opacity: 0.6
    });
    
    audioSphere = new THREE.Mesh(geometry, material);
    audioSphere.position.set(0, 0, 0);
    scene3D.add(audioSphere);
}

function createParticleSystems() {
    const particleCount = 500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
        const radius = 15 + Math.random() * 10;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);
        
        const colorChoice = Math.random();
        if (colorChoice < 0.33) {
            colors[i * 3] = 0.38; colors[i * 3 + 1] = 0.65; colors[i * 3 + 2] = 0.98;
        } else if (colorChoice < 0.66) {
            colors[i * 3] = 0.75; colors[i * 3 + 1] = 0.52; colors[i * 3 + 2] = 0.99;
        } else {
            colors[i * 3] = 0.96; colors[i * 3 + 1] = 0.45; colors[i * 3 + 2] = 0.71;
        }
        
        sizes[i] = Math.random() * 2 + 0.5;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });
    
    particleSystem = new THREE.Points(geometry, material);
    scene3D.add(particleSystem);
}

function createGlowRings() {
    glowRings = new THREE.Group();
    
    for (let i = 0; i < 3; i++) {
        const ringGeometry = new THREE.TorusGeometry(8 + i * 3, 0.1, 16, 100);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: i === 0 ? 0x60a5fa : i === 1 ? 0xc084fc : 0xf472b6,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        glowRings.add(ring);
    }
    
    scene3D.add(glowRings);
}

function animate3DVisualizer() {
    if (!visualizer3DActive) return;
    
    animationFrame3D = requestAnimationFrame(animate3DVisualizer);
    
    const time = Date.now() * 0.001;
    
    // Get audio data
    let audioIntensity = 0.5;
    let bassIntensity = 0.5;

    const activeAnalyser =
        (typeof visualizer !== 'undefined' && visualizer && visualizer.analyser)
            ? visualizer.analyser
            : ((typeof analyser !== 'undefined' && analyser) ? analyser : null);

    if (activeAnalyser) {
        const dataArray = new Uint8Array(activeAnalyser.frequencyBinCount);
        activeAnalyser.getByteFrequencyData(dataArray);
        
        // Calculate average intensity
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        audioIntensity = sum / (dataArray.length * 255);
        
        // Bass intensity (low frequencies)
        let bassSum = 0;
        for (let i = 0; i < dataArray.length / 4; i++) {
            bassSum += dataArray[i];
        }
        bassIntensity = bassSum / ((dataArray.length / 4) * 255);
    }
    
    // Rotate star field
    if (starField) {
        starField.rotation.y += 0.0002;
        starField.rotation.x += 0.0001;
    }
    
    // Animate spaceship
    if (spaceship) {
        spaceship.rotation.y += 0.01;
        spaceship.position.y = Math.sin(time * 0.5) * 2;
        spaceship.position.x = Math.cos(time * 0.3) * 3;
        
        // Pulse with bass
        const scale = 1 + bassIntensity * 0.3;
        spaceship.scale.set(scale, scale, scale);
        
        // Update engine glow based on audio
        const engine = spaceship.children[3];
        if (engine && engine.material) {
            engine.material.emissiveIntensity = 0.5 + bassIntensity * 1.5;
        }
    }
    
    // Animate audio sphere
    if (audioSphere) {
        audioSphere.rotation.x += 0.005;
        audioSphere.rotation.y += 0.007;
        
        // React to audio
        const sphereScale = 1 + audioIntensity * 0.8;
        audioSphere.scale.set(sphereScale, sphereScale, sphereScale);
        
        // Change opacity with audio
        if (audioSphere.material) {
            audioSphere.material.opacity = 0.3 + audioIntensity * 0.5;
            audioSphere.material.emissiveIntensity = 0.2 + audioIntensity;
        }
    }
    
    // Animate particles
    if (particleSystem) {
        particleSystem.rotation.y += 0.002;
        
        const positions = particleSystem.geometry.attributes.position.array;
        const sizes = particleSystem.geometry.attributes.size.array;
        
        for (let i = 0; i < positions.length; i += 3) {
            // Orbital motion
            const idx = i / 3;
            const radius = Math.sqrt(positions[i] ** 2 + positions[i + 1] ** 2 + positions[i + 2] ** 2);
            const angle = Math.atan2(positions[i + 1], positions[i]) + 0.01;
            
            positions[i] = radius * Math.cos(angle);
            positions[i + 1] = radius * Math.sin(angle);
            
            // Pulse size with audio
            sizes[idx] = (0.5 + Math.random() * 1.5) * (1 + audioIntensity);
        }
        
        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleSystem.geometry.attributes.size.needsUpdate = true;
    }
    
    // Animate glow rings
    if (glowRings) {
        glowRings.rotation.z += 0.005;
        
        glowRings.children.forEach((ring, index) => {
            ring.rotation.y = time * (0.5 + index * 0.2);
            ring.scale.set(
                1 + audioIntensity * 0.3,
                1 + audioIntensity * 0.3,
                1
            );
            
            if (ring.material) {
                ring.material.opacity = 0.2 + audioIntensity * 0.4;
            }
        });
    }
    
    // Camera movement
    camera3D.position.x = Math.sin(time * 0.2) * 5;
    camera3D.position.y = Math.cos(time * 0.15) * 3;
    camera3D.lookAt(0, 0, 0);
    
    // Render
    renderer3D.render(scene3D, camera3D);
}

function stop3DVisualizer() {
    visualizer3DActive = false;
    if (animationFrame3D) {
        cancelAnimationFrame(animationFrame3D);
        animationFrame3D = null;
    }
}

function resize3DVisualizer(width, height) {
    if (!camera3D || !renderer3D) return;
    
    camera3D.aspect = width / height;
    camera3D.updateProjectionMatrix();
    renderer3D.setSize(width, height);
}

// Export functions
window.init3DVisualizer = init3DVisualizer;
window.start3DVisualizer = init3DVisualizer;
window.stop3DVisualizer = stop3DVisualizer;
window.resize3DVisualizer = resize3DVisualizer;