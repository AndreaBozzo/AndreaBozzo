import { document, windowBar, computer, escape } from './site-template.mjs';

const projects = [
  ['dataprof', 'Rust · Python · Arrow', 'Files, DataFrames, and Arrow streams. Quality reports that disclose what was actually assessed.', 'File, DataFrame e stream Arrow. Report che esplicitano cosa è stato davvero valutato.', 'work/dataprof/'],
  ['Ceres + Ares', 'Rust · Open data', 'Collecting open data and turning messy sources into useful datasets.', 'Raccolta di open data: da fonti disordinate a dataset utilizzabili.', 'work/ares-ceres/'],
  ['GitNodes', 'Rust · Git · MCP', 'Connect decisions, incidents, and the reasons things changed. Knowledge that stays in Git.', 'Collega decisioni, incidenti e ragioni dei cambiamenti. La conoscenza resta in Git.', 'work/gitnodes/'],
  ['dlt + dbt', 'Python · Databricks', 'Runnable lakehouse pipelines, analytics marts, and quality gates. Also tested locally with DuckDB.', 'Pipeline lakehouse, mart e controlli di qualità eseguibili. Verificati anche in locale con DuckDB.', 'work/dlt-dbt-databricks/'],
  ['Nephtys', 'Go · NATS · Edge', 'Supervised stream ingestion, durable events, and reproducible edge benchmarks.', 'Ingestion supervisionata, eventi durevoli e benchmark edge riproducibili.', 'work/nephtys/'],
];

const copy = {
  en: {
    title: 'Welcome to my corner of the web', description: 'Andrea Bozzo: data engineer, open-source builder, and technical writer. Rust, Python, Go, and a fondness for the old web.',
    directory: 'site directory', about: 'About me', projects: 'Things I build', writing: 'Field notes', contact: 'Say hello', blog: 'Visit the blog',
    welcome: 'HELLO, WORLD. MAKE YOURSELF AT HOME.', intro: 'I’m Andrea.<br>I make data<br><em>make sense.</em>',
    bio: 'Data engineer, open-source builder, and incurable tinkerer. I work where data pipelines, storage, and developer tools meet, usually with Rust, Python, or Go.',
    introLink: 'Have a look around', note: 'PERSONAL SITE, PERSONAL RULES', noteBody: 'Useful software.<br>Honest field notes.<br>A healthy curiosity.',
    colophon: 'Best viewed with<br><strong>an open mind.</strong>', selected: 'A few things from the workbench', selectedIntro: 'Tools I build, maintain, and learn from. The source is yours to explore.', archive: 'More projects & experiments', repo: 'All repositories on GitHub',
    upstream: 'Also found upstream', upstreamText: 'I contribute fixes and improvements to the tools I use, including Apache Arrow, DataFusion, Iceberg Rust, Polars, and Tokio.', upstreamLink: 'Follow the contribution trail',
    notesTitle: 'Notes from the rabbit hole', notesIntro: 'Experiments, things that broke, and what I learned along the way.', allWriting: 'Enter the blog', rss: 'Subscribe via RSS',
    contactTitle: 'Got something interesting?', contactText: 'Data infrastructure, open source, or a good technical rabbit hole. Drop me a line.', email: 'Write me an email',
    badges: ['PERSONAL HOME PAGE', 'OPEN SOURCE INSIDE', 'KEEP THE WEB WEIRD'], status: 'Still exploring. Still building.',
  },
  it: {
    title: 'Benvenuto nel mio angolo del web', description: 'Andrea Bozzo: data engineer, sviluppatore open source e autore tecnico. Rust, Python, Go e una passione per il vecchio web.',
    directory: 'indice del sito', about: 'Chi sono', projects: 'Cosa costruisco', writing: 'Appunti di viaggio', contact: 'Scrivimi', blog: 'Visita il blog',
    welcome: 'CIAO, MONDO. FAI COME SE FOSSI A CASA.', intro: 'Sono Andrea.<br>Do un senso<br><em>ai dati.</em>',
    bio: 'Data engineer, sviluppatore open source e sperimentatore instancabile. Lavoro dove si incontrano pipeline dati, storage e strumenti per sviluppatori, di solito con Rust, Python o Go.',
    introLink: 'Dai un’occhiata', note: 'UN SITO PERSONALE, A MODO MIO', noteBody: 'Software utile.<br>Appunti sinceri.<br>Una sana curiosità.',
    colophon: 'Da visitare con<br><strong>una mente aperta.</strong>', selected: 'Qualche progetto dal laboratorio', selectedIntro: 'Strumenti che costruisco, mantengo e da cui imparo. Il codice è a disposizione.', archive: 'Altri progetti ed esperimenti', repo: 'Tutti i repository su GitHub',
    upstream: 'Mi trovi anche upstream', upstreamText: 'Contribuisco correzioni e miglioramenti agli strumenti che uso, tra cui Apache Arrow, DataFusion, Iceberg Rust, Polars e Tokio.', upstreamLink: 'Segui le mie contribuzioni',
    notesTitle: 'Appunti dalle esplorazioni', notesIntro: 'Esperimenti, cose che si sono rotte e quello che ho imparato.', allWriting: 'Entra nel blog', rss: 'Segui via RSS',
    contactTitle: 'Hai qualcosa di interessante?', contactText: 'Infrastrutture dati, open source o un bel problema tecnico da esplorare: scrivimi.', email: 'Mandami un’email',
    badges: ['HOME PAGE PERSONALE', 'OPEN SOURCE INSIDE', 'UN WEB PIÙ PERSONALE'], status: 'Continuo a esplorare e costruire.',
  },
};

export function homepage(lang, studies, posts) {
  const c = copy[lang];
  const root = lang === 'it' ? '../' : './';
  const blog = `${root}blog/${lang === 'en' ? 'en/' : ''}`;
  const projectLink = url => url.startsWith('https:') ? url : `./${url}`;
  const body = `<div class="desktop-rule"><span>WORLD WIDE WEB / PERSONAL EDITION</span><span>RUST · PYTHON · GO</span></div>
  <div class="layout">
    <aside class="sidebar">
      <nav class="window directory" aria-label="${c.directory}">${windowBar(c.directory)}<div class="directory-body">
        <p class="directory-label">~/andrea/</p>
        <a href="#about"><span aria-hidden="true">☺</span> ${c.about}</a>
        <a href="#workbench"><span aria-hidden="true">▤</span> ${c.projects}</a>
        <a href="#writing"><span aria-hidden="true">✎</span> ${c.writing}</a>
        <a href="#contact"><span aria-hidden="true">✉</span> ${c.contact}</a>
        <hr><a href="${blog}"><span aria-hidden="true">↗</span> ${c.blog}</a>
        <a href="https://github.com/AndreaBozzo"><span aria-hidden="true">↗</span> GitHub</a>
      </div></nav>
      <div class="sticky-note"><span class="note-pin" aria-hidden="true">+</span><p class="tiny">${c.note}</p><p>${c.noteBody}</p><span class="note-signature">Andrea</span></div>
      <div class="web-stamp"><span aria-hidden="true">✳</span><p>${c.colophon}</p></div>
      <p class="sidebar-status"><span aria-hidden="true">●</span> ${c.status}</p>
    </aside>
    <main id="main">
      <section id="about" class="window welcome">${windowBar('hello_world.txt')}<div class="welcome-content">
        <p class="eyebrow">${c.welcome}</p>
        <div class="hero-grid"><div><h1>${c.intro}</h1><p class="bio">${c.bio}</p><a class="button" href="#workbench">${c.introLink} <span aria-hidden="true">↓</span></a></div>${computer}</div>
      </div><div class="status-bar"><span><span class="status-dot" aria-hidden="true"></span> ${c.status}</span><span>100% PERSONAL</span></div></section>
      <section id="workbench" class="window projects">${windowBar('projects/', '01')}<div class="panel-content">
        <h2>${c.selected}</h2><p class="section-intro">${c.selectedIntro}</p>
        <div class="project-list">${projects.map(([name, stack, en, it, url], i) => `<article class="project-row"><span class="file-icon" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><h3><a href="${projectLink(url)}">${name}</a></h3><p>${lang === 'it' ? it : en}</p></div><span class="project-stack">${stack}</span></article>`).join('')}</div>
        <details class="archive"><summary>${c.archive}</summary><ul>
          ${studies.filter(s => !['dataprof', 'ares-ceres', 'gitnodes', 'dlt-dbt-databricks', 'nephtys', 'apache-rust-upstream'].includes(s.slug)).sort((a,b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || '')).map(s => { const localized = lang === 'it' ? s.translations.it : s; return `<li><a href="./work/${s.slug}/">${escape(localized.displayTitle || localized.title || s.title)}</a>: ${escape(localized.subtitle)}</li>`; }).join('')}</ul><a href="https://github.com/AndreaBozzo?tab=repositories">${c.repo} ↗</a></details>
        <p class="section-intro summer-notes">${lang === 'it' ? 'Dal laboratorio, estate 2026:' : 'From the workbench, summer 2026:'} <a href="./work/fantabuddy/">Fantabuddy</a> · <a href="./work/occas/">OCCAS</a> · <a href="./work/iceberg-stale-base-repro/">${lang === 'it' ? 'Esperimento sui commit Iceberg' : 'Iceberg commit experiment'}</a></p>
        <div id="papers" class="research"><p>${lang === 'it' ? 'Ricerca e benchmark riproducibili:' : 'Research & reproducible benchmarks:'} <a href="https://github.com/AndreaBozzo/uic2026-nephtys">Nephtys / UIC 2026</a> · <a href="https://github.com/AndreaBozzo/scalcom2026-dataprof">dataprof / ScalCom 2026</a></p></div>
        <div class="upstream" id="projects"><h3>${c.upstream}</h3><p>${c.upstreamText}</p><a href="./work/apache-rust-upstream/">${c.upstreamLink} →</a></div>
      </div></section>
      <section id="writing" class="window writing">${windowBar(lang === 'it' ? 'appunti / blog' : 'field notes / blog', '02')}<div class="panel-content">
        <h2>${c.notesTitle}</h2><p class="section-intro">${c.notesIntro}</p>
        <ol class="post-list">${posts.map(p => `<li><time datetime="${p.date}">${p.date.slice(0, 10)}</time><a href="${blog}posts/${p.slug}/">${escape(p.title)}</a><span aria-hidden="true">↗</span></li>`).join('')}</ol>
        <div class="writing-links"><a class="button" href="${blog}">${c.allWriting} →</a><a href="${blog}index.xml">${c.rss}</a></div>
      </div></section>
      <section id="contact" class="contact"><span class="contact-icon" aria-hidden="true">✉</span><div><h2>${c.contactTitle}</h2><p>${c.contactText}</p><div class="contact-links"><a href="mailto:andreabozzo92@gmail.com">${c.email} ↗</a><a href="https://www.linkedin.com/in/andrea-bozzo-/">LinkedIn ↗</a><a href="https://github.com/AndreaBozzo">GitHub ↗</a></div></div></section>
      <div class="badges">${c.badges.map(b => `<span>${b}</span>`).join('')}<a href="https://github.com/AndreaBozzo/AndreaBozzo">${lang === 'it' ? 'CODICE SORGENTE' : 'VIEW SOURCE'} ↗</a></div>
    </main>
  </div>`;
  return document({ lang, path: lang === 'it' ? 'it/' : '', title: c.title, description: c.description, body, root });
}
