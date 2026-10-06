# Contributing

Quantum Sculpting is developed by Peiyan Zou and Ray Zhang at Wedge. Work goes through branches and
pull requests; `main` is protected and Wedge (`@wedgeglobal`) reviews and merges every change.

1. **Branch from the latest `main`**, named after you and the work:

   ```bash
   git fetch origin main
   git checkout -b ray/research-prologue origin/main
   ```

2. **Commit under your own name.** Use your GitHub identity (`git config user.name` and
   `git config user.email`, with your GitHub noreply address). Commits carry people's names only:
   no tool identities, no `Co-Authored-By:` or "Generated with" lines.

3. **Check before pushing.** The interface must typecheck and build:

   ```bash
   cd web && npx tsc -b && npx vite build
   ```

   If `main` moved in the meantime, merge it into your branch first.

4. **Push and open a pull request** into `main`. Wedge reviews it and merges it; the branch is deleted
   after the merge. Every merge to `main` republishes the [website](https://wedgeglobal.github.io/Quantum-Sculptor/).

The [guide](docs/guide.md) explains how the app is put together, and [web/README.md](web/README.md)
the interface.
