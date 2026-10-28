import { useEffect, useRef, useState } from 'react';
import { editorLocationHash, locationIdentity, parseEditorLocation, resolveEditorLocation } from '../navigation/editorLocation.js';

// UUIDs own live selection; only persistent names cross the URL boundary.
export default function useEditorLocation({ ready, draft, current, apply, onError }) {
  const latest = useRef(null), boot = useRef(false), applying = useRef(null), last = useRef(null);
  const dialogs = useRef(new Map()), index = useRef(0), restore = useRef(null), bypass = useRef(false);
  const [confirmation, setConfirmation] = useState(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const hash = editorLocationHash(draft, current), identity = locationIdentity(current);
  latest.current = { ready, draft, current, apply, onError, hash, identity };
  function write(target, replace = false) {
    if (!replace) index.current += 1;
    window.history[replace ? 'replaceState' : 'pushState']({ ...window.history.state, editorLocationIndex: index.current }, '', target);
  }
  function accept(target) {
    const state = latest.current;
    const result = resolveEditorLocation(state.draft, parseEditorLocation(target));
    applying.current = { identity: locationIdentity(result.location), hash: editorLocationHash(state.draft, result.location) };
    state.onError(result.error ? result : null);
    state.apply(result.location);
    setRequestVersion((value) => value + 1);
  }
  useEffect(() => {
    const changed = () => {
      const state = latest.current;
      if (!state.ready || !boot.current) return;
      const target = window.location.hash;
      if (restore.current) {
        if (target === restore.current) restore.current = null;
        return;
      }
      if (target === last.current?.hash) return; // popstate and hashchange describe the same traversal.
      let targetIndex = window.history.state?.editorLocationIndex;
      // A typed/assigned hash creates an entry carrying the previous state. Stamp it
      // before traversing so cancelling a draft navigation preserves Back/Forward.
      if (!Number.isInteger(targetIndex) || targetIndex === index.current) {
        targetIndex = index.current + 1;
        window.history.replaceState({ ...window.history.state, editorLocationIndex: targetIndex }, '', window.location.href);
      }
      const delta = targetIndex - index.current;
      if (!bypass.current && [...dialogs.current.values()].some((dialog) => dialog.dirty)) {
        if (delta) { restore.current = last.current.hash; window.history.go(-delta); }
        else write(last.current.hash, true);
        setConfirmation({ target, delta });
        return;
      }
      bypass.current = false;
      index.current = Number.isInteger(targetIndex) ? targetIndex : index.current + 1;
      last.current = { ...last.current, hash: target };
      accept(target);
    };
    window.addEventListener('popstate', changed); window.addEventListener('hashchange', changed);
    return () => { window.removeEventListener('popstate', changed); window.removeEventListener('hashchange', changed); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (!boot.current) {
      boot.current = true;
      index.current = window.history.state?.editorLocationIndex ?? 0;
      write(window.location.hash || hash, true);
      if (window.location.hash !== hash) { accept(window.location.hash); return; }
    }
    if (applying.current) {
      const expected = applying.current;
      // App may show its established default selection for a list route.
      if (identity !== expected.identity && expected.identity !== locationIdentity({ ...current, id: null, eventId: undefined })) return;
      applying.current = null;
      write(expected.hash, true);
      last.current = { hash: expected.hash, identity };
      return;
    }
    if (last.current?.hash === hash) { last.current = { hash, identity }; return; }
    const replace = !last.current || last.current.identity === identity;
    write(hash, replace);
    last.current = { hash, identity };
    latest.current.onError(null);
  }, [ready, hash, identity, requestVersion]);

  const registry = useRef({
    register(id, value) { dialogs.current.set(id, value); return () => dialogs.current.delete(id); },
  }).current;
  function cancel() { setConfirmation(null); }
  function discard() {
    const pending = confirmation; setConfirmation(null);
    if (pending.delta) { bypass.current = true; window.history.go(pending.delta); }
    else { write(pending.target); last.current = { ...last.current, hash: pending.target }; accept(pending.target); }
  }
  return { registry, confirmation, cancel, discard, refresh: () => setRequestVersion((value) => value + 1) };
}
