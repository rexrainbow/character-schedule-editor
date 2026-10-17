# Character Schedule Editor

[Open the Web App](https://rexrainbow.github.io/character-schedule-editor/dist/)

## Purpose

Character Schedule Editor is a visual tool for designing character routines and the tasks they perform. Build reusable slot schedules, arrange them into days and weeks, and combine weeks into longer sequences. Use variables and conditional rules to adapt activities to a character's state, then export the resulting data for a game engine or other runtime.

## Interface Features

- **Schedule editors:** Create, search, duplicate, and organize slot schedules, day schedules, week schedules, and week sequences. Assign reusable schedules, customize individual weekdays, and add day overrides within a week sequence.
- **Conditions and expressions:** Build nested ALL/ANY conditions, comparisons, and arithmetic expressions with visual editors. Reuse numeric or Boolean expression macros in either single-expression or conditional branch mode.
- **Tasks and macros:** Select tasks, fill in typed parameters, and reuse task macros containing sequential steps or conditional branches. Built-in variable tasks support assignment, numeric increments, Boolean toggles, and resetting initial values.
- **Variables and environments:** Organize typed variables into groups, configure initial values and read-only access, and switch between user editing and environment editing. Environment definitions provide the variables and task interfaces available to user content.
- **Simulation:** Choose a slot schedule, adjust independent test values, and inspect condition results, task calls, macro expansion, and variable changes. Reset inputs or use the resulting values for another run without changing the project. External engine task effects are not simulated.
- **Project and runtime files:** Import and export complete projects, import and export environment definitions, and export runtime data for engine integration.
- **Navigation and appearance:** Use a dark interface, searchable lists, a shared icon picker, day previews, and shortcuts to referenced schedules. The layout adapts to desktop and mobile screens.
- **Languages:** Switch between English and Traditional Chinese, with the initial interface language selected from browser preferences.
