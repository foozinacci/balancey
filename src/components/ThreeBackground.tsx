import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function ThreeBackground() {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        meshes: THREE.Mesh[];
        animationId: number;
    } | null>(null);

    useEffect(() => {
        if (!containerRef.current || sceneRef.current) return;

        const container = containerRef.current;
        const parent = container.parentElement;
        if (!parent) return;

        // Get dimensions from parent (the mobile container)
        const getSize = () => ({
            width: parent.clientWidth,
            height: parent.clientHeight,
        });

        const size = getSize();

        // Scene setup
        const scene = new THREE.Scene();

        // Camera
        const camera = new THREE.PerspectiveCamera(60, size.width / size.height, 0.1, 1000);
        camera.position.z = 30;

        // Renderer - optimized for S24 Ultra QHD+ display
        const renderer = new THREE.WebGLRenderer({
            antialias: true, // Enable for QHD+ display
            alpha: true,
            powerPreference: 'high-performance' // S24 Ultra can handle it
        });
        renderer.setSize(size.width, size.height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Higher for QHD+
        renderer.setClearColor(0x050810, 1);
        container.appendChild(renderer.domElement);

        // Color palette from favicon
        const colors = {
            lime: 0x7fff00,
            magenta: 0xff2d7e,
            silver: 0x8a9bb8,
            gold: 0xc9a050,
            cyan: 0x00ffff,
        };

        // Create floating geometry with depth layers
        const meshes: THREE.Mesh[] = [];
        const geometries = [
            new THREE.IcosahedronGeometry(1, 1), // More detail
            new THREE.OctahedronGeometry(1, 0),
            new THREE.TetrahedronGeometry(1, 0),
            new THREE.DodecahedronGeometry(0.8, 0),
            new THREE.TorusGeometry(0.5, 0.2, 8, 16),
        ];

        const colorValues = [colors.lime, colors.magenta, colors.silver, colors.gold, colors.cyan];

        // More shapes for S24 Ultra's power
        const shapeCount = 35;

        // Create 3 depth layers
        for (let layer = 0; layer < 3; layer++) {
            const layerZ = -layer * 15 - 5;
            const layerOpacity = 0.25 - layer * 0.06;
            const layerCount = Math.floor(shapeCount / 3);

            for (let i = 0; i < layerCount; i++) {
                const geometry = geometries[Math.floor(Math.random() * geometries.length)];
                const color = colorValues[Math.floor(Math.random() * colorValues.length)];

                const material = new THREE.MeshBasicMaterial({
                    color,
                    wireframe: true,
                    transparent: true,
                    opacity: layerOpacity + Math.random() * 0.1,
                });

                const mesh = new THREE.Mesh(geometry, material);

                // Position in layer
                mesh.position.x = (Math.random() - 0.5) * (50 + layer * 20);
                mesh.position.y = (Math.random() - 0.5) * (70 + layer * 15);
                mesh.position.z = layerZ + (Math.random() - 0.5) * 10;

                // Random scale - larger in back
                const scale = (0.5 + Math.random() * 1.5) * (1 + layer * 0.3);
                mesh.scale.set(scale, scale, scale);

                // Store animation data with pulse info
                mesh.userData = {
                    layer,
                    rotationSpeed: {
                        x: (Math.random() - 0.5) * 0.006,
                        y: (Math.random() - 0.5) * 0.008,
                        z: (Math.random() - 0.5) * 0.004,
                    },
                    floatSpeed: 0.0004 + Math.random() * 0.0008,
                    floatOffset: Math.random() * Math.PI * 2,
                    pulseSpeed: 0.5 + Math.random() * 1,
                    pulseOffset: Math.random() * Math.PI * 2,
                    originalY: mesh.position.y,
                    baseOpacity: layerOpacity + Math.random() * 0.1,
                };

                scene.add(mesh);
                meshes.push(mesh);
            }
        }

        // Animation - 60 FPS for S24 Ultra's 120Hz display
        let time = 0;
        let lastFrame = 0;
        const targetFPS = 60;
        const frameInterval = 1000 / targetFPS;

        const animate = (currentTime: number) => {
            sceneRef.current!.animationId = requestAnimationFrame(animate);

            const delta = currentTime - lastFrame;
            if (delta < frameInterval) return;

            lastFrame = currentTime - (delta % frameInterval);
            time += 0.016;

            meshes.forEach((mesh) => {
                const { rotationSpeed, floatSpeed, floatOffset, originalY, pulseSpeed, pulseOffset, baseOpacity, layer } = mesh.userData;

                mesh.rotation.x += rotationSpeed.x;
                mesh.rotation.y += rotationSpeed.y;
                mesh.rotation.z += rotationSpeed.z;

                // Gentle floating motion - more pronounced for back layers
                const floatAmount = 1.5 + layer * 0.8;
                mesh.position.y = originalY + Math.sin(time * floatSpeed * 100 + floatOffset) * floatAmount;

                // Subtle pulse effect on opacity
                const pulse = Math.sin(time * pulseSpeed + pulseOffset) * 0.03;
                (mesh.material as THREE.MeshBasicMaterial).opacity = baseOpacity + pulse;
            });

            // Dynamic camera movement with parallax depth effect
            camera.position.x = Math.sin(time * 0.1) * 2;
            camera.position.y = Math.cos(time * 0.08) * 1.2;
            camera.position.z = 30 + Math.sin(time * 0.05) * 3;
            camera.lookAt(0, 0, -15);

            renderer.render(scene, camera);
        };

        const animationId = requestAnimationFrame(animate);
        sceneRef.current = { scene, camera, renderer, meshes, animationId };

        // Resize handler - observe parent container
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

                meshes.forEach(mesh => {
                    mesh.geometry.dispose();
                    (mesh.material as THREE.Material).dispose();
                });

                renderer.dispose();
                sceneRef.current = null;
            }
        };
    }, []);

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
