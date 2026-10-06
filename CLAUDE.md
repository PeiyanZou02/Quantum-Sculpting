# Working on this repo

- **Commits carry people's names only.** Commit as the person running the session, under their own
  GitHub identity: set `git config user.name` and `git config user.email` to their name and GitHub
  noreply address before the first commit. Never commit as "Claude" or under any other tool
  identity, and do not add `Co-Authored-By:` lines, "Generated with ..." lines or any other tool
  attribution to commit messages or pull request descriptions.
- **Publish every change to `main`.** Peiyan pulls from `main`, so after each change: typecheck and
  build (`cd web && npx tsc -b && npx vite build`), commit, merge the latest `origin/main` in first if
  it moved, and push to `main` (and to the session's working branch). Don't leave finished work on a
  side branch.
- **The Default composition** (`web/src/hud/defaultComposition.ts`) is the only preset. It is Ray's
  design: when Ray sends a new one (Compose · Saved compositions · Copy on Default), replace
  `DEFAULT_COMPOSITION` with it and raise `rev`, so browsers holding the older Default take the new one.
- The Research article lives in `web/src/screens/Research.tsx`; its text is plain JSX, edited in place.
