export const iconBlueprint = {
  project: { name: 'Icons', slots_per_day: 3 },
  environment: { name: 'Engine', version: 'dev', icon: 'tabler:code|purple' },
  variables: { stamina: { display_name: 'Stamina', initial: 60, icon: 'tabler:heart|red' } },
  expressions: { ready: { type: 'boolean', value: 'vars.stamina >= 10', icon: 'tabler:check|green' } },
  enums: { mood: { scope: 'environment', icon: 'tabler:heart|pink', options: [{ value: 'warm', display_name: 'Warm', icon: 'tabler:heart|red' }, { value: 'calm', display_name: 'Calm', icon: 'blue' }] } },
  tasks: { work: { display_name: 'Work', icon: 'tabler:briefcase|blue', parameters: {
    amount: { type: 'number', icon: 'tabler:calculator|yellow' },
    mood: { type: 'enum', enum: 'mood', icon: 'tabler:heart|purple' },
    tone: { type: 'enum', icon: '#60A5FA', options: [{ value: 'warm', display_name: 'Warm', icon: 'tabler:heart|red' }] },
  } } },
  task_macros: { shift: { mode: 'sequence', icon: 'tabler:briefcase|#60A5FA', parameters: { amount: { type: 'number', icon: 'tabler:calculator|cyan' } }, steps: [] } },
  slots: { routine: { icon: 'tabler:briefcase|blue', branches: [] } },
  days: { working: { icon: 'green', slots: ['routine', null, null] } },
  weeks: { normal: { icon: 'tabler:calendar-week|purple', days: { mon: 'working' } } },
  sequences: { life: { icon: 'tabler:calendar-stats|cyan', weeks: ['normal'], events: { greeting: { icon: 'tabler:heart|red', kind: 'once', day: 'working', start: { week: 1, weekday: 'mon' } } } } },
  builtins: { increment_variable: { icon: 'tabler:calculator|yellow', parameter_icons: { target: 'tabler:code|green' } }, adjust_probability_event: { parameter_icons: { operation: 'tabler:code|blue' }, parameter_option_icons: { operation: { set: 'tabler:check|green' } } } },
};
