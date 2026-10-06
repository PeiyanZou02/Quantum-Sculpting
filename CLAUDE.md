# Working on this repo

- **Commits carry people's names only.** Commit as the person running the session, under their own
  GitHub identity: set `git config user.name` and `git config user.email` to their name and GitHub
  noreply address before the first commit. Never commit as "Claude" or under any other tool
  identity, and do not add `Co-Authored-By:` lines, "Generated with ..." lines or any other tool
  attribution to commit messages or pull request descriptions.
- **One repo, branches, pull requests.** All work happens in `PeiyanZou02/Quantum-Sculpting`. Start
  each piece of work on its own branch from the latest `main` (`git fetch origin main && git checkout
  -b <name>/<topic> origin/main`, e.g. `ray/research-prologue`, `peiyan/qrng-tiles`), commit there, push
  the branch and open a pull request into `main`. Peiyan decides what is merged. Never push to `main`
  directly. Before pushing, typecheck and build (`cd web && npx tsc -b && npx vite build`), and if
  `main` moved, merge it into the branch first. After a merge, delete the branch.
  Ray's fork (`madebyrayz/quantum-sculptor`) is no longer used for work.
- **The Default composition** is the only preset; it is Ray's design and lives in
  `web/src/hud/defaultComposition.json`. Ray publishes a new one from the app (Compose · Saved
  compositions · Publish as Default), which writes that file and raises its `rev`; it goes to `main`
  through a branch and pull request like any change. Whoever pulls it gets the new Default on screen
  when they open the app.
- The Research article lives in `web/src/screens/Research.tsx`; its text is plain JSX, edited in place.
