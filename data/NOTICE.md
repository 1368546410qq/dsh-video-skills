# Data provenance

`data/skills.json` is an unmodified snapshot of the upstream catalog file
`data/skills.json` from https://github.com/zhuyansen/awesome-claude-video-skills
(fetched over GitHub raw, commit ref `HEAD`, 373 entries).

The upstream catalog data is released under **CC0 1.0 Universal** (public domain
dedication). It is redistributed here under the same terms; the package code
that reads it stays MIT-licensed (see `LICENSE`).

The snapshot is a fallback: at runtime the host prefers a freshly fetched copy of
the same upstream URL, caches it for 24 h under `~/.dsh/video-skills/catalog.json`,
and serves this file — marked `stale: true` — only when the network or the cache
is unavailable. Preview images are never bundled; entries link to
`https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/<owner>__<repo>.jpg`.

Replacing this file only requires overwriting it with a newer upstream copy; the
entry mapping lives in `src/host/catalog.js` (`mapEntry`).
