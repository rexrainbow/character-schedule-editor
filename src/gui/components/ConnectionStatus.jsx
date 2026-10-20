export default function ConnectionStatus({ connection, onReload, onExport, t }) {
  if (!connection) return null;
  const warning = connection.conflict || !connection.connected;
  return <section className={`connection-status ${warning ? 'connection-warning' : ''}`} aria-label={t('remoteConnection')}>
    <span role="status">{t(!connection.connected ? 'remoteDisconnected' : connection.conflict ? 'remoteConflict' : connection.pending || connection.busy ? 'remoteSubmitting' : connection.remoteUpdates ? 'remoteDraftHeld' : 'remoteConnected')}</span>
    {warning && <div><button className="button secondary" onClick={onExport}>{t('remoteExportLocal')}</button><button className="button secondary" onClick={onReload}>{t(connection.ready ? 'remoteReload' : 'remoteRetry')}</button></div>}
  </section>;
}
