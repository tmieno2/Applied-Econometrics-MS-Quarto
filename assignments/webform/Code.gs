/**
 * Assignment submission form for AECN 896-004 (Applied Econometrics).
 *
 * Replaces the Dropbox file request the course used before it moved to Google
 * Drive. A student opens the web app, gives their name and email, picks the
 * assignment, and uploads their files. Each file is written straight into
 *
 *     <submission root>/<year>/<assignment>/
 *
 * which is the same tree assignments/sort-submissions.R produces, so grading
 * works exactly as it did. Because the form asks which assignment it is,
 * nothing has to be guessed from the filename afterwards.
 *
 * Two properties of the old Dropbox request are preserved deliberately:
 *   - No deadline is enforced here. The binding deadline is the one printed in
 *     the assignment; the form stays open and every upload is timestamped in
 *     the log, so lateness is a grading decision rather than a locked door.
 *   - Nothing is ever overwritten. A second upload of the same file lands as
 *     `_v2`, `_v3`, ... Student work is not in version control and cannot be
 *     recovered if lost.
 *
 * Configuration lives in Script Properties, so the same code can be pushed to a
 * fresh project and pointed somewhere else without editing it. `setup()` below
 * writes them; run it once before deploying, or the form will refuse to open.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

var PROP_FOLDER_ID = 'SUBMISSION_FOLDER_ID'; // Drive id of assignments/submission
var PROP_COURSE_YEAR = 'COURSE_YEAR';        // e.g. "2026"; the term's calendar year
var PROP_SEND_RECEIPT = 'SEND_RECEIPT';      // "true" | "false"
var PROP_LOG_SHEET_ID = 'LOG_SHEET_ID';      // filled in automatically

var COURSE = 'AECN 896-004 — Applied Econometrics';
var LOG_SHEET_NAME = 'submission-log';

/** assignments/submission/ in Drive; also `submission.drive_folder_id` in course-dates.json. */
var DEFAULT_FOLDER_ID = '1F31lKFXaAUhmHR02WR3k3c-RgAlbq2LP';

/**
 * What the dropdown offers. `id` must match the folder names the grading
 * scripts expect (assignments/submission/<year>/<id>/).
 */
var ASSIGNMENTS = [
  { id: 'assignment-1', label: 'Assignment 1' },
  { id: 'assignment-2', label: 'Assignment 2' },
  { id: 'assignment-3', label: 'Assignment 3' },
  { id: 'final-project', label: 'Final project' }
];

/** Extensions a submission may contain, lower case, without the dot. */
var ALLOWED_EXT = ['qmd', 'rmd', 'html', 'htm', 'pdf', 'r', 'ipynb', 'zip'];

/** Drive is happier previewing these than application/octet-stream. */
var MIME_BY_EXT = {
  qmd: 'text/plain',
  rmd: 'text/plain',
  r: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  pdf: 'application/pdf',
  ipynb: 'application/json',
  zip: 'application/zip'
};

var MAX_FILE_BYTES = 25 * 1024 * 1024; // one google.script.run call per file
var MAX_FILES = 8;

// ---------------------------------------------------------------------------
// One-time setup — run this from the editor after pasting in your folder id
// ---------------------------------------------------------------------------

/**
 * Record the destination folder and the term year. RUN THIS ONCE, before you
 * deploy -- until you do, the form refuses to open and no student can submit.
 *
 * The values below are already the right ones for this course, so running it
 * unedited is correct. Rerunning is harmless. Script Properties are read on
 * every request, so this takes effect immediately: no redeploy needed, just
 * reload the form.
 */
function setup() {
  PropertiesService.getScriptProperties().setProperties({
    SUBMISSION_FOLDER_ID: DEFAULT_FOLDER_ID,
    MATERIALS_ROOT_ID: DEFAULT_MATERIALS_ROOT_ID,   // see Materials.gs
    COURSE_YEAR: '2026',
    SEND_RECEIPT: 'true'
  });
  return checkSetup();
}

/**
 * Why the form cannot accept submissions right now, or '' if it can.
 *
 * doGet() calls this on every page load so an unconfigured deployment shows a
 * closed door instead of a working-looking form -- the failure this replaces
 * only surfaced after a student had filled everything in and uploaded, which
 * is the worst moment to discover it.
 */
function configurationProblem_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_FOLDER_ID);
  if (!id) {
    return 'SUBMISSION_FOLDER_ID is unset. Run setup() in the Apps Script ' +
           'editor, then reload this page.';
  }
  try {
    DriveApp.getFolderById(id);
  } catch (err) {
    return 'SUBMISSION_FOLDER_ID (' + id + ') is not a folder this script can ' +
           'open: ' + err.message;
  }
  return '';
}

/**
 * Confirm the script can actually reach the folder it is configured to write
 * to. Run this after setup() and after rolling the course to a new year.
 */
function checkSetup() {
  var problem = configurationProblem_();
  if (problem) throw new Error(problem);

  var root = DriveApp.getFolderById(
    PropertiesService.getScriptProperties().getProperty(PROP_FOLDER_ID));
  var report = [
    'Submission root : ' + root.getName() + '  (' + root.getUrl() + ')',
    'Course year     : ' + courseYear_(),
    'Email receipts  : ' + sendReceiptsEnabled_(),
    'Assignments     : ' + ASSIGNMENTS.map(function (a) { return a.id; }).join(', ')
  ].join('\n');
  Logger.log(report);
  return report;
}

/**
 * Walk the entire server-side path with a tiny file, so a failure in the
 * browser can be told apart from a failure in Drive.
 *
 * Run it from the editor and read the report: every step prints OK, or the
 * first failing step prints FAILED HERE with the real message. The test file
 * it writes is trashed again before it returns.
 *
 * If every step passes but students still see an error on submit, the problem
 * is the upload request rather than anything here -- usually a file too large
 * to travel in one google.script.run call.
 */
function selfTest() {
  var log = [];
  var file = null;

  try {
    var root = rootFolder_();
    log.push('properties    OK   folder id is set');
    log.push('root folder   OK   ' + root.getName() + '  ' + root.getUrl());

    var year = courseYear_();
    log.push('course year   OK   ' + year);

    var id = ASSIGNMENTS[0].id;
    var dir = destinationFolder_(id);
    log.push('destination   OK   ' + year + '/' + id);

    var meta = { lastName: 'Selftest', firstName: 'Self',
                 email: 'nobody@example.com', assignment: id };
    var name = uniqueName_(dir, canonicalName_(meta, 'qmd'));
    log.push('naming        OK   would store as ' + name);

    var payload = Utilities.base64Encode('--- selfTest ---');
    var f = validateFile_({ name: name, data: payload });
    log.push('validation    OK   ' + f.bytes + ' bytes, ' + f.mimeType);

    file = dir.createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType, name));
    log.push('create file   OK   ' + file.getUrl());

    logRow_(meta, { storedName: name, originalName: 'selfTest()', url: file.getUrl(), bytes: f.bytes });
    log.push('log sheet     OK   appended a row (delete it if you like)');

    log.push('receipts      ' + (sendReceiptsEnabled_() ? 'ON   SEND_RECEIPT is true' : 'OFF  SEND_RECEIPT is false'));
    log.push('');
    log.push('All server-side steps passed.');
  } catch (err) {
    log.push('FAILED HERE   ' + err.message);
    log.push('');
    log.push(err.stack || '(no stack)');
  } finally {
    if (file) {
      file.setTrashed(true);
      log.push('cleanup       OK   test file moved to trash');
    }
  }

  var report = log.join('\n');
  Logger.log(report);
  return report;
}

// ---------------------------------------------------------------------------
// Web app
// ---------------------------------------------------------------------------

function doGet(e) {
  var problem = configurationProblem_();
  if (problem) return notReadyPage_(problem);

  var page = HtmlService.createTemplateFromFile('Form');
  page.config = formConfig_();
  return page.evaluate()
    .setTitle('Submit an assignment — ' + COURSE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // ALLOWALL so the form can also be embedded in the Quarto course site.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Shown instead of the form when the script is not configured. A student who
 * lands here is told to email rather than left to fill in a form that cannot
 * store anything; the instructor is told exactly which step is missing.
 */
function notReadyPage_(problem) {
  var html =
    '<div style="font:16px/1.6 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,' +
    'Helvetica,Arial,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem">' +
    '<h1 style="font-size:1.3rem;margin:0 0 .5rem">This form is not accepting submissions yet</h1>' +
    '<p style="margin:0 0 1.5rem">Please email your instructor, and keep your files ' +
    'as they are &mdash; nothing you do here has been recorded.</p>' +
    '<p style="font-size:.85rem;color:#5b6470;border-top:1px solid #d9dee5;padding-top:1rem;margin:0">' +
    '<strong>Instructor:</strong> ' + escapeHtml_(problem) + '</p></div>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('Not ready — ' + COURSE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function escapeHtml_(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function formConfig_() {
  return {
    course: COURSE,
    assignments: ASSIGNMENTS,
    allowedExt: ALLOWED_EXT,
    maxFileBytes: MAX_FILE_BYTES,
    maxFiles: MAX_FILES,
    year: courseYear_()
  };
}

// ---------------------------------------------------------------------------
// Upload — the client calls submitFile() once per file, then finishSubmission()
// ---------------------------------------------------------------------------

/**
 * Store one uploaded file.
 *
 * @param {Object} meta  {lastName, firstName, email, assignment}
 * @param {Object} file  {name, data}  data = base64, no data: prefix
 * @return {Object} {storedName, url, bytes, originalName}
 */
function submitFile(meta, file) {
  var m = validateMeta_(meta);
  var f = validateFile_(file);

  var lock = LockService.getScriptLock();
  // Two students uploading at once must not race on folder creation or on the
  // uniqueness check that stops one submission overwriting another.
  if (!lock.tryLock(45000)) {
    throw new Error('The server is busy. Wait a moment and try again — nothing was lost.');
  }
  try {
    var dir = destinationFolder_(m.assignment);
    var name = uniqueName_(dir, canonicalName_(m, f.ext));
    var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType, name);
    var created = dir.createFile(blob);
    created.setDescription(
      'Uploaded ' + stamp_() + ' by ' + m.firstName + ' ' + m.lastName +
      ' <' + m.email + '> as "' + f.name + '"'
    );

    var stored = {
      storedName: name,
      originalName: f.name,
      url: created.getUrl(),
      bytes: f.bytes
    };
    logRow_(m, stored);
    return stored;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Called once after every file is in. Emails the student a receipt; a failure
 * here (quota, bad address) must never invalidate an upload that succeeded, so
 * it is reported but not thrown.
 */
function finishSubmission(meta, stored) {
  var m = validateMeta_(meta);
  var when = stamp_();
  var result = { when: when, emailed: false, note: '' };

  if (!sendReceiptsEnabled_()) return result;

  try {
    var lines = (stored || []).map(function (s) {
      return '  - ' + s.storedName + '   (you uploaded it as "' + s.originalName + '")';
    }).join('\n');

    MailApp.sendEmail({
      to: m.email,
      subject: 'Received: ' + labelFor_(m.assignment) + ' — ' + COURSE,
      body: [
        m.firstName + ',',
        '',
        'Your submission for ' + labelFor_(m.assignment) + ' was received on ' + when + '.',
        '',
        'Files stored:',
        lines,
        '',
        'Keep this email. It is your record that the upload went through.',
        'If you resubmit, the new copy is kept alongside this one as _v2, _v3',
        'and so on — nothing you have already submitted is overwritten.',
        '',
        COURSE
      ].join('\n')
    });
    result.emailed = true;
  } catch (err) {
    // Consumer Gmail allows 100 recipients/day; a deadline-night burst can hit
    // it. The files are already stored, so this is cosmetic.
    result.note = 'Your files were stored, but the confirmation email could not be sent.';
    console.warn('receipt failed: ' + err);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateMeta_(meta) {
  meta = meta || {};

  var last = cleanName_(meta.lastName);
  if (!last) throw new Error('Enter your last name.');

  var first = cleanName_(meta.firstName);
  if (!first) throw new Error('Enter your first name.');

  var email = String(meta.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }

  var assignment = String(meta.assignment || '');
  if (!ASSIGNMENTS.some(function (a) { return a.id === assignment; })) {
    throw new Error('Choose which assignment this is.');
  }

  return { lastName: last, firstName: first, email: email, assignment: assignment };
}

/**
 * Reduce a typed name to something safe to put in a filename, while keeping it
 * recognisable: "  o'brien-smith " -> "Obrien-Smith".
 *
 * Everything that is not a letter or a hyphen goes, so the result can never
 * escape the folder it is written into or collide with a path separator.
 * Capitals the student typed themselves are left alone, so "McPherson" and
 * "MIENO" survive as written; only the first letter of each hyphenated part is
 * forced, so a lower-case entry still files under a recognisable name.
 */
function cleanName_(value) {
  var s = String(value || '')
    .replace(/[^A-Za-zÀ-ɏ' -]/g, '')  // digits, dots, slashes, everything else
    .replace(/['\s]+/g, '')           // O'Brien -> OBrien, van der -> vander
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!s) return '';

  return s.split('-').map(function (part) {
    return part ? part.charAt(0).toUpperCase() + part.slice(1) : part;
  }).join('-');
}

function validateFile_(file) {
  file = file || {};
  var name = String(file.name || '').trim();
  if (!name) throw new Error('That file has no name.');

  var ext = (name.split('.').pop() || '').toLowerCase();
  if (name.indexOf('.') === -1 || ALLOWED_EXT.indexOf(ext) === -1) {
    throw new Error('"' + name + '" is not a file type this form accepts (' +
                    ALLOWED_EXT.join(', ') + ').');
  }

  var data = String(file.data || '');
  if (!data) throw new Error('"' + name + '" arrived empty.');

  // base64 is 4 characters per 3 bytes; close enough to enforce the cap.
  var bytes = Math.floor(data.replace(/=+$/, '').length * 3 / 4);
  if (bytes > MAX_FILE_BYTES) {
    throw new Error('"' + name + '" is ' + mb_(bytes) + ' MB. The limit is ' +
                    mb_(MAX_FILE_BYTES) + ' MB per file.');
  }

  return {
    name: name,
    ext: ext,
    data: data,
    bytes: bytes,
    mimeType: MIME_BY_EXT[ext] || 'application/octet-stream'
  };
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

function rootFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_FOLDER_ID);
  if (!id) throw new Error('This form is not configured yet — SUBMISSION_FOLDER_ID is unset.');
  return DriveApp.getFolderById(id);
}

function destinationFolder_(assignment) {
  return childFolder_(childFolder_(rootFolder_(), courseYear_()), assignment);
}

function childFolder_(parent, name) {
  var hit = parent.getFoldersByName(name);
  return hit.hasNext() ? hit.next() : parent.createFolder(name);
}

/**
 * `Mieno_assignment_1.qmd` — the same convention the assignments ask for and
 * assignments/sort-submissions.R reads, so a file that arrives here by any
 * other route still files correctly.
 */
function canonicalName_(m, ext) {
  var slug = m.assignment === 'final-project'
    ? 'final-project'
    : m.assignment.replace('-', '_');
  return m.lastName + '_' + slug + '.' + ext;
}

/**
 * Never overwrite. A resubmission becomes _v2, _v3, ... and the grader takes
 * the highest version; the log says when each arrived.
 */
function uniqueName_(dir, name) {
  if (!dir.getFilesByName(name).hasNext()) return name;

  var dot = name.lastIndexOf('.');
  var stem = name.slice(0, dot);
  var ext = name.slice(dot);

  for (var v = 2; v <= 99; v++) {
    var candidate = stem + '_v' + v + ext;
    if (!dir.getFilesByName(candidate).hasNext()) return candidate;
  }
  // Beyond 99 something is wrong, but still refuse to clobber anything.
  return stem + '_' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss') + ext;
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

var LOG_HEADERS = ['timestamp', 'year', 'assignment', 'last name', 'first name',
                   'email', 'stored as', 'uploaded as', 'bytes', 'link'];

function logRow_(m, stored) {
  try {
    logSheet_().appendRow([
      stamp_(), courseYear_(), m.assignment, m.lastName, m.firstName,
      m.email, stored.storedName, stored.originalName, stored.bytes, stored.url
    ]);
  } catch (err) {
    // The file itself is already stored; losing a log row must not fail the
    // upload the student is watching.
    console.warn('log append failed: ' + err);
  }
}

function logSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_LOG_SHEET_ID);
  if (id) {
    try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (err) { /* recreate */ }
  }

  var root = rootFolder_();
  var ss;
  var existing = root.getFilesByName(LOG_SHEET_NAME);
  if (existing.hasNext()) {
    ss = SpreadsheetApp.open(existing.next());
  } else {
    ss = SpreadsheetApp.create(LOG_SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
  }

  var sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_HEADERS);
    sheet.setFrozenRows(1);
  }
  props.setProperty(PROP_LOG_SHEET_ID, ss.getId());
  return sheet;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function tz_() {
  return Session.getScriptTimeZone();
}

function stamp_() {
  return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd HH:mm:ss z");
}

function mb_(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

function labelFor_(id) {
  for (var i = 0; i < ASSIGNMENTS.length; i++) {
    if (ASSIGNMENTS[i].id === id) return ASSIGNMENTS[i].label;
  }
  return id;
}

function sendReceiptsEnabled_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_SEND_RECEIPT) !== 'false';
}

/**
 * The calendar year submissions are filed under, matching
 * format(cal$first_class_day, "%Y") in course-dates.R.
 *
 * Set COURSE_YEAR explicitly when you roll the course. The fallback exists so
 * a forgotten property does not misfile work: the course runs in the fall, so
 * anything submitted in January still belongs to the previous year's term.
 */
function courseYear_() {
  var explicit = PropertiesService.getScriptProperties().getProperty(PROP_COURSE_YEAR);
  if (explicit && /^\d{4}$/.test(explicit)) return explicit;

  var now = new Date();
  var year = now.getFullYear();
  return String(now.getMonth() >= 5 ? year : year - 1);
}
