# ADR 019: Deploy after CI and wait until the merged commit is the one answering

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

The api runs on Render, the web app on Vercel. Vercel deploys from its Git integration. For
the api, PLAN.md Slice 7.2 asks for a workflow that triggers Render's deploy hook after CI and
then polls `/health` "until 200".

Two things made a plain 200 the wrong signal:

- While Render builds the new Docker image (several minutes on the free plan), the **old**
  version keeps answering `/health` with 200. A "wait for 200" check passes in seconds and
  proves nothing.
- On 2026-11-09 production sign-in broke because `apps/web/vercel.json` sent `/api/*` to a
  Render service that wasn't ours. Render itself was healthy, so no check aimed only at Render
  would have caught it.

## Decision

1. **`.github/workflows/deploy.yml` runs on `workflow_run` after CI** and only deploys when that
   run succeeded, was a push, and came from this repository (not from a fork's `main`). It can
   also be run by hand on `main`.
2. **The hook is called with `&ref=<sha>`**, so Render builds exactly the commit CI tested, not
   whatever `main` is by then. The hook URL is the `RENDER_DEPLOY_HOOK_URL` secret; the job
   fails loudly if it's missing.
3. **`/health` reports the running commit**: `{ status, db, commit }`, from Render's
   `RENDER_GIT_COMMIT` (validated as a SHA in `env.ts`, `null` locally).
4. **The workflow waits for `commit == <sha>` and `status == ok`**, polling every 15 s for up to
   10 minutes (a sleeping free service has to wake up and build).
5. **Then it checks the same through Vercel** (`<web>/api/health`), so a rewrite pointing at the
   wrong place fails the deploy.
6. **One deploy at a time** (`concurrency`, not cancelled), so a newer merge waits instead of
   interrupting a Render build halfway.

## Alternatives considered

- **Render's own auto-deploy on push:** no workflow to maintain, but it deploys before (or
  even when) CI fails, and nothing tells us when the new version is live.
- **Poll until 200, as the plan says:** passes against the old version, so it checks only that
  _something_ answers.
- **Compare a build timestamp or version number:** needs a value baked in at build time; the
  commit SHA already exists, is what we merged, and Render provides it for free.
- **Render's API to watch the deploy status:** needs an API key with access to the whole
  account in GitHub secrets, and still says nothing about the Vercel proxy.

## Consequences

- Good: a green Deploy run means the merged commit is serving traffic, directly and through the
  path real users take. Verified on 9e7bf79 (45 s) and 1cd9a3e.
- Good: the commit in `/health` also helps by hand: `curl …/health` answers "what's live?".
- Bad: `/health` reveals the commit SHA. The repo is going public anyway, so this exposes nothing
  new.
- Bad: the web app isn't gated by CI; Vercel deploys on its own. A broken web build shows up
  in Vercel, not in this workflow.
- Bad: the live URLs are hard-coded in the workflow; a new domain means editing it.
