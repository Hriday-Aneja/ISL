import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
const SIGN_MAP = {
  HELLO: "hello",
  THANKYOU: "thankyou",
  HELP: "help",
  WATER: "water",
  YES: "yes",
  NO: "no",
  SORRY: "sorry",
};

export default function AvatarViewer() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000
    );

    camera.position.set(0, 120, 250);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    renderer.setSize(
      mount.clientWidth,
      mount.clientHeight
    );

    renderer.setPixelRatio(window.devicePixelRatio);

    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 2));

    const light = new THREE.DirectionalLight(
      0xffffff,
      3
    );

    light.position.set(100, 200, 100);
    scene.add(light);

    // Optional Grid
    scene.add(new THREE.GridHelper(500, 20));

    let mixer = null;
    let currentAction = null;
    let avatarModel = null;

    const clock = new THREE.Clock();
    const loader = new FBXLoader();

    // Animation Loader
    const playAnimation = (name) => {
      if (!avatarModel || !mixer) return;

      const animLoader = new FBXLoader();

      animLoader.load(
        `/assets/animations/${name}.fbx`,
        (anim) => {
          if (!anim.animations.length) return;

          if (currentAction) {
            currentAction.stop();
          }

          const clip = anim.animations[0];

          currentAction =
            mixer.clipAction(clip);

          currentAction.reset();
          currentAction.play();

          console.log(
            `✅ Playing ${name}`
          );
        },
        undefined,
        (err) => {
          console.error(
            `❌ ${name} load error`,
            err
          );
        }
      );
    };

    // Make available globally
   window.playAvatarAnimation = playAnimation;

window.playSigns = async (signs) => {
  console.log("🎬 Queue Started:", signs);

  for (const sign of signs) {
    playAnimation(sign.toLowerCase());

    await new Promise((resolve) =>
      setTimeout(resolve, 2500)
    );
  }

  console.log("✅ Queue Complete");

playAnimation("idle");
};
window.playSignMessage = (data) => {
  if (!data?.signs) return;

  const signs = data.signs
    .map((s) => SIGN_MAP[s])
    .filter(Boolean);

  window.playSigns(signs);
};
    // Load Avatar
    loader.load(
      "/assets/X Bot.fbx",
      (avatar) => {
        console.log("✅ XBot Loaded");

        avatarModel = avatar;

        const box =
          new THREE.Box3().setFromObject(
            avatar
          );

        const center =
          box.getCenter(
            new THREE.Vector3()
          );

        avatar.position.set(
          -center.x,
          -box.min.y,
          -center.z
        );

        scene.add(avatar);

        mixer =
          new THREE.AnimationMixer(
            avatar
          );

        camera.lookAt(0, 80, 0);

        playAnimation("idle");
      },
      undefined,
      (err) => {
        console.error(
          "❌ XBot Load Error",
          err
        );
      }
    );

    const resize = () => {
      camera.aspect =
        mount.clientWidth /
        mount.clientHeight;

      camera.updateProjectionMatrix();

      renderer.setSize(
        mount.clientWidth,
        mount.clientHeight
      );
    };

    window.addEventListener(
      "resize",
      resize
    );

    const animate = () => {
      requestAnimationFrame(
        animate
      );

      if (mixer) {
        mixer.update(
          clock.getDelta()
        );
      }

      renderer.render(
        scene,
        camera
      );
    };

    animate();

    return () => {
      delete window.playAvatarAnimation;

      window.removeEventListener(
        "resize",
        resize
      );

      renderer.dispose();

      if (
        mount &&
        mount.contains(
          renderer.domElement
        )
      ) {
        mount.removeChild(
          renderer.domElement
        );
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "600px",
      }}
    />
  );
}