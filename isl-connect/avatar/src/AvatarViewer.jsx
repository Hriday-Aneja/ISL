// Minimal Three.js avatar viewport. Get this rendering first —
// it's demoable before a single animation clip exists.
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function AvatarViewer() {
  const mountRef = useRef(null);

  useEffect(() => {
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 1.4, 2.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 2, 2);
    scene.add(light, new THREE.AmbientLight(0xffffff, 0.4));

    // TODO: load the rigged avatar model (GLTFLoader) here instead of the placeholder cube
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.8, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x4f46e5 })
    );
    scene.add(placeholder);

    function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    return () => mountRef.current?.removeChild(renderer.domElement);
  }, []);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
