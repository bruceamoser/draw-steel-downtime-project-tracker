import {
  getState, setState, findHero, findProject,
  removeLedgerEntry, ledgerTotal
} from "./data/BoardState.mjs";

const MODULE_ID = "ds-project-tracker";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * LedgerDialog — Displays the full point history for a single project.
 */
export class LedgerDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(opts = {}) {
    super({ uniqueId: `${opts.actorId}-${opts.itemId}` });
    this._actorId = opts.actorId;
    this._itemId = opts.itemId;
    this._projectName = opts.projectName ?? "Project";
    this._board = opts.board;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "ds-project-tracker-ledger-{id}",
    classes: ["ds-project-tracker", "ledger-dialog"],
    position: { width: 560, height: 420 },
    window: {
      title: "DS_PROJECT_TRACKER.ledger.title",
      icon: "fas fa-scroll",
      resizable: true
    },
    actions: {
      deleteEntry: LedgerDialog.#onDeleteEntry
    }
  };

  static PARTS = {
    ledger: {
      template: `modules/${MODULE_ID}/templates/ledger.hbs`
    }
  };

  /** @override */
  async _prepareContext(options) {
    const state = getState();
    const heroEntry = findHero(state, this._actorId);
    const projEntry = heroEntry ? findProject(heroEntry, this._itemId) : null;

    const entries = (projEntry?.ledger ?? []).map(e => ({
      ...e,
      dateStr: new Date(e.timestamp).toLocaleDateString(),
      sourceLabel: this.#sourceLabel(e.source)
    }));

    const total = projEntry ? ledgerTotal(projEntry) : 0;

    // Get goal from the actor's item
    const actor = game.actors.get(this._actorId);
    const item = actor?.items.get(this._itemId);
    const goal = item?.system?.goal ?? 0;
    const canEdit = game.user.isGM || actor?.isOwner;

    return {
      projectName: this._projectName,
      entries,
      total,
      goal,
      isEmpty: entries.length === 0,
      isGM: game.user.isGM,
      canEdit
    };
  }

  #sourceLabel(source) {
    const map = {
      career: "Career Points",
      roll: "Project Roll",
      guide: "Guide Studied",
      follower: "Follower Work",
      perk: "Artisan/Sage Perk",
      collaboration: "Collaboration",
      event: "Project Event",
      other: "Other"
    };
    return map[source] ?? source;
  }

  static async #onDeleteEntry(event, target) {
    const entryId = target.dataset.entryId;
    if (!entryId) return;

    // Permission check
    const actor = game.actors.get(this._actorId);
    if (!game.user.isGM && !actor?.isOwner) return;

    const state = getState();
    const heroEntry = findHero(state, this._actorId);
    if (!heroEntry) return;
    const projEntry = findProject(heroEntry, this._itemId);
    if (!projEntry) return;

    removeLedgerEntry(projEntry, entryId);
    await setState(state);

    // Sync if enabled
    const syncEnabled = game.settings.get(MODULE_ID, "syncPoints");
    if (syncEnabled) {
      try {
        const actor = game.actors.get(this._actorId);
        const item = actor?.items.get(this._itemId);
        if (item) {
          await item.update({ "system.points": ledgerTotal(projEntry) });
        }
      } catch (err) {
        console.warn("ds-project-tracker | Failed to sync points after delete", err);
      }
    }

    this.render();
    if (this._board) this._board.render();
  }
}
