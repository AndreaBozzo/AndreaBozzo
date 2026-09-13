// Shared chrome. All content renders to HTML; there is no browser runtime.
export const origin = 'https://andreabozzo.github.io/AndreaBozzo/';
export const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function document({ lang, path, title, description, body, root }) {
  const en = path.replace(/^it\//, '');
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} | Andrea Bozzo</title>
  <meta name="description" content="${escape(description)}">
  <meta name="theme-color" content="#36306b">
  <link rel="canonical" href="${origin}${path}">
  <link rel="alternate" hreflang="en" href="${origin}${en}">
  <link rel="alternate" hreflang="it" href="${origin}it/${en}">
  <link rel="alternate" hreflang="x-default" href="${origin}${en}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escape(title)} | Andrea Bozzo">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${origin}${path}">
  <meta property="og:image" content="${origin}assets/images/og/homepage.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${root}assets/styles.css">
  <link rel="alternate" type="application/rss+xml" title="Andrea Bozzo · Blog" href="${root}blog/${lang === 'en' ? 'en/' : ''}index.xml">
</head>
<body>
  <a class="skip" href="#main">${lang === 'it' ? 'Vai al contenuto' : 'Skip to content'}</a>
  <div class="desktop" id="top">
    <header class="masthead">
      <a class="brand" href="${root}${lang === 'it' ? 'it/' : ''}"><span class="brand-icon" aria-hidden="true">@</span> andrea bozzo<span class="brand-suffix"> / personal home page</span></a>
      <nav class="languages" aria-label="${lang === 'it' ? 'Lingua' : 'Language'}"><a href="${root}${en}" lang="en" hreflang="en"${lang === 'en' ? ' aria-current="page"' : ''}>EN</a> / <a href="${root}it/${en}" lang="it" hreflang="it"${lang === 'it' ? ' aria-current="page"' : ''}>IT</a></nav>
    </header>
    ${body}
    <footer class="footer"><span>© ${new Date().getUTCFullYear()} Andrea Bozzo</span><span>${lang === 'it' ? 'Un piccolo angolo del World Wide Web.' : 'A little corner of the World Wide Web.'}</span><a href="#top">${lang === 'it' ? 'Torna su' : 'Back to top'} ↑</a></footer>
  </div>
</body>
</html>
`;
}

export function windowBar(title, number = '') {
  return `<div class="window-bar"><span>${title}</span><span class="window-controls" aria-hidden="true">${number || '▪ &nbsp; □'}</span></div>`;
}

export const computer = `<div class="computer" aria-hidden="true">
  <div class="monitor"><div class="screen"><span class="terminal-label">ANDREA'S WORKSTATION</span><pre>  ┌───────┐
  │ &gt;_   │──┐
  └───────┘  │
      ┌──────┴──┐
      │  DATA   │
      └─────────┘</pre><span class="terminal-command">$ build useful things<span class="cursor">_</span></span></div><div class="monitor-chin"><span>AB / SYSTEMS</span><i></i></div></div>
  <div class="monitor-neck"></div><div class="computer-base"><span></span><i></i></div>
  <p class="computer-caption">small tools. big curiosity.</p>
</div>`;
