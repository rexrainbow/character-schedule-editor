# Character Schedule Editor

[Open the Web App](https://rexrainbow.github.io/character-schedule-editor/dist/)

## Purpose

Character Schedule Editor is a visual tool for designing character routines and the tasks they perform. Build reusable slot schedules, arrange them into days and weeks, and combine weeks into longer sequences. Use variables and conditional rules to adapt activities to a character's state, then export the resulting data for a game engine or other runtime.

## Interface Features

- **Schedule editors:** Start with day schedules, then organize weeks and week sequences. Type an activity name in a day cell's slot picker and confirm to create and assign it, or reuse an existing schedule. Activities can consist of a name alone; task logic is optional and available in the advanced slot editor. Customize individual weekdays and add day overrides within a week sequence.
- **Conditions and expressions:** Build nested ALL/ANY conditions, comparisons, and arithmetic expressions with visual editors. Reuse numeric or Boolean expression macros in either single-expression or conditional branch mode.
- **Macro eligibility and priority candidates:** Add optional eligibility conditions to sequence, branch, or priority macros. Keep rules and actions in one definition, and arrange any macro types into a priority list that runs the first eligible candidate. Conditions start collapsed, with summaries and shortcuts to shared definitions.
- **Direct slot candidates:** Start an empty slot schedule with either an ELSE branch or a priority candidate list. Select and order reusable macros directly in the slot editor, without creating a separate priority macro.
- **Day and slot events:** Optionally assign schedules to the start and end of a day or individual time slots. Expand compact event rows to edit them, reuse named activities, or jump to their details. Event assignments are preserved in day copies, week customizations, previews, and runtime exports.
- **Overlay events:** Add one-time or recurring day schedules to a week sequence. Manage event groups in one panel, choose dates from a week calendar, set priorities, and inspect ordered event icons on each date. Event dates stay fixed when the main week schedules move.
- **Tasks and macros:** Browse variable operations, flow control, and engine tasks; fill in typed parameters and reuse sequential or branching task macros. Built-in tasks support variable assignment, increments, Boolean toggles, and resets. Flow control can cancel lower-priority schedules for the rest of a slot or day while preserving the current source and equal priorities.
- **Variables and environments:** Organize typed variables into groups, configure initial values and read-only access, and switch between user editing and environment editing. Environment definitions provide the variables and task interfaces available to user content.
- **Simulation:** Test a single slot schedule or a selected day in a week sequence. Preview the main schedule and recurring overlay events, then inspect execution by phase and priority with shared test values throughout the day. Follow condition results, task calls, macro expansion, and variable changes, or jump to source schedules. Reset inputs or use successful results for another run without changing the project. External engine task effects are not simulated.
- **Project and runtime files:** Import and export complete projects, import and export environment definitions, and export runtime data for engine integration.
- **Navigation and appearance:** Use a dark interface, searchable lists, a shared icon picker, day previews, and shortcuts to referenced schedules. The layout adapts to desktop and mobile screens.
- **Languages:** Switch between English and Traditional Chinese, with the initial interface language selected from browser preferences.
