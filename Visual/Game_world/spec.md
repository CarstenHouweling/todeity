### Specification for AI agent: Game world

#### Map background
In the `components` directory, add a `Map.js` file with the following implementation:
- Checkerboard floor: Create a grid-based floor using a checkerboard pattern.
- Colors: Alternate between Dark Green (`#228B22`) and Light Green (`#90EE90`).

#### Obstacles
In the `components` directory, add a `House.js` file:
- Use the `small_house.glb` model located in `/models/` at a scale of `65`.
- Add 3 houses to the map in random positions.
- Rotate all houses `Math.PI / 2` around the X-axis to align with the Z-up coordinate system.
- Assign each house a random rotation around the Y-axis in multiples of `Math.PI / 2`.
- Implement logic to ensure houses sit exactly on the ground level (Z = 0) by calculating their bounding box.
- Implement collision logic for:
  - Houses and entities
  - Houses and the player
- Note: Neither enemies nor the player should be able to pass through the houses.

#### Integration
In the main entry point, `main.js`:
- Initialize the map and add it to the scene.
- Load the houses and add them to the map group.
