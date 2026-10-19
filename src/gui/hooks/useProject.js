import { useRef, useSyncExternalStore } from 'react';
import { createProjectSession } from '../../core/projectApi.js';

export default function useProject() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createProjectSession(undefined, { validation: 'draft' });
  const project = ref.current;
  const draft = useSyncExternalStore(project.subscribe, project.getSnapshot, project.getSnapshot);
  return [project, draft];
}
