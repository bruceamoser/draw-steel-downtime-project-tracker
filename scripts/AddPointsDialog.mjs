import {
  getState, setState, findHero, findProject,
  addLedgerEntry, ledgerTotal
} from "./data/BoardState.mjs";

const MODULE_ID = "ds-project-tracker";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * AddPointsDialog — A dialog for adding point entries to a project's ledger.
 * Changes the visible form fields depending on the selected source type.
 */
export class AddPointsDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {object} opts
   * @param {string} opts.actorId
   * @param {string} opts.itemId
   * @param {string} opts.projectName
   * @param {ProjectBoard} opts.board - the parent board to re-render
   * @param {string} [opts.defaultSource="career"] - pre-selected source
   */
  constructor(opts = {}) {
    super({ uniqueId: `${opts.actorId}-${opts.itemId}` });
    this._actorId = opts.actorId;
    this._itemId = opts.itemId;
    this._projectName = opts.projectName ?? "Project";
    this._board = opts.board;
    this._defaultSource = opts.defaultSource ?? "career";
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "ds-project-tracker-add-points-{id}",
    classes: ["ds-project-tracker", "add-points-dialog"],
    position: { width: 420, height: "auto" },
    window: {
      title: "DS_PROJECT_TRACKER.addPoints.title",
      icon: "fas fa-plus-circle"
    },
    actions: {
      submitPoints: AddPointsDialog.#onSubmit
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/add-points.hbs`
    }
  };

  /** @override */
  async _prepareContext(options) {
    const sources = [
      { value: "career", label: "Career Points" },
      { value: "roll", label: "Project Roll" },
      { value: "guide", label: "Guide Studied" },
      { value: "follower", label: "Artisan/Sage Follower Roll" },
      { value: "perk", label: "Traveling Artisan/Sage Perk" },
      { value: "collaboration", label: "Another Hero's Project Roll" },
      { value: "faction", label: "Faction Helper Roll" },
      { value: "other", label: "Director Award / Other" }
    ];

    // Mark selected
    for (const s of sources) {
      s.selected = s.value === this._defaultSource;
    }

    return {
      projectName: this._projectName,
      sources,
      defaultSource: this._defaultSource,
      actorId: this._actorId,
      itemId: this._itemId,
      sourceGuidance: "Use manual entries for guides, follower help, perks, faction help, collaboration, and Director awards. Event-table rolls and results are intentionally not logged in the tracker ledger."
    };
  }

  /**
   * Action handler for the "Add to Ledger" button.
   */
  static async #onSubmit(event, target) {
    const form = this.element.querySelector(".add-points-form");
    const fd = new FormData(form);
    const actorId = fd.get("actorId");
    const itemId = fd.get("itemId");
    const source = fd.get("source");
    const points = fd.get("points");
    const notes = fd.get("notes");

    const numPoints = Number(points);
    if (!numPoints || numPoints <= 0) {
      ui.notifications.warn("Points must be a positive number.");
      return;
    }

    const state = getState();
    const heroEntry = findHero(state, actorId);
    if (!heroEntry) {
      ui.notifications.error("Hero not found on the board.");
      return;
    }

    const projEntry = findProject(heroEntry, itemId);
    if (!projEntry) {
      ui.notifications.error("Project not found on the board.");
      return;
    }

    addLedgerEntry(projEntry, { source, points: numPoints, notes: notes ?? "" });

    const actor = game.actors.get(actorId);
    const item = actor?.items.get(itemId);

    if (source === "career") {
      const careerItem = actor?.system?.career;
      const availableCareerPoints = careerItem?.system?.projectPoints ?? 0;

      if (!careerItem) {
        ui.notifications.error("This hero has no career item to spend project points from.");
        return;
      }

      if (numPoints > availableCareerPoints) {
        ui.notifications.warn(`Only ${availableCareerPoints} career project point(s) are available.`);
        return;
      }

      try {
        await careerItem.update({ "system.projectPoints": availableCareerPoints - numPoints });
      } catch (err) {
        console.warn("ds-project-tracker | Failed to spend career points from career item", err);
        ui.notifications.error("Failed to spend career project points from the hero's career.");
        return;
      }
    }

    await setState(state);

    // Optionally sync points back to the system item
    const syncEnabled = game.settings.get(MODULE_ID, "syncPoints");
    if (syncEnabled) {
      try {
        if (item) {
          const newTotal = ledgerTotal(projEntry);
          await item.update({ "system.points": newTotal });
        }
      } catch (err) {
        console.warn("ds-project-tracker | Failed to sync points to item", err);
      }
    }

    ui.notifications.info(`Added ${numPoints} points (${source}) to ${this._projectName || "project"}.`);

    // Close dialog and re-render the board
    await this.close();
    if (this._board) this._board.render();
  }
}
