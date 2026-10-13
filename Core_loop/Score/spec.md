### Specification for AI agent: Score

Implement a scoring system that rewards survival time and enemy defeats.

#### Score UI
- Create a `div` element with the class `score` to display the current score.
- Position it at the top of the screen via CSS.
- Update the text content whenever the score changes.

#### Scoring logic
- Survival: Add 1 point for every 10 seconds (or 0.1 points per second) the player stays alive.
- Kills: Add 10 points for each enemy defeated.
- Use a `Clock` to track elapsed time and update the score in the animation loop.

#### Implementation details
- Define constants for `SCORE_PER_SECOND` and `SCORE_PER_KILL`.
- Ensure the displayed score is rounded down.
