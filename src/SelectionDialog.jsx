import { useContext, useLayoutEffect } from 'react';
import { IconDialogContext } from './iconDialogContext.js';
import { Dialog } from './ui.jsx';

// Reuse the active native dialog instead of opening nested modal windows.
export default function SelectionDialog(props) {
  const host = useContext(IconDialogContext);
  useLayoutEffect(() => { if (host) host(props); });
  useLayoutEffect(() => () => { if (host) host(null); }, [host]);
  return host ? null : <Dialog {...props} />;
}
