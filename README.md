# Andrea Bozzo

Open source engineer building data platforms, developer tooling, and technical writing around Rust, Python, Go, and modern analytics systems.

This repository is the public front door for that work: the landing page, the blog, the interactive workbench, the generated case studies, and the small companion API that powers live GitHub stats on the site.

[Website](https://andreabozzo.github.io/AndreaBozzo/) | [Blog](https://andreabozzo.github.io/AndreaBozzo/blog/) | [LinkedIn](https://www.linkedin.com/in/andrea-bozzo-/) | [Email](mailto:andreabozzo92@gmail.com)

![Climbing towards the celestial Ankh](assets/images/Climbing%20towards%20the%20celestial%20Ankh.png)

_Per aspera ad data._

## What this repository contains

- A handcrafted landing page at the repository root built with HTML, CSS, and JavaScript.
- A Hugo-powered writing archive under [blog](blog).
- A queryable workbench whose frontend logic is mirrored between JavaScript and Rust compiled to WebAssembly.
- Generated case-study pages under [work](work), sourced from structured data and built through the Go harvester in [cmd/harvester](cmd/harvester).
- A small Go companion API under [api](api) for live GitHub metrics and badge endpoints.

Public deployment is intentionally split: GitHub Pages serves the static site and blog, while Vercel serves only the dynamic `api/` surface.

## Selected papers and companion repositories

- [uic2026-nephtys](https://github.com/AndreaBozzo/uic2026-nephtys) - companion repository for the IEEE UIC 2026 short paper on Nephtys, including the sensor simulator, demo scripts, benchmark automation, and LaTeX source.
- [scalcom2026-dataprof](https://github.com/AndreaBozzo/scalcom2026-dataprof) - IEEE ScalCom 2026 paper and benchmark suite comparing dataprof against interpreted Python profilers for scalable and sustainable edge AI telemetry profiling.

## Open source contributions

Contributions to the broader open source ecosystem beyond my own repositories.

> This section is updated automatically via GitHub Actions.

<!-- EXTERNAL_CONTRIBUTIONS:START -->
<p align="center">
  <img src="https://img.shields.io/badge/Projects-21-blue?style=flat-square" alt="Projects"/>
  <img src="https://img.shields.io/badge/PRs_Merged-50-success?style=flat-square" alt="PRs Merged"/>
  <img src="https://img.shields.io/badge/Combined_Stars-134.5k-yellow?style=flat-square" alt="Stars"/>
</p>

### Data ecosystem

<p>
<a href="https://github.com/pola-rs/polars"><img src="https://img.shields.io/badge/polars-%E2%AD%90%2038.4k%20%7C%203%20PR-informational?style=flat-square" alt="polars"/></a>
  <a href="https://github.com/risingwavelabs/risingwave"><img src="https://img.shields.io/badge/risingwave-%E2%AD%90%209.0k%20%7C%201%20PR-informational?style=flat-square" alt="risingwave"/></a>
  <a href="https://github.com/apache/datafusion"><img src="https://img.shields.io/badge/datafusion-%E2%AD%90%208.7k%20%7C%201%20PR-informational?style=flat-square" alt="datafusion"/></a>
  <a href="https://github.com/lance-format/lance"><img src="https://img.shields.io/badge/lance-%E2%AD%90%206.4k%20%7C%202%20PR-informational?style=flat-square" alt="lance"/></a>
  <a href="https://github.com/apache/arrow-rs"><img src="https://img.shields.io/badge/arrow--rs-%E2%AD%90%203.5k%20%7C%202%20PR-informational?style=flat-square" alt="arrow-rs"/></a>
  <a href="https://github.com/supabase/etl"><img src="https://img.shields.io/badge/etl-%E2%AD%90%202.2k%20%7C%202%20PR-informational?style=flat-square" alt="etl"/></a>
  <a href="https://github.com/lakekeeper/lakekeeper"><img src="https://img.shields.io/badge/lakekeeper-%E2%AD%90%201.3k%20%7C%202%20PR-informational?style=flat-square" alt="lakekeeper"/></a>
  <a href="https://github.com/pganalyze/pg_query.rs"><img src="https://img.shields.io/badge/pg__query.rs-%E2%AD%90%20234%20%7C%201%20PR-informational?style=flat-square" alt="pg_query.rs"/></a>
  <a href="https://github.com/apache/fluss-rust"><img src="https://img.shields.io/badge/fluss--rust-%E2%AD%90%2049%20%7C%202%20PR-informational?style=flat-square" alt="fluss-rust"/></a>
</p>

### Rust tooling

<p>
<a href="https://github.com/tokio-rs/tokio"><img src="https://img.shields.io/badge/tokio-%E2%AD%90%2031.9k%20%7C%202%20PR-informational?style=flat-square" alt="tokio"/></a>
  <a href="https://github.com/tokio-rs/axum"><img src="https://img.shields.io/badge/axum-%E2%AD%90%2025.9k%20%7C%201%20PR-informational?style=flat-square" alt="axum"/></a>
  <a href="https://github.com/apache/iceberg-rust"><img src="https://img.shields.io/badge/iceberg--rust-%E2%AD%90%201.3k%20%7C%203%20PR-informational?style=flat-square" alt="iceberg-rust"/></a>
  <a href="https://github.com/vakamo-labs/openfga-client"><img src="https://img.shields.io/badge/openfga--client-%E2%AD%90%207%20%7C%201%20PR-informational?style=flat-square" alt="openfga-client"/></a>
  <a href="https://github.com/rust-ita/rust-docs-it"><img src="https://img.shields.io/badge/rust--docs--it-%E2%AD%90%202%20%7C%202%20PR-informational?style=flat-square" alt="rust-docs-it"/></a>
</p>

### AI and ML

<p>
<a href="https://github.com/datapizza-labs/datapizza-ai"><img src="https://img.shields.io/badge/datapizza--ai-%E2%AD%90%202.2k%20%7C%205%20PR-informational?style=flat-square" alt="datapizza-ai"/></a>
  <a href="https://github.com/mosaico-labs/mosaico"><img src="https://img.shields.io/badge/mosaico-%E2%AD%90%20860%20%7C%2010%20PR-informational?style=flat-square" alt="mosaico"/></a>
</p>

### Infrastructure

<p>
<a href="https://github.com/beelzebub-labs/beelzebub"><img src="https://img.shields.io/badge/beelzebub-%E2%AD%90%202.0k%20%7C%201%20PR-informational?style=flat-square" alt="beelzebub"/></a>
  <a href="https://github.com/CortexFlow/CortexBrain"><img src="https://img.shields.io/badge/CortexBrain-%E2%AD%90%2080%20%7C%203%20PR-informational?style=flat-square" alt="CortexBrain"/></a>
</p>

### Other

<p>
<a href="https://github.com/italia-opensource/awesome-italia-opensource"><img src="https://img.shields.io/badge/awesome--italia--opensource-%E2%AD%90%20326%20%7C%201%20PR-informational?style=flat-square" alt="awesome-italia-opensource"/></a>
  <a href="https://github.com/piopy/fantacalcio-py"><img src="https://img.shields.io/badge/fantacalcio--py-%E2%AD%90%2051%20%7C%204%20PR-informational?style=flat-square" alt="fantacalcio-py"/></a>
  <a href="https://github.com/informagico/fantavibe"><img src="https://img.shields.io/badge/fantavibe-%E2%AD%90%206%20%7C%201%20PR-informational?style=flat-square" alt="fantavibe"/></a>
</p><!-- EXTERNAL_CONTRIBUTIONS:END -->

## GitHub snapshot

<p align="center">
  <img src="metrics/github-stats.svg" alt="GitHub Stats"/>
  <img src="metrics/languages.svg" alt="Top Languages"/>
</p>

<p align="center">
  <img src="metrics/contributions.svg" alt="Contribution Graph" />
</p>

## Local development

For the full contributor workflow, see [DEVELOPMENT.md](DEVELOPMENT.md). The shortest local preview path is:

```bash
npm install
npm run build:site
python3 -m http.server --directory _site 8000
```

Then open `http://localhost:8000/`.

Useful notes:

- The merged GitHub Pages artifact is assembled into [_site](_site).
- Styles are modularized under [assets/styles](assets/styles), with [assets/styles.css](assets/styles.css) as the single entrypoint for the bundled stylesheet.
- Case-study pages under [work](work) are generated from [assets/data/case-studies.json](assets/data/case-studies.json); edit the source data rather than the generated HTML.
- The Go harvester in [cmd/harvester](cmd/harvester) owns generated site artifacts and the auto-updated contributions section in this README.

If you only want to preview the blog, run `hugo server -D -F` inside [blog](blog).

## Roadmap

The next phases for the site are tracked in [ROADMAP.md](ROADMAP.md), including the multi-source harvester, typed schema work, client-side live polling polish, and the terminal-native `ssh cv.andreabozzo.com` companion project.
