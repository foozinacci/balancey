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

        // Renderer - optimized for mobile
        const renderer = new THREE.WebGLRenderer({
            antialias: false, // Disable for better mobile performance
            alpha: true,
            powerPreference: 'low-power' // Better battery life on mobile
        });
        renderer.setSize(size.width, size.height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap pixel ratio
        renderer.setClearColor(0x050810, 1);
        container.appendChild(renderer.domElement);

        // Color palette from favicon
        const colors = {
            lime: 0x7fff00,
            magenta: 0xff2d7e,
            silver: 0x8a9bb8,
            gold: 0xc9a050,
        };

        // Create fewer floating geometry for mobile performance
        const meshes: THREE.Mesh[] = [];
        const geometries = [
            new THREE.IcosahedronGeometry(1, 0),
            new THREE.OctahedronGeometry(1, 0),
            new THREE.TetrahedronGeometry(1, 0),
        ];

        const colorValues = [colors.lime, colors.magenta, colors.silver, colors.gold];

        // Fewer shapes for better performance
        const shapeCount = 20;

        for (let i = 0; i < shapeCount; i++) {
            const geometry = geometries[Math.floor(Math.random() * geometries.length)];
            const color = colorValues[Math.floor(Math.random() * colorValues.length)];

            const material = new THREE.MeshBasicMaterial({
                color,
                wireframe: true,
                transparent: true,
                opacity: 0.12 + Math.random() * 0.15,
            });

            const mesh = new THREE.Mesh(geometry, material);

            // Position relative to viewport
            mesh.position.x = (Math.random() - 0.5) * 40;
            mesh.position.y = (Math.random() - 0.5) * 60;
            mesh.position.z = (Math.random() - 0.5) * 20 - 10;

            // Random scale
            const scale = 0.5 + Math.random() * 1.5;
            mesh.scale.set(scale, scale, scale);

            // Store animation data
            mesh.userData = {
                rotationSpeed: {
                    x: (Math.random() - 0.5) * 0.008,
                    y: (Math.random() - 0.5) * 0.008,
                    z: (Math.random() - 0.5) * 0.008,
                },
                floatSpeed: 0.0003 + Math.random() * 0.0006,
                floatOffset: Math.random() * Math.PI * 2,
                originalY: mesh.position.y,
            };

            scene.add(mesh);
            meshes.push(mesh);
        }

        // Animation with throttle for mobile
        let time = 0;
        let lastFrame = 0;
        const targetFPS = 30; // Cap at 30 FPS for mobile
        const frameInterval = 1000 / targetFPS;

        const animate = (currentTime: number) => {
            sceneRef.current!.animationId = requestAnimationFrame(animate);

            const delta = currentTime - lastFrame;
            if (delta < frameInterval) return;

            lastFrame = currentTime - (delta % frameInterval);
            time += 0.016;

            meshes.forEach((mesh) => {
                const { rotationSpeed, floatSpeed, floatOffset, originalY } = mesh.userData;

                mesh.rotation.x += rotationSpeed.x;
                mesh.rotation.y += rotationSpeed.y;
                mesh.rotation.z += rotationSpeed.z;

                // Gentle floating motion
                mesh.position.y = originalY + Math.sin(time * floatSpeed * 100 + floatOffset) * 1.5;
            });

            // Subtle camera movement
            camera.position.x = Math.sin(time * 0.08) * 1.5;
            camera.position.y = Math.cos(time * 0.06) * 0.8;
            camera.lookAt(0, 0, 0);

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
