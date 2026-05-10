import { inject } from '@vercel/analytics';
import { createWorkbench } from './workbench/index.js';

// ===== Theme Toggle =====
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.getElementById('theme-icon').textContent = newTheme === 'dark' ? '🌙' : '☀️';
    syncThemeColor(newTheme);
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('theme-icon').textContent = savedTheme === 'dark' ? '🌙' : '☀️';

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
    const color = theme === 'dark' ? '#101726' : '#f5efe2';

    if (themeColorMeta) {
        themeColorMeta.setAttribute('content', color);
    }
}

syncThemeColor(savedTheme);

// ===== Scroll Reveal Animation with Intersection Observer =====
const revealElements = document.querySelectorAll('.scroll-reveal');

// Use Intersection Observer for better performance
if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target); // Stop observing once revealed
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
                el.classList.add('revealed');
            }
        });
    };
    window.addEventListener('scroll', revealOnScroll, { passive: true });
    revealOnScroll();
}

// ===== Blog Posts Auto-Loading =====
function getCurrentBlogLanguage() {
    // Check if user has manually selected a language
    const savedLang = localStorage.getItem('blog_language_preference');
    if (savedLang) return savedLang;

    // Auto-detect from browser
    const userLang = (navigator.language || navigator.userLanguage).toLowerCase();
    const isItalian = userLang.startsWith('it');
    return isItalian ? 'it' : 'en';
}

function toggleBlogLanguage() {
    const currentLang = getCurrentBlogLanguage();
    const newLang = currentLang === 'it' ? 'en' : 'it';

    // Save preference
    localStorage.setItem('blog_language_preference', newLang);

    // Update UI
    updateLanguageToggleUI(newLang);

    // Reload blog posts
    loadLatestBlogPosts(newLang);
}

function updateLanguageToggleUI(lang) {
    const icon = document.getElementById('lang-icon');
    const text = document.getElementById('lang-text');
    if (!icon || !text) return;

    if (lang === 'it') {
        icon.textContent = '🇮🇹';
        text.textContent = 'IT';
    } else {
        icon.textContent = '🇬🇧';
        text.textContent = 'EN';
    }
}

function parseCompactNumber(value) {
    if (!value) return 0;

    const normalized = value.trim().toLowerCase();
    if (normalized.endsWith('k')) {
        return Math.round(parseFloat(normalized.slice(0, -1)) * 1000);
    }

    return parseFloat(normalized) || 0;
}

function formatMetricCount(value) {
    if (!Number.isFinite(value)) return '--';

    return new Intl.NumberFormat('en-US', {
        notation: value >= 1000 ? 'compact' : 'standard',
        maximumFractionDigits: 1
    }).format(value);
}

function getBlogJsonPath(lang) {
    const relativePath = lang === 'en' ? 'en/index.json' : 'index.json';
    return `${siteBasePath}blog/${relativePath}`;
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

async function loadLatestBlogPosts(forceLang = null) {
    const lang = forceLang || getCurrentBlogLanguage();

    // Update toggle UI
    updateLanguageToggleUI(lang);

    const cacheKey = `blog_posts_${lang}_` + new Date().toDateString();
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
        try {
            const posts = JSON.parse(cached);
            renderBlogPosts(posts, lang);
            workbench.state.posts = posts;
            workbench.renderWorkbench();
            return;
        } catch (e) {
            console.warn('Failed to parse cached blog posts:', e);
            localStorage.removeItem(cacheKey);
        }
    }

    try {
        const response = await fetch(getBlogJsonPath(lang));
        if (!response.ok) {
            throw new Error('Failed to fetch blog posts');
        }

        const posts = await response.json();

        localStorage.setItem(cacheKey, JSON.stringify(posts));
        renderBlogPosts(posts, lang);
        workbench.state.posts = posts;
        workbench.renderWorkbench();
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
    } catch (e) {
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

async function fetchContributions(username, repoName = 'AndreaBozzo', branch = 'main') {
    const listElement = document.getElementById('contributions-list');
    if (!listElement) return;

    try {
        const response = await fetch(`${siteBasePath}assets/data/contributions.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch contributions.json: ${response.status}`);
        }

        const payload = await response.json();
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
                projectItem.innerHTML = `
                    <h3 class="project-name">${escapeHtml(contrib.name)}</h3>
                    <p class="project-desc">${escapeHtml(contrib.desc)}</p>
                    <p class="project-contrib">⭐ ${escapeHtml(contrib.stars)} stars · ${escapeHtml(contrib.prs)} PR${contrib.prs !== '1' ? 's' : ''}</p>
                    <a href="${contrib.url}" class="project-link" target="_blank" rel="noopener noreferrer">View project</a>
                `;
                listElement.appendChild(projectItem);
            });

        workbench.state.contributions = contributions;
        workbench.renderWorkbench();
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
        const response = await fetch(`${siteBasePath}assets/data/papers.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch papers.json: ${response.status}`);
        }

        const payload = await response.json();
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

        revealLoadedCards(listElement, '.content-card-enter');
    } catch (error) {
        console.error('Failed to load papers:', error);
        listElement.innerHTML = '<p class="error-message">Could not load papers at this time.</p>';
    }
}

async function loadCaseStudies() {
    try {
        const response = await fetch(`${siteBasePath}assets/data/case-studies.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch case-studies.json: ${response.status}`);
        }

        const payload = await response.json();
        workbench.state.caseStudies = Array.isArray(payload.items) ? payload.items : [];
        workbench.renderWorkbench();
    } catch (error) {
        console.error('Failed to load case studies:', error);
    }
}

// ===== Service Worker Registration =====
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
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
            console.log('🔄 Service Worker updated, reloading...');
            window.location.reload();
        });
    });
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', function() {
    if (shouldEnableAnalytics()) {
        inject();
    }
    const loadBlogPosts = () => loadLatestBlogPosts();
    const hasWorkbench = workbench.initializeWorkbench();

    loadHeroStats();

    if (hasWorkbench) {
        workbench.loadWorkbenchEngine();
        loadCaseStudies();
        fetchContributions(defaultGitHubUsername);
        loadPapers();

        if ('requestIdleCallback' in window) {
            requestIdleCallback(loadBlogPosts);
        } else {
            setTimeout(loadBlogPosts, 100);
        }
    }
});
