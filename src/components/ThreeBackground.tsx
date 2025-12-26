import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

// Event system for button pops
const hyperspaceEvents = {
    listeners: [] as ((type: 'pop' | 'success' | 'error') => void)[],
    emit: (type: 'pop' | 'success' | 'error') => {
        hyperspaceEvents.listeners.forEach(fn => fn(type));
    },
    subscribe: (fn: (type: 'pop' | 'success' | 'error') => void) => {
        hyperspaceEvents.listeners.push(fn);
        return () => {
            hyperspaceEvents.listeners = hyperspaceEvents.listeners.filter(l => l !== fn);
        };
    }
};

export const triggerHyperspacePop = (type: 'pop' | 'success' | 'error' = 'pop') => {
    hyperspaceEvents.emit(type);
};

interface HyperspaceProps {
    goalProgress?: number;
    overdueCount?: number;
    goalAmountCents?: number; // 1 symbol per $1 (capped for performance)
    dailyCollectedCents?: number; // Daily collected for green $ particles
    tipsCents?: number; // Gold $ for tips
}

export function ThreeBackground({ goalProgress = 0.5, overdueCount = 0, goalAmountCents = 100000, dailyCollectedCents = 0, tipsCents = 0 }: HyperspaceProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        particles: THREE.Points;
        animationId: number;
        speed: number;
        targetSpeed: number;
    } | null>(null);

    const handlePop = useCallback((type: 'pop' | 'success' | 'error') => {
        if (!sceneRef.current) return;
        sceneRef.current.targetSpeed = type === 'success' ? 4 : type === 'error' ? 0.3 : 2.5;
        setTimeout(() => {
            if (sceneRef.current) sceneRef.current.targetSpeed = 1;
        }, 600);
    }, []);

    useEffect(() => {
        const unsubscribe = hyperspaceEvents.subscribe(handlePop);
        return unsubscribe;
    }, [handlePop]);

    useEffect(() => {
        if (!containerRef.current || sceneRef.current) return;

        const container = containerRef.current;
        const parent = container.parentElement;
        if (!parent) return;

        const getSize = () => ({
            width: parent.clientWidth,
            height: parent.clientHeight,
        });

        const size = getSize();

        // Scene
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, size.width / size.height, 0.1, 2000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({
            antialias: false, // Disable for performance with many particles
            alpha: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(size.width, size.height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x040609, 1);
        container.appendChild(renderer.domElement);

        // Calculate particle count: 1 per $1, capped at 50,000 for performance
        const goalDollars = Math.floor(goalAmountCents / 100);
        const particleCount = Math.min(50000, Math.max(100, goalDollars));

        // Expanded currency/money symbols (16 total for 4x4 atlas)
        const currencySymbols = [
            '$', '€', '£', '¥',      // Major currencies
            '₿', '₹', '₩', '฿',      // Crypto & Asian
            '¢', '₽', '₴', '₺',      // Cent, Ruble, Hryvnia, Lira
            '◈', '◇', '●', '★',      // Geometric accents
        ];

        // Create texture atlas (4x4 grid of symbols)
        const createSymbolAtlas = (): THREE.CanvasTexture => {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d')!;

            ctx.clearRect(0, 0, 256, 256);
            ctx.font = 'bold 48px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 6;

            // Draw each symbol in a 4x4 grid
            for (let i = 0; i < 16; i++) {
                const x = (i % 4) * 64 + 32;
                const y = Math.floor(i / 4) * 64 + 34;
                ctx.fillText(currencySymbols[i], x, y);
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        };

        // Colors based on status
        const statusColors = {
            achieved: new THREE.Color(0x7fff00),    // Lime
            onTrack: new THREE.Color(0xc9a050),     // Gold
            base: new THREE.Color(0x8a9bb8),        // Silver
            behind: new THREE.Color(0xff2d7e),      // Magenta
            overdue: new THREE.Color(0xff4444),     // Red
        };

        // Create geometry for particles
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const speeds = new Float32Array(particleCount);
        const sizes = new Float32Array(particleCount);
        const symbolIndices = new Float32Array(particleCount);

        const tunnelRadius = 30;
        const tunnelDepth = 500;

        // Calculate green portion based on daily collected
        const dailyCollectedDollars = Math.floor(dailyCollectedCents / 100);
        const tipsDollars = Math.floor(tipsCents / 100);
        const greenBoost = Math.min(dailyCollectedDollars / Math.max(1, goalDollars), 0.15);
        const goldBoost = Math.min(tipsDollars / Math.max(1, goalDollars), 0.10);

        // Determine color thresholds based on goal progress
        const achievedThreshold = goalProgress * 0.7 + greenBoost;
        const onTrackThreshold = achievedThreshold + goldBoost; // Gold tips come after green
        const overdueThreshold = Math.min(overdueCount / Math.max(1, goalDollars * 0.01), 0.1);

        for (let i = 0; i < particleCount; i++) {
            // Position in tunnel
            const angle = Math.random() * Math.PI * 2;
            const radius = 2 + Math.random() * tunnelRadius;
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = Math.sin(angle) * radius;
            positions[i * 3 + 2] = -Math.random() * tunnelDepth;

            // Speed variation
            speeds[i] = 0.5 + Math.random() * 1.5;

            // Size variation
            sizes[i] = 2 + Math.random() * 4;

            // Color and symbol based on index and progress
            const ratio = i / particleCount;
            let color: THREE.Color;
            let symbolIdx: number;

            if (ratio < overdueThreshold) {
                color = statusColors.overdue;
                symbolIdx = Math.floor(Math.random() * 16); // Random symbol
            } else if (ratio < achievedThreshold) {
                color = statusColors.achieved;
                symbolIdx = 0; // Always $ for collected/profitable (lime green)
            } else if (ratio < onTrackThreshold) {
                color = statusColors.onTrack;
                symbolIdx = Math.floor(Math.random() * 8); // Currency symbols only
            } else if (ratio < 0.85) {
                color = statusColors.base;
                symbolIdx = Math.floor(Math.random() * 16);
            } else {
                color = statusColors.behind;
                symbolIdx = Math.floor(Math.random() * 16);
            }

            symbolIndices[i] = symbolIdx;
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
        geometry.setAttribute('symbolIndex', new THREE.BufferAttribute(symbolIndices, 1));

        // Custom shader for varied sizes, colors, and symbol selection from atlas
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uSpeed: { value: 1 },
                uTexture: { value: createSymbolAtlas() },
            },
            vertexShader: `
                attribute float size;
                attribute float speed;
                attribute float symbolIndex;
                attribute vec3 color;
                varying vec3 vColor;
                varying float vAlpha;
                varying float vSymbolIndex;
                uniform float uTime;
                uniform float uSpeed;
                
                void main() {
                    vColor = color;
                    vSymbolIndex = symbolIndex;
                    
                    vec3 pos = position;
                    
                    // Move along z axis (toward camera)
                    pos.z = mod(pos.z + uTime * speed * uSpeed * 50.0 + 500.0, 500.0) - 500.0;
                    
                    // Fade based on distance
                    float dist = -pos.z;
                    vAlpha = smoothstep(500.0, 100.0, dist) * smoothstep(0.0, 50.0, dist);
                    
                    // Scale up as approaching
                    float scale = 1.0 + max(0.0, (pos.z + 50.0) / 50.0) * 2.0;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_PointSize = size * scale * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                varying vec3 vColor;
                varying float vAlpha;
                varying float vSymbolIndex;
                
                void main() {
                    // Calculate UV offset for symbol in 4x4 atlas
                    float idx = floor(vSymbolIndex + 0.5);
                    float col = mod(idx, 4.0);
                    float row = floor(idx / 4.0);
                    
                    // Map gl_PointCoord to atlas region
                    vec2 uv = (gl_PointCoord + vec2(col, row)) * 0.25;
                    
                    vec4 texColor = texture2D(uTexture, uv);
                    if (texColor.a < 0.1) discard;
                    
                    gl_FragColor = vec4(vColor * texColor.rgb, texColor.a * vAlpha * 0.8);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const particles = new THREE.Points(geometry, material);
        scene.add(particles);

        // Animation
        let time = 0;
        let speed = 1;
        let targetSpeed = 1;

        const animate = () => {
            sceneRef.current!.animationId = requestAnimationFrame(animate);
            time += 0.016;

            // Smooth speed transition
            speed += (targetSpeed - speed) * 0.05;
            sceneRef.current!.speed = speed;
            sceneRef.current!.targetSpeed = targetSpeed;

            // Update shader uniforms
            material.uniforms.uTime.value = time;
            material.uniforms.uSpeed.value = speed;

            // Subtle camera wobble
            camera.position.x = Math.sin(time * 0.2) * 0.5;
            camera.position.y = Math.cos(time * 0.15) * 0.3;

            renderer.render(scene, camera);
        };

        const animationId = requestAnimationFrame(animate);
        sceneRef.current = { scene, camera, renderer, particles, animationId, speed: 1, targetSpeed: 1 };

        // Resize handler
        const resizeObserver = new ResizeObserver(() => {
            const newSize = getSize();
            camera.aspect = newSize.width / newSize.height;
            camera.updateProjectionMatrix();
            renderer.setSize(newSize.width, newSize.height);
        });

        resizeObserver.observe(parent);

        // Cleanup
        return () => {
            resizeObserver.disconnect();
            if (sceneRef.current) {
                cancelAnimationFrame(sceneRef.current.animationId);
                if (container.contains(renderer.domElement)) {
                    container.removeChild(renderer.domElement);
                }
                geometry.dispose();
                material.dispose();
                (material.uniforms.uTexture.value as THREE.Texture).dispose();
                renderer.dispose();
                sceneRef.current = null;
            }
        };
    }, [goalProgress, overdueCount, goalAmountCents, dailyCollectedCents, tipsCents]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
            }}
        />
    );
}
