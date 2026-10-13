### Specification for AI agent: Player movement

Implement player movement system featuring a jump animation controlled by keyboard input.

#### Input collection
- Use `addEventListener` to capture keyboard events for the arrow keys.
- Maintain a queue to store pending inputs.

#### Movement state & logic
- Track the current movement state: direction, progress (0 to 1), and completion status.
- Implement jump logic using `Math.sin(progress * Math.PI)` to adjust the player's height (the Z-axis).
- Update the player's position and rotation based on the current move.
- Store movement speed, jump height, and jump distance as constants.
- Keep a reference to the loaded model object and rotate that rather than rotating the player group.

#### Animation loop integration
Inside `setAnimationLoop`:
- Process the input queue.
- Update movement progress and object transformation.
- Handle re-rendering.
