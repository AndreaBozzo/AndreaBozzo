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

const siteBasePath = new URL('.', window.location.href).pathname;
const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);

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

function getBlogJsonCandidates(lang) {
    const relativePath = lang === 'en' ? 'en/index.json' : 'index.json';
    const candidates = [];

    if (isLocalPreview) {
        candidates.push(`${siteBasePath}blog/public/${relativePath}`);
        candidates.push(`https://andreabozzo.github.io/AndreaBozzo/blog/${relativePath}`);
    }

    candidates.push(`${siteBasePath}blog/${relativePath}`);
    return [...new Set(candidates)];
}

function extractContributionMetrics(badgeSource) {
    const withoutStyle = badgeSource.replace(/-informational.*$/, '');
    const metricsSegment = withoutStyle.split('-').pop() || '';
    const [starsPart = '', prsPart = ''] = metricsSegment.split('|').map((part) => part.trim());

    return {
        stars: starsPart.replace(/^⭐\s*/, '') || '0',
        prs: prsPart.replace(/\s*PR$/, '') || '0'
    };
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
            return;
        } catch (e) {
            console.warn('Failed to parse cached blog posts:', e);
            localStorage.removeItem(cacheKey);
        }
    }

    try {
        const candidates = getBlogJsonCandidates(lang);
        let posts = null;

        for (const blogJsonPath of candidates) {
            const response = await fetch(blogJsonPath);
            if (!response.ok) {
                continue;
            }

            posts = await response.json();
            break;
        }

        if (!posts) {
            throw new Error('Failed to fetch blog posts');
        }

        localStorage.setItem(cacheKey, JSON.stringify(posts));
        renderBlogPosts(posts, lang);
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
            <a href="${post.permalink}" class="blog-card" style="text-decoration: none; color: inherit;">
                <div class="blog-date">${escapeHtml(date)}</div>
                <div class="blog-title">${escapeHtml(post.title)}</div>
                <div class="blog-summary">${escapeHtml(post.summary)}</div>
                <div class="blog-tags">
                    ${tags.map(tag => `<span class="blog-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </a>
        `;
    }).join('');
}

function showBlogError(lang) {
    const blogGrid = document.getElementById('blog-grid');
    const message = lang === 'it'
        ? 'Nessun articolo disponibile al momento.'
        : 'No articles available at the moment.';

    blogGrid.innerHTML = `
        <div class="blog-card" style="text-align: center; padding: 3rem;">
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
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

async function fetchContributions(username, repoName = 'AndreaBozzo', branch = 'main') {
    const listElement = document.getElementById('contributions-list');
    if (!listElement) return;

    try {
        const response = await fetch(`https://raw.githubusercontent.com/${username}/${repoName}/${branch}/README.md`);
        if (!response.ok) {
            throw new Error(`Failed to fetch README.md: ${response.status}`);
        }

        const markdown = await response.text();
        const startMarker = '<!-- EXTERNAL_CONTRIBUTIONS:START -->';
        const endMarker = '<!-- EXTERNAL_CONTRIBUTIONS:END -->';
        const startIndex = markdown.indexOf(startMarker);
        const endIndex = markdown.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error('Contribution markers not found in README.md');
        }

        const contributionsText = markdown.substring(startIndex + startMarker.length, endIndex).trim();
        const parser = new DOMParser();
        const doc = parser.parseFromString(contributionsText, 'text/html');
        const badges = doc.querySelectorAll('a img[alt]');
        const contributions = [];

        badges.forEach((img) => {
            const link = img.parentElement;
            if (!link) return;

            const badgeSource = decodeURIComponent(img.src.split('/').pop() || '');
            const { stars, prs } = extractContributionMetrics(badgeSource);

            contributions.push({
                name: img.alt,
                url: link.href,
                stars,
                prs,
                desc: 'Contributed code, fixes, or improvements to this project.'
            });
        });

        listElement.innerHTML = '';

        if (contributions.length === 0) {
            listElement.innerHTML = '<p class="error-message">No contribution cards available right now.</p>';
            return;
        }

        contributions
            .sort((left, right) => parseCompactNumber(right.stars) - parseCompactNumber(left.stars))
            .slice(0, 4)
            .forEach((contrib) => {
                const projectItem = document.createElement('article');
                projectItem.className = 'project-item';
                projectItem.innerHTML = `
                    <h3 class="project-name">${escapeHtml(contrib.name)}</h3>
                    <p class="project-desc">${escapeHtml(contrib.desc)}</p>
                    <p class="project-contrib">⭐ ${escapeHtml(contrib.stars)} stars · ${escapeHtml(contrib.prs)} PR${contrib.prs !== '1' ? 's' : ''}</p>
                    <a href="${contrib.url}" class="project-link" target="_blank" rel="noopener noreferrer">View project</a>
                `;
                listElement.appendChild(projectItem);
            });
    } catch (error) {
        console.error('Failed to fetch GitHub contributions:', error);
        listElement.innerHTML = '<p class="error-message">Could not load contributions at this time.</p>';
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
    const loadBlogPosts = () => loadLatestBlogPosts();
    fetchContributions('AndreaBozzo');

    if ('requestIdleCallback' in window) {
        requestIdleCallback(loadBlogPosts);
    } else {
        setTimeout(loadBlogPosts, 100);
    }
});
