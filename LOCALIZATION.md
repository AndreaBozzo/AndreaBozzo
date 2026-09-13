# Localization

English personal pages live at `/` and `/work/<slug>/`; Italian pages at `/it/`
and `/it/work/<slug>/`. Both are static, indexable HTML with reciprocal language
links and self-canonical URLs. Switches lead to the same page in the other language.

Homepage translations live together in `scripts/homepage.mjs`. Project translations
live in each entry's `translations.it` in `content/projects.json`. Keep both versions
complete when editing. Shared project names and technical terms can remain unchanged.

Hugo owns the blog translations: Italian at `/blog/`, English at `/blog/en/`.
Homepage writing links use the appropriate Hugo index at build time.

Run `npm run test:smoke` to check language switching, canonical URLs, and local links.
