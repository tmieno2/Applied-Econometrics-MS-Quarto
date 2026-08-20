// =============================================================================
// Exercise the pure helpers in Code.gs outside Apps Script.
//
//     node assignments/webform/test-helpers.js
//
// The parts of the form that are easy to get quietly wrong -- the name a file
// is stored under, the refusal to overwrite, which year work is filed in -- are
// pure functions, so they can be checked here instead of by uploading test
// files to Drive and reading folders afterwards.
//
// What this does NOT cover: doGet, the Drive writes themselves, the log sheet,
// and the receipt email. Those need a real deployment. See README.md step 4.
// =============================================================================

// Minimal Apps Script stubs so the helpers can run under plain node.
const props = { COURSE_YEAR: '2026', SUBMISSION_FOLDER_ID: 'FAKE', SEND_RECEIPT: 'true' };
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => props[k] || null, setProperty: (k,v) => props[k]=v,
  setProperties: o => Object.assign(props,o) }) };
global.Session = { getScriptTimeZone: () => 'America/Chicago' };
global.Utilities = { formatDate: () => '20260920-101500', base64Decode: s => Buffer.from(s,'base64') };
global.console = console;

const path = require('path');
const fs = require('fs');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
eval(read('Code.gs') + '\n' + read('Materials.gs') +
  '\nglobal.T = {validateMeta_, validateFile_, cleanName_, canonicalName_, uniqueName_, ' +
  'courseYear_, labelFor_, shareabilityProblems_, UNSHAREABLE_NAME};');
const T = global.T;

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (ok ? '' : `\n         got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
}
function throws(label, fn, re) {
  try { fn(); fail++; console.log('  FAIL ' + label + ' (did not throw)'); }
  catch (e) { const ok = re.test(e.message); ok ? pass++ : fail++;
    console.log((ok?'  ok   ':'  FAIL ') + label + (ok?'':` -> ${e.message}`)); }
}

console.log('\nname cleaning');
eq("o'brien-smith -> Obrien-Smith", T.cleanName_("  o'brien-smith "), 'Obrien-Smith');
eq('van der Berg loses spaces',    T.cleanName_('van der Berg'), 'VanderBerg');
eq('typed capitals survive',       T.cleanName_('McPherson'), 'McPherson');
eq('all caps survive',             T.cleanName_('MIENO'), 'MIENO');
eq('path escape impossible',       T.cleanName_('../../keys'), 'Keys');
eq('stray hyphens tidied',         T.cleanName_('--smith--'), 'Smith');
eq('digits and slashes stripped',  T.cleanName_('Mie/no2'), 'Mieno');
eq('accented kept',                T.cleanName_('Muñoz'), 'Muñoz');
eq('all-junk -> empty',            T.cleanName_('123 !!'), '');

console.log('\nmeta validation');
const good = {firstName:'Taro', lastName:'Mieno', email:'t@unl.edu', assignment:'assignment-1'};
eq('valid meta passes', T.validateMeta_(good), {lastName:'Mieno',firstName:'Taro',email:'t@unl.edu',assignment:'assignment-1'});
throws('blank last name', () => T.validateMeta_({...good, lastName:'  '}), /last name/);
throws('bad email',       () => T.validateMeta_({...good, email:'nope'}), /email/);
throws('unknown assignment', () => T.validateMeta_({...good, assignment:'assignment-9'}), /which assignment/);
throws('injected path in assignment', () => T.validateMeta_({...good, assignment:'../../keys/2026'}), /which assignment/);

console.log('\nfile validation');
const b64 = s => Buffer.from(s).toString('base64');
eq('qmd accepted, mime text/plain',
   (f => [f.ext, f.mimeType, f.bytes])(T.validateFile_({name:'my work.qmd', data:b64('x'.repeat(300))})),
   ['qmd','text/plain',300]);
eq('html mime', T.validateFile_({name:'a.HTML', data:b64('y')}).mimeType, 'text/html');
throws('exe rejected',      () => T.validateFile_({name:'bad.exe', data:b64('y')}), /not a file type/);
throws('no extension',      () => T.validateFile_({name:'README', data:b64('y')}), /not a file type/);
throws('empty payload',     () => T.validateFile_({name:'a.qmd', data:''}), /empty/);
throws('oversize rejected', () => T.validateFile_({name:'big.zip', data:'A'.repeat(40*1024*1024)}), /limit is/);

console.log('\ncanonical names');
const m = T.validateMeta_(good);
eq('assignment-1 qmd', T.canonicalName_(m,'qmd'), 'Mieno_assignment_1.qmd');
eq('assignment-1 html', T.canonicalName_(m,'html'), 'Mieno_assignment_1.html');
eq('final project', T.canonicalName_({...m, assignment:'final-project'},'qmd'), 'Mieno_final-project.qmd');

console.log('\nsort-submissions.R classify() must still recognise these');
const classify = f => { const n = /assignment[ _-]*([0-9]+)/.exec(f.toLowerCase());
  return n ? 'assignment-' + parseInt(n[1]) : (/final/.test(f.toLowerCase()) ? 'final-project' : null); };
eq('Mieno_assignment_1.qmd',        classify('Mieno_assignment_1.qmd'), 'assignment-1');
eq('Mieno_assignment_3_v2.html',    classify('Mieno_assignment_3_v2.html'), 'assignment-3');
eq('Mieno_final-project.qmd',       classify('Mieno_final-project.qmd'), 'final-project');

console.log('\nnever overwrite');
const dirWith = names => ({ getFilesByName: n => ({ hasNext: () => names.includes(n) }) });
eq('free name kept',   T.uniqueName_(dirWith([]), 'Mieno_assignment_1.qmd'), 'Mieno_assignment_1.qmd');
eq('taken -> _v2',     T.uniqueName_(dirWith(['Mieno_assignment_1.qmd']), 'Mieno_assignment_1.qmd'), 'Mieno_assignment_1_v2.qmd');
eq('_v2 taken -> _v3', T.uniqueName_(dirWith(['Mieno_assignment_1.qmd','Mieno_assignment_1_v2.qmd']), 'Mieno_assignment_1.qmd'), 'Mieno_assignment_1_v3.qmd');
eq('99 taken -> timestamp',
   T.uniqueName_({getFilesByName: () => ({hasNext: () => true})}, 'A_assignment_1.qmd'),
   'A_assignment_1_20260920-101500.qmd');

console.log('\ncourse year');
eq('property wins', T.courseYear_(), '2026');
delete props.COURSE_YEAR;
const y = new Date().getFullYear(), fallback = new Date().getMonth() >= 5 ? y : y - 1;
eq('fallback = fall-term year', T.courseYear_(), String(fallback));
props.COURSE_YEAR = '2026';

// ---------------------------------------------------------------------------
// The materials share gate, run against the real folders on disk.
//
// Drive's folder API is shallow enough to fake over the filesystem, and the
// local tree IS what Drive syncs -- so this checks the actual question that
// matters: would shareMaterials() hand out this year's folder, and would it
// refuse the answer keys?
// ---------------------------------------------------------------------------
const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
const fakeFile = p => ({
  getName: () => path.basename(p),
  getBlob: () => ({ getDataAsString: () => fs.readFileSync(p, 'utf8') })
});
const fakeFolder = dir => ({
  getName: () => path.basename(dir),
  getUrl: () => 'file://' + dir,
  getFiles: () => iter(fs.readdirSync(dir)
    .filter(n => fs.statSync(path.join(dir, n)).isFile()).map(n => fakeFile(path.join(dir, n)))),
  getFolders: () => iter(fs.readdirSync(dir)
    .filter(n => fs.statSync(path.join(dir, n)).isDirectory()).map(n => fakeFolder(path.join(dir, n))))
});

const repo = path.join(__dirname, '..', '..');
const exists = d => fs.existsSync(d);

console.log('\nmaterials share gate');

const year = path.join(repo, 'assignments', 'students', '2026');
if (exists(year)) {
  eq('this year\'s materials are shareable', T.shareabilityProblems_(fakeFolder(year)), []);
} else {
  console.log('  skip  assignments/students/2026 not built');
}

const keys = path.join(repo, 'assignments', 'keys', '2026');
if (exists(keys)) {
  const problems = T.shareabilityProblems_(fakeFolder(keys));
  eq('answer keys are refused', problems.length > 0, true);
  eq('...and every key file is named', problems.length >= 3, true);
} else {
  console.log('  skip  assignments/keys/2026 not built');
}

// A student copy that still carries an answer div is the failure the name
// check alone would miss -- the filename looks perfectly innocent.
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sharegate-'));
fs.mkdirSync(path.join(tmp, 'assignment-1'));
fs.writeFileSync(path.join(tmp, 'assignment-1', 'assignment-1.qmd'),
  '# Question 1\n\n::: {.answer}\nBecause income is correlated with prpblck.\n:::\n');
const leaked = T.shareabilityProblems_(fakeFolder(tmp));
eq('a leaked .answer div is caught', leaked.length, 1);
eq('...and the file is named', /assignment-1\.qmd/.test(leaked[0] || ''), true);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
