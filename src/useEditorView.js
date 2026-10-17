import { useState } from 'react';

// Keep page selection and search in App when a mode/page is temporarily hidden.
export default function useEditorView(view, onViewChange, initialSelected = null) {
  const [local, setLocal] = useState({ selected: initialSelected, search: '' });
  const state = view ?? local;
  const change = (key, value) => (onViewChange ?? setLocal)((previous) => ({ ...previous, [key]: value }));
  return [state.selected ?? initialSelected, (value) => change('selected', value), state.search ?? '', (value) => change('search', value)];
}
