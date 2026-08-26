#!/usr/bin/env python3
"""Check the student download path for assignment materials.

Acts like a student with no Google account: opens the shared Drive folder
named in course-dates.json, lists what is visible, downloads every file, and
compares the result against the local published folder.

    python3 assignments/test-student-download.py

Exit status 0 means a signed-out student can get everything.
"""
import json, os, re, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CONF = json.load(open(os.path.join(HERE, os.pardir, "course-dates.json")))["materials"]
FOLDER_ID = re.search(r"folders/([A-Za-z0-9_-]+)", CONF["url"]).group(1)
LOCAL = os.path.join(CONF["publish_dir"], CONF["year"])

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
ROW = re.compile(r'data-id="([A-Za-z0-9_-]{20,})"')
LABEL = re.compile(r'aria-label="([^"]+?)"')
# Drive appends the file type and sharing state to the accessible name.
TYPE_SUFFIX = re.compile(r"\s+(?:[A-Z][\w ]*?|Binary|Compressed archive)?\s*Shared(?: folder)?$")


def fetch(url):
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45)
    return r, r.read()


def children(folder_id):
    """(id, name, is_folder) for what a signed-out visitor sees in this folder."""
    try:
        r, raw = fetch("https://drive.google.com/drive/folders/" + folder_id)
    except urllib.error.HTTPError as e:
        # Drive answers 404 both for a folder that does not exist and for one
        # the visitor may not see, so this covers "the share was never made".
        sys.exit("FAIL: folder %s is not visible to a signed-out student "
                 "(http %s). Run shareMaterials() in the Apps Script project."
                 % (folder_id, e.code))
    if "accounts.google.com" in r.geturl():
        sys.exit("FAIL: opening folder %s asks for a sign-in" % folder_id)
    body = raw.decode("utf-8", "replace")
    out, seen = [], set()
    for m in ROW.finditer(body):
        fid = m.group(1)
        if fid in seen:
            continue
        seen.add(fid)
        label = LABEL.search(body, m.end(), m.end() + 4000)
        name = label.group(1) if label else fid
        is_dir = name.endswith("folder")
        out.append((fid, TYPE_SUFFIX.sub("", name), is_dir))
    return out


def walk(folder_id, prefix="", found=None):
    found = {} if found is None else found
    for fid, name, is_dir in children(folder_id):
        path = prefix + name
        print("  " + ("[dir] " if is_dir else "      ") + path)
        walk(fid, path + "/", found) if is_dir else found.setdefault(path, fid)
    return found


print("What a signed-out student sees in %s:" % CONF["url"])
remote = walk(FOLDER_ID)

print("\nDownloading %d file(s) with no account:" % len(remote))
failures = []
for path, fid in sorted(remote.items()):
    try:
        r, raw = fetch("https://drive.google.com/uc?export=download&id=" + fid)
        # Files over ~100 MB return a scan-warning page instead of bytes; still public.
        ok = "accounts.google.com" not in r.geturl() and (
            len(raw) > 0 or b"Virus scan warning" in raw[:2000]
        )
        print("  %-5s %9d bytes  %s" % ("OK" if ok else "FAIL", len(raw), path))
        if not ok:
            failures.append(path + " (not readable signed out)")
        else:
            local = os.path.join(LOCAL, path)
            if os.path.exists(local) and os.path.getsize(local) != len(raw):
                failures.append(
                    "%s (Drive has %d bytes, local build has %d)"
                    % (path, len(raw), os.path.getsize(local))
                )
    except urllib.error.HTTPError as e:
        print("  FAIL  http %s  %s" % (e.code, path))
        failures.append("%s (http %s)" % (path, e.code))

local_files = {
    os.path.relpath(os.path.join(d, f), LOCAL)
    for d, _, fs in os.walk(LOCAL)
    for f in fs
    if f != ".DS_Store"
}
for missing in sorted(local_files - set(remote)):
    print("  MISS  %s is in the local build but not in Drive" % missing)
    failures.append(missing + " (missing from Drive)")

if failures:
    print("\nRESULT: %d problem(s):" % len(failures))
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("\nRESULT: a student with no Google account can download all %d file(s)." % len(remote))
