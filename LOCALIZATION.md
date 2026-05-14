# Localization Strategy

This site must not present a language switch unless the destination page is
actually localized. A locale control is a content contract, not a UI preference.

## Current State

- The root site and generated case-study pages are English-only.
- The Hugo blog is bilingual: Italian lives at `/blog/`, English at `/blog/en/`.
- The homepage blog preview may let readers choose the writing language because
  those cards come from real localized blog indexes.

## Target URL Model

Use explicit, crawlable URLs for every localized public page:

- English root: `/`
- Italian root: `/it/`
- English case studies: `/work/<slug>/`
- Italian case studies: `/it/work/<slug>/`
- Italian blog: `/blog/`
- English blog: `/blog/en/`

English remains `x-default` unless we intentionally change the default market.
Italian pages must have their own canonical URL, not a JavaScript translation of
the English page.

## Source Of Truth

Localization should live beside the content source that generates each surface.

- Root page copy should move out of hand-coded HTML into a small locale-aware
  source file before `/it/` is published.
- Case-study translations should live in structured source data, either as
  per-item `translations.it` blocks in `assets/data/case-studies.json` or in a
  sibling locale file consumed by the harvester.
- Blog localization stays in Hugo content files, where it already has real
  translated Markdown and Hugo translation links.

Do not translate public pages only in client-side JavaScript. That is acceptable
for small labels after page load, but not for indexable content.

## Release Gate

Before exposing a locale switch on a page:

1. The localized URL exists in the assembled `_site` artifact.
2. The page has localized title, meta description, visible body copy, and
   structured data `inLanguage`.
3. `hreflang` links are reciprocal between the language pair.
4. The page has a self-canonical URL.
5. Tests or generator checks fail when a page advertises a missing locale.

Partial localization is allowed only as page-by-page release: a translated
case-study page may link to its English counterpart, but unrelated English-only
case studies must not show an Italian switch.

## Implementation Plan

1. Keep the global shell English-only until `/it/` exists with translated root
   content. **(done)** No site-wide language switch is exposed.
2. Keep the homepage language control scoped to the blog preview and label it as
   writing language. **(done)** Audited 2026-05-14 — the toggle lives only in
   the blog panel, is labeled "Writing language", and writes
   `data-writing-language` for inspection only (no CSS reads it). Nav `Blog`
   anchors carry `data-blog-link` so the writing-language preference can
   retarget them.
3. Add locale support to the case-study generator:
   - render `/work/<slug>/` from English source
   - render `/it/work/<slug>/` only when the Italian translation block is present
   - emit reciprocal `hreflang` only for generated language pairs

   **(done)** Inline `translations.it` block per item in
   `assets/data/case-studies.json`. Field-level fallback is lenient, but the
   generator refuses to emit an Italian page unless localized title,
   meta/summary/subtitle, and at least one localized section body are present
   (release-gate guardrail). `hreflang` and `og:locale:alternate` are emitted
   only for the locales actually generated; `x-default` points at English.
   Italian pages live three levels deep (`it/work/<slug>/`) and use `../../../`
   for asset paths. Empty `it/` is pruned when no translations are indexable.
4. Move root homepage copy into locale-aware source data and generate `/` plus
   `/it/` from the same template. **(deferred)** No Italian root content is
   authored yet. Revisit when there is real content to ship at `/it/`. The
   current homepage stays hand-authored English-only; the case-study generator
   already produces `/it/work/<slug>/` independently.
5. Add a localization check command that validates link reciprocity and blocks
   fake alternates. **(done)** `go run ./cmd/harvester validate-localization`
   walks `_site/` (or a path passed as the second argument), extracts every
   page's `<link rel="canonical">` and `<link rel="alternate" hreflang="...">`
   set, and fails the build when an advertised alternate either does not
   resolve to a generated page or fails to link back. English-only pages with
   self-en and `x-default` are exempt. Hugo's `/blog/` subtree is skipped
   (it owns its own translation links).

