### Specification for AI agent: Attack system

Implement a player attack mechanism.

#### Attack trigger
- Add a listener for the Space key to trigger an attack.
- Implement an attack cooldown. Store it as a constant and initialize it with a default value of 1 second.

#### Visual feedback
- Visualize the attack using a small yellow circle (`THREE.CircleGeometry` with `MeshBasicMaterial`) around the player.
- The circle should appear briefly and then disappear or fade out.
- Place the circle on the ground plane (XY) at a small Z offset (z = 0.25).

#### Combat logic
- Detect collisions between the attack area and enemies.
- If an enemy is within the attack radius, remove it from the scene and delete from the tracking array.
- Store the attack radius as a constant.
