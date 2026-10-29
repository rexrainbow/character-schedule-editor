# Character Schedule Editor

Plan what a character does and when, then adapt those activities to their state and events. Start with a fixed routine; add conditions, tasks and simulation as needed.

| Level | Purpose | Example |
| --- | --- | --- |
| Week sequence | Combine weeks; set boundaries, repeats and events | Repeat a working week indefinitely, with possible illness |
| Week schedule | Assign a day schedule to each weekday | Work on weekdays, rest on weekends |
| Day schedule | Arrange slots and day/slot start and end actions | Work in the morning and afternoon, rest in the evening |
| Slot schedule | Define an activity, optionally chosen by conditions | Work if stamina is sufficient; otherwise rest |
| Task macro | Combine tasks into sequences, branches or priority candidates | Work: spend stamina and count completed shifts |
| Task | Perform one specific action | Increase money, set a variable or reserve an event |
| Variables / expression macros | Store state or calculate results shared across all levels | Stamina, completed shifts and weekly pay |

## Events change the routine

Add one-time, periodic or probability events to a week sequence. Rent and payroll can run as overlays; illness and maintenance can interrupt the main schedule. Events also use day schedules to define their content.

## Start simple, then add detail

Activity names alone are enough to build a routine. Add tasks, macros and conditions when you need action logic. Slot schedules can also call tasks directly, without a macro.

## Edit → simulate → export

Use day simulation to inspect conditions and execution order, and continuous simulation to observe value trends. Export runtime data for your engine, or a YAML blueprint for people and agents to edit. Simulation runs built-in variable operations; external task effects are provided by your engine.
