### Specification for AI agent: Collision detection

Implement collision detection to prevent character overlapping.

#### Object shapes
- Use a 3D model's shape to determine boundaries of the object.
- Do not use raw bounding boxes, as they are often too large and inaccurate for rounded characters.

#### Collision rules
- Enemy vs. Enemy: Enemies must not overlap. An enemy can only move to a new position if that movement does not result in a collision with another enemy. 
- Enemy vs. Player: Enemies must not overlap with the player. The player should only move if the intended new position is clear of enemy collisions.
- Provide a separate constant to control the minimum distance required to trigger a collision.

#### Integration
- Perform all collision checks during the position update phase within the animation loop.
- Only update an object's coordinates if the intended next position is validated as "collision-free."
