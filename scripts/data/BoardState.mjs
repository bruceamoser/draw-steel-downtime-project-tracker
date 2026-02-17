/**
 * BoardState — Data model for the project tracker's world-level setting.
 *
 * Stored in: game.settings.get("ds-project-tracker", "boardState")
 *
 * Shape:
 * {
 *   version: 1,
 *   heroes: [
 *     {
 *       actorId: string,
 *       careerPointsAllocated: number,   // how many career PP have been spent across projects
 *       projects: [
 *         {
 *           itemId: string,              // ID of the project Item on the actor
 *           ledger: [ LedgerEntry, ... ],
 *           completed: boolean
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * LedgerEntry:
 * {
 *   id: string,        // random unique id
 *   timestamp: number,  // Date.now()
 *   source: "career"|"roll"|"guide"|"follower"|"perk"|"collaboration"|"event"|"other",
 *   points: number,
 *   notes: string
 * }
 */

const MODULE_ID = "ds-project-tracker";
const SETTING_KEY = "boardState";

export function emptyState() {
  return { version: 1, heroes: [] };
}

export function emptyHeroEntry(actorId) {
  return {
    actorId,
    careerPointsAllocated: 0,
    projects: []
  };
}

export function emptyProjectEntry(itemId) {
  return {
    itemId,
    ledger: [],
    completed: false
  };
}

/**
 * Generate a short random ID for ledger entries.
 */
export function randomId(len = 16) {
  return foundry.utils.randomID(len);
}

/**
 * Read the current board state from the world setting.
 */
export function getState() {
  const raw = game.settings.get(MODULE_ID, SETTING_KEY);
  if (!raw || !raw.version) return emptyState();
  return raw;
}

/**
 * Write the full board state to the world setting.
 */
export async function setState(state) {
  await game.settings.set(MODULE_ID, SETTING_KEY, state);
}

/* ─── Hero helpers ─── */

export function findHero(state, actorId) {
  return state.heroes.find(h => h.actorId === actorId);
}

export function addHero(state, actorId) {
  if (findHero(state, actorId)) return state;
  state.heroes.push(emptyHeroEntry(actorId));
  return state;
}

export function removeHero(state, actorId) {
  state.heroes = state.heroes.filter(h => h.actorId !== actorId);
  return state;
}

/* ─── Project helpers ─── */

export function findProject(heroEntry, itemId) {
  return heroEntry.projects.find(p => p.itemId === itemId);
}

export function addProject(heroEntry, itemId) {
  if (findProject(heroEntry, itemId)) return heroEntry;
  heroEntry.projects.push(emptyProjectEntry(itemId));
  return heroEntry;
}

export function removeProject(heroEntry, itemId) {
  heroEntry.projects = heroEntry.projects.filter(p => p.itemId !== itemId);
  return heroEntry;
}

/* ─── Ledger helpers ─── */

export function addLedgerEntry(projectEntry, { source, points, notes = "" }) {
  const entry = {
    id: randomId(),
    timestamp: Date.now(),
    source,
    points: Number(points) || 0,
    notes
  };
  projectEntry.ledger.push(entry);
  return entry;
}

export function removeLedgerEntry(projectEntry, entryId) {
  projectEntry.ledger = projectEntry.ledger.filter(e => e.id !== entryId);
}

export function ledgerTotal(projectEntry) {
  return projectEntry.ledger.reduce((sum, e) => sum + (e.points || 0), 0);
}

/* ─── Actor data extraction ─── */

/**
 * Read career information from an actor.
 * Returns { name, projectPoints } or null.
 */
export function getCareerData(actor) {
  if (!actor) return null;
  const career = actor.items.find(i => i.type === "career");
  if (!career) return null;
  return {
    name: career.name,
    projectPoints: career.system?.projectPoints ?? 0
  };
}

/**
 * Read all project items from an actor.
 * Returns an array of { itemId, name, type, points, goal, rollCharacteristic, prerequisites, projectSource }.
 */
export function getActorProjects(actor) {
  if (!actor) return [];
  return actor.items
    .filter(i => i.type === "project")
    .map(i => ({
      itemId: i.id,
      name: i.name,
      type: i.system?.type ?? "other",
      points: i.system?.points ?? 0,
      goal: i.system?.goal ?? 0,
      rollCharacteristic: i.system?.rollCharacteristic ?? [],
      prerequisites: i.system?.prerequisites ?? "",
      projectSource: i.system?.projectSource ?? ""
    }));
}

/**
 * Calculate total career points allocated across all projects for a hero.
 */
export function totalCareerAllocated(heroEntry) {
  let total = 0;
  for (const proj of heroEntry.projects) {
    for (const entry of proj.ledger) {
      if (entry.source === "career") total += entry.points;
    }
  }
  return total;
}
