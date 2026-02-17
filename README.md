# Draw Steel: Project Point Tracker

A Foundry VTT module for the [Draw Steel](https://mcdm.gg/DrawSteel) system that provides a **party-level project board** for tracking downtime project progress.

Track career project points, point sources, and completion across your entire party — all from a single GM-facing window.

![Foundry VTT v13](https://img.shields.io/badge/Foundry_VTT-v13-informational)
![Draw Steel System](https://img.shields.io/badge/System-Draw_Steel-orange)

---

## Features

- **Party-wide project board** — See all heroes and their active projects in one window.
- **Drag & drop** — Drag hero actors from the sidebar onto the board to register them. Drag project items onto a hero card to assign projects.
- **Auto-import** — When a hero is added, their existing project items are automatically imported.
- **Career project points** — Shows each hero's career name with remaining/total project points and how much has been allocated.
- **Point ledger** — Every point addition is logged with a source, timestamp, and optional notes. View the full history per project.
- **Multiple point sources** — Career points, project rolls, guide studied, follower work, artisan/sage perks, hero collaboration, project events, and director awards.
- **Progress tracking** — Visual progress bar per project showing points earned vs. goal.
- **Roll for progress** — Trigger the Draw Steel system's native project roll (`item.system.rollPrompt()`), or fall back to manual entry.
- **Point sync** — Optionally syncs ledger totals back to the project item's `system.points` field so the character sheet stays up-to-date.
- **Complete projects** — Mark a project as complete when the goal is reached.

## Requirements

| Requirement | Version |
|---|---|
| [Foundry VTT](https://foundryvtt.com/) | v13+ |
| [Draw Steel System](https://github.com/MetaMorphic-Digital/draw-steel) | Any |

This module **only** works with the Draw Steel system. It will not initialise in worlds using other game systems.

## Installation

### Manifest URL (recommended)

1. In Foundry VTT, go to **Settings → Manage Modules → Install Module**.
2. Paste the manifest URL into the **Manifest URL** field:
   ```
   https://github.com/bruceamoser/draw-steel-downtime-project-tracker/releases/latest/download/module.json
   ```
3. Click **Install**.

### Manual

1. Download the latest release zip from the [Releases](https://github.com/bruceamoser/draw-steel-downtime-project-tracker/releases) page.
2. Extract the zip into your Foundry `Data/modules/` folder. The folder should be named `ds-project-tracker`.
3. Restart Foundry and enable the module in your Draw Steel world.

### From Source (development)

1. Symlink `foundry-project-point-tracker/` into your Foundry VTT `Data/modules/` directory as `ds-project-tracker/`.
2. Restart Foundry and enable the module.

## Usage

### Opening the Board

Click the **hammer icon** in the **Token Controls** toolbar on the left sidebar. The button is visible to GMs only.

### Adding Heroes

Drag a **hero actor** from the Actors sidebar onto the project board window. The hero will be registered and any existing project items on their character sheet will be auto-imported.

### Adding Projects

- **Automatic** — Projects are imported when a hero is first added to the board.
- **Drag & drop** — Drag a project item from the Items sidebar (or from a compendium) onto a specific hero card on the board. If the item is not already owned by that actor, a copy will be created on their character sheet.

### Adding Points

Click **Add Points** on a project card:

1. Select a **Source** (career points, project roll, guide, etc.).
2. Enter the number of **Points**.
3. Optionally add **Notes** to describe this entry.
4. Click **Add to Ledger**.

### Rolling for Progress

Click **Roll** on a project card. If the Draw Steel system supports native project rolls, that will be triggered. Otherwise, the Add Points dialog opens pre-set to the "Project Roll" source for manual entry.

### Viewing the Ledger

Click **Ledger** to see the full point history for a project. GMs can delete individual entries from the ledger if needed.

### Completing a Project

When a project reaches 100% progress, a **Complete** button appears. Clicking it marks the project as complete (irreversible).

### Removing Heroes & Projects

- Click the **×** on a hero card header to remove that hero from the board.
- Click the **trash icon** on a project card to remove that project (ledger history will be lost).

## Settings

| Setting | Default | Description |
|---|---|---|
| **Sync points to project items** | Enabled | When adding points via the tracker, also update the project item's `system.points` field on the actor. Disable this if you want the tracker to operate independently of the character sheet. |

Access via **Settings → Module Settings → Draw Steel: Project Point Tracker**.

## File Structure

```
foundry-project-point-tracker/
├── module.json                       # Module manifest
├── lang/
│   └── en.json                       # English localisation
├── scripts/
│   ├── module.mjs                    # Entry point: hooks, settings, toolbar button
│   ├── ProjectBoard.mjs              # Main ApplicationV2 window
│   ├── AddPointsDialog.mjs           # Add Points dialog
│   ├── LedgerDialog.mjs              # Point ledger dialog
│   └── data/
│       └── BoardState.mjs            # Data model, state helpers, actor extraction
├── styles/
│   └── ds-project-tracker.css        # All styles
├── templates/
│   ├── project-board.hbs             # Main board template
│   ├── add-points.hbs                # Add Points form
│   └── ledger.hbs                    # Ledger table
├── dist/                             # Build output (git-ignored)
├── tools/
│   └── build_foundry_release.js      # Build & zip script
└── README.md
```

## Building a Release

```bash
npm run build:project-tracker-release
```

Output:
- `foundry-project-point-tracker/dist/module.json` — Stamped manifest for GitHub Releases
- `foundry-project-point-tracker/dist/ds-project-tracker-v<VERSION>.zip` — Installable zip

Upload both files as GitHub Release assets.

## License

This project is licensed under the [MIT License](LICENSE.md).

## Acknowledgements

- [Foundry VTT](https://foundryvtt.com/) — Virtual tabletop platform.
- [Draw Steel](https://mattcolville.com/drawsteel) by MCDM Productions — The RPG system this module supports.
- [MetaMorphic Digital](https://github.com/MetaMorphic-Digital/draw-steel) — Draw Steel system implementation for Foundry VTT.
