# Lava Tower

An endless vertical platform game built with HTML Canvas and vanilla JavaScript.

## Play

Run `./run.sh` and open the displayed local URL. Use Arrow keys or A/D to move and Space, W, or Up Arrow to jump. Build horizontal speed before jumping to launch higher; land higher from consecutive momentum jumps to grow a combo.

Escape pauses the game. Touch controls appear by default on coarse-pointer devices and can be toggled during a run. Sound preference and local top-five scores are saved in the browser.

## Test

Run `node game-core.test.js` to check platform reachability, momentum-jump calculations, and saved-score validation.

## Architecture

- `game-core.js`: pure, reusable gameplay and persistence calculations
- `game.js`: simulation, canvas rendering, input, audio, and UI state
- `index.html` and `style.css`: game shell and responsive controls

The simulation uses a fixed 60 Hz step, independent of display refresh rate.
