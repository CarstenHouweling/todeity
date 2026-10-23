// Dev-only contact sheets of close-ups, for checking looks (models, z-fighting) without moving the game's camera.
//   game.snap([{ at: [x, y, z], dist: 80, yaw: -0.785, pitch: 0.6, label: 'queen' }, …], { cols: 2, w: 400, h: 300 })
// renders each spot straight with the renderer (no post-processing) and shows the sheet over the page; click it, or
// call game.snap(), to hide it. Returns the sheet as a data URL. `{ id: 'birdbath' }` looks at a placed trinket.
// Tip: game.shadowFollow = false first, or shadows end where the gameplay view's shadow box does.
export function makeSnap(game) {
  let img = null;
  return (targets = [], { cols = 2, w = 400, h = 300 } = {}) => {
    if (!targets.length) {
      if (img) img.style.display = 'none';
      return null;
    }
    const rows = Math.ceil(targets.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * w;
    canvas.height = rows * h;
    const ctx = canvas.getContext('2d');
    const { renderer } = game;
    const camera = game.camera.clone();
    const size = renderer.getSize(camera.position.clone());
    const ratio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    targets.forEach((target, i) => {
      let { at, dist = 70, yaw = -Math.PI / 4, pitch = 0.6, label = '' } = target;
      if (target.id) {
        const spot = game.meta.decor.find((d) => d.id === target.id);
        at = [spot.x, spot.y, target.z ?? 14];
        label ||= target.id;
      }
      camera.aspect = w / h;
      camera.up.set(0, 0, 1);
      camera.position.set(at[0] + Math.cos(yaw) * Math.cos(pitch) * dist, at[1] + Math.sin(yaw) * Math.cos(pitch) * dist, at[2] + Math.sin(pitch) * dist);
      camera.lookAt(...at);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      renderer.render(game.scene, camera);
      const x = (i % cols) * w;
      const y = Math.floor(i / cols) * h;
      ctx.drawImage(renderer.domElement, 0, 0, w, h, x, y, w, h);
      ctx.fillStyle = '#000';
      ctx.font = '16px sans-serif';
      ctx.fillText(label, x + 6, y + 18);
    });
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.x, size.y, false);
    if (!img) {
      img = document.createElement('img');
      img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;z-index:99999;background:#000';
      img.addEventListener('click', () => (img.style.display = 'none'));
      document.body.appendChild(img);
    }
    img.src = canvas.toDataURL('image/jpeg', 0.92);
    img.style.display = 'block';
    return img.src;
  };
}
