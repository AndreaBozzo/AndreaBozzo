import { inject } from '@vercel/analytics';
import { createWorkbench } from './workbench/index.js';

// ===== Theme Toggle =====
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggleIcon(newTheme);
    syncThemeColor(newTheme);
}

function updateThemeToggleIcon(theme) {
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
}

function initializeThemeToggle() {
    const toggleButtons = document.querySelectorAll('.theme-toggle');
    toggleButtons.forEach((button) => {
        button.addEventListener('click', toggleTheme);
    });
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeToggleIcon(savedTheme);

const defaultGitHubUsername = 'AndreaBozzo';

function shouldEnableAnalytics() {
    const hostname = window.location.hostname;
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && window.location.protocol !== 'file:';
}

function getSiteBasePath() {
    const assetStylesheet = document.querySelector('link[href$="assets/styles.min.css"], link[href$="assets/styles.css"]');
    if (assetStylesheet) {
        return new URL('../', new URL(assetStylesheet.getAttribute('href'), window.location.href)).pathname;
    }

    return new URL('.', window.location.href).pathname;
}

const siteBasePath = getSiteBasePath();

function getCompanionApiBase() {
    const configuredBase = document.querySelector('meta[name="ab-api-base"]')?.getAttribute('content')?.trim();
    if (configuredBase) {
        return configuredBase.replace(/\/$/, '');
    }

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.vercel.app')) {
        return window.location.origin;
    }

    return '';
}

function syncThemeColor(theme) {
    const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])');
    const color = theme === 'dark' ? '#071411' : '#f7faf6';

    if (themeColorMeta) {
        themeColorMeta.setAttribute('content', color);
    }
}

syncThemeColor(savedTheme);

function ensureCaseStudyMediaViewer() {
    let viewer = document.getElementById('case-study-media-viewer');
    if (viewer) {
        return viewer;
    }

    viewer = document.createElement('div');
    viewer.id = 'case-study-media-viewer';
    viewer.className = 'media-viewer';
    viewer.hidden = true;
    viewer.innerHTML = `
        <div class="media-viewer-backdrop" data-media-dismiss="true"></div>
        <div class="media-viewer-dialog" role="dialog" aria-modal="true" aria-label="Expanded case study media">
            <button class="media-viewer-close" type="button" aria-label="Close full size media">×</button>
            <div class="media-viewer-frame">
                <img src="" alt="">
            </div>
            <div class="media-viewer-meta">
                <div class="media-viewer-label"></div>
                <p class="media-viewer-caption"></p>
            </div>
        </div>
    `;

    const closeViewer = () => {
        viewer.hidden = true;
        document.body.classList.remove('media-viewer-open');
    };

    viewer.querySelector('[data-media-dismiss="true"]').addEventListener('click', closeViewer);
    viewer.querySelector('.media-viewer-close').addEventListener('click', closeViewer);
    viewer.addEventListener('click', (event) => {
        if (event.target === viewer) {
            closeViewer();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !viewer.hidden) {
            closeViewer();
        }
    });

    document.body.appendChild(viewer);
    return viewer;
}

function initializeCaseStudyMediaViewer() {
    const triggers = document.querySelectorAll('.media-slot-trigger');
    if (!triggers.length) {
        return;
    }

    const viewer = ensureCaseStudyMediaViewer();
    const viewerImage = viewer.querySelector('.media-viewer-frame img');
    const viewerLabel = viewer.querySelector('.media-viewer-label');
    const viewerCaption = viewer.querySelector('.media-viewer-caption');
    const viewerClose = viewer.querySelector('.media-viewer-close');

    triggers.forEach((trigger) => {
        trigger.addEventListener('click', () => {
            viewerImage.src = trigger.dataset.mediaSrc || '';
            viewerImage.alt = trigger.dataset.mediaAlt || trigger.dataset.mediaLabel || '';
            viewerLabel.textContent = trigger.dataset.mediaLabel || 'Case study media';
            viewerCaption.textContent = trigger.dataset.mediaCaption || '';
            viewer.hidden = false;
            document.body.classList.add('media-viewer-open');
            viewerClose.focus();
        });
    });
}

// ===== Scroll Reveal Animation with Intersection Observer =====
const revealElements = document.querySelectorAll('.scroll-reveal');
let revealObserver = null;

function revealElement(element) {
    element.classList.add('revealed');
    revealObserver?.unobserve(element);
}

function revealVisibleElements() {
    revealElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
            revealElement(element);
        }
    });
}

function revealHashTarget() {
    if (!window.location.hash) return;

    const target = document.getElementById(window.location.hash.slice(1));
    const revealTarget = target?.classList.contains('scroll-reveal')
        ? target
        : target?.closest('.scroll-reveal');
    if (revealTarget) {
        revealElement(revealTarget);
    }
}

function scrollHashTargetIntoView() {
    if (!window.location.hash) return;

    const target = document.getElementById(window.location.hash.slice(1));
    if (!target) return;

    window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY,
        behavior: 'auto'
    });
}

// Use Intersection Observer for better performance
if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                revealElement(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));
} else {
    // Fallback for older browsers
    const revealOnScroll = () => {
        revealElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight - 100) {
                revealElement(el);
            }
        });
    };
    window.addEventListener('scroll', revealOnScroll, { passive: true });
    revealOnScroll();
}

requestAnimationFrame(() => {
    revealHashTarget();
    revealVisibleElements();
});
window.addEventListener('load', () => {
    revealHashTarget();
    revealVisibleElements();
    requestAnimationFrame(scrollHashTargetIntoView);
});
window.addEventListener('hashchange', () => {
    revealHashTarget();
    requestAnimationFrame(scrollHashTargetIntoView);
});

// ===== Writing Language Preference and Blog Posts Auto-Loading =====
const supportedWritingLanguages = new Set(['en', 'it']);
const writingLanguageStorageKey = 'writing_language_preference';
const legacyBlogLanguageStorageKey = 'blog_language_preference';
const legacySiteLanguageStorageKey = 'site_language_preference';

function normalizeWritingLanguage(lang) {
    const normalized = String(lang || '').toLowerCase().split('-')[0];
    return supportedWritingLanguages.has(normalized) ? normalized : '';
}

function detectBrowserLanguage() {
    const userLang = normalizeWritingLanguage(navigator.language || navigator.userLanguage);
    return userLang === 'it' ? 'it' : 'en';
}

function getCurrentWritingLanguage() {
    const savedLang = normalizeWritingLanguage(localStorage.getItem(writingLanguageStorageKey));
    if (savedLang) return savedLang;

    const legacySavedLang = normalizeWritingLanguage(
        localStorage.getItem(legacyBlogLanguageStorageKey) || localStorage.getItem(legacySiteLanguageStorageKey)
    );
    if (legacySavedLang) return legacySavedLang;

    return detectBrowserLanguage();
}

function persistWritingLanguage(lang) {
    localStorage.setItem(writingLanguageStorageKey, lang);
    localStorage.setItem(legacyBlogLanguageStorageKey, lang);
}

function getBlogPathForLanguage(lang) {
    const basePath = siteBasePath.endsWith('/') ? siteBasePath : `${siteBasePath}/`;
    return `${basePath}blog/${lang === 'en' ? 'en/' : ''}`;
}

function updateWritingLanguageUI(lang) {
    document.documentElement.setAttribute('data-writing-language', lang);

    document.querySelectorAll('[data-writing-language-toggle]').forEach((button) => {
        const text = button.querySelector('[data-lang-text]');
        if (text) {
            text.textContent = lang.toUpperCase();
        }
        button.setAttribute('aria-label', lang === 'it'
            ? 'Switch writing language to English'
            : 'Switch writing language to Italian');
        button.setAttribute('title', lang === 'it'
            ? 'Show English writing'
            : 'Show Italian writing');
    });

    document.querySelectorAll('[data-blog-link]').forEach((link) => {
        link.setAttribute('href', getBlogPathForLanguage(lang));
    });
}

function toggleWritingLanguage() {
    const currentLang = getCurrentWritingLanguage();
    const newLang = currentLang === 'it' ? 'en' : 'it';

    persistWritingLanguage(newLang);
    updateWritingLanguageUI(newLang);

    if (document.getElementById('blog-grid')) {
        loadLatestBlogPosts(newLang);
    }
}

window.toggleTheme = toggleTheme;
window.toggleBlogLanguage = toggleWritingLanguage;

function initializeWritingLanguagePreference() {
    const lang = getCurrentWritingLanguage();
    updateWritingLanguageUI(lang);
    document.querySelectorAll('[data-writing-language-toggle]').forEach((button) => {
        button.addEventListener('click', toggleWritingLanguage);
    });
}

// ===== Site Locale Switch (EN ↔ IT) =====
// The widget is plain anchors that work without JS. This enhancement preserves
// the current URL hash when navigating, so deep links to in-page sections
// (e.g. #workbench) survive the locale flip on pages that share section IDs.
function initializeSiteLocaleSwitch() {
    document.querySelectorAll('[data-site-locale-switch] a[data-site-lang]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const hash = window.location.hash;
            if (!hash) return;
            const href = link.getAttribute('href');
            if (!href || href.includes('#')) return;
            event.preventDefault();
            window.location.href = href + hash;
        });
    });
}

function formatMetricCount(value) {
    if (!Number.isFinite(value)) return '--';

    return new Intl.NumberFormat('en-US', {
        notation: value >= 1000 ? 'compact' : 'standard',
        maximumFractionDigits: 1
    }).format(value);
}

function formatProofPercent(value) {
    if (!Number.isFinite(value)) return '--';
    return `${Math.round(value * 100)}%`;
}

function sumNumbers(items, field) {
    return items.reduce((total, item) => {
        const value = item?.[field];
        return Number.isFinite(value) ? total + value : total;
    }, 0);
}

function uniqueValues(items, field) {
    return new Set(items.map(item => item?.[field]).filter(Boolean));
}

function proofLocale() {
    return document.documentElement.lang === 'it' ? 'it' : 'en';
}

function proofText(en, it) {
    return proofLocale() === 'it' ? it : en;
}

function getBlogJsonPath(lang) {
    const relativePath = lang === 'en' ? 'en/index.json' : 'index.json';
    return `${siteBasePath}blog/${relativePath}`;
}

async function fetchJson(url, { timeoutMs = 7000 } = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        return await response.json();
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function revealLoadedCards(container, selector) {
    const items = container.querySelectorAll(selector);

    items.forEach((item, index) => {
        item.style.setProperty('--card-delay', `${index}`);
    });

    requestAnimationFrame(() => {
        items.forEach((item) => item.classList.add('is-visible'));
    });
}

function blogCacheKey(lang) {
    return `blog_posts_${lang}`;
}

function readBlogCache(lang) {
    const raw = localStorage.getItem(blogCacheKey(lang));
    if (!raw) return null;
    try {
        const entry = JSON.parse(raw);
        if (!entry || entry.date !== new Date().toDateString() || !Array.isArray(entry.posts)) {
            return null;
        }
        return entry.posts;
    } catch {
        localStorage.removeItem(blogCacheKey(lang));
        return null;
    }
}

function writeBlogCache(lang, posts) {
    try {
        localStorage.setItem(blogCacheKey(lang), JSON.stringify({
            date: new Date().toDateString(),
            posts
        }));
    } catch {
        // localStorage may be full or disabled; silently skip.
    }
}

async function loadLatestBlogPosts(forceLang = null) {
    const lang = normalizeWritingLanguage(forceLang) || getCurrentWritingLanguage();
    updateWritingLanguageUI(lang);

    const cached = readBlogCache(lang);
    if (cached) {
        renderBlogPosts(cached, lang);
        workbench.setPosts(cached);
        return;
    }

    try {
        const posts = await fetchJson(getBlogJsonPath(lang));
        writeBlogCache(lang, posts);
        renderBlogPosts(posts, lang);
        workbench.setPosts(posts);
    } catch (error) {
        console.error('Failed to load blog posts:', error);
        showBlogError(lang);
    }
}

function renderBlogPosts(posts, lang) {
    const blogGrid = document.getElementById('blog-grid');
    if (!blogGrid || !posts || posts.length === 0) {
        showBlogError(lang);
        return;
    }

    const latestPosts = posts.slice(0, 2); // Show 2 latest posts

    blogGrid.innerHTML = latestPosts.map(post => {
        const date = formatBlogDate(post.date || '', lang);
        const tags = extractTags(post);

        return `
            <a href="${post.permalink}" class="blog-card content-card-enter" style="text-decoration: none; color: inherit;">
                <div class="blog-date">${escapeHtml(date)}</div>
                <div class="blog-title">${escapeHtml(post.title)}</div>
                <div class="blog-summary">${escapeHtml(post.summary)}</div>
                <div class="blog-tags">
                    ${tags.map(tag => `<span class="blog-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </a>
        `;
    }).join('');

    revealLoadedCards(blogGrid, '.content-card-enter');
}

function showBlogError(lang) {
    const blogGrid = document.getElementById('blog-grid');
    if (!blogGrid) return;
    const message = lang === 'it'
        ? 'Nessun articolo disponibile al momento.'
        : 'No articles available at the moment.';

    blogGrid.innerHTML = `
        <div class="blog-card content-card-enter is-visible" style="text-align: center; padding: 3rem;">
            <div class="blog-title">${message}</div>
        </div>
    `;
}

function formatBlogDate(dateString, lang) {
    if (!dateString) return lang === 'it' ? 'Recente' : 'Recent';

    try {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        const locale = lang === 'it' ? 'it-IT' : 'en-US';
        return date.toLocaleDateString(locale, options);
    } catch {
        return dateString;
    }
}

function extractTags(post) {
    // Try to extract tags from various possible locations
    if (post.tags && Array.isArray(post.tags)) {
        return post.tags.slice(0, 4); // Max 4 tags
    }

    // Fallback: extract from content or title
    const defaultTags = [];
    const content = (post.content || post.title || '').toLowerCase();

    if (content.includes('rust')) defaultTags.push('Rust');
    if (content.includes('data') && content.includes('engineer')) defaultTags.push('Data Engineering');
    if (content.includes('streaming')) defaultTags.push('Streaming');
    if (content.includes('iceberg')) defaultTags.push('Apache Iceberg');

    return defaultTags.slice(0, 4);
}

function escapeHtml(text) {
    const value = String(text || '');
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return value.replace(/[&<>"']/g, m => map[m]);
}

function formatRelativeDate(input) {
    if (!input) return '';
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
    const years = Math.floor(days / 365);
    return years === 1 ? '1 year ago' : `${years} years ago`;
}

const workbench = createWorkbench({
    siteBasePath,
    escapeHtml,
    revealLoadedCards
});

async function loadHeroStats() {
    const root = document.getElementById('hero-stats');
    const followers = document.getElementById('hero-stat-followers');
    const stars = document.getElementById('hero-stat-stars');
    const repos = document.getElementById('hero-stat-repos');
    const meta = document.getElementById('hero-stat-meta');

    if (!root || !followers || !stars || !repos || !meta) return;

    const apiBase = getCompanionApiBase();
    if (!apiBase) {
        root.hidden = true;
        root.dataset.state = 'disabled';
        meta.textContent = 'Set the companion Vercel host in the ab-api-base meta tag to enable live GitHub stats.';
        return;
    }

    root.hidden = false;

    try {
        const endpoint = new URL('/api/github/stats', apiBase);
        endpoint.searchParams.set('username', defaultGitHubUsername);

        const response = await fetch(endpoint.toString(), { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`Failed to fetch live stats: ${response.status}`);
        }

        const summary = await response.json();
        followers.textContent = formatMetricCount(summary.followers);
        stars.textContent = formatMetricCount(summary.totalStars);
        repos.textContent = formatMetricCount(summary.ownedRepos || summary.publicRepos);

        const updatedAt = summary.generatedAtUtc ? new Date(summary.generatedAtUtc).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) : 'now';
        const topRepo = summary.topRepoName ? `Top repo: ${summary.topRepoName}` : 'Top repo unavailable';
        meta.textContent = `${topRepo} · Updated ${updatedAt}`;
        root.dataset.state = 'live';
    } catch (error) {
        console.error('Failed to load live GitHub stats:', error);
        root.dataset.state = 'error';
        meta.textContent = 'The companion API is unavailable right now. Static content is still served from GitHub Pages.';
    }
}

function renderProofCardSignals(name, signals) {
    const root = document.querySelector(`[data-proof-card="${name}"]`);
    if (!root || !Array.isArray(signals) || signals.length === 0) return;

    root.innerHTML = signals.map((signal) => `
        <div class="proof-card-signal">
            <dt>${escapeHtml(signal.label)}</dt>
            <dd>${escapeHtml(signal.value)}</dd>
        </div>
    `).join('');
}

function setProofStat(id, value) {
    const element = document.getElementById(id);
    if (element && value) {
        element.textContent = value;
    }
}

function packagesRelatedTo(items, slug) {
    return items.filter((item) => Array.isArray(item.relatedCaseStudies) && item.relatedCaseStudies.includes(slug));
}

function ciRelatedTo(items, slug) {
    return items.filter((item) => item.caseStudySlug === slug);
}

function averageSuccessRate(items) {
    const rates = items.map(item => item.successRate).filter(Number.isFinite);
    if (rates.length === 0) return null;
    return rates.reduce((total, value) => total + value, 0) / rates.length;
}

function parsePRCount(value) {
    const parsed = Number.parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function apacheContributionItems(items) {
    return items.filter((item) => /arrow|datafusion|iceberg|fluss/i.test(`${item.name || ''} ${item.url || ''}`));
}

async function loadGeneratedProofSignals() {
    const strip = document.getElementById('proof-signal-strip');
    if (!strip) return;

    try {
        const [packagesPayload, ciPayload, datasetsPayload, writingPayload, contributionsPayload] = await Promise.all([
            fetchJson(`${siteBasePath}assets/data/packages.json`),
            fetchJson(`${siteBasePath}assets/data/ci-runtimes.json`),
            fetchJson(`${siteBasePath}assets/data/datasets.json`),
            fetchJson(`${siteBasePath}assets/data/writing.json`),
            fetchJson(`${siteBasePath}assets/data/contributions.json`)
        ]);

        const packages = Array.isArray(packagesPayload.items) ? packagesPayload.items : [];
        const ciRuns = Array.isArray(ciPayload.items) ? ciPayload.items : [];
        const datasets = Array.isArray(datasetsPayload.items) ? datasetsPayload.items : [];
        const writing = Array.isArray(writingPayload.items) ? writingPayload.items : [];
        const contributions = Array.isArray(contributionsPayload.items) ? contributionsPayload.items : [];

        const totalDownloads = sumNumbers(packages, 'downloadsTotal');
        const latestGreen = ciRuns.filter(item => item.latestConclusion === 'success').length;
        const totalRecords = sumNumbers(datasets, 'totalRecords');
        const writingSlugs = uniqueValues(writing, 'slug');
        const writingLanguages = [...uniqueValues(writing, 'language')].map(lang => lang.toUpperCase()).sort();
        const totalPRs = contributions.reduce((total, item) => total + parsePRCount(item.prs), 0);

        setProofStat('proof-stat-packages', `${packages.length} ${proofText('packages', 'package')} · ${formatMetricCount(totalDownloads)} ${proofText('downloads', 'download')}`);
        setProofStat('proof-stat-ci', `${latestGreen}/${ciRuns.length} ${proofText('latest runs green', 'run recenti verdi')}`);
        setProofStat('proof-stat-datasets', `${formatMetricCount(totalRecords)} ${proofText('records', 'record')} · ${datasets.length} ${proofText('dataset', 'dataset')}`);
        setProofStat('proof-stat-writing', `${writingSlugs.size} ${proofText('posts', 'articoli')} · ${writingLanguages.join('/')}`);
        setProofStat('proof-stat-repos', `${totalPRs} ${proofText('merged PRs', 'PR mergeate')} · ${contributions.length} repo`);

        const dataprofPackages = packagesRelatedTo(packages, 'dataprof');
        const dataprofCI = ciRelatedTo(ciRuns, 'dataprof');
        renderProofCardSignals('dataprof', [
            {
                label: proofText('Registry', 'Registry'),
                value: `${dataprofPackages.length} ${proofText('packages', 'package')} · ${formatMetricCount(sumNumbers(dataprofPackages, 'downloadsTotal'))}`
            },
            {
                label: proofText('CI', 'CI'),
                value: `${formatProofPercent(averageSuccessRate(dataprofCI))} ${proofText('success', 'successo')}`
            }
        ]);

        const apacheItems = apacheContributionItems(contributions);
        const apachePRs = apacheItems.reduce((total, item) => total + parsePRCount(item.prs), 0);
        const apacheWriting = writing.filter(item => Array.isArray(item.relatedCaseStudies) && item.relatedCaseStudies.includes('apache-rust-upstream'));
        renderProofCardSignals('apache', [
            {
                label: proofText('Public PRs', 'PR pubbliche'),
                value: `${apachePRs} ${proofText('merged', 'mergeate')}`
            },
            {
                label: proofText('Repos', 'Repo'),
                value: `${apacheItems.length} Apache/Rust`
            }
        ]);

        const totalWords = sumNumbers(writing, 'wordCount');
        renderProofCardSignals('writing', [
            {
                label: proofText('Archive', 'Archivio'),
                value: `${writingSlugs.size} ${proofText('topics', 'temi')}`
            },
            {
                label: proofText('Depth', 'Profondità'),
                value: `${formatMetricCount(totalWords)} ${proofText('words', 'parole')}`
            }
        ]);

        if (apacheWriting.length > 0) {
            const apacheRoot = document.querySelector('[data-proof-card="apache"]');
            apacheRoot?.insertAdjacentHTML('beforeend', `
                <div class="proof-card-signal">
                    <dt>${escapeHtml(proofText('Writing', 'Scrittura'))}</dt>
                    <dd>${escapeHtml(`${uniqueValues(apacheWriting, 'slug').size} ${proofText('related posts', 'articoli collegati')}`)}</dd>
                </div>
            `);
        }
    } catch (error) {
        console.error('Failed to load generated proof signals:', error);
    }
}

async function fetchContributions() {
    const listElement = document.getElementById('contributions-list');
    if (!listElement) return;

    try {
        const payload = await fetchJson(`${siteBasePath}assets/data/contributions.json`);
        const contributions = Array.isArray(payload.items) ? payload.items : [];

        listElement.innerHTML = '';

        if (contributions.length === 0) {
            listElement.innerHTML = '<p class="error-message">No contribution cards available right now.</p>';
            return;
        }

        contributions
            .forEach((contrib) => {
                const projectItem = document.createElement('article');
                projectItem.className = 'project-item content-card-enter';

                const prList = Array.isArray(contrib.prList) ? contrib.prList : [];
                const prRowsHtml = prList.map((pr) => {
                    const mergedDate = formatRelativeDate(pr.mergedAt);
                    const number = pr.number ? `#${pr.number}` : '';
                    return `
                        <li class="project-pr">
                            <a class="project-pr-link" href="${pr.url}" target="_blank" rel="noopener noreferrer">
                                <span class="project-pr-state" aria-label="merged">merged</span>
                                <span class="project-pr-title">${escapeHtml(pr.title)}</span>
                                <span class="project-pr-meta">${escapeHtml(number)}${mergedDate ? ` · ${escapeHtml(mergedDate)}` : ''}</span>
                            </a>
                        </li>
                    `;
                }).join('');

                const recency = formatRelativeDate(contrib.lastPRMergedAt);
                const recencyHtml = recency ? ` · last merge ${escapeHtml(recency)}` : '';

                projectItem.innerHTML = `
                    <h3 class="project-name">${escapeHtml(contrib.name)}</h3>
                    <p class="project-desc">${escapeHtml(contrib.desc)}</p>
                    <p class="project-contrib">⭐ ${escapeHtml(contrib.stars)} stars · ${escapeHtml(contrib.prs)} PR${contrib.prs !== '1' ? 's' : ''}${recencyHtml}</p>
                    ${prRowsHtml ? `<ul class="project-prs">${prRowsHtml}</ul>` : ''}
                    <a href="${contrib.url}" class="project-link" target="_blank" rel="noopener noreferrer">View project</a>
                `;
                listElement.appendChild(projectItem);
            });

        workbench.setContributions(contributions);
        revealLoadedCards(listElement, '.content-card-enter');
    } catch (error) {
        console.error('Failed to fetch GitHub contributions:', error);
        listElement.innerHTML = '<p class="error-message">Could not load contributions at this time.</p>';
    }
}

async function loadPapers() {
    const listElement = document.getElementById('papers-list');
    if (!listElement) return;

    try {
        const payload = await fetchJson(`${siteBasePath}assets/data/papers.json`);
        const papers = Array.isArray(payload.items) ? payload.items : [];

        listElement.innerHTML = '';

        if (papers.length === 0) {
            listElement.innerHTML = '<p class="error-message">No paper cards available right now.</p>';
            return;
        }

        papers.forEach((paper) => {
            const paperItem = document.createElement('article');
            paperItem.className = 'project-item paper-item content-card-enter';
            paperItem.innerHTML = `
                <p class="paper-kicker">${escapeHtml(paper.kicker || '')}</p>
                <h3 class="project-name">${escapeHtml(paper.name || 'Paper')}</h3>
                <p class="project-desc">${escapeHtml(paper.desc || '')}</p>
                <p class="project-contrib">${escapeHtml(paper.meta || '')}</p>
                <a href="${paper.url}" class="project-link" target="_blank" rel="noopener noreferrer">View repository</a>
            `;
            listElement.appendChild(paperItem);
        });

        workbench.setPapers(papers);
        revealLoadedCards(listElement, '.content-card-enter');
    } catch (error) {
        console.error('Failed to load papers:', error);
        listElement.innerHTML = '<p class="error-message">Could not load papers at this time.</p>';
    }
}

async function loadPackages() {
    try {
        const payload = await fetchJson(`${siteBasePath}assets/data/packages.json`);
        workbench.setPackages(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
        console.error('Failed to load packages:', error);
    }
}

async function loadCaseStudies() {
    try {
        const payload = await fetchJson(`${siteBasePath}assets/data/case-studies.json`);
        workbench.setCaseStudies(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
        console.error('Failed to load case studies:', error);
    }
}

// ===== Service Worker Registration =====
if ('serviceWorker' in navigator && shouldEnableAnalytics()) {
    let refreshing = false;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${siteBasePath}sw.js`)
            .then((registration) => {
                console.log('✅ Service Worker registered:', registration.scope);

                // Controlla aggiornamenti ogni ora
                setInterval(() => {
                    registration.update();
                }, 60 * 60 * 1000);
            })
            .catch((error) => {
                console.log('❌ Service Worker registration failed:', error);
            });

        // Ascolta aggiornamenti del SW
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            console.log('🔄 Service Worker updated, reloading...');
            window.location.reload();
        });
    });
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', function() {
    initializeThemeToggle();
    initializeWritingLanguagePreference();
    initializeSiteLocaleSwitch();
    if (shouldEnableAnalytics()) {
        inject();
    }
    initializeCaseStudyMediaViewer();
    const loadBlogPosts = () => loadLatestBlogPosts();
    const hasWorkbench = workbench.initializeWorkbench();

    loadHeroStats();
    loadGeneratedProofSignals();

    if (hasWorkbench) {
        workbench.loadWorkbenchEngine();
        loadCaseStudies();
        fetchContributions();
        loadPapers();
        loadPackages();

        if ('requestIdleCallback' in window) {
            requestIdleCallback(loadBlogPosts, { timeout: 1500 });
        } else {
            setTimeout(loadBlogPosts, 100);
        }
    }
});
