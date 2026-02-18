/**
 * ds-project-tracker — Main module entry point.
 *
 * Registers:
 * - World setting for board state
 * - Scene control toolbar button (left sidebar)
 * - Singleton ProjectBoard application
 *
 * Requires the Draw Steel system ("draw-steel").
 */
import { ProjectBoard } from "./ProjectBoard.mjs";
import { invalidateCache } from "./data/BoardState.mjs";

const MODULE_ID = "ds-project-tracker";
const REQUIRED_SYSTEM = "draw-steel";

let _board = null;
let _systemValid = false;

function getBoard() {
  if (!_board) _board = new ProjectBoard();
  return _board;
}

/* ─── Hook: init — validate system & register settings ─── */
Hooks.once("init", () => {
  if (game.system.id !== REQUIRED_SYSTEM) {
    console.warn(
      `${MODULE_ID} | This module requires the "${REQUIRED_SYSTEM}" system `
      + `(current: "${game.system.id}"). Aborting initialisation.`
    );
    return;
  }

  _systemValid = true;
  console.log(`${MODULE_ID} | Initialising Project Point Tracker`);

  // World-level setting to persist board state
  game.settings.register(MODULE_ID, "boardState", {
    name: "Project Board State",
    scope: "world",
    config: false,
    type: Object,
    default: { version: 1, heroes: [] }
  });

  // Sync toggle
  game.settings.register(MODULE_ID, "syncPoints", {
    name: game.i18n?.localize("DS_PROJECT_TRACKER.settings.syncPoints.name") ?? "Sync points to project items",
    hint: game.i18n?.localize("DS_PROJECT_TRACKER.settings.syncPoints.hint") ?? "When enabled, adding points via the tracker also updates the project item's system.points field on the actor.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

/* ─── Hook: getSceneControlButtons — add toolbar button ─── */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!_systemValid) return;

  // v13 API: controls is Record<string, SceneControl>, tools is Record<string, SceneControlTool>
  const tokenGroup = controls.tokens;
  if (!tokenGroup) return;

  tokenGroup.tools.projectTracker = {
    name: "projectTracker",
    title: "DS_PROJECT_TRACKER.toolbar.tooltip",
    icon: "fa-solid fa-hammer",
    order: Object.keys(tokenGroup.tools).length,
    button: true,
    visible: true,
    onChange: () => {
      const board = getBoard();
      if (board.rendered) {
        board.close();
      } else {
        board.render({ force: true });
      }
    }
  };
});

/* ─── Hook: ready — socket relay & log startup ─── */
Hooks.once("ready", () => {
  if (!_systemValid) return;

  // Socket listener: handle relay & refresh messages
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    // GM-only: persist state changes requested by players
    if (data.action === "setState" && game.user.isGM) {
      const firstGM = game.users.find(u => u.isGM && u.active);
      if (game.user === firstGM) {
        await game.settings.set(MODULE_ID, "boardState", data.state);
        // Broadcast refresh so all clients (including the originating player) re-render
        game.socket.emit(`module.${MODULE_ID}`, { action: "refreshBoard" });
      }
    }

    // All clients: re-render the board when told to refresh
    if (data.action === "refreshBoard") {
      invalidateCache();
      if (_board?.rendered) _board.render();
    }
  });

  console.log(`${MODULE_ID} | Project Point Tracker ready`);
});

/* ─── Hook: updateSetting — re-render board when state changes (safety net) ─── */
Hooks.on("updateSetting", (setting) => {
  if (setting.key === `${MODULE_ID}.boardState`) {
    invalidateCache();
    if (_board?.rendered) _board.render();
  }
});
