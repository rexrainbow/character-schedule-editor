---
version: alpha
name: Character Schedule Editor
description: Dense dark schedule authoring with explicit execution order and reusable definitions.
colors:
  background: "#101218"
  text: "#e2e5ed"
  muted: "#9299ac"
  border: "#2b303e"
  primary: "#b5a1ff"
typography:
  sans: { fontFamily: "Inter, 'Noto Sans TC', system-ui, sans-serif" }
  mono: { fontFamily: "ui-monospace, monospace" }
rounded:
  DEFAULT: "7px"
spacing:
  button-padding: "10px 15px"
components:
  button: {}
  dialog: {}
  input: {}
  execution-trace: {}
---

## Overview

### Creative North Star

A character's schedule is an executable calendar. The distinctive visual element is the ordered, expandable execution tree linked back to its source definitions. Preserve the established dense dark workspace; this migration introduces no visual redesign.

### Product context and register

Product tool for people authoring reusable character schedules and testing their logic. Desktop uses side-by-side inputs/results; narrow screens use input/result tabs. English and Traditional Chinese follow the existing locale provider in `src/i18n/index.js`; neither locale implies a country-specific business workflow. No Japanese locale is currently supported.

### Token ownership/runtime mapping

Existing CSS remains canonical: `src/styles/styles.css` owns base colors, typography, button states and focus; `workspace.css` and `operands.css` own workspace geometry. Values above mirror those sources rather than generating another theme. Shared components and sibling schedule editors are the visual reference.

## Colors

Use background/text for the dark document, muted for secondary explanations, border for grouping and primary for selections/focus. Execution success, skipped and error states include text; color alone never indicates a condition result.

## Typography

Use the existing sans stack for controls and labels; utility monospace for expressions and paths. Human display names may be Chinese or English independently of the active interface locale. Do not translate user-authored names.

## Layout

Keep the compact header and independent input/result scroll regions. Preserve the existing narrow-screen tabs and native selection controls. Busy feedback replaces the existing result status rather than introducing a banner that moves the toolbar.

## Elevation & Depth

Use existing dark surfaces and borders. Diagnostic nesting represents actual execution hierarchy; avoid decorative nested cards.

## Shapes

Retain existing button, field and modal corner geometry. Do not create local theme variants for simulation.

## Components

### Foundational visual states

Native controls retain visible focus and accessible labels. Run is disabled and aria-busy while active; a neutral Cancel action remains available. Inputs remain editable and invalidate the active run. Failed/cancelled results cannot be applied.

### Buttons and actions

Ordinary application notices use a non-interactive toast at the viewport's lower left, visible for the user-requested one second. Reuse the existing dark preview surface, border and accent tokens. The fixed toast never changes workspace height; actionable errors keep their persistent inline treatment.

Sequence editing and continuous simulation share direct source-navigation shortcuts. The editor uses the existing secondary action beside event management (icon only at the established compact breakpoint); simulation uses the existing external-link icon beside the sequence selector. Preserve the compact toolbar height and localized accessible names.

Reuse `.button.primary`, `.button.secondary`, lucide icons and shared UI primitives. Keep Run's label/geometry stable while busy. Apply is always explicit and affects test inputs only.

### Navigation and data display

Editor locations use a shared hash router (`src/gui/navigation/editorLocation.js`, `useEditorLocation.js`). The route stores mode, page, persistent name and optional sequence event name; UUIDs remain live selection identities. Selection changes add history; renames replace the current entry. Search/filter and disclosure state remain transient, outside share links. Pending startup links survive until a project is loaded. Browser navigation through unapplied dialog drafts uses the shared Dialog confirmation with localized labels; missing targets keep navigation usable and show a persistent inline explanation. Shared copy-link actions reuse lucide Link, icon-button and AppNotice.

Continuous simulation's desktop input panel may collapse to a 36px rail using the established panel-toggle icons. Result charts resize within their existing scroller. Narrow screens keep the input/result tab layout and ignore the desktop collapsed geometry; no additional mobile panel state is introduced.

Continuous simulation reuses the mode's small tabs, input/result panels and narrow-screen panel tabs. Daily/weekly results are paged tables; shared dialogs reveal snapshots and the same detailed execution trace. Numeric values carry a secondary delta; event icons identify actual daily sources. Preserve the established dark calendar/editor identity without adding a second dashboard theme.

Week repetition uses the existing native select and compact numeric input in the sticky week-reference column. It does not expand calendar rows into duplicate weeks or add a separate navigation surface.

Sequence event icons form a four-column calendar grid, growing each week uniformly up to three event rows by default. The optional full expansion increases week height instead of introducing cell scrollbars. Overflow uses the existing preview surface colors and allows access to every event's shared information panel.

Expand/collapse details for the trace; source icons jump to the same day/slot definitions as sibling previews. A simulation result is local session state and never changes project dirty status.

### Forms and overlays

Weighted random task macros reuse candidate cards, TaskUseEditor, OperandEditor and DescriptionField. A persistent explanation above the mode selector states qualification → weights → one draw → empty-pool fallback. Each card shows the shared qualification summary before the numeric weight and action selector; fallback is a separate optional section. Reuse existing borders/accent tokens and one editor scroller, with the same controls and explanatory states in English and Traditional Chinese.

The always-available header Help action uses lucide CircleHelp and the existing icon-button. HelpDialog renders the bilingual introduction Markdown documents as a compact semantic table and three short sections. Reuse the shared modal and one body scroller on small screens; desktop targets one-screen reading. Help does not mutate the project or URL, and closing restores focus to its trigger.

Reuse existing native selects when the OS popup is acceptable, the shared Dialog and the existing SequenceDatePicker. Shared descriptions grow with their content up to a scrollable limit instead of requiring drag resizing. Application forms own validation, without native validation bubbles. This task adds no overlay or destructive action.

### Iconography

Lucide for controls; the existing local icon catalog for user objects. Icon-only actions need an accessible name.

All named definitions, task/macro parameters and enum options use the shared `IconField` and `SlotIcon`. The title row remains icon, persistent name, display label; parameter titles use the same compact layout. `src/icons/catalog.js` owns the eight background colors and offline foregrounds; `appearance.js` owns composition, fallback and contrast. The shared picker adds background/hex controls without changing Apply/Cancel semantics. Runtime output excludes icons at every depth; Blueprint preserves optional icons. Generated `docs/ICONS.md` and `src/icons/manifest.json` feed the agent kit from this same catalog.

### Motion

No new animation. Execution yields periodically so Cancel and input edits remain operable. Respect existing reduced-motion behavior.

### Content and data visualization

Event annotations reuse `colorIcons` from `src/icons/catalog.js`, with numeric labels/tooltips accompanying color. Selected events fill or ring the corresponding daily point while preserving the accent-colored line. Invisible larger hit areas support point selection, and keyboard activation opens the canonical day dialog. No new event palette or modal variant is introduced.

Trend charts use Recharts SVG with straight segments, independent numeric scales and a shared Day axis. Runtime snapshots own the values, including captured input at Day 0. Chart lines use the existing `--accent`, ticks use `--muted`, and grids use `--border` from styles.css. Figures stay within the existing result scroller, with no new palette, chart animation or cell scroll region. Keyboard inspection and localized numeric tooltips share the same day coordinate across figures.

Runtime emits structural records; the simulation adapter localizes headings, reasons, paths and values. A false condition differs from an unevaluated condition. Staged changes must never be presented as committed changes.

## Do's and Don'ts

- Preserve the established layout and source navigation.
- Keep project definitions separate from test state and runtime checkpoint state.
- Do not run external engine effects during editor simulation.
- Do not publish a completed result after its input, project or mounted view has changed.
