import {
  getState, setState, findHero, addProject
} from "./data/BoardState.mjs";

const MODULE_ID = "ds-project-tracker";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * AddProjectDialog — A dialog for creating a custom project item on a hero.
 * Available to GM (and owners) to add a brand-new project without needing
 * a compendium or sidebar item.
 */
export class AddProjectDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {object} opts
   * @param {string} opts.actorId
   * @param {ProjectBoard} opts.board - the parent board to re-render
   */
  constructor(opts = {}) {
    super({ uniqueId: `add-project-${opts.actorId}` });
    this._actorId = opts.actorId;
    this._board = opts.board;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "ds-project-tracker-add-project-{id}",
    classes: ["ds-project-tracker", "add-project-dialog"],
    position: { width: 440, height: "auto" },
    window: {
      title: "DS_PROJECT_TRACKER.addProject.title",
      icon: "fas fa-plus-circle"
    },
    actions: {
      submitProject: AddProjectDialog.#onSubmit
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/add-project.hbs`
    }
  };

  /** @override */
  async _prepareContext(options) {
    const actor = game.actors.get(this._actorId);
    const types = [
      { value: "crafting", label: "Crafting" },
      { value: "research", label: "Research" },
      { value: "other", label: "Other" }
    ];

    return {
      actorId: this._actorId,
      actorName: actor?.name ?? "Unknown",
      types
    };
  }

  /**
   * Action handler for the "Create Project" button.
   */
  static async #onSubmit(event, target) {
    const form = this.element.querySelector(".add-project-form");
    const fd = new FormData(form);
    const actorId = fd.get("actorId");
    const name = fd.get("name")?.trim();
    const type = fd.get("type");
    const goal = Number(fd.get("goal")) || 0;
    const prerequisites = fd.get("prerequisites")?.trim() ?? "";
    const projectSource = fd.get("projectSource")?.trim() ?? "";

    if (!name) {
      ui.notifications.warn("Project name is required.");
      return;
    }

    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.error("Actor not found.");
      return;
    }

    // Permission check
    if (!game.user.isGM && !actor.isOwner) {
      ui.notifications.warn("You don't have permission to add projects to this character.");
      return;
    }

    // Create the project item on the actor
    let createdItem;
    try {
      const itemData = {
        name,
        type: "project",
        system: {
          type: type ?? "other",
          goal,
          points: 0,
          prerequisites,
          projectSource
        }
      };
      const created = await actor.createEmbeddedDocuments("Item", [itemData]);
      createdItem = created[0];
    } catch (err) {
      console.error("ds-project-tracker | Failed to create project item", err);
      ui.notifications.error("Failed to create project item on the character.");
      return;
    }

    // Add to the board state
    const state = getState();
    const heroEntry = findHero(state, actorId);
    if (!heroEntry) {
      ui.notifications.error("Hero not found on the board.");
      return;
    }

    addProject(heroEntry, createdItem.id);
    await setState(state);

    ui.notifications.info(`Created project "${name}" on ${actor.name}.`);

    await this.close();
    if (this._board) this._board.render();
  }
}
