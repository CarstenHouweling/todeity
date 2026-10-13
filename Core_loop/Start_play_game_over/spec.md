### Specification for AI agent: Start, play, and Game Over

Implement game state management including "Game Over" conditions and game reset.

#### Game Over condition
- Check for collisions between the player and enemies.
- If a collision occurs, trigger the "Game Over" state.
- Handling the "Game Over" state should have higher priority than collision handling.
- Moving enemies should be able to collide with the player to trigger the "Game Over" state.

#### Game Over state
- Display a "Game Over" overlay (a `div` with the class `game-over`).
- The player character should be removed or made invisible.
- Enemies should stop moving (stop updating their positions).
- Disable further player actions (e.g., movement and attack).

#### Reset logic
- The Space key triggers a reset.
- Reset player position to the starting point.
- Clear all existing enemies and re-spawn them at the map corners.
- Reset the score and update the UI.
- Remove the "Game Over" overlay and resume the game loop.
