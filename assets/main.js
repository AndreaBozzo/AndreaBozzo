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

const topicBlueprints = [
    {
        id: 'all',
        label: 'All work',
        kind: 'topic',
        summary: 'Writing, projects, and open-source work across data infrastructure, developer tooling, and technical systems.',
        tags: ['Rust', 'Python', 'Go', 'Open Source']
    },
    {
        id: 'data-platforms',
        label: 'Data platforms',
        kind: 'topic',
        summary: 'Pipelines, lakehouse systems, analytical storage, orchestration, and the places where those systems touch.',
        tags: ['Iceberg', 'Lakehouse', 'Pipelines', 'Storage']
    },
    {
        id: 'rust-systems',
        label: 'Rust systems',
        kind: 'topic',
        summary: 'Rust-native analytics, async runtimes, web services, and the ergonomics of building dependable systems.',
        tags: ['Rust', 'Polars', 'Tokio', 'Axum']
    },
    {
        id: 'streaming',
        label: 'Streaming',
        kind: 'topic',
        summary: 'Streaming databases, event-driven systems, and operational patterns for continuous data products.',
        tags: ['RisingWave', 'Events', 'Queries']
    },
    {
        id: 'scraping',
        label: 'Harvesting',
        kind: 'topic',
        summary: 'Data acquisition, scraping boundaries, pipeline design, and the difference between collecting and extracting.',
        tags: ['Scraping', 'Harvesting', 'Pipelines']
    },
    {
        id: 'ai-finops',
        label: 'AI + FinOps',
        kind: 'topic',
        summary: 'The cost, architecture, and governance questions around analytical systems and AI workloads.',
        tags: ['AI', 'FinOps', 'Lakehouse']
    }
];

const workbenchState = {
    initialized: false,
    activeTopic: 'all',
    query: '',
    selectedId: 'data-platforms',
    posts: [],
    contributions: []
};

function normalizeText(value) {
    return String(value || '').toLowerCase();
}

function topicForItem(text) {
    const haystack = normalizeText(text);
    const matches = [];

    if (/(iceberg|lakehouse|pipeline|storage|lance|arrow|tabular|database|data platform|analytics)/.test(haystack)) {
        matches.push('data-platforms');
    }
    if (/(rust|polars|tokio|axum|async|runtime)/.test(haystack)) {
        matches.push('rust-systems');
    }
    if (/(stream|risingwave|event|query)/.test(haystack)) {
        matches.push('streaming');
    }
    if (/(scrap|harvest|ares|ceres|grappler)/.test(haystack)) {
        matches.push('scraping');
    }
    if (/(ai|finops|cost|dbu|claude|ml)/.test(haystack)) {
        matches.push('ai-finops');
    }

    return matches.length ? matches : ['data-platforms'];
}

function itemTags(item) {
    if (Array.isArray(item.tags) && item.tags.length) {
        return item.tags.slice(0, 4);
    }

    const source = normalizeText(`${item.title || item.label} ${item.summary || ''}`);
    const tags = [];
    if (source.includes('rust')) tags.push('Rust');
    if (source.includes('iceberg')) tags.push('Iceberg');
    if (source.includes('lakehouse')) tags.push('Lakehouse');
    if (source.includes('stream')) tags.push('Streaming');
    if (source.includes('scrap') || source.includes('harvest')) tags.push('Harvesting');
    if (source.includes('ai')) tags.push('AI');
    return tags.slice(0, 4);
}

function getWorkbenchItems() {
    const topicItems = topicBlueprints.filter(topic => topic.id !== 'all');
    const postItems = workbenchState.posts.slice(0, 8).map((post, index) => {
        const text = `${post.title || ''} ${post.summary || ''} ${(post.tags || []).join(' ')}`;
        return {
            id: `post-${index}-${normalizeText(post.title).replace(/[^a-z0-9]+/g, '-').slice(0, 36)}`,
            kind: 'post',
            label: post.title || 'Untitled note',
            title: post.title || 'Untitled note',
            summary: post.summary || 'A technical note from the archive.',
            tags: itemTags(post),
            topics: topicForItem(text),
            url: post.permalink || './blog/'
        };
    });

    const contributionItems = workbenchState.contributions.map((contrib, index) => {
        const text = `${contrib.name || ''} ${contrib.desc || ''}`;
        return {
            id: `project-${index}-${normalizeText(contrib.name).replace(/[^a-z0-9]+/g, '-')}`,
            kind: 'project',
            label: contrib.name,
            title: contrib.name,
            summary: contrib.desc,
            tags: itemTags({ title: contrib.name, summary: contrib.desc }),
            topics: topicForItem(text),
            url: contrib.url
        };
    });

    return [...topicItems, ...postItems, ...contributionItems];
}

function matchesWorkbenchFilter(item) {
    const query = normalizeText(workbenchState.query);
    const activeTopic = workbenchState.activeTopic;
    const itemTopicIds = item.kind === 'topic' ? [item.id] : item.topics || [];
    const matchesTopic = activeTopic === 'all' || itemTopicIds.includes(activeTopic);
    const searchable = normalizeText(`${item.label} ${item.title || ''} ${item.summary || ''} ${(item.tags || []).join(' ')}`);

    return matchesTopic && (!query || searchable.includes(query));
}

function renderTopicStrip() {
    const strip = document.getElementById('topic-strip');
    if (!strip) return;

    strip.innerHTML = topicBlueprints.map(topic => `
        <button class="topic-pill${topic.id === workbenchState.activeTopic ? ' is-active' : ''}" type="button" data-topic="${topic.id}">
            ${escapeHtml(topic.label)}
        </button>
    `).join('');

    strip.querySelectorAll('[data-topic]').forEach(button => {
        button.addEventListener('click', () => {
            workbenchState.activeTopic = button.dataset.topic;
            const topic = topicBlueprints.find(item => item.id === workbenchState.activeTopic);
            if (topic && topic.id !== 'all') workbenchState.selectedId = topic.id;
            renderWorkbench();
        });
    });
}

function renderMap(items) {
    const map = document.getElementById('map-orbit');
    if (!map) return;

    const visibleItems = items.slice(0, 14);
    const count = Math.max(visibleItems.length, 1);
    map.innerHTML = visibleItems.map((item, index) => {
        const isTopic = item.kind === 'topic';
        const radius = isTopic ? 24 : 38;
        const angle = (Math.PI * 2 * index / count) - Math.PI / 2;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * (radius * 0.78);
        const muted = matchesWorkbenchFilter(item) ? '' : ' is-muted';
        const selected = item.id === workbenchState.selectedId ? ' is-selected' : '';

        return `
            <button class="map-node${muted}${selected}" type="button" data-item-id="${escapeHtml(item.id)}" data-kind="${escapeHtml(item.kind)}" style="--node-x: ${x.toFixed(2)}%; --node-y: ${y.toFixed(2)}%;">
                ${escapeHtml(item.label)}
            </button>
        `;
    }).join('');

    map.querySelectorAll('[data-item-id]').forEach(button => {
        button.addEventListener('click', () => {
            workbenchState.selectedId = button.dataset.itemId;
            renderWorkbench();
        });
    });
}

function renderInspector(items) {
    const selected = items.find(item => item.id === workbenchState.selectedId)
        || topicBlueprints.find(topic => topic.id === workbenchState.activeTopic && topic.id !== 'all')
        || topicBlueprints[1];

    const kind = document.getElementById('inspector-kind');
    const title = document.getElementById('inspector-title');
    const summary = document.getElementById('inspector-summary');
    const tags = document.getElementById('inspector-tags');
    const link = document.getElementById('inspector-link');

    if (!kind || !title || !summary || !tags || !link) return;

    kind.textContent = selected.kind === 'post' ? 'Writing' : selected.kind === 'project' ? 'Open source' : 'Thread';
    title.textContent = selected.title || selected.label;
    summary.textContent = selected.summary;
    tags.innerHTML = (selected.tags || []).map(tag => `<span class="inspector-tag">${escapeHtml(tag)}</span>`).join('');
    link.href = selected.url || './blog/';
    link.textContent = selected.kind === 'project' ? 'View project' : selected.kind === 'post' ? 'Read note' : 'Browse related writing';
    link.target = selected.kind === 'project' ? '_blank' : '';
    link.rel = selected.kind === 'project' ? 'noopener noreferrer' : '';
}

function renderWorkbenchResults(items) {
    const container = document.getElementById('workbench-results');
    if (!container) return;

    const matches = items.filter(item => item.kind !== 'topic' && matchesWorkbenchFilter(item)).slice(0, 6);
    const fallback = items.filter(item => item.kind !== 'topic').slice(0, 6);
    const results = matches.length ? matches : fallback;

    if (!results.length) {
        container.innerHTML = topicBlueprints.slice(1, 4).map(topic => `
            <article class="result-card">
                <span class="result-meta">Thread</span>
                <h3>${escapeHtml(topic.label)}</h3>
                <p>${escapeHtml(topic.summary)}</p>
            </article>
        `).join('');
        return;
    }

    container.innerHTML = results.map(item => `
        <a class="result-card content-card-enter" href="${escapeHtml(item.url || './blog/')}" ${item.kind === 'project' ? 'target="_blank" rel="noopener noreferrer"' : ''}>
            <span class="result-meta">${item.kind === 'project' ? 'Open source' : 'Writing'}</span>
            <h3>${escapeHtml(item.title || item.label)}</h3>
            <p>${escapeHtml(item.summary || '')}</p>
        </a>
    `).join('');

    revealLoadedCards(container, '.content-card-enter');
}

function renderWorkbench() {
    if (!workbenchState.initialized) return;

    const items = getWorkbenchItems();
    renderTopicStrip();
    renderMap(items);
    renderInspector(items);
    renderWorkbenchResults(items);
}

function initializeWorkbench() {
    const search = document.getElementById('workbench-search');
    const map = document.getElementById('map-orbit');
    if (!search || !map || workbenchState.initialized) return;

    workbenchState.initialized = true;
    search.addEventListener('input', () => {
        workbenchState.query = search.value;
        renderWorkbench();
    });

    renderWorkbench();
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
            workbenchState.posts = posts;
            renderWorkbench();
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
        workbenchState.posts = posts;
        renderWorkbench();
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

        workbenchState.contributions = contributions;
        renderWorkbench();
        revealLoadedCards(listElement, '.content-card-enter');
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
    initializeWorkbench();
    fetchContributions('AndreaBozzo');

    if ('requestIdleCallback' in window) {
        requestIdleCallback(loadBlogPosts);
    } else {
        setTimeout(loadBlogPosts, 100);
    }
});
