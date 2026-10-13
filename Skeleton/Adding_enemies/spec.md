### Specification for AI agent: Adding enemies

Implement basic enemy spawning and behavior.

#### Enemy model
In the `components` directory, create an `Enemy.js` file with the following implementation:
- Load the enemy model `enemy.glb` from `public/models/`.
- Positioning:
    - Calculate the Z offset based on the height of the model to position the model on top of the ground.
    - Apply a rotation of `model.rotation.x = Math.PI / 2;`.
- Set the model scale using a scalar of `5`.

#### Spawning logic
- Define four spawn locations at the corners of the map.
- Implement a mechanism to spawn enemies periodically or at the start. Store the spawning delay as a constant.
- Ensure the spawned enemies are added to the `THREE.Scene`.

#### Enemy behavior
- In the animation loop, update each enemy's position so it moves toward the player's current coordinates.
- Rotate enemies to face the player while moving (update enemy rotation each frame based on the direction vector in the XY plane). 
- Store the enemy's moving speed as a constant.
- At this stage, enemies can overlap with each other and the player.
