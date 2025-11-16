// ===== Theme Toggle =====
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.getElementById('theme-icon').textContent = newTheme === 'dark' ? '🌙' : '☀️';
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('theme-icon').textContent = savedTheme === 'dark' ? '🌙' : '☀️';

// ===== Custom Cursor =====
// Only enable on desktop to save resources
if (window.innerWidth > 768) {
    const cursor = document.querySelector('.cursor');
    const cursorFollower = document.querySelector('.cursor-follower');

    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';

        setTimeout(() => {
            cursorFollower.style.left = e.clientX + 'px';
            cursorFollower.style.top = e.clientY + 'px';
        }, 100);
    });

    document.querySelectorAll('a, button, .btn, .tech-item, .blog-card, .project-card').forEach(el => {
        el.addEventListener('mouseenter', () => cursor.classList.add('active'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('active'));
    });
}

// ===== Particles Animation =====
const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const particles = [];
// Riduce particelle su mobile per performance
const particleCount = window.innerWidth < 768 ? 30 : 45;

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.radius = Math.random() * 2 + 1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }

    draw() {
        ctx.fillStyle = 'rgba(88, 166, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
}

let lastFrameTime = 0;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS;
const maxDistance = 120;
const maxDistanceSquared = maxDistance * maxDistance; // Avoid sqrt by comparing squared distances
let isCanvasVisible = true;
let animationId = null;

// Check for reduced motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateParticles(currentTime) {
    if (!isCanvasVisible || prefersReducedMotion) return; // Stop if not visible or reduced motion

    // Throttle animation to target FPS
    if (currentTime - lastFrameTime < frameInterval) {
        animationId = requestAnimationFrame(animateParticles);
        return;
    }
    lastFrameTime = currentTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update all particles first
    particles.forEach(particle => particle.update());

    // Draw connections (optimized with squared distance)
    ctx.lineWidth = 0.5;
    for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];

        // Limit connections per particle for better performance
        let connectionsDrawn = 0;
        const maxConnectionsPerParticle = 5;

        for (let j = i + 1; j < particles.length && connectionsDrawn < maxConnectionsPerParticle; j++) {
            const otherParticle = particles[j];
            const dx = particle.x - otherParticle.x;
            const dy = particle.y - otherParticle.y;

            // Quick rejection test with absolute values
            if (Math.abs(dx) > maxDistance || Math.abs(dy) > maxDistance) continue;

            // Use squared distance to avoid expensive sqrt
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < maxDistanceSquared) {
                const distance = Math.sqrt(distanceSquared); // Only calculate sqrt when needed
                const opacity = 0.2 * (1 - distance / maxDistance);
                ctx.strokeStyle = `rgba(88, 166, 255, ${opacity})`;
                ctx.beginPath();
                ctx.moveTo(particle.x, particle.y);
                ctx.lineTo(otherParticle.x, otherParticle.y);
                ctx.stroke();
                connectionsDrawn++;
            }
        }
    }

    // Draw particles after connections (so they appear on top)
    ctx.fillStyle = 'rgba(88, 166, 255, 0.3)';
    particles.forEach(particle => particle.draw());

    animationId = requestAnimationFrame(animateParticles);
}

// Pause animation when canvas is not in viewport
function startAnimation() {
    if (!isCanvasVisible || animationId || prefersReducedMotion) return;
    lastFrameTime = performance.now(); // Reset frame time
    animationId = requestAnimationFrame(animateParticles);
}

function stopAnimation() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// Observe canvas visibility
if ('IntersectionObserver' in window) {
    const canvasObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            isCanvasVisible = entry.isIntersecting;
            if (isCanvasVisible) {
                startAnimation();
            } else {
                stopAnimation();
            }
        });
    }, {
        threshold: 0.01 // Start animation when even 1% is visible
    });

    canvasObserver.observe(canvas);
}

if (!prefersReducedMotion) {
    startAnimation();
}

// Debounce resize event
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }, 150);
});

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

// ===== GitHub API Integration =====
async function loadGitHubMetrics() {
    const cacheKey = 'github_metrics';
    const cacheTimestampKey = 'github_metrics_timestamp';
    const cached = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(cacheTimestampKey);

    // Check if cache is valid (less than 24 hours old)
    const now = Date.now();
    const cacheAge = cacheTimestamp ? now - parseInt(cacheTimestamp) : Infinity;
    const cacheMaxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    if (cached && cacheAge < cacheMaxAge) {
        try {
            const data = JSON.parse(cached);
            updateMetrics(data);
            return;
        } catch (e) {
            console.warn('Failed to parse cached GitHub metrics:', e);
            localStorage.removeItem(cacheKey);
            localStorage.removeItem(cacheTimestampKey);
        }
    }

    try {
        const username = 'AndreaBozzo';

        const [userResponse, reposResponse] = await Promise.all([
            fetch(`https://api.github.com/users/${username}`),
            fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`)
        ]);

        const [userData, reposData] = await Promise.all([
            userResponse.json(),
            reposResponse.json()
        ]);

        const totalStars = reposData.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        const publicRepos = userData.public_repos;
        const estimatedCommits = Math.max(publicRepos * 50, 500);

        const metrics = { commits: estimatedCommits, repos: publicRepos, stars: totalStars };

        localStorage.setItem(cacheKey, JSON.stringify(metrics));
        localStorage.setItem(cacheTimestampKey, now.toString());
        updateMetrics(metrics);

    } catch (error) {
        console.log('GitHub API error:', error);
        updateMetrics({ commits: 500, repos: 15, stars: 50 });
    }
}

function updateMetrics(data) {
    const elements = ['commits-count', 'repos-count', 'stars-count'];
    const values = [data.commits, data.repos, data.stars];

    elements.forEach((id, index) => {
        const el = document.getElementById(id);
        el.classList.remove('loading');
        animateCounter(id, values[index]);
    });
}

function animateCounter(elementId, targetValue) {
    const element = document.getElementById(elementId);
    const duration = 2000;
    const stepTime = 50;
    const steps = duration / stepTime;
    const increment = targetValue / steps;
    let current = 0;

    const timer = setInterval(() => {
        current += increment;
        if (current >= targetValue) {
            current = targetValue;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toLocaleString();
    }, stepTime);
}

// ===== 3D Parallax Effect on Hero (Throttled for performance) =====
const hero = document.querySelector('.hero-content');
let parallaxEnabled = false;
let ticking = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Enable parallax only after initial animations complete and if not reduced motion
setTimeout(() => {
    if (!prefersReducedMotion) {
        parallaxEnabled = true;
    }
}, 1000);

function updateParallax() {
    if (!parallaxEnabled || window.innerWidth <= 768) return;

    const xAxis = (window.innerWidth / 2 - lastMouseX) / 100;
    const yAxis = (window.innerHeight / 2 - lastMouseY) / 100;

    const maxRotation = 5;
    const clampedX = Math.max(-maxRotation, Math.min(maxRotation, xAxis));
    const clampedY = Math.max(-maxRotation, Math.min(maxRotation, yAxis));

    hero.style.transform = `rotateY(${clampedX}deg) rotateX(${clampedY}deg)`;
    ticking = false;
}

document.addEventListener('mousemove', (e) => {
    lastMouseX = e.pageX;
    lastMouseY = e.pageY;

    if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
    }
});

document.addEventListener('mouseleave', () => {
    if (parallaxEnabled) {
        hero.style.transform = 'rotateY(0deg) rotateX(0deg)';
    }
});

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
        // Try language-specific JSON first
        const blogJsonPath = lang === 'en'
            ? '/AndreaBozzo/blog/en/index.json'
            : '/AndreaBozzo/blog/index.json';

        const response = await fetch(blogJsonPath);
        if (!response.ok) {
            throw new Error('Failed to fetch blog posts');
        }

        const posts = await response.json();
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

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', function() {
    const loadMetrics = () => loadGitHubMetrics();
    const loadBlogPosts = () => loadLatestBlogPosts();

    if ('requestIdleCallback' in window) {
        requestIdleCallback(loadMetrics);
        requestIdleCallback(loadBlogPosts);
    } else {
        setTimeout(loadMetrics, 100);
        setTimeout(loadBlogPosts, 150);
    }

    // Analytics
    if (window.location.hostname !== 'localhost') {
        console.log('📊 Landing Page Analytics:', {
            timestamp: new Date().toISOString(),
            page: 'landing-page',
            referrer: document.referrer,
            screen: screen.width + 'x' + screen.height
        });
    }
});
