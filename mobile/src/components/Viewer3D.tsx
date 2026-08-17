import { Asset } from "expo-asset";
import { GLView, ExpoWebGLRenderingContext } from "expo-gl";
import React, { useEffect, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import * as THREE from "three";
import { authHeaders } from "../api/client";
import { useThemedStyles } from "../theme/ThemeProvider";
import { radii, type ThemeColors } from "../theme/tokens";

// Maillages de base (un par sexe), embarqués dans l'app — voir
// backend/app/services/avatar/export_base_mesh.py, qui les produit une fois
// pour toutes avec tous les axes de morphologie comme morph targets glTF.
// `require()` doit rester statique pour que Metro les traite comme assets
// (voir metro.config.js, qui ajoute .glb à assetExts).
const BASE_MESHES = {
  male: require("../../assets/avatar-base-male.glb"),
  female: require("../../assets/avatar-base-female.glb"),
} as const;

export interface AvatarMorphology {
  gender: "male" | "female";
  height_cm: number;
  /** Hauteur ESTIMÉE du maillage une fois `weights` appliqué — pas la
   *  hauteur du maillage neutre, voir morph_weights.py côté backend. */
  reference_height_cm: number;
  /** Nom du morph target (ex. "measure-waist-circ-incr") -> influence [0, 1]. */
  weights: Record<string, number>;
}

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
  /** Poids de morph targets calculés côté serveur (voir AvatarMorphology
   *  ci-dessus) — chemin normal depuis que la génération ne passe plus par
   *  Blender en production. Prioritaire sur `glbUrl` si les deux sont fournis. */
  avatarMorphology?: AvatarMorphology | null;
  /** URL d'un GLB déjà entièrement généré (ancien pipeline, un fichier par
   *  client). Conservé pour les avatars créés avant `avatarMorphology`. */
  glbUrl?: string | null;
  skinToneHex?: string;
  garmentColorHex?: string | null;
  measurements?: Record<string, number> | null;
  /** Uniquement utilisé par le corps procédural (repli sans GLB) — les
   *  proportions par défaut (épaules/hanches) étaient celles d'un gabarit
   *  unique quel que soit le sexe du client. */
  gender?: string | null;
  autoRotate?: boolean;
  height?: number;
  /** Appelé quand le modèle 3D est réellement rendu dans la scène (après
   *  téléchargement GLB + application morph targets). Utilisé par le parent
   *  pour coordonner l'affichage du spinner de chargement. */
  onReady?: () => void;
  /** Appelé si le chargement/traitement du modèle échoue — distinct de
   *  onReady pour que le parent puisse afficher une vraie erreur au lieu de
   *  montrer les actions "prêt" sur une scène restée vide. */
  onError?: (error: unknown) => void;
}

export function Viewer3D({
  avatarMorphology = null,
  glbUrl = null,
  skinToneHex = "#C68863",
  garmentColorHex = null,
  measurements = null,
  gender = null,
  autoRotate = true,
  height = 320,
  onReady,
  onError,
}: Viewer3DProps) {
  const styles = useThemedStyles(makeStyles);
  const groupRef = useRef<THREE.Group | null>(null);
  const dragging = useRef(false);
  const lastDx = useRef(0);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const skinMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const skinToneHexRef = useRef(skinToneHex);
  skinToneHexRef.current = skinToneHex;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      skinMaterialsRef.current = [];
      // Le renderer WebGL garde géométries, matériaux et programmes shader en
      // mémoire GPU tant qu'on ne les libère pas explicitement — React ne le
      // fait pas pour nous. Sans ça, chaque aller-retour sur un écran avec
      // avatar (essayage, configurateur...) laissait un contexte GL derrière
      // lui, jamais récupéré.
      sceneRef.current?.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      rendererRef.current?.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // B1: Réactivité du sélecteur de teint — mettre à jour les matériaux peau
  // déjà en scène quand skinToneHex change (la closure de onContextCreate ne
  // se relance pas sur un changement de props).
  useEffect(() => {
    skinMaterialsRef.current.forEach((m) => m.color.set(skinToneHex));
  }, [skinToneHex]);

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
    // Si le contexte GL est recréé (resize, background/foreground), disposer
    // les anciens objets pour éviter les fuites GPU.
    if (rendererRef.current || sceneRef.current) {
      skinMaterialsRef.current = [];
      sceneRef.current?.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      rendererRef.current?.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
    }

    const width = gl.drawingBufferWidth;
    const heightPx = gl.drawingBufferHeight;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasShim(gl),
      context: gl as unknown as WebGLRenderingContext,
      antialias: false,
    });
    renderer.setSize(width, heightPx, false);
    renderer.setClearColor(0xf4f2f8, 1);
    rendererRef.current = renderer;
    console.log("[Viewer3D] WebGL2:", renderer.capabilities.isWebGL2);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
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

    if (avatarMorphology) {
      // --- Maillage de base embarqué, déformé par morph targets ---
      // Contrairement au chemin `glbUrl` ci-dessous, ce fichier est local
      // (require() + expo-asset) : pas de requête réseau, pas d'en-tête
      // d'authentification, et surtout aucun Blender à faire tourner côté
      // serveur — voir morph_weights.py.
      const asset = Asset.fromModule(BASE_MESHES[avatarMorphology.gender]);
      Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        asset.downloadAsync(),
      ]).then(([{ GLTFLoader }]) => {
        if (!mountedRef.current || !asset.localUri) return;
        const loader = new GLTFLoader();
        loader.load(
          asset.localUri,
          (gltf) => {
            if (!mountedRef.current) return;
            try {
              const model = gltf.scene;

              model.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
                for (const [name, weight] of Object.entries(avatarMorphology.weights)) {
                  const idx = mesh.morphTargetDictionary[name];
                  if (idx !== undefined) mesh.morphTargetInfluences[idx] = weight;
                }
                const material = mesh.material as THREE.MeshStandardMaterial | undefined;
                if (material?.color) {
                  material.color.set(skinToneHexRef.current);
                  skinMaterialsRef.current.push(material);
                }
              });

              // Mise à l'échelle par la taille réelle. `reference_height_cm`
              // est une ESTIMATION de la hauteur du maillage une fois les
              // morph targets appliqués (pas la hauteur du maillage neutre) —
              // voir target_map.estimate_reference_height_cm côté backend :
              // diviser par la hauteur neutre reproduirait l'erreur de
              // plusieurs cm déjà documentée dans generator.py::_apply_height.
              const scaleFactor = avatarMorphology.height_cm / Math.max(avatarMorphology.reference_height_cm, 0.01);
              model.scale.setScalar(scaleFactor);

              const box = new THREE.Box3().setFromObject(model);
              const center = box.getCenter(new THREE.Vector3());
              model.position.x -= center.x;
              model.position.z -= center.z;
              group.add(model);
              const size = box.getSize(new THREE.Vector3());
              const focusY = Math.min(size.y, 1.8) * 0.55;
              camera.lookAt(0, focusY, 0);

              if (garmentColorHex) {
                const garmentMat = new THREE.MeshStandardMaterial({
                  color: garmentColorHex,
                  roughness: 0.75,
                  metalness: 0.05,
                });
                const torsoRadius = Math.max(size.x, size.z) * 0.32;
                const garment = new THREE.Mesh(
                  new THREE.CylinderGeometry(torsoRadius, torsoRadius * 0.92, size.y * 0.32, 24, 1, true),
                  garmentMat
                );
                garment.position.y = size.y * 0.62;
                group.add(garment);
              }
              onReadyRef.current?.();
            } catch (error) {
              console.error("[Viewer3D] Erreur post-chargement (morphology):", error);
              onErrorRef.current?.(error);
            }
          },
          undefined,
          (error) => {
            console.error("Base mesh load error:", error);
            onErrorRef.current?.(error);
          }
        );
      }).catch((error) => {
        console.error("[Viewer3D] Erreur chargement asset:", error);
        onErrorRef.current?.(error);
      });
    } else if (glbUrl) {
      // --- Chargement GLB via GLTFLoader ---
      // `glbUrl` pointe vers /api/avatars/{id}/glb, une route authentifiée
      // (voir avatarMeshUrl dans api/client.ts) : sans l'en-tête Authorization,
      // le serveur répond 401 et le modèle ne charge jamais. GLTFLoader fait
      // sa propre requête réseau, hors du client `api.*` qui l'ajoute
      // automatiquement ailleurs — il faut donc le faire ici explicitement.
      Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        authHeaders(),
      ]).then(([{ GLTFLoader }, headers]) => {
        if (!mountedRef.current) return;
        const loader = new GLTFLoader();
        loader.setRequestHeader(headers);
        loader.load(
          glbUrl,
          (gltf) => {
            if (!mountedRef.current) return;
            try {
              const model = gltf.scene;
              const box = new THREE.Box3().setFromObject(model);
              const center = box.getCenter(new THREE.Vector3());
              // Recentre seulement horizontalement : le générateur Blender
              // exporte l'avatar pieds au sol (y=0), et un précédent recentrage
              // vertical + une mise à l'échelle fixe à 1,80 m écrasaient la
              // taille réelle du sujet — un avatar de 1,55 m et un de 1,85 m
              // rendaient identiques. Voir generator.py::_apply_height, qui
              // calcule désormais cette hauteur au centimètre près.
              model.position.x -= center.x;
              model.position.z -= center.z;

              // B1: collecter les matériaux peau pour mise à jour réactive
              model.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                const material = mesh.material as THREE.MeshStandardMaterial | undefined;
                if (material?.color) {
                  material.color.set(skinToneHexRef.current);
                  skinMaterialsRef.current.push(material);
                }
              });

              group.add(model);
              const size = box.getSize(new THREE.Vector3());
              const focusY = Math.min(size.y, 1.8) * 0.55;
              camera.lookAt(0, focusY, 0);

              // Le GLB exporté par generator.py est le corps seul, sans
              // géométrie de vêtement à teinter directement (voir
              // generator.py::_export_glb) : sans ce recouvrement, choisir un
              // tissu n'avait aucun effet visible sur un avatar réel — seul le
              // corps procédural (repli sans GLB) réagissait à cette prop.
              if (garmentColorHex) {
                const garmentMat = new THREE.MeshStandardMaterial({
                  color: garmentColorHex,
                  roughness: 0.75,
                  metalness: 0.05,
                });
                const torsoRadius = Math.max(size.x, size.z) * 0.32;
                const garment = new THREE.Mesh(
                  new THREE.CylinderGeometry(torsoRadius, torsoRadius * 0.92, size.y * 0.32, 24, 1, true),
                  garmentMat
                );
                garment.position.y = size.y * 0.62;
                group.add(garment);
              }
              onReadyRef.current?.();
            } catch (error) {
              console.error("[Viewer3D] Erreur post-chargement (glbUrl):", error);
              onErrorRef.current?.(error);
            }
          },
          undefined,
          (error) => {
            console.error("GLB load error:", error);
            onErrorRef.current?.(error);
          }
        );
      }).catch((error) => {
        console.error("[Viewer3D] Erreur chargement GLB:", error);
        onErrorRef.current?.(error);
      });
    } else {
      // --- Fallback : body procédural ---
      const heightCm = measurements?.height_total ?? 170;
      const chestCm = measurements?.chest ?? 92;
      const waistCm = measurements?.waist ?? 78;
      const hipsCm = measurements?.hips ?? 96;
      const shoulderCm = measurements?.shoulder ?? 40;

      // Sans mensuration détaillée à disposition (repli le plus dégradé), le
      // sexe reste le seul signal pour ne pas rendre le même gabarit à
      // tout le monde : hanches un peu plus marquées et épaules un peu
      // moins larges au féminin, l'inverse au masculin.
      const feminine = (gender || "").toLowerCase().startsWith("f");
      const hipFactor = feminine ? 1.08 : 0.96;
      const shoulderFactor = feminine ? 0.94 : 1.06;

      const scale = heightCm / 170;
      const torsoRadius = (chestCm / (2 * Math.PI)) * 0.028;
      const waistRadius = (waistCm / (2 * Math.PI)) * 0.028;
      const hipRadius = (hipsCm / (2 * Math.PI)) * 0.028 * hipFactor;
      const shoulderWidth = (shoulderCm / 100) * 0.9 * shoulderFactor;

      const skinMat = new THREE.MeshStandardMaterial({ color: skinToneHex, roughness: 0.6 });
      skinMaterialsRef.current.push(skinMat);
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
      onReadyRef.current?.();
    }

    const render = () => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(render);
      if (autoRotate && !dragging.current) {
        group.rotation.y += 0.006;
      }
      try {
        renderer.render(scene, camera);
      } catch {
        // WebGL context loss — arrêter la boucle de rendu
        console.warn("[Viewer3D] WebGL context lost");
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        return;
      }
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
