### Specification for AI agent: Scene setup

#### Scene setup
In the main entry point `main.js`, implement the following:
- Create a new `THREE.Scene()`.

#### Lighting
In the main entry point `main.js`, implement the following:
- Add an `AmbientLight` to the scene with an intensity of `1.5` to provide base illumination.
- Add a `DirectionalLight` to the scene to create shadows and depth. Set the intensity to  `1.5` and positioned to `(-100, -100, 200)`.

#### Player
In the `components` directory, create a file named `Player.js` with the following implementation:
- The player should be represented by a `THREE.Group`.
- Load the 3D model `tode.glb` from `public/models/`.
- Add the model as a child of the `THREE.Group`.
- Positioning:
  - Place the group at the center of the scene.
  - Calculate the Z-offset based on the model height to ensure Tode sits flush on the ground.
  - Add model rotation: `model.rotation.x = Math.PI / 2;`.
- Scale the model using a scalar of `20`.

Add the player to the main entry point `main.js`.

#### Camera
In the `components` directory, create a file named `Camera.js` with the following implementation:
- A perspective camera with a 30° field of view and the far plane set to `9000`.
- Set the initial camera position to `(300, -300, 300)` and set `camera.up` to `(0, 0, 1)`.
- Point the camera at the origin `(0, 0, 0)`.

In the main entry point `main.js`:
- Add the camera as a child of the player group: `player.add(camera)`.

#### Renderer
In the `components` directory, create `Renderer.js` with the following implementation:
- Initialize `THREE.WebGLRenderer`.
- Use `canvas.game` in `index.html` as the rendering canvas.
- Enable `alpha: true` and `antialias: true`.
- Set the renderer size to match the window dimensions.

Add the renderer to the main entry point `main.js`. 
