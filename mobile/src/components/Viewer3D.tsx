import { GLView, ExpoWebGLRenderingContext } from "expo-gl";
import React, { useEffect, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import * as THREE from "three";
import { useThemedStyles } from "../theme/ThemeProvider";
import { radii, type ThemeColors } from "../theme/tokens";

function canvasShim(gl: ExpoWebGLRenderingContext) {
  return {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    clientWidth: gl.drawingBufferWidth,
    clientHeight: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
}

export interface Viewer3DProps {
  /** URL du fichier GLB généré par Blender/MPFB. Si fourni, charge ce modèle
   *  au lieu du body procédural. Permet la visualisation 360° via drag. */
  glbUrl?: string | null;
  skinToneHex?: string;
  garmentColorHex?: string | null;
  measurements?: Record<string, number> | null;
  autoRotate?: boolean;
  height?: number;
}

export function Viewer3D({
  glbUrl = null,
  skinToneHex = "#C68863",
  garmentColorHex = null,
  measurements = null,
  autoRotate = true,
  height = 320,
}: Viewer3DProps) {
  const styles = useThemedStyles(makeStyles);
  const groupRef = useRef<THREE.Group | null>(null);
  const dragging = useRef(false);
  const lastDx = useRef(0);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragging.current = true;
        lastDx.current = 0;
      },
      onPanResponderMove: (_evt, gesture) => {
        const group = groupRef.current;
        if (!group) return;
        const delta = gesture.dx - lastDx.current;
        group.rotation.y += delta * 0.01;
        lastDx.current = gesture.dx;
      },
      onPanResponderRelease: () => {
        dragging.current = false;
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
      },
    })
  ).current;

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const width = gl.drawingBufferWidth;
    const heightPx = gl.drawingBufferHeight;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasShim(gl),
      context: gl as unknown as WebGLRenderingContext,
      antialias: true,
    });
    renderer.setSize(width, heightPx, false);
    renderer.setClearColor(0xf4f2f8, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / heightPx, 0.1, 100);
    camera.position.set(0, 1.1, 4.2);
    camera.lookAt(0, 0.9, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7c3aed, 0.3);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    if (glbUrl) {
      // --- Chargement GLB via GLTFLoader ---
      import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
        if (!mountedRef.current) return;
        const loader = new GLTFLoader();
        loader.load(
          glbUrl,
          (gltf) => {
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            const size = box.getSize(new THREE.Vector3());
            if (size.y > 0) {
              const targetHeight = 1.8;
              const s = targetHeight / size.y;
              model.scale.setScalar(s);
            }
            group.add(model);
            const newBox = new THREE.Box3().setFromObject(model);
            const newCenter = newBox.getCenter(new THREE.Vector3());
            camera.lookAt(newCenter);
          },
          undefined,
          (error) => console.error("Erreur chargement GLB:", error)
        );
      });
    } else {
      // --- Fallback : body procédural ---
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
      group.scale.setScalar(scale);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), skinMat);
      head.position.y = 1.62;
      group.add(head);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16), skinMat);
      neck.position.y = 1.52;
      group.add(neck);

      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(torsoRadius, 0.14), Math.max(waistRadius, 0.12), 0.55, 24),
        skinMat
      );
      torso.position.y = 1.2;
      group.add(torso);

      const hips = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(waistRadius, 0.12), Math.max(hipRadius, 0.15), 0.22, 24),
        skinMat
      );
      hips.position.y = 0.9;
      group.add(hips);

      [-1, 1].forEach((side) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.9, 16), skinMat);
        leg.position.set(side * 0.11, 0.35, 0);
        group.add(leg);
      });

      [-1, 1].forEach((side) => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.6, 14), skinMat);
        arm.position.set(side * (shoulderWidth / 2 + 0.05), 1.15, 0);
        arm.rotation.z = side * 0.12;
        group.add(arm);
      });

      if (garmentColorHex) {
        const garmentMat = new THREE.MeshStandardMaterial({
          color: garmentColorHex,
          roughness: 0.75,
          metalness: 0.05,
        });
        const garment = new THREE.Mesh(
          new THREE.CylinderGeometry(
            Math.max(torsoRadius, 0.14) * 1.12,
            Math.max(hipRadius, 0.15) * 1.1,
            0.85,
            24,
            1,
            true
          ),
          garmentMat
        );
        garment.position.y = 1.05;
        group.add(garment);
      }

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(0.9, 32),
        new THREE.MeshBasicMaterial({ color: 0xe5e1ee, transparent: true, opacity: 0.6 })
      );
      ground.rotation.x = -Math.PI / 2;
      group.add(ground);
    }

    const render = () => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(render);
      if (autoRotate && !dragging.current) {
        group.rotation.y += 0.006;
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  };

  return (
    <View style={[styles.wrap, { height }]} {...panResponder.panHandlers}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: radii.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
