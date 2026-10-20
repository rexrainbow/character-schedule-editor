import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createProjectSession } from '../../core/projectApi.js';
import { createRemoteProjectClient } from '../../browser/remoteProjectClient.js';

const noSubscribe = () => () => {}, noConnection = () => null;

export default function useProject() {
  const ref = useRef(null);
  if (!ref.current) ref.current = window.__SCHEDULE_CONNECTION__ ? createRemoteProjectClient(window.__SCHEDULE_CONNECTION__) : createProjectSession(undefined, { validation: 'draft' });
  const project = ref.current;
  const draft = useSyncExternalStore(project.subscribe, project.getSnapshot, project.getSnapshot);
  const connection = useSyncExternalStore(project.subscribeConnection ?? noSubscribe, project.getConnectionState ?? noConnection, noConnection);
  useEffect(() => {
    if (!project.isRemote) return;
    const stop = project.start();
    const update = () => project.setHold(!!document.querySelector('dialog[open]'));
    const observer = new MutationObserver(update); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] }); update();
    return () => { observer.disconnect(); stop(); };
  }, [project]);
  return [project, draft, connection];
}
