import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { colors, radii } from "../theme/tokens";

/**
 * Placeholder 3D mannequin viewer. Real Sur-MeZur avatars would be a
 * MakeHuman/MPFB-generated glTF fitted to the client's measurements (see doc
 * 3/4); since that pipeline isn't wired up here, this renders a procedural
 * body built from the *same measurement numbers* (proportional capsule/limb
 * scaling) tinted by skin tone, with an optional garment "shell" tinted by
 * the selected fabric color. Fully interactive (drag to orbit, scroll to
 * zoom, optional auto-rotate) rather than a static image.
 */
export interface Viewer3DProps {
  skinToneHex?: string;
  garmentColorHex?: string | null;
  measurements?: Record<string, number> | null;
  autoRotate?: boolean;
  height?: number;
}

export function Viewer3D({
  skinToneHex = "#C68863",
  garmentColorHex = null,
  measurements = null,
  autoRotate = true,
  height = 320,
}: Viewer3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f2f8);

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1.1, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 6;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 2.2;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7c3aed, 0.3);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    // Body proportions derived from measurements (cm), falling back to
    // plausible defaults so the viewer works before mesures are ready.
    const heightCm = measurements?.height_total ?? 170;
    const chestCm = measurements?.chest ?? 92;
    const waistCm = measurements?.waist ?? 78;
    const hipsCm = measurements?.hips ?? 96;
    const shoulderCm = measurements?.shoulder ?? 40;

    const scale = heightCm / 170;
    const torsoRadius = (chestCm / (2 * Math.PI)) * 0.028;
    const waistRadius = (waistCm / (2 * Math.PI)) * 0.028;
    const hipRadius = (hipsCm / (2 * Math.PI)) * 0.028;
    const shoulderWidth = (shoulderCm / 100) * 0.9;

    const skinMat = new THREE.MeshStandardMaterial({ color: skinToneHex, roughness: 0.6 });
    const group = new THREE.Group();
    group.scale.setScalar(scale);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), skinMat);
    head.position.y = 1.62;
    group.add(head);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16), skinMat);
    neck.position.y = 1.52;
    group.add(neck);

    // Torso (tapered capsule approximated via lathe-like stacked cylinders)
    const torsoGeo = new THREE.CylinderGeometry(
      Math.max(torsoRadius, 0.14),
      Math.max(waistRadius, 0.12),
      0.55,
      24
    );
    const torso = new THREE.Mesh(torsoGeo, skinMat);
    torso.position.y = 1.2;
    group.add(torso);

    const hips = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.max(waistRadius, 0.12), Math.max(hipRadius, 0.15), 0.22, 24),
      skinMat
    );
    hips.position.y = 0.9;
    group.add(hips);

    // Legs
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.9, 16), skinMat);
      leg.position.set(side * 0.11, 0.35, 0);
      group.add(leg);
    });

    // Arms
    [-1, 1].forEach((side) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.6, 14), skinMat);
      arm.position.set(side * (shoulderWidth / 2 + 0.05), 1.15, 0);
      arm.rotation.z = side * 0.12;
      group.add(arm);
    });

    // Optional garment shell over the torso, tinted by the selected fabric.
    if (garmentColorHex) {
      const garmentMat = new THREE.MeshStandardMaterial({
        color: garmentColorHex,
        roughness: 0.75,
        metalness: 0.05,
      });
      const garment = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(torsoRadius, 0.14) * 1.12, Math.max(hipRadius, 0.15) * 1.1, 0.85, 24, 1, true),
        garmentMat
      );
      garment.position.y = 1.05;
      group.add(garment);
    }

    // Simple ground shadow disc
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 32),
      new THREE.MeshBasicMaterial({ color: 0xe5e1ee, transparent: true, opacity: 0.6 })
    );
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);

    scene.add(group);

    let frameId: number;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [skinToneHex, garmentColorHex, measurements, autoRotate, height]);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height,
        borderRadius: radii.card,
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
        touchAction: "none",
      }}
    />
  );
}
