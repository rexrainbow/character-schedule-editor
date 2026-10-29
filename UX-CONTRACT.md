# Character Schedule Editor behavior contract

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native select; existing authored day and icon pickers | Existing editor controls and i18n provider | Native for simple values; authored for rich objects | Browser simulation and day simulation tests |
| Date | SequenceDatePicker | Sequence boundaries and schedule constants | Active-date-only simulation selection | tests/browser/daySimulation.spec.js |
| Form | Existing editors and Issues | Project schemas, field errors and simulation inputs | Editable test values; bound progress fields disabled | tests/browser/simulation.spec.js |
| Scrollbar | src/styles/styles.css and workspace.css | Existing independent input/result panels | Narrow-screen panel tabs | Desktop/narrow browser verification |
| Toast | AppNotice and inline role=status/Issues | src/gui/components/AppNotice.jsx and shared ui.jsx | Ordinary notices use a one-second lower-left toast; actionable errors remain dismissible inline | tests/browser/toast.spec.js |
| CRUD | Project API and existing editor navigation | docs/PROJECT_API.md | Simulation is isolated, not a project mutation | Project-equality assertions in browser tests |

## Weighted task macros

- Random mode uses the same task/macro parameter controls and candidate add/copy/move/delete actions as sibling editors. The final add-candidate action remains available below the list.
- Qualification belongs to the referenced macro; weight belongs to the candidate call. The shared TaskUseEditor supports a summary-first variant, with the numeric OperandEditor before the action selector.
- Persistent localized instructions explain the execution order. Static probability previews are shown only for unconditional candidates with valid constant weights. Fallback is optional, independent of the pool, and retains normal call eligibility.
- The runtime owns all decisions and emits diagnostics; summaries and reports never execute expressions. UUID/name programs and pending checkpoints preserve the same selection behavior.
- Verification: `tests/weightedTaskMacros.test.js`, `tests/browser/weightedMacros.spec.js`.

## Tool introduction

- The global Help icon is available before a project is loaded and in every editing/simulation mode. Its content follows the active English/Traditional Chinese locale.
- The shared icon picker edits a local draft: Apply commits foreground/background together; Cancel/Escape preserve the original string and restore trigger focus. Unknown imported identifiers remain editable with a cosmetic warning. Parameters/options use the same picker, including fixed builtin metadata while structural controls remain locked. Native enum selects retain text options and show the selected option icon beside the control. Empty icons use the editor default; foregrounds never fetch from the network.
- `HelpDialog` reads `docs/INTRODUCTION.md` and `docs/INTRODUCTION.en.md` directly; the documentation remains the content owner. It uses the shared Dialog, native table semantics, Escape/Close actions and trigger focus restoration.
- Help is read-only and transient: opening/closing does not change project data, navigation history or editor selection. Desktop targets one screen; narrow screens use the shared modal body scroller.

## Shareable editor locations

- The canonical owner is `src/gui/navigation/editorLocation.js` with `useEditorLocation.js`; App selections remain UUID-based. Hash routes contain mode, page and persistent name, with optional sequence event name. GitHub Pages requires no server fallback configuration.
- Initial links wait for project import/load. Missing objects and malformed routes show localized persistent inline feedback and leave list navigation available.
- Selecting a different editor/object pushes browser history; editing the name of the same UUID replaces its entry. Transient searches, filters, expansions, test values and unapplied drafts are excluded from shared URLs.
- Browser Back/Forward and external hash changes use the shared Dialog to protect unapplied dialog drafts. Keep editing preserves the draft and URL; discard opens the target. Ordinary editor fields continue their existing immediate-commit behavior.
- Copy-link actions use the same icon-button, localized labels and AppNotice feedback on all modes; events provide a copy action inside their modal.
- Verification: `tests/editorLocation.test.js` and `tests/browser/editorLocation.spec.js`.

## Application notification behavior

- Ordinary import/export and informational notices appear at the viewport's lower left for 1000 ms, as explicitly requested. They do not move editor content, take focus or intercept pointer input.
- A new notice replaces the previous one and restarts its timer. Cleanup plus notice-identity checking prevents an old timer from hiding a new message. Announcements use the existing localized polite status semantics.
- Errors and associated validation details remain in the existing inline area until dismissed or replaced by a later operation. Simulation progress and other persistent local statuses are not transient toasts.

## Runtime-backed simulation

- Each Run uses a new UUID program and independent state. Inputs, initial-value baseline, manual event outcomes, selected event days and progress bindings are captured for that run.
- Only one run per mounted simulator. Run is disabled while busy; duplicate activation is guarded synchronously.
- Input/project changes and unmount abort the old run. Late results cannot overwrite a newer session. Manual Cancel preserves test inputs and never applies partial results.
- Runtime diagnostics are opt-in, emitted as frozen records, and collected outside runtime. No historical diagnostic records belong in runtime state or checkpoint.
- Successful execution displays the existing execution tree, task calls and committed variable changes. Short-circuit and unselected branches remain explicitly unevaluated. Error paths and source links remain available.
- External tasks are recorded without side effects. The interface retains the explicit unknown-effects assumption.
- Apply copies successful final variables to test inputs only. Reset restores project-defined initial values. Failure, cancellation and active execution disable Apply.
- Trace localization is presentation work; engine decisions never depend on translated text. Supported interface locales are English and Traditional Chinese.

## Continuous simulation

- Schedule simulation and continuous simulation share the mode navigation and keep separate sessions. Local result history never dirties or exports with project definitions.
- Sequence editor ↔ continuous simulation shortcuts use the currently selected sequence. Entering simulation preserves inputs and same-target results, clears different-target results and never auto-runs. Returning opens the selector's current sequence and clears sequence search; an active run is stopped with completed dates retained. Compact screens use accessible icon buttons with localized titles.
- Continuous runs start at the sequence start, default to 28 days and allow 1–366. Runtime makes probability/candidate decisions; progress values are automatic. No engine handler runs.
- Run is guarded against duplicates; explicit cancellation retains completed days. Input/project changes or unmount invalidate outstanding work. A partial day is excluded from daily/week-end snapshots.
- Daily/week tables use 14 rows per page and up to six chosen value columns. Complete snapshots retain all variables. The existing result panel owns scrolling; mobile uses input/result tabs.
- Desktop continuous inputs can collapse to a narrow expand rail, giving the result panel remaining width. Controls stay in the toolbar; input/result/marker state remains mounted and unchanged. Keyboard focus moves to the available toggle. At the existing narrow-screen breakpoint the desktop preference is ignored and input/result tabs remain authoritative.
- Shared Dialog owns day/week summaries and source navigation. Detailed replay stays in that same day dialog, restores a pre-start checkpoint and collects shared SimulationTrace diagnostics independently. Closing cancels replay.
- Macro summaries subscribe to lifecycle events with diagnostics disabled. Historical snapshots and contributions belong to the simulation collector, not runtime.
- Results have Daily records / Weekly summaries / Trends tabs. Recharts owns SVG plotting in the lazily loaded trend component; the simulation data adapter remains library independent. Each numeric variable has its own value scale and shared elapsed-day axis. Day 0 is captured input, followed only by completed daily snapshots. Chart selections are separate from table columns, and tooltip day positions synchronize across charts.
- Clickable chart points reuse the shared day dialog; arrow keys plus Enter/Space provide an alternative. Day 0 has no day dialog. Selected actual event occurrences use existing eight-color markers; same-day events use rings and a count, with all names in the tooltip. Event selection/colors are session presentation data only. Simulation range and future chart viewport limits remain separate concerns.

## Sequence event display

Week references own execution counts: once, finite positive total, or infinite on the final entry only. Infinite repetition hides end flags and disables unreachable append/duplicate/move actions. The calendar stays a template; day numbers and single-day simulation use each cell's first active occurrence. Repeat settings are project data, while event expansion is presentation only.

- Events use four columns in execution order. The default limit is three rows: up to 12 events, or 11 plus an overflow button when more exist.
- Each week grows to its busiest day's event area; main day references remain aligned across the week. Existing variable-height virtualization owns scrolling; cells do not scroll independently.
- Overflow opens a non-modal list of all events with names and the shared day-reference previews. Outside interaction closes it; Escape closes the nested preview first, then the list and restores focus to the trigger.
- Expand all events removes the row limit for inspection. It is local presentation state and does not change project data.

## Migration boundaries

This change preserves the existing visual system and editor flows. Native confirmation calls in unrelated legacy editors are not a newly approved pattern; replace them through the shared Dialog when those workflows are migrated. No financial or external engine action is executed by simulation.
