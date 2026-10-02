# Margin

A responsive writing workshop built with plain JavaScript, PHP 8+, CSS, and MySQL 8. No package manager or frontend build step. Apache can serve the project directly. The demo works without a database and saves to this browser.

## Run locally

```sh
php -S localhost:8080
```

Open http://localhost:8080. For MySQL persistence, import `database/schema.sql` into a database and configure these environment variables in PHP/Apache:

```text
MARGIN_DB_DSN=mysql:host=127.0.0.1;dbname=margin;charset=utf8mb4
MARGIN_DB_USER=margin
MARGIN_DB_PASSWORD=your-password
```

Requires PDO MySQL. Use a database account scoped to this database. With Apache, point the document root at this directory; no rewrite rules are needed. Fonts use Google Fonts, with local system fallbacks.

## What works

- Multiple documents, automatic browser saving, sidebar deletion with confirmation, and optional session-scoped MySQL persistence.
- Plain-text prose editing with native keyboard undo/redo, selected-text annotations, editing-pass categories, comment navigation, and resolve/reopen.
- **Writing settings** in the sidebar controls spelling underlines and automatic corrections for the document editor. Underlines default off to avoid the intrusive tap-to-correct menu; automatic corrections default on. The preference is saved in this browser.
- Revision checkpoints, major-revision flags, and restoring drafts with a backup checkpoint first.
- Process recording: app-wide keydown/keyup, beforeinput/input, IME composition boundaries, paste/cut/copy, editor cursor selections, comment drafts, title edits, focus/blur, window focus, tab visibility, scroll positions, interface controls, comments, revisions, and document navigation.
- Every event has a UUID, document sequence, session ID, UTC wall-clock timestamp, and monotonic elapsed milliseconds. Text edits store patches; session starts and restores store snapshots so the draft can be reconstructed.
- Replay through events, a process summary, a recent-event list, text export, and full JSON process export. Recording can be paused explicitly.

## Prototype boundaries

Replay reconstructs document text and displays event/cursor information; it does not reproduce the entire browser interface or scroll motion. Playback currently advances one event every 130 ms rather than following original timing. Selection and scroll events are coalesced, so this is a semantic process log, not a screen recording or raw pointer trace. Edits overlapping an annotation detach its highlight but retain its comment. The editor is plain text, not a rich-text Notion implementation.

The browser stores the complete workspace, and the server receives complete workspace snapshots with deduplicated event inserts. This is suitable for a small prototype, not long research sessions: Incremental event batches, acknowledgements/retries, and a storage quota strategy should precede production collection. Local storage now uses separate IndexedDB records (see save behavior below). Closing a tab before a pending server sync may leave its last events only in browser storage. MySQL sessions are scoped to a PHP session cookie; authentication, cross-device accounts, concurrent editing, and conflict resolution are not included. Local state takes precedence if present.

The capture switch starts on and records only activity within this app. For research use, add participant consent, study identifiers, broader retention controls, and access restrictions. Drafts and process logs include sensitive typed content. Serve via HTTPS. External fonts can be self-hosted for an offline deployment.

Spellcheck and autocorrect attributes are browser/keyboard controls rather than a guaranteed way to suppress every mobile suggestion menu. Browsers do not expose a reliable separate control for spelling underlines and the tap-to-correct menu. Turning spelling underlines back on can bring that menu back. Inline writing predictions and suggestions above the keyboard remain available. Writing settings are device-local preferences, not part of a document or workspace export.

## Word analysis

Open **Word analysis** to see one row for every word occurrence in the latest checkpoint. Save a new checkpoint to update the final text being analysed. The table includes before/after pauses in seconds, compact editing history, expandable individual operations with UTC timestamps, and a heuristic purity score. **Export analysis JSON** downloads the derived rows and their source checkpoint; analysis does not modify the underlying log.

Pauses use the monotonic intervals between **document text-input events**, around the inputs that created the first and last surviving characters. This includes spaces, punctuation, deletions, and any time spent elsewhere between those inputs; it is not a measure of active thinking time. Missing preceding/following input, session boundaries, recording boundaries, and pasted or bulk characters produce unknown intervals. If a single-letter correction changes a word's first or last letter, its boundary pause follows that surviving corrected letter. Input after the chosen checkpoint is excluded.

History notation: `T"cat"` (typing), `I"s"` (insertion into an existing word), `D"t"` (deletion), `R"o"→"a"` (replacement), `P"text"` (external paste), `C←@0 "cat"` (matched internal copy), `M←@0 "cat"` (matched internal cut/paste), `B"text"` (bulk input), and `Restore`. Offsets are zero-based UTF-16 character positions, matching textarea selections. Word parsing handles Unicode letters/numbers, combining marks, internal apostrophes, and hyphens; it is not language-specific morphological segmentation.

Character provenance and word ancestry survive corrections, splits, joins, complete deletion followed by retyping at the same seam, and nested copy/move operations. Copy history freezes at the copy event, so later source edits do not contaminate the copy. Copy/move matching is a same-document heuristic based on the last captured selection and exact pasted text. Cross-document copies, external clipboard changes, drag/drop provenance, and ambiguous bulk replacements are not resolved. Passage replacements and split/join histories can be shared across final words and are marked accordingly. Older logs used minimal diffs, which can mislocate edits among repeated letters; new edits use pre-input selections when available.

Purity is `round(100 / (1 + revision-operation count + transferred/bulk-character penalty + shared-lineage penalty))`. Revision operations include insertion into a completed word, deletion, replacement, paste, copy, move, bulk input, and restoration; each recorded operation counts separately. Penalties are each 0 or 1. Typing a word once without revisions scores 100; pre-existing/unrecorded ancestry is unknown. It describes the observed editing process rather than writing quality. IME/mobile multi-character batches are explicitly marked bulk, not assumed to be individual keystrokes. Seed checkpoints without matching capture events have unknown histories. Words present during a recording pause have incomplete histories even if the resumed snapshot looks unchanged, because edits that were subsequently reversed cannot be detected. Checkpoints saved while recording is paused also show unknown history.

Run the meaningful analysis and integration checks without dependencies:

```sh
node tests/word-analysis.test.cjs
node tests/app-integration.test.cjs
```

## Writing scores and synthetic test data

Open **Writing score** to paste a linear representation, preview the reconstructed text, and create a separate test document. Imports include a final checkpoint for word analysis and a log for replay. Existing documents are never overwritten. **Load example** loads the supplied example; its exact final text includes two trailing newlines. The optional expected-text field compares the complete string, including whitespace, before import.

For automatic test data, enter a target in **Expected final text / generator target**, choose a seed and an edit-pass count, then click **Generate score**. The same target, seed, and count produce the same score. Generation types the target with per-character delays, introduces/corrects suffix errors, copies temporary passages, and moves original words out and back. By default, these operations are expressed using only pauses, literal typing, `<DEL>`, `<ENTER>`, and `<CLICK…>` for compatibility with basic renderers. **Use extended notation** preserves explicit selections and clipboard operations. Each generated score is parsed again to verify that it reconstructs the target exactly. Targets are limited to 5,000 UTF-16 units and edit passes to 50.

Basic notation (default generation/export) uses pauses, literal typing, DEL, CLICK, and ENTER. The selection, clipboard, forward-delete, tab, and bracket directives below are optional Margin extensions and require a renderer that supports them. **Make portable** converts an existing extended score into basic notation without changing its final text or overall pause duration.

Syntax:

| Score | Effect |
| --- | --- |
| `<2.329>` | Advance the simulated clock by 2.329 seconds |
| `Hello` | Insert a run of characters at the cursor, replacing any selection |
| `<DEL>` / `<DEL3>` | Backspace one / three UTF-16 units; a selected range is deleted as a whole |
| `<CLICK31>` | Collapse the cursor to zero-based UTF-16 offset 31 |
| `<ENTER>` / `<TAB>` | Insert newline / tab |
| `<SELECT2:8>` | Select the half-open range from 2 to 8 |
| `<FWD>` / `<FWD3>` | Delete forward one / three units |
| `<COPY>` | Capture the selected text into the simulated clipboard |
| `<CUT>` | Capture and delete the selected text |
| `<PASTE>` | Paste the simulated clipboard |
| `<LT>` / `<GT>` | Type a literal angle bracket |

Unicode characters are typed as whole code points. Cursor/delete operations that split surrogate pairs are rejected. Out-of-range cursor positions and malformed directives are errors; overlong backspaces clamp to the text boundary with a warning. Unknown tokens are preserved as log markers and reported as having no simulated effect.

Typed characters produce synthetic `before_input` and `text_change` events with the same event structure used by the editor; cursor and clipboard actions produce corresponding semantic events. No physical keyboard, focus, or scroll activity is invented. All synthetic events are explicitly marked. A plain run such as `Hello` supplies no timing between its letters: word analysis marks intervals inside that run as unknown, rather than assuming zero. Explicit pauses between runs are measured, and the initial score delay is available as the first word's before-pause. Rich-log clocks use millisecond resolution; finer pause values are rounded with a warning while the original score tokens remain intact. Imported simulated sessions end at import time so subsequent real writing belongs to a new session.

**Load its score** / **Download score** export the active document. The default basic export reconstructs text, cursor movements, and edit timing. Selected replacements become `<CLICKend><DELcount>` followed by literal text; cuts and copies become explicit deletes and literal insertions. No SELECT, COPY, CUT, PASTE, PATCH, BASE, CLIP, or RICH tokens appear in basic output. Clipboard provenance, selection ranges, bulk input types, and snapshot origins require extended notation or the archive. Basic output cannot safely encode literal angle brackets, and refuses those cases rather than emitting unsupported escapes. **Use extended notation** enables the richer compact export. Encoded extensions preserve operations that do not fit basic shorthand: `BASE` stores an existing-text snapshot; `PATCH` stores a replacement/bulk input with its input type; `CLIP` captures a clipboard source without applying the later deletion twice; `TEXT` and `PASTE` can carry arbitrary text. Payloads are base64url-encoded UTF-8 JSON. In extended mode, original imported score tokens roundtrip exactly, including unsupported tokens and trailing pauses; exporting ordinary logs gives an equivalent score, not the original physical key stream. Compact export reports omitted non-text metadata and snapshots needed for unrecorded changes.

Select **Include lossless log archive** to use extended notation and append a `RICH` extension containing the entire document. Parsing this preserves event details, identities, timestamps, comments, revisions, and metadata exactly, and verifies that the visible score reconstructs the archive's final text. Creating a document from an archive deliberately forks it: document, event, session, and revision IDs are remapped to prevent collisions; original identities remain as metadata. The UI appends a final checkpoint to the new copy. This archive can be much larger than the compact score. All score inputs are capped at 2 million characters and 100,000 simulated events.

The codec and generator are also available without the UI:

```js
const score = require('./assets/writing-score.js');
const generated = score.generate('A final draft.', { seed: 'study-1', edits: 5 });
const session = score.parse(generated.score);
// session.text, session.events, session.elapsedMs, session.warnings
const basic = score.exportScore(document);
const compact = score.exportScore(document, { extended: true });
const portable = score.toPortable(existingExtendedScore);
const archive = score.exportScore(document, { lossless: true });
```

Additional validation includes the supplied example, compact and lossless roundtrips, edit timing, cursor/deletion bounds, Unicode, copying/moving, 100 generated sessions with different seeds, another 100 sessions rendered by an independent basic-only renderer against the ten-sentence regression text, and UI import/generation/export integration:

```sh
node tests/writing-score.test.cjs
node tests/app-integration.test.cjs
```

## Word editing heatmap

**Word analysis** opens with a heatmap of the latest checkpoint, using the reference screenshot's green-to-yellow-to-orange word highlights. Toggle **Table** to return to the analytical rows. Text, punctuation, whitespace, and newlines are preserved; every word occurrence is individually selectable. Click/tap a word, or focus it and press Enter/Space, to inspect its purity, provenance, pauses, compact history, and timestamped operations below the text.

Colors use the existing purity heuristic on a fixed scale: 100 is green (typed once), 50–99 light yellow-green, 33–49 yellow, 25–32 amber, and 0–24 orange. Unknown/incomplete history uses gray hatching rather than an untouched green. Lower purity reflects revisions, transfers/bulk input, and shared ancestry; the heatmap is not a raw edit count or a writing-quality score. It is read-only and excludes changes after the latest checkpoint. Accessible labels and the inspection panel describe the score independently of color.

```sh
node tests/word-heatmap.test.cjs
node tests/app-integration.test.cjs
```

## Finding documents in larger workspaces

The sidebar list scrolls independently while its search, filters, new-document action, and recording controls stay visible. Search matches document titles and body text (case/diacritic insensitive; multiple search terms must all match). **Writing** excludes imported/generated score tests; **Score tests** shows those test documents. Sort by recent edits, natural alphabetical title, or oldest edits; the sort preference is remembered in this browser without reordering stored documents.

Result counts, creation/edit times, test labels, and two-line titles help distinguish documents. Enter in the search field opens the first match; Escape or the clear button clears the search. **Show current document** resets restrictive filters and brings the active document into view. New documents and score imports clear search/filter restrictions so they remain visible. Library and UI checks cover a 300-document collection, duplicate titles, filters, sorting, search, and navigation:

Each sidebar row has a delete button. Confirming removes that document's draft, checkpoints, comments, and process log from browser records; optional MySQL sync removes its stored log too. Deleting the last document opens a new blank draft. Use **Backup** before deletion if you want to keep a copy.

```sh
node tests/document-library.test.cjs
node tests/app-integration.test.cjs
```

## Current save behavior and offline limitations

IndexedDB (`margin-local`, schema version 2) stores document bodies, revisions, comments, and process events as separate records, with small metadata and document-head records for ordering/counts. Each save writes changed records and only the newly appended events. Committed event histories are neither cloned nor rewritten by subsequent saves. Logging captures event data independently so later comment/document mutations cannot change old events. Reload reconstructs the workspace for the existing editor and analysis UI.

Existing IndexedDB snapshots and the original `localStorage` workspace migrate on startup. The old snapshot/key is removed only in/after the transaction that commits all the new records. If IndexedDB is unavailable, the original localStorage format remains as a fallback. Failed reads do not silently reseed or overwrite existing data. Editing waits for local loading to complete, and a delayed server response cannot replace changes already made in the page.

Autosaving runs after roughly 180 ms without new activity and at most 1.5 seconds into continuous activity. Hidden-page and exit handlers attempt a final flush. Write requests capture call-time record changes and run in sequence; a failed transaction does not prevent subsequent retries. The Saved label appears after commit, not when a save is merely scheduled. Pausing process recording does not pause document saving. A persistent warning shows the storage backend and error on desktop and mobile. Server sync does not hide local errors. **Backup** downloads every document, revision, and log in the current in-memory workspace, even if a write has failed.

When MySQL is configured, a separate delayed POST sends the workspace to the session-scoped server record. Offline edits can save locally without that request succeeding. Reload prefers existing IndexedDB/local state; server state is loaded only when no local workspace exists and the user has not changed anything during startup. Browser storage is scoped to the browser/profile and site origin. Local storage limits, cleared site data, browser termination before a pending save, and browser shutdown before a commit remain prototype limitations. Local record generations detect conflicting writes from another tab and reject the transaction with a visible backup/reload message; this is conflict detection, not automatic merging. Checkpoints use the same storage and are not separate backups; document/log exports provide downloadable copies. Local events now persist incrementally. Server synchronization still sends a complete workspace snapshot and needs incremental batching and durable retry/version handling for long sessions. IndexedDB has more suitable capacity than localStorage but is still subject to browser limits and eviction. Index responses are not cached, and CSS/JavaScript URLs include file versions to prevent stale app code after updates. Loading the app itself offline is not guaranteed: no service worker/offline app-shell cache has been added.

Storage tests include safe migration, failed migration, queued commits, aborted transactions, error recovery, corrupt reads, and reload with a six-million-character log while localStorage refuses writes:

```sh
node tests/workspace-storage.test.cjs
```

Record-level storage checks also verify both migrations, writing only one changed document, append-only events, independent revision/comment updates, retrying failed appends, queued reverts, stale-tab rejection, and avoiding traversal of committed event histories. Without IndexedDB, the compatibility fallback still uses the original JSON workspace in localStorage.
