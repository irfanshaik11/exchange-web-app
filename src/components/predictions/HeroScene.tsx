import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HeroSceneProps {
  probability: number;
  /** Mutable ref to scroll progress (0-1). Read in animation loop — zero re-renders. */
  scrollRef?: React.MutableRefObject<number>;
}

/**
 * Single smooth torus ring — teal→green gradient, positioned center-right.
 * Scroll makes it tilt, drift upward, and fade slightly.
 */
function Ring({ scrollRef }: { scrollRef?: React.MutableRefObject<number> }) {
  const ref = useRef<THREE.Group>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScroll: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uScroll;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);

          // Teal → green gradient
          vec3 teal = vec3(0.0, 0.3, 0.38);
          vec3 green = vec3(0.29, 0.87, 0.5);
          vec3 cyan = vec3(0.13, 0.83, 0.93);

          float grad = smoothstep(-1.0, 1.0, vWorldPos.y);
          vec3 color = mix(teal, green, grad);
          color += mix(green, cyan, 0.35) * fresnel * 0.3;

          // Fade out as user scrolls — gone by the time cards appear
          float scrollFade = 1.0 - uScroll * 3.0;
          scrollFade = clamp(scrollFade, 0.0, 1.0);
          float alpha = (0.2 + fresnel * 0.25) * scrollFade;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const scroll = scrollRef?.current ?? 0;

    material.uniforms.uTime.value = t;
    material.uniforms.uScroll.value = scroll;

    if (ref.current) {
      // Slow, smooth rotation — no jerky speeds
      ref.current.rotation.x = 0.55 + Math.sin(t * 0.06) * 0.05 + scroll * 0.5;
      ref.current.rotation.y = t * 0.04 + scroll * 0.3;
      ref.current.rotation.z = Math.cos(t * 0.04) * 0.025;

      // Smooth parallax drift upward
      ref.current.position.y = 0.2 - scroll * 2.0;

      // Gentle scale down
      const s = 1.0 - scroll * 0.1;
      ref.current.scale.setScalar(Math.max(s, 0.8));
    }

    if (wireRef.current) {
      wireRef.current.rotation.z = t * 0.03 + scroll * 0.2;
    }
  });

  return (
    <group ref={ref} position={[0.5, 0.2, 0]}>
      {/* Smooth ring — large background presence */}
      <mesh material={material}>
        <torusGeometry args={[1.8, 0.42, 48, 80]} />
      </mesh>

      {/* Wireframe overlay */}
      <mesh ref={wireRef}>
        <torusGeometry args={[1.8, 0.43, 10, 24]} />
        <meshBasicMaterial color="#70E0B0" wireframe transparent opacity={0.04} />
      </mesh>
    </group>
  );
}

export default function HeroScene({ probability, scrollRef }: HeroSceneProps) {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ zIndex: 1 }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 35 }}
        frameloop="always"
        gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
        dpr={1.5}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[4, 3, 5]} intensity={0.5} />
        <pointLight position={[1.5, 0, 3]} intensity={0.3} color="#4ADE80" />

        <Ring scrollRef={scrollRef} />
      </Canvas>
    </div>
  );
}
