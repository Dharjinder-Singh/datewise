# Datewise

A daily timeline puzzle. You get five events and put them in order, oldest first, with four tries. After each try, cards in the right spot lock green, and the rest show an arrow pointing where they belong.

It is a static site: plain HTML, CSS and JS with no build step and no dependencies.

## Run locally

```sh
python -m http.server 8000
# open http://localhost:8000
```

## How puzzles work

- Puzzle #1 is 12 Oct 2026, and the number goes up by one each local day.
- `events.js` holds the event pool. A fixed seeded shuffle walks through it five events a day, so events don't repeat until the pool cycles. Every puzzle uses distinct years.
- `?day=N` opens a past puzzle and `?practice` starts an unlimited random round.
- Progress and stats are saved in `localStorage`.

## Adding events

Add `[title, year, category]` to `events.js`. Negative years are BC. Use only well-established years, because a wrong date breaks a puzzle. Categories: `history`, `india`, `science`, `space`, `tech`, `film`, `music`, `sport`, `landmark`, `culture`, `games`.

## Analytics

`app.js` calls `window.posthog.capture(...)` for `view`, `swap`, `try`, `solved`, `failed`, `share` and `practice_start` if PostHog is on the page. Add the PostHog snippet to `index.html` to turn it on.

## Deploy

Any static host works: GitHub Pages, Netlify or Vercel. Serve the repo root.
