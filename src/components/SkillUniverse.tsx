import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PerformanceMode, SkillNode, SkillUniverseResponse } from '../types';

interface HoverState {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface SkillUniverseProps {
  universe: SkillUniverseResponse;
  selectedSkillId: string | null;
  focusVersion: number;
  performanceMode: PerformanceMode;
  activeRouteSkillIds: string[];
  activeClusterIds: Set<string>;
  onSelectSkill: (skillId: string) => void;
}

interface SceneState {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  routeGroup: THREE.Group;
  skillObjects: Map<string, THREE.Group>;
  clusterObjects: Map<string, THREE.Group>;
  pickable: THREE.Object3D[];
  starField: THREE.Points;
  targetPosition: THREE.Vector3;
  cameraTargetPosition: THREE.Vector3;
  cameraFlightFrames: number;
}

const PERFORMANCE_SETTINGS: Record<PerformanceMode, {
  pixelRatio: number;
  fps: number;
  starCount: number;
  starOpacity: number;
  nebulaScale: number;
  autoRotateSpeed: number;
  detail: 'high' | 'medium' | 'low';
}> = {
  quality: {
    pixelRatio: 1.8,
    fps: 60,
    starCount: 1300,
    starOpacity: 0.78,
    nebulaScale: 1.15,
    autoRotateSpeed: 0.22,
    detail: 'high'
  },
  balanced: {
    pixelRatio: 1.5,
    fps: 45,
    starCount: 950,
    starOpacity: 0.72,
    nebulaScale: 1,
    autoRotateSpeed: 0.18,
    detail: 'medium'
  },
  battery: {
    pixelRatio: 1,
    fps: 24,
    starCount: 360,
    starOpacity: 0.45,
    nebulaScale: 0.28,
    autoRotateSpeed: 0.04,
    detail: 'low'
  }
};

function colorWithAlpha(hex: string, alpha: number) {
  const color = new THREE.Color(hex);
  return new THREE.Color(color.r * alpha, color.g * alpha, color.b * alpha);
}

function seededUnit(text: string, salt: number) {
  let hash = 2166136261 + salt;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function createStarField(count: number, radius: number, opacity: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = ['#f6f0df', '#95fff0', '#ffcf76', '#fa83a0', '#a88bff'];

  for (let index = 0; index < count; index += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const distance = radius * (0.45 + Math.random() * 0.55);
    const color = new THREE.Color(palette[index % palette.length]);

    positions[index * 3] = Math.sin(phi) * Math.cos(theta) * distance;
    positions[index * 3 + 1] = Math.cos(phi) * distance * 0.42;
    positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * distance;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity,
      sizeAttenuation: true
    })
  );
}

function createNebula(center: [number, number, number], color: string, count: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);

  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 1.5 + Math.random() * 4.5;
    const height = (Math.random() - 0.5) * 2.5;
    positions[index * 3] = center[0] + Math.cos(angle) * distance;
    positions[index * 3 + 1] = center[1] + height;
    positions[index * 3 + 2] = center[2] + Math.sin(angle) * distance;
    colors[index * 3] = base.r;
    colors[index * 3 + 1] = base.g;
    colors[index * 3 + 2] = base.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    })
  );
}

function registerSkillMaterial(material: THREE.Material, baseOpacity: number, activeOpacity?: number) {
  material.userData.baseOpacity = baseOpacity;
  material.userData.activeOpacity = activeOpacity ?? Math.min(1, baseOpacity * 1.8);
}

function createSkillObject(skill: SkillNode, detail: 'high' | 'medium' | 'low') {
  const group = new THREE.Group();
  group.position.set(skill.position[0], skill.position[1], skill.position[2]);
  group.userData = {
    skillId: skill.id,
    baseY: skill.position[1],
    active: false
  };

  const color = new THREE.Color(skill.color);
  const pearl = new THREE.Color('#fff0cf').lerp(color, 0.48);
  const seed = seededUnit(skill.id, 7);
  const healthColor =
    skill.health?.level === 'risk'
      ? '#ff8a65'
      : skill.health?.level === 'watch'
        ? '#f2c14e'
        : '#88ffe1';

  if (detail !== 'low') {
    const glowMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: detail === 'high' ? 0.1 : 0.085,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    registerSkillMaterial(glowMaterial, detail === 'high' ? 0.1 : 0.085, 0.18);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(skill.radius * 1.86, detail === 'high' ? 28 : 20, detail === 'high' ? 28 : 20), glowMaterial);
    glow.userData = { skillId: skill.id };
    group.add(glow);
  }

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.34,
    metalness: 0.24,
    clearcoat: 0.68,
    clearcoatRoughness: 0.24,
    emissive: colorWithAlpha(skill.color, 0.34),
    emissiveIntensity: 0.34
  });
  bodyMaterial.userData.baseEmissiveIntensity = 0.34;
  bodyMaterial.userData.activeEmissiveIntensity = 0.78;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(skill.radius, detail === 'low' ? 1 : 2), bodyMaterial);
  body.rotation.set(seed * 0.9, seed * 1.7, seed * 0.6);
  body.userData = { skillId: skill.id };
  group.add(body);

  if (detail !== 'low') {
    const latticeMaterial = new THREE.MeshBasicMaterial({
      color: pearl,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending
    });
    registerSkillMaterial(latticeMaterial, 0.16, 0.38);
    const lattice = new THREE.Mesh(new THREE.DodecahedronGeometry(skill.radius * 1.18, 0), latticeMaterial);
    lattice.rotation.set(seed * Math.PI, seed * Math.PI * 0.7, seed * Math.PI * 1.4);
    lattice.userData = { skillId: skill.id };
    group.add(lattice);
  }

  const healthRingMaterial = new THREE.MeshBasicMaterial({
    color: healthColor,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending
  });
  registerSkillMaterial(healthRingMaterial, 0.34, 0.86);
  const healthRing = new THREE.Mesh(new THREE.TorusGeometry(skill.radius * 1.38, 0.015, 8, 96), healthRingMaterial);
  healthRing.rotation.x = Math.PI / 2.6;
  healthRing.rotation.z = seed * Math.PI;
  healthRing.userData = { skillId: skill.id };
  group.add(healthRing);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(skill.radius * 0.34, 14, 14),
    new THREE.MeshStandardMaterial({
      color: pearl,
      emissive: color,
      emissiveIntensity: 0.28,
      roughness: 0.24,
      metalness: 0.34
    })
  );
  (cap.material as THREE.MeshStandardMaterial).userData.baseEmissiveIntensity = 0.28;
  (cap.material as THREE.MeshStandardMaterial).userData.activeEmissiveIntensity = 0.5;
  cap.position.set(skill.radius * -0.28, skill.radius * 0.42, skill.radius * 0.5);
  cap.userData = { skillId: skill.id };
  group.add(cap);

  const ringCount =
    (skill.resources.scripts.length ? 1 : 0) +
    (skill.resources.references.length ? 1 : 0) +
    (skill.resources.assets.length ? 1 : 0);

  const visibleRingCount = detail === 'low' ? Math.min(1, ringCount) : Math.max(1, ringCount);
  for (let index = 0; index < visibleRingCount; index += 1) {
    const ringRadius = skill.radius * (1.46 + index * 0.28);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: index % 2 ? pearl : color,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending
    });
    registerSkillMaterial(ringMaterial, 0.42, 0.82);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.019, 8, 96), ringMaterial);
    ring.rotation.x = Math.PI / 2 + index * 0.38;
    ring.rotation.y = index * 0.55;
    ring.userData = { skillId: skill.id };
    group.add(ring);

    const nodeCount = detail === 'low' ? 0 : 2 + ((skill.triggerTerms.length + index) % 4);
    for (let node = 0; node < nodeCount; node += 1) {
      const angle = (node / nodeCount) * Math.PI * 2 + seed * Math.PI;
      const beadMaterial = new THREE.MeshBasicMaterial({
        color: node % 2 ? '#fff0cf' : skill.color,
        transparent: true,
        opacity: 0.72
      });
      registerSkillMaterial(beadMaterial, 0.72, 0.95);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(skill.radius * 0.085, 10, 10), beadMaterial);
      bead.position.set(Math.cos(angle) * ringRadius, Math.sin(angle) * 0.18, Math.sin(angle) * ringRadius);
      bead.rotation.copy(ring.rotation);
      bead.userData = { skillId: skill.id };
      group.add(bead);
    }
  }

  const moduleCount = skill.source === 'plugin' ? 3 : Math.min(2, skill.resources.scripts.length + skill.resources.references.length);
  for (let index = 0; index < moduleCount; index += 1) {
    const angle = seed * Math.PI * 2 + index * ((Math.PI * 2) / Math.max(1, moduleCount));
    const moduleMaterial = new THREE.MeshStandardMaterial({
      color: pearl,
      emissive: color,
      emissiveIntensity: 0.26,
      roughness: 0.3,
      metalness: 0.42,
      transparent: true,
      opacity: 0.84
    });
    registerSkillMaterial(moduleMaterial, 0.84, 0.94);
    moduleMaterial.userData.baseEmissiveIntensity = 0.26;
    moduleMaterial.userData.activeEmissiveIntensity = 0.44;
    const module = new THREE.Mesh(new THREE.BoxGeometry(skill.radius * 0.54, skill.radius * 0.18, skill.radius * 0.26), moduleMaterial);
    module.position.set(Math.cos(angle) * skill.radius * 1.56, skill.radius * (0.08 + index * 0.12), Math.sin(angle) * skill.radius * 1.56);
    module.lookAt(0, 0, 0);
    module.userData = { skillId: skill.id };
    group.add(module);
  }

  return group;
}

function createClusterObject(cluster: SkillUniverseResponse['clusters'][number], nebulaScale: number) {
  const group = new THREE.Group();
  group.userData = { clusterId: cluster.id };
  const nebulaCount = Math.round(Math.min(110, Math.max(28, cluster.skillIds.length * 9)) * nebulaScale);
  if (nebulaCount > 0) group.add(createNebula(cluster.position, cluster.color, nebulaCount));

  const beacon = new THREE.Mesh(
    new THREE.TorusGeometry(3.4 + cluster.skillIds.length * 0.08, 0.018, 6, nebulaScale < 0.5 ? 48 : 96),
    new THREE.MeshBasicMaterial({
      color: cluster.color,
      transparent: true,
      opacity: 0.15
    })
  );
  beacon.position.set(cluster.position[0], cluster.position[1] - 0.08, cluster.position[2]);
  beacon.rotation.x = Math.PI / 2;
  group.add(beacon);
  return group;
}

function createRouteObjects(routeSkills: SkillNode[]) {
  const group = new THREE.Group();
  if (routeSkills.length < 2) return group;

  const routeColor = new THREE.Color('#f2c14e');

  for (let index = 0; index < routeSkills.length - 1; index += 1) {
    const startSkill = routeSkills[index];
    const endSkill = routeSkills[index + 1];
    const start = new THREE.Vector3(...startSkill.position);
    const end = new THREE.Vector3(...endSkill.position);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 2.4 + index * 0.28;

    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 42, 0.052, 8, false),
      new THREE.MeshBasicMaterial({
        color: routeColor,
        transparent: true,
        opacity: 0.7
      })
    );
    group.add(tube);
  }

  routeSkills.forEach((skill, index) => {
    const beacon = new THREE.Mesh(
      new THREE.TorusGeometry(skill.radius * 1.88, 0.032, 8, 80),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? '#88ffe1' : '#f2c14e',
        transparent: true,
        opacity: 0.86
      })
    );
    beacon.position.set(skill.position[0], skill.position[1], skill.position[2]);
    beacon.rotation.x = Math.PI / 2;
    beacon.userData = { routeBeacon: true };
    group.add(beacon);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.16 + index * 0.015, 14, 14),
      new THREE.MeshBasicMaterial({
        color: index === routeSkills.length - 1 ? '#ffffff' : '#f2c14e',
        transparent: true,
        opacity: 0.92
      })
    );
    core.position.set(skill.position[0], skill.position[1] + skill.radius * 1.68, skill.position[2]);
    group.add(core);
  });

  return group;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
  } else {
    material.dispose();
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  });
}

function setObjectActive(object: THREE.Group, active: boolean) {
  if (object.userData.active === active) return;
  object.userData.active = active;
  object.scale.setScalar(active ? 1.18 : 1);

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (typeof material.userData.baseOpacity === 'number') {
        material.opacity = active
          ? material.userData.activeOpacity
          : material.userData.baseOpacity;
      }
      if ('emissiveIntensity' in material && typeof material.userData.baseEmissiveIntensity === 'number') {
        material.emissiveIntensity = active
          ? material.userData.activeEmissiveIntensity
          : material.userData.baseEmissiveIntensity;
      }
    }
  });
}

function hasVisibleAncestor(object: THREE.Object3D | null) {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export function SkillUniverse({
  activeClusterIds,
  activeRouteSkillIds,
  focusVersion,
  performanceMode,
  selectedSkillId,
  universe,
  onSelectSkill
}: SkillUniverseProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const hoverRef = useRef<HoverState | null>(null);
  const onSelectSkillRef = useRef(onSelectSkill);
  const activeClusterIdsRef = useRef(activeClusterIds);
  const activeRouteSkillIdsRef = useRef(activeRouteSkillIds);
  const [hover, setHover] = useState<HoverState | null>(null);
  const skillsById = useMemo(() => new Map(universe.skills.map((skill) => [skill.id, skill])), [universe.skills]);
  const performance = PERFORMANCE_SETTINGS[performanceMode];

  useEffect(() => {
    onSelectSkillRef.current = onSelectSkill;
  }, [onSelectSkill]);

  useEffect(() => {
    activeClusterIdsRef.current = activeClusterIds;
  }, [activeClusterIds]);

  useEffect(() => {
    activeRouteSkillIdsRef.current = activeRouteSkillIds;
  }, [activeRouteSkillIds]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07070b');
    scene.fog = new THREE.Fog('#07070b', 32, 90);

    const camera = new THREE.PerspectiveCamera(54, host.clientWidth / host.clientHeight, 0.1, 220);
    camera.position.set(0, 15, 38);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, performance.pixelRatio));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.domElement.setAttribute('data-testid', 'skill-universe-canvas');
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 8;
    controls.maxDistance = 78;
    controls.autoRotate = true;
    controls.autoRotateSpeed = performance.autoRotateSpeed;

    scene.add(new THREE.AmbientLight('#d6f7ff', 0.5));
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.18);
    keyLight.position.set(12, 18, 14);
    scene.add(keyLight);
    const roseLight = new THREE.PointLight('#ff7a9f', 30, 80);
    roseLight.position.set(-16, 4, 20);
    scene.add(roseLight);
    const mintLight = new THREE.PointLight('#4dd7a8', 28, 80);
    mintLight.position.set(20, -4, -18);
    scene.add(mintLight);

    const starField = createStarField(performance.starCount, 72, performance.starOpacity);
    scene.add(starField);

    const clusterObjects = new Map<string, THREE.Group>();
    for (const cluster of universe.clusters) {
      const object = createClusterObject(cluster, performance.nebulaScale);
      object.visible = activeClusterIdsRef.current.has(cluster.id);
      clusterObjects.set(cluster.id, object);
      scene.add(object);
    }

    const routeGroup = new THREE.Group();
    scene.add(routeGroup);

    const pickable: THREE.Object3D[] = [];
    const skillObjects = new Map<string, THREE.Group>();
    for (const skill of universe.skills) {
      const object = createSkillObject(skill, performance.detail);
      object.visible = activeClusterIdsRef.current.has(skill.clusterId);
      skillObjects.set(skill.id, object);
      scene.add(object);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) pickable.push(child);
      });
    }

    const state: SceneState = {
      camera,
      controls,
      renderer,
      routeGroup,
      skillObjects,
      clusterObjects,
      pickable,
      starField,
      targetPosition: new THREE.Vector3(0, 0, 0),
      cameraTargetPosition: camera.position.clone(),
      cameraFlightFrames: 0
    };
    sceneRef.current = state;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function setHoverThrottled(next: HoverState | null) {
      const current = hoverRef.current;
      if (!next) {
        if (current) {
          hoverRef.current = null;
          setHover(null);
        }
        return;
      }
      if (
        current?.id === next.id &&
        Math.abs(current.x - next.x) < 10 &&
        Math.abs(current.y - next.y) < 10
      ) {
        return;
      }
      hoverRef.current = next;
      setHover(next);
    }

    function updatePointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickable, false).find((entry) => {
        const skillId = entry.object.userData.skillId as string | undefined;
        const skill = skillId ? skillsById.get(skillId) : undefined;
        return Boolean(skill && activeClusterIdsRef.current.has(skill.clusterId) && hasVisibleAncestor(entry.object));
      });
      if (!hit) {
        setHoverThrottled(null);
        renderer.domElement.style.cursor = 'grab';
        return;
      }
      const skillId = hit.object.userData.skillId as string;
      const skill = skillsById.get(skillId);
      if (!skill) return;
      renderer.domElement.style.cursor = 'pointer';
      setHoverThrottled({ id: skill.id, name: skill.displayName, x: event.clientX, y: event.clientY });
    }

    function handleClick() {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickable, false).find((entry) => {
        const skillId = entry.object.userData.skillId as string | undefined;
        const skill = skillId ? skillsById.get(skillId) : undefined;
        return Boolean(skill && activeClusterIdsRef.current.has(skill.clusterId) && hasVisibleAncestor(entry.object));
      });
      const skillId = hit?.object.userData.skillId as string | undefined;
      if (skillId) onSelectSkillRef.current(skillId);
    }

    renderer.domElement.addEventListener('pointermove', updatePointer);
    renderer.domElement.addEventListener('pointerleave', () => setHoverThrottled(null));
    renderer.domElement.addEventListener('click', handleClick);

    const resizeObserver = new ResizeObserver(() => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    });
    resizeObserver.observe(host);

    let frame = 0;
    let raf = 0;
    let lastRender = 0;
    function animate(now = 0) {
      raf = requestAnimationFrame(animate);
      if (document.hidden) return;
      if (now - lastRender < 1000 / performance.fps) return;
      lastRender = now;
      frame += 0.012;
      starField.rotation.y += performanceMode === 'battery' ? 0.00018 : 0.0007;
      controls.target.lerp(state.targetPosition, 0.04);
      if (state.cameraFlightFrames > 0) {
        camera.position.lerp(state.cameraTargetPosition, performanceMode === 'battery' ? 0.035 : 0.055);
        state.cameraFlightFrames -= 1;
      }
      controls.update();
      routeGroup.traverse((object) => {
        if (object.userData.routeBeacon) object.rotation.z += 0.02;
      });
      for (const object of skillObjects.values()) {
        if (!object.visible) continue;
        object.rotation.y += object.userData.active ? 0.004 : 0.0022;
        object.position.y = object.userData.baseY + Math.sin(frame + object.position.x) * 0.045;
      }
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', updatePointer);
      renderer.domElement.removeEventListener('click', handleClick);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      hoverRef.current = null;
      setHover(null);
    };
  }, [performance, performanceMode, skillsById, universe]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    for (const cluster of universe.clusters) {
      const visible = activeClusterIds.has(cluster.id);
      const object = state.clusterObjects.get(cluster.id);
      if (object) object.visible = visible;
    }
    for (const skill of universe.skills) {
      const object = state.skillObjects.get(skill.id);
      if (object) object.visible = activeClusterIds.has(skill.clusterId);
    }
  }, [activeClusterIds, universe.clusters, universe.skills]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const activeIds = new Set([selectedSkillId, ...activeRouteSkillIds].filter(Boolean));
    for (const [skillId, object] of state.skillObjects) {
      setObjectActive(object, activeIds.has(skillId));
    }

    const selectedSkill = selectedSkillId ? skillsById.get(selectedSkillId) : undefined;
    const target = selectedSkill
      ? new THREE.Vector3(selectedSkill.position[0], selectedSkill.position[1], selectedSkill.position[2])
      : new THREE.Vector3(0, 0, 0);
    state.targetPosition.copy(target);
    if (selectedSkill) {
      const currentDirection = state.camera.position.clone().sub(state.controls.target);
      if (currentDirection.length() < 0.001) currentDirection.set(0, 0.42, 1);
      currentDirection.normalize();
      const distance = Math.max(11, Math.min(22, 14 + selectedSkill.radius * 4));
      state.cameraTargetPosition.copy(target.clone().add(currentDirection.multiplyScalar(distance)));
      state.cameraFlightFrames = performanceMode === 'battery' ? 34 : 54;
    } else {
      state.cameraTargetPosition.set(0, 15, 38);
      state.cameraFlightFrames = 44;
    }
  }, [activeRouteSkillIds, focusVersion, performanceMode, selectedSkillId, skillsById]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    disposeObject(state.routeGroup);
    state.routeGroup.clear();
    const routeSkills = activeRouteSkillIds
      .map((id) => skillsById.get(id))
      .filter((skill): skill is SkillNode => Boolean(skill))
      .filter((skill) => activeClusterIds.has(skill.clusterId));
    const nextRoute = createRouteObjects(routeSkills);
    while (nextRoute.children.length) {
      state.routeGroup.add(nextRoute.children[0]);
    }
  }, [activeClusterIds, activeRouteSkillIds, skillsById]);

  return (
    <div className="universe-stage" ref={hostRef}>
      {hover ? (
        <div className="skill-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.name}
        </div>
      ) : null}
    </div>
  );
}
