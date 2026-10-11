import { downloadBackup, downloadJson } from "./backupDownload";
import type { SaveStatus } from "./plannerController";
import type { useStoredPlanner } from "./useStoredPlanner";

type PlannerState = ReturnType<typeof useStoredPlanner>;

export function saveStatusLabel(status: SaveStatus, revision: number, local: boolean): string {
  switch (status) {
    case "saved":
      if (revision === 0) return "No changes to save";
      return local ? "Saved in this browser" : "Saved to your account";
    case "conflict": return "Save conflict";
    case "failed": return "Save failed";
    case "pending": return "Changes pending";
  }
}

export function MigrationScreen({ planner }: { planner: PlannerState }) {
  const migration = planner.migration;
  if (!migration) return null;
  const localDocument = migration.document;
  return <main className="page-content">
    <h1>Choose your planner for account {planner.session?.user_id}</h1>
    <p>
      Existing browser data and settings were found. Local copies remain readable to anyone using this browser,
      including other accounts. After a successful upload you can remove them and their recovery backups.
      {" "}{planner.revision === 0
        ? "This account has no remote planner."
        : "This account also has a remote planner. Uploading local data replaces that remote copy."}
    </p>
    <button className="button" onClick={() => downloadJson(migration.raw)}>Export original local backup</button>
    {localDocument && <>
      <p>Local copy: {localDocument.pools.length} pools; {localDocument.events.length} events.</p>
      <button className="button" onClick={() => downloadBackup(localDocument)}>Export migrated local backup</button>
    </>}
    <button className="button" onClick={() => downloadBackup(planner.document)}>Export remote backup</button>
    {migration.warnings.map((warning, index) => <p role="alert" key={index}>{warning}</p>)}
    {(planner.error || migration.error) && <p role="alert">{planner.error || migration.error}</p>}
    <button className="button" disabled={planner.resolving || !localDocument} onClick={() => {
      if (window.confirm("Upload the displayed local copy and settings, replacing the remote planner? Export backups first if needed.")) {
        void planner.migrate();
      }
    }}>Upload local planner and settings</button>
    <button className="button" disabled={planner.resolving} onClick={planner.chooseRemote}>Use remote / cancel migration</button>
    {planner.mode === "remote" && <button className="button" onClick={() => void planner.logout()}>Sign out</button>}
  </main>;
}

export function ConflictPanel({ planner }: { planner: PlannerState }) {
  const local = planner.mode === "local";
  const source = local ? "browser" : "remote";
  const latest = planner.latest;
  function resolve(replace: boolean) {
    const message = replace
      ? `Replace the latest ${source} copy with your unsaved work? Export both copies first if needed.`
      : `Load the latest ${source} copy? Your unsaved work will remain available as a retained backup in this page.`;
    if (window.confirm(message)) planner.resolveConflict(replace);
  }
  return <section aria-label="Resolve revision conflict">
    <p role="alert">
      {local ? "Another tab or window changed this browser's planner." : "Remote data changed."}
      {" "}Your unsaved work is retained. Saving is paused until you choose a copy.
    </p>
    <button className="button" onClick={() => downloadBackup(planner.document)}>Export unsaved work</button>
    <button className="button" disabled={planner.resolving} onClick={() => void planner.fetchLatest()}>
      Fetch latest {source} copy
    </button>
    {latest && <>
      <p>Latest {source} revision: {latest.revision}. Pools: {latest.document.pools.length}; events: {latest.document.events.length}.</p>
      <button className="button" onClick={() => downloadBackup(latest.document)}>Export latest {source} backup</button>
      <button className="button" onClick={() => resolve(false)}>Load latest {source} copy</button>
      <button className="button" onClick={() => resolve(true)}>Replace {local ? `${source} copy` : source} with my work</button>
    </>}
  </section>;
}
