/**
 * Publishing the year's assignment materials.
 *
 * The other half of the course's Drive plumbing: `Code.gs` takes work in,
 * this puts work out. `Rscript assignments/build-assignments.R` writes
 * assignments/students/<year>/ and Drive syncs it, but a synced folder is
 * still private -- someone has to make it readable by anyone with the link.
 * Doing that by hand is the step that gets forgotten when the term rolls,
 * leaving the class unable to download anything on day one.
 *
 * Run `shareMaterials()` from the editor. It refuses unless the folder is
 * genuinely safe to hand out, so it is a stricter gate than the Share dialog,
 * not a shortcut past it.
 *
 * Lives in the same Apps Script project as the submission form only because
 * that project is already authorised for this Drive. The two features are
 * otherwise unrelated.
 */

var PROP_MATERIALS_ROOT_ID = 'MATERIALS_ROOT_ID';

/** assignments/students/ in Drive -- the parent of the year folders. */
var DEFAULT_MATERIALS_ROOT_ID = '15FPJxUnjQfd76QGUvc1tbgD9sx_yQjUS';

/**
 * Names that must never appear in something handed to students. Mirrors the
 * check in assignments/build-assignments.R -- this one runs against what Drive
 * actually holds, which is what students actually get.
 */
var UNSHAREABLE_NAME = /key|solution|answer|submission|roster|grade/i;

/** How deep to walk. The tree is <year>/<assignment>/<files>; 5 is slack. */
var MAX_SCAN_DEPTH = 5;

// ---------------------------------------------------------------------------
// The one you run
// ---------------------------------------------------------------------------

/**
 * Make this year's materials folder readable by anyone with the link, and
 * return the link. Safe to rerun; sharing an already-shared folder is a no-op.
 */
function shareMaterials() {
  return shareMaterialsFor(courseYear_());
}

/**
 * As above, for a specific year -- `shareMaterialsFor('2027')`.
 */
function shareMaterialsFor(year) {
  year = String(year);
  if (!/^\d{4}$/.test(year)) throw new Error('Year must look like "2026", got "' + year + '".');

  var folder = yearFolder_(year);

  // Refuse before flipping anything, not after. A folder handed out by link is
  // readable by anyone who ever sees that link, including forwarded copies --
  // there is no taking it back once an answer key has been downloaded.
  var problems = shareabilityProblems_(folder);
  if (problems.length) {
    throw new Error(
      'Refusing to share assignments/students/' + year + '/ -- it contains ' +
      'things students must not have:\n  - ' + problems.join('\n  - ') +
      '\nFix the build, then run this again.');
  }

  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var url = folder.getUrl();
  var report = [
    'Shared assignments/students/' + year + '/  (anyone with the link, view only)',
    '',
    'materials.url  : ' + url,
    'materials.year : ' + year,
    '',
    'Put both into the `materials` block of course-dates.json.',
    '',
    'Checked and found nothing that should not go out:',
    '  ' + describeContents_(folder)
  ].join('\n');

  Logger.log(report);
  return report;
}

/**
 * Withdraw the link. Use when a year is well over -- not the moment the term
 * ends, because a student finishing late work still needs the files.
 */
function unshareMaterialsFor(year) {
  var folder = yearFolder_(String(year));
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  var msg = 'assignments/students/' + year + '/ is private again.';
  Logger.log(msg);
  return msg;
}

/**
 * Report without changing anything: which years exist, and which are shared.
 */
function materialsStatus() {
  var root = materialsRoot_();
  var lines = ['assignments/students/ in Drive:'];
  var years = root.getFolders();

  while (years.hasNext()) {
    var y = years.next();
    var access;
    try {
      access = String(y.getSharingAccess());
    } catch (err) {
      access = 'unknown (' + err.message + ')';
    }
    var shared = access === 'ANYONE_WITH_LINK' || access === 'ANYONE';
    lines.push('  ' + y.getName() + '   ' + (shared ? 'SHARED   ' + y.getUrl()
                                                    : 'private  (' + access + ')'));
  }

  lines.push('');
  lines.push('Current course year: ' + courseYear_());
  var report = lines.join('\n');
  Logger.log(report);
  return report;
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

/**
 * Everything in this folder tree that would be wrong to hand to students.
 * Empty array means it is safe to share.
 */
function shareabilityProblems_(folder) {
  var problems = [];
  scan_(folder, '', 0, problems);
  return problems;
}

function scan_(folder, prefix, depth, problems) {
  if (depth > MAX_SCAN_DEPTH) {
    problems.push(prefix + ' is nested deeper than expected — check it by hand');
    return;
  }

  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    var path = prefix + name;

    if (UNSHAREABLE_NAME.test(name)) {
      problems.push(path + '  (name looks like an answer key or private record)');
      continue;
    }
    if (/\.(qmd|rmd)$/i.test(name) && containsAnswerDiv_(f)) {
      problems.push(path + '  (still contains a ::: {.answer} block)');
    }
  }

  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    var subName = sub.getName();
    if (UNSHAREABLE_NAME.test(subName)) {
      problems.push(prefix + subName + '/  (folder name looks like keys or submissions)');
      continue;
    }
    scan_(sub, prefix + subName + '/', depth + 1, problems);
  }
}

/**
 * The stripper removes answer divs when it builds the student copy, so one
 * surviving here means the build was skipped or something was copied in by
 * hand. Cheap to check -- there are only a handful of qmd files.
 */
function containsAnswerDiv_(file) {
  try {
    return /^:{3,}\s*\{[^}]*\.answer/m.test(file.getBlob().getDataAsString());
  } catch (err) {
    // Unreadable is not the same as clean; make someone look at it.
    return true;
  }
}

function describeContents_(folder) {
  var parts = [];
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    var n = 0;
    var files = sub.getFiles();
    while (files.hasNext()) { files.next(); n++; }
    parts.push(sub.getName() + ' (' + n + ' files)');
  }
  return parts.length ? parts.join(', ') : '(empty)';
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

function materialsRoot_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_MATERIALS_ROOT_ID)
        || DEFAULT_MATERIALS_ROOT_ID;
  return DriveApp.getFolderById(id);
}

/**
 * The year folder, never its parent.
 *
 * Sharing assignments/students/ itself would let a student wander into another
 * year and download the wrong assignment, so this only ever returns a child.
 */
function yearFolder_(year) {
  var hit = materialsRoot_().getFoldersByName(year);
  if (!hit.hasNext()) {
    throw new Error(
      'No assignments/students/' + year + '/ in Drive. Run ' +
      '`Rscript assignments/build-assignments.R ' + year + '` first, and wait ' +
      'for Drive to finish syncing it.');
  }
  return hit.next();
}
