# tools/port-155/

The tooling that moved this fork's stack from Chromium 153 onto the vendored
BrowserOS patch tree at Chromium 155, and the checks that say it is sound. Kept in
the repository rather than in a scratch directory because the next uprev is the
same shape, and because a result nobody can re-derive is not evidence.

Nothing here needs a second Chromium checkout. Every file is read out of
`chromium/src`'s git objects at a named revision, so a 148 GB tree is never
duplicated and a revision that is not checked out can still be measured.

| script | what it does |
|---|---|
| `port.py` | shared plumbing: read a file at a revision, apply one diff to one file's text in isolation, diff two texts as a patch, and fetch upstream's own patch for a path |
| `replaster.py` | regenerate every rule in `//rewrite` against 155 and write the patches into the vendored tree. `--write` refuses unless all 107 resolve |
| `check_at_155.py` | re-derive every patch from its rule, independently, and compare to what is on disk |
| `verify_structure.py` | structural checks the rule engine cannot make, each measured against the untouched 155 baseline so the checker's own limits are not reported as defects |
| `reverse_verify.py` | restore each defect `verify_structure.py` claims to catch and require it to go red |
| `applies.py` | does a whole patch set still apply at a given revision, measured per file |

Run them from here, in this order:

```
python3 replaster.py            # dry run: every rule must resolve
python3 replaster.py --write    # write the patches
python3 check_at_155.py         # the patches are what the rules say
python3 verify_structure.py     # nothing structurally broken was introduced
python3 reverse_verify.py       # and that checker can still go red
python3 applies.py ../../chromium/src "$(cat ../../vendor/browseros/BASE_COMMIT)" \
        ../../vendor/browseros/chromium_patches '**/*'
cd ../../vendor/browseros && python -m bos_build dev doctor
```

## Two facts the scripts read rather than restate

`vendor/browseros/BASE_COMMIT` is the revision the vendored stack is cut against.
`vendor/browseros/IMPORT_COMMIT` is the commit holding that stack **as upstream
shipped it**, before any of our rules ran.

The second one is not bookkeeping. Where both forks edit a file the vendored layout
holds one combined patch, so the file on disk no longer says which part was theirs.
A script that reads "theirs" from the working tree therefore feeds our own output
back in and applies the rules twice — which is exactly what happened the first time
these scripts were run from inside the repository: 50 of 107 rules failed and 57
silently double-applied. The import commit is the only place their side still
stands alone.

## Why the rules are re-run instead of the diffs being merged

Every patch this fork owns is generated from a rule in `//rewrite`. A hand patch is
rebased by resolving a merge; a rule is rebased by re-running it, and its `count:`
then says out loud when the premise it was written under stopped holding. At this
uprev that reported six stale rules by name, and one of them had stopped being
needed at all because upstream shipped the feature it flipped.
