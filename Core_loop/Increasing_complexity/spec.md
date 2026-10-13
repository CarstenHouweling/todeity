### Specification for AI agent: Increasing complexity

Implement a dynamic difficulty system that scales the game's challenge based on the player's current score.

#### Difficulty scaling parameters
As the score increases, adjust the following parameters:
- Enemy spawn delay: Decrease the delay between enemy spawns (enemies appear more frequently).
- Implement enemy spawning with an accumulated timer in the animation loop (advance it with `clock.getDelta()`)
- Enemy movement speed: Increase enemy speed.
- Player movement speed: Slightly increase the player's speed.
- Player attack delay: Decrease the time between player attacks.
- Player attack distance: Slightly increase the attack range.

#### Scaling logic
- Calculate a difficulty factor based on the complexity growth rate factor stored in a constant.
- Adjust the complexity parameters linearly in proportion to the growth difficulty factor.
- Ensure enemy parameters scale slightly faster than player parameters to maintain a challenge.

#### Animation loop integration
- Recalculate these parameters in each frame of the animation loop using the current score.
- Apply the updated speeds and delays to the respective game systems.
