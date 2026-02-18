import {
  getState, setState, findHero, addHero, removeHero,
  findProject, addProject, removeProject,
  addLedgerEntry, ledgerTotal, totalCareerAllocated,
  getCareerData, getActorProjects
} from "./data/BoardState.mjs";
import { AddPointsDialog } from "./AddPointsDialog.mjs";
import { AddProjectDialog } from "./AddProjectDialog.mjs";
import { LedgerDialog } from "./LedgerDialog.mjs";

const MODULE_ID = "ds-project-tracker";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * ProjectBoard — The main party-level project tracker window.
 * Uses Foundry V2 Application framework (ApplicationV2 + HandlebarsApplicationMixin).
 */
export class ProjectBoard extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "ds-project-tracker-board",
    classes: ["ds-project-tracker", "project-board"],
    position: { width: 720, height: 640 },
    window: {
      title: "DS_PROJECT_TRACKER.board.title",
      icon: "fas fa-hammer",
      resizable: true
    },
    actions: {
      addOwnHero: ProjectBoard.#onAddOwnHero,
      addCustomProject: ProjectBoard.#onAddCustomProject,
      removeHero: ProjectBoard.#onRemoveHero,
      removeProject: ProjectBoard.#onRemoveProject,
      addPoints: ProjectBoard.#onAddPoints,
      rollProgress: ProjectBoard.#onRollProgress,
      completeProject: ProjectBoard.#onCompleteProject,
      viewLedger: ProjectBoard.#onViewLedger
    }
  };

  static PARTS = {
    board: {
      template: `modules/${MODULE_ID}/templates/project-board.hbs`
    }
  };

  /* ─── Data preparation ─── */

  /** @override */
  async _prepareContext(options) {
    const state = getState();
    const heroes = [];

    for (const heroEntry of state.heroes) {
      const actor = game.actors.get(heroEntry.actorId);
      if (!actor) continue;

      const career = getCareerData(actor);
      const actorProjects = getActorProjects(actor);
      const careerAllocated = totalCareerAllocated(heroEntry);

      const projects = [];
      for (const projEntry of heroEntry.projects) {
        const actorProj = actorProjects.find(p => p.itemId === projEntry.itemId);
        const item = actor.items.get(projEntry.itemId);
        if (!item) continue;

        const trackerPoints = ledgerTotal(projEntry);
        const systemPoints = actorProj?.points ?? 0;
        const displayPoints = Math.max(trackerPoints, systemPoints);
        const goal = actorProj?.goal ?? 0;
        const pct = goal > 0 ? Math.min(100, Math.round((displayPoints / goal) * 100)) : 0;

        projects.push({
          itemId: projEntry.itemId,
          name: item.name,
          type: actorProj?.type ?? "other",
          typeLabel: this.#projectTypeLabel(actorProj?.type),
          points: displayPoints,
          goal,
          pct,
          canComplete: pct >= 100 && !projEntry.completed,
          completed: projEntry.completed,
          rollCharacteristic: actorProj?.rollCharacteristic ?? [],
          prerequisites: actorProj?.prerequisites ?? "",
          projectSource: actorProj?.projectSource ?? "",
          ledgerCount: projEntry.ledger.length
        });
      }

      heroes.push({
        actorId: heroEntry.actorId,
        name: actor.name,
        img: actor.img,
        canEdit: game.user.isGM || actor.isOwner,
        career: career ? {
          name: career.name,
          total: career.projectPoints,
          allocated: careerAllocated,
          remaining: career.projectPoints - careerAllocated
        } : null,
        projects
      });
    }

    // For non-GM users, find owned hero actors not yet on the board
    const ownedHeroes = [];
    if (!game.user.isGM) {
      const onBoardIds = new Set(heroes.map(h => h.actorId));
      for (const actor of game.actors) {
        if (actor.type === "hero" && actor.isOwner && !onBoardIds.has(actor.id)) {
          ownedHeroes.push({ actorId: actor.id, name: actor.name, img: actor.img });
        }
      }
    }

    return {
      heroes,
      isEmpty: heroes.length === 0 && ownedHeroes.length === 0,
      isGM: game.user.isGM,
      ownedHeroes
    };
  }

  #projectTypeLabel(type) {
    const map = { crafting: "Crafting", research: "Research", other: "Other" };
    return map[type] ?? "Other";
  }

  /* ─── Drag & Drop ─── */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Manually create and bind DragDrop each render.
    // Inner DOM is replaced by HandlebarsApplicationMixin, so we must rebind.
    // DragDrop uses property assignment (ondragover/ondrop) — no stacking risk.
    const dd = new foundry.applications.ux.DragDrop({
      dropSelector: ".project-board-body",
      permissions: {
        drop: () => true  // both GM and players can add
      },
      callbacks: {
        dragover: this.#onDragOver.bind(this),
        drop: this.#onDropBound.bind(this)
      }
    });
    dd.bind(this.element);

    // Dragleave handler — also on fresh element each render (no stacking: old element is GC'd)
    const body = this.element.querySelector(".project-board-body");
    if (body) {
      body.addEventListener("dragleave", (ev) => {
        if (!body.contains(ev.relatedTarget)) {
          body.classList.remove("drag-over");
        }
      });
    }
  }

  #onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const zone = event.currentTarget;
    if (zone) zone.classList.add("drag-over");
  }

  async #onDropBound(event) {
    event.preventDefault();
    const zone = event.currentTarget;
    if (zone) zone.classList.remove("drag-over");

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    // Drop an Actor → register hero
    if (data.type === "Actor") {
      await this.#handleActorDrop(data);
      return;
    }

    // Drop an Item (project) → add to a hero
    if (data.type === "Item") {
      await this.#handleItemDrop(data, event);
      return;
    }
  }

  async #handleActorDrop(data) {
    const actor = await fromUuid(data.uuid);
    if (!actor || actor.type !== "hero") {
      ui.notifications.warn("Only PC (hero) actors can be added to the project board.");
      return;
    }

    // Players can only add their own characters
    if (!game.user.isGM && !actor.isOwner) {
      ui.notifications.warn("You can only add your own characters to the board.");
      return;
    }

    const state = getState();
    if (findHero(state, actor.id)) {
      ui.notifications.info(`${actor.name} is already on the board.`);
      return;
    }

    addHero(state, actor.id);

    // Auto-import any existing project items from the actor
    const heroEntry = findHero(state, actor.id);
    const actorProjects = getActorProjects(actor);
    for (const proj of actorProjects) {
      addProject(heroEntry, proj.itemId);
    }

    await setState(state);
    this.render();

    const projCount = actorProjects.length;
    ui.notifications.info(`${actor.name} added to the board${projCount ? ` with ${projCount} project(s).` : "."}`);
  }

  async #handleItemDrop(data, event) {
    // Determine which hero card this was dropped on
    const heroCard = event.target.closest("[data-actor-id]");
    if (!heroCard) {
      ui.notifications.warn("Drop the project item onto a hero card.");
      return;
    }
    const actorId = heroCard.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;

    // Players can only add projects to their own characters
    if (!game.user.isGM && !actor.isOwner) {
      ui.notifications.warn("You can only add projects to your own characters.");
      return;
    }

    const item = await fromUuid(data.uuid);
    if (!item || item.type !== "project") {
      ui.notifications.warn("Only project items can be dropped onto hero cards.");
      return;
    }

    // If the item isn't already owned by this actor, create it on the actor
    let ownedItem = actor.items.get(item.id);
    if (!ownedItem) {
      const created = await actor.createEmbeddedDocuments("Item", [item.toObject()]);
      ownedItem = created[0];
    }

    const state = getState();
    const heroEntry = findHero(state, actorId);
    if (!heroEntry) return;

    if (findProject(heroEntry, ownedItem.id)) {
      ui.notifications.info("That project is already on the board.");
      return;
    }

    addProject(heroEntry, ownedItem.id);
    await setState(state);
    this.render();

    ui.notifications.info(`${ownedItem.name} added to ${actor.name}'s projects.`);
  }

  /* ─── Action Handlers ─── */

  static async #onAddCustomProject(event, target) {
    const actorId = target.closest("[data-actor-id]").dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    if (!game.user.isGM && !actor.isOwner) return;

    new AddProjectDialog({
      actorId,
      board: this
    }).render({ force: true });
  }

  static async #onAddOwnHero(event, target) {
    const actorId = target.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor || actor.type !== "hero") return;
    if (!game.user.isGM && !actor.isOwner) return;

    const state = getState();
    if (findHero(state, actor.id)) {
      ui.notifications.info(`${actor.name} is already on the board.`);
      this.render();
      return;
    }

    addHero(state, actor.id);

    // Auto-import any existing project items from the actor
    const heroEntry = findHero(state, actor.id);
    const actorProjects = getActorProjects(actor);
    for (const proj of actorProjects) {
      addProject(heroEntry, proj.itemId);
    }

    await setState(state);
    this.render();

    const projCount = actorProjects.length;
    ui.notifications.info(`${actor.name} added to the board${projCount ? ` with ${projCount} project(s).` : "."}`); 
  }

  static async #onRemoveHero(event, target) {
    const actorId = target.closest("[data-actor-id]").dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!game.user.isGM && !actor?.isOwner) return;
    const name = actor?.name ?? "Unknown";

    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Remove Hero" },
      content: `<p>Remove <strong>${name}</strong> from the project board?</p>`,
      yes: { default: true }
    });
    if (!confirm) return;

    const state = getState();
    removeHero(state, actorId);
    await setState(state);
    this.render();
  }

  static async #onRemoveProject(event, target) {
    const actorId = target.closest("[data-actor-id]").dataset.actorId;
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const actor = game.actors.get(actorId);
    if (!game.user.isGM && !actor?.isOwner) return;

    const item = actor?.items.get(itemId);
    const projectName = item?.name ?? "this project";

    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Remove Project" },
      content: `<p>Remove <strong>${projectName}</strong> from the board and delete it from ${actor?.name ?? "the character"}? Ledger history will be lost.</p>`,
      yes: { default: true }
    });
    if (!confirm) return;

    // Remove from board state
    const state = getState();
    const heroEntry = findHero(state, actorId);
    if (!heroEntry) return;
    removeProject(heroEntry, itemId);
    await setState(state);

    // Delete the project item from the actor
    if (item) {
      try {
        await item.delete();
      } catch (err) {
        console.warn("ds-project-tracker | Failed to delete project item from actor", err);
      }
    }

    this.render();
  }

  static async #onAddPoints(event, target) {
    const actorId = target.closest("[data-actor-id]").dataset.actorId;
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const actor = game.actors.get(actorId);
    const item = actor?.items.get(itemId);
    if (!actor || !item) return;
    if (!game.user.isGM && !actor.isOwner) return;

    new AddPointsDialog({
      actorId,
      itemId,
      projectName: item.name,
      board: this
    }).render({ force: true });
  }

  static async #onRollProgress(event, target) {
    const actorId = target.closest("[data-actor-id]").dataset.actorId;
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const actor = game.actors.get(actorId);
    const item = actor?.items.get(itemId);
    if (!actor || !item) return;
    if (!game.user.isGM && !actor.isOwner) return;

    // Try to call the system's native roll method
    if (typeof item.system?.rollPrompt === "function") {
      try {
        await item.system.rollPrompt();
        // After the roll, the system should update item.system.points.
        // We'll detect the change on next render.
        // Optionally, capture the chat message to auto-log to ledger.
        this.render();
        return;
      } catch (err) {
        console.warn("ds-project-tracker | rollPrompt() failed, falling back to manual", err);
      }
    }

    // Fallback: open AddPoints dialog pre-set to "roll" source
    new AddPointsDialog({
      actorId,
      itemId,
      projectName: item.name,
      board: this,
      defaultSource: "roll"
    }).render({ force: true });
  }

  static async #onCompleteProject(event, target) {
    const actorId = target.closest("[data-actor-id]").dataset.actorId;
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const actor = game.actors.get(actorId);
    if (!game.user.isGM && !actor?.isOwner) return;

    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Complete Project" },
      content: `<p>Mark this project as <strong>complete</strong>? This cannot be undone.</p>`,
      yes: { default: true }
    });
    if (!confirm) return;

    const state = getState();
    const heroEntry = findHero(state, actorId);
    if (!heroEntry) return;
    const projEntry = findProject(heroEntry, itemId);
    if (!projEntry) return;
    projEntry.completed = true;
    await setState(state);
    this.render();

    ui.notifications.info("Project completed!");
  }

  static async #onViewLedger(event, target) {
    const actorId = target.closest("[data-actor-id]").dataset.actorId;
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const actor = game.actors.get(actorId);
    const item = actor?.items.get(itemId);

    new LedgerDialog({
      actorId,
      itemId,
      projectName: item?.name ?? "Unknown Project",
      board: this
    }).render({ force: true });
  }
}
