# Working on this repo

- **Commits carry people's names only.** Commit as the person running the session, under their own
  GitHub identity: set `git config user.name` and `git config user.email` to their name and GitHub
  noreply address before the first commit. Never commit as "Claude" or under any other tool
  identity, and do not add `Co-Authored-By:` lines, "Generated with ..." lines or any other tool
  attribution to commit messages or pull request descriptions.
- **One repo, branches, pull requests.** All work happens in `wedgeglobal/Quantum-Sculptor` (it moved
  there from `PeiyanZou02/Quantum-Sculpting` with its whole history; Ray, Peiyan and the team are
  collaborators). Start each piece of work on its own branch from the latest `main` (`git fetch origin
  main && git checkout -b <name>/<topic> origin/main`, e.g. `ray/research-prologue`,
  `peiyan/qrng-tiles`), commit there, push the branch and open a pull request into `main`. `main` is
  protected: Wedge (`@wedgeglobal`) reviews and merges every pull request. Never push to `main`
  directly, and never rewrite its history. Before pushing, typecheck and build (`cd web && npx tsc -b && npx vite build`), and if
  `main` moved, merge it into the branch first. After a merge, delete the branch.
  Ray's fork (`madebyrayz/quantum-sculptor`) and Peiyan's repo are no longer used for work.
  `.claude/settings.json` turns off Claude Code's own commit and pull request attribution for everyone
  working here. `CONTRIBUTING.md` is the public version of these rules.
- **The website** (<https://wedgeglobal.github.io/Quantum-Sculptor/>) is built from `main` by
  `.github/workflows/pages.yml`. It runs `app/*.py` in the visitor's browser with Pyodide
  (`web/src/engine/`), so a change to the service reaches the website too; keep `app/` free of
  anything Pyodide cannot load. Atlas jobs from the browser go through `relay/` (a Cloudflare Worker,
  `cd relay && npx wrangler deploy`).
- **The Default composition** is the only preset; it is Ray's design and lives in
  `web/src/hud/defaultComposition.json`. Ray publishes a new one from the app (Compose · Saved
  compositions · Publish as Default), which writes that file and raises its `rev`; it goes to `main`
  through a branch and pull request like any change. Whoever pulls it gets the new Default on screen
  when they open the app.
- The Research article lives in `web/src/screens/Research.tsx`; its text is plain JSX, edited in place.
