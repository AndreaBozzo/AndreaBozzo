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
    contributions: [],
    caseStudies: []
};

let workbenchEngine = null;
let workbenchEngineTick = null;
let workbenchEngineLoadStarted = false;

const graphSim = {
    enabled: false,
    nodes: [],
    edges: [],
    rafId: null,
    hoveredId: null,
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    reduceMotion: false,
    settledFrames: 0,
    temperature: 1.0,
    tickCount: 0
};

const NODE_KIND_COLORS = {
    topic: '#c45a27',
    'case-study': '#7358ba',
    post: '#1e4f95',
    project: '#0e7065'
};
const NODE_KIND_RADIUS = {
    topic: 30,
    'case-study': 24,
    post: 20,
    project: 20
};
const SIM_WARMUP_STEPS = 60;
const SIM_TEMP_FLOOR = 0.05;
const SIM_TEMP_DECAY = 0.985;

function normalizeText(value) {
    return String(value || '').toLowerCase();
}

function topicForItem(text) {
    const haystack = normalizeText(text);
    const matches = [];

    if (/(iceberg|lakehouse|pipeline|storage|lance|arrow|tabular|database|data platform|analytics|profiler|contract)/.test(haystack)) {
        matches.push('data-platforms');
    }
    if (/(rust|polars|tokio|axum|async|runtime|no_std|embassy|embedded)/.test(haystack)) {
        matches.push('rust-systems');
    }
    if (/(streaming|risingwave|event-driven|jetstream|websocket|webhook|server-sent|\bsse\b|\bnats\b|grpc)/.test(haystack)) {
        matches.push('streaming');
    }
    if (/(scrap|harvest|ares|ceres|schema extraction|json schema|open data portal|web scraper)/.test(haystack)) {
        matches.push('scraping');
    }
    if (/(finops|cost|dbu|green ai|edge ai|machine learning|tinyml|llm|agent|physical ai|robotics|\bml\b)/.test(haystack)) {
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
    const caseStudyItems = workbenchState.caseStudies.map((study) => {
        const title = study.title || study.slug || 'Case study';
        const text = `${study.title || ''} ${study.subtitle || ''} ${study.summary || ''} ${(study.stack || []).join(' ')} ${(study.relatedPosts || []).join(' ')}`;

        return {
            id: `case-${normalizeText(study.slug || title).replace(/[^a-z0-9]+/g, '-')}`,
            kind: 'case-study',
            label: title,
            title,
            summary: study.summary || study.subtitle || 'A project case study from the archive.',
            tags: Array.isArray(study.stack) ? study.stack.slice(0, 4) : [],
            topics: topicForItem(text),
            url: `${siteBasePath}work/${study.slug || normalizeText(title).replace(/[^a-z0-9]+/g, '-')}/`
        };
    });
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

    return [...topicItems, ...caseStudyItems, ...postItems, ...contributionItems];
}

function buildWorkbenchPayload() {
    return {
        topics: topicBlueprints,
        posts: workbenchState.posts,
        contributions: workbenchState.contributions,
        caseStudies: workbenchState.caseStudies,
        activeTopic: workbenchState.activeTopic,
        query: workbenchState.query,
        selectedId: workbenchState.selectedId
    };
}

function resultFromItem(item, score = 0) {
    return {
        id: item.id,
        kind: item.kind,
        title: item.title || item.label,
        summary: item.summary || '',
        tags: item.tags || [],
        url: item.url || './blog/',
        score
    };
}

function selectedFromItem(item) {
    return {
        id: item.id,
        kind: item.kind,
        title: item.title || item.label,
        summary: item.summary || '',
        tags: item.tags || [],
        url: item.url || './blog/'
    };
}

function buildFallbackWorkbench() {
    const items = getWorkbenchItems();
    const count = Math.max(items.length, 1);
    const visibleItems = items.filter(item => matchesWorkbenchFilter(item));
    const results = items
        .filter(item => item.kind !== 'topic' && matchesWorkbenchFilter(item))
        .slice(0, 6)
        .map((item, index) => resultFromItem(item, 10 - index));
    const fallbackResults = items
        .filter(item => item.kind !== 'topic')
        .slice(0, 6)
        .map((item, index) => resultFromItem(item, 5 - index));
    const selected = visibleItems.find(item => item.id === workbenchState.selectedId)
        || topicBlueprints.find(topic => topic.id === workbenchState.activeTopic && topic.id !== 'all')
        || visibleItems.find(item => item.kind !== 'topic')
        || topicBlueprints[1];

    return {
        nodes: items.slice(0, 14).map((item, index) => {
            const isTopic = item.kind === 'topic';
            const radius = isTopic ? 24 : 38;
            const angle = (Math.PI * 2 * index / count) - Math.PI / 2;
            return {
                id: item.id,
                kind: item.kind,
                label: item.label,
                x: 50 + Math.cos(angle) * radius,
                y: 50 + Math.sin(angle) * (radius * 0.78),
                score: 0,
                visible: matchesWorkbenchFilter(item)
            };
        }),
        results: results.length ? results : fallbackResults,
        selected: selectedFromItem(selected),
        topics: topicBlueprints.map(topic => ({
            id: topic.id,
            label: topic.label,
            count: topic.id === 'all'
                ? items.filter(item => item.kind !== 'topic').length
                : items.filter(item => (item.topics || []).includes(topic.id)).length
        }))
    };
}

function buildWorkbenchViewModel() {
    if (workbenchEngine) {
        try {
            const output = workbenchEngine(JSON.stringify(buildWorkbenchPayload()));
            return JSON.parse(output);
        } catch (error) {
            console.warn('Rust workbench engine failed, using JavaScript fallback:', error);
        }
    }

    return buildFallbackWorkbench();
}

function matchesWorkbenchFilter(item) {
    const query = normalizeText(workbenchState.query);
    const activeTopic = workbenchState.activeTopic;
    const itemTopicIds = item.kind === 'topic' ? [item.id] : item.topics || [];
    const matchesTopic = activeTopic === 'all' || itemTopicIds.includes(activeTopic);
    const searchable = normalizeText(`${item.label} ${item.title || ''} ${item.summary || ''} ${(item.tags || []).join(' ')}`);

    return matchesTopic && (!query || searchable.includes(query));
}

function renderTopicStrip(topicCounts = []) {
    const strip = document.getElementById('topic-strip');
    if (!strip) return;

    const countsById = new Map(topicCounts.map(topic => [topic.id, topic.count]));

    strip.innerHTML = topicBlueprints.map(topic => `
        <button class="topic-pill${topic.id === workbenchState.activeTopic ? ' is-active' : ''}" type="button" data-topic="${topic.id}">
            ${escapeHtml(topic.label)} <span>${escapeHtml(countsById.get(topic.id) ?? '')}</span>
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

function renderMap(nodes, edges) {
    if (graphSim.enabled) {
        renderGraphCanvas(nodes, edges);
        renderMapA11yList(nodes);
        return;
    }
    renderMapDom(nodes);
    renderMapA11yList(nodes);
}

function renderMapDom(nodes) {
    const map = document.getElementById('map-orbit');
    if (!map) return;

    map.innerHTML = nodes.map((node) => {
        const muted = node.visible ? '' : ' is-muted';
        const selected = node.id === workbenchState.selectedId ? ' is-selected' : '';

        return `
            <button class="map-node${muted}${selected}" type="button" data-item-id="${escapeHtml(node.id)}" data-kind="${escapeHtml(node.kind)}" style="--node-x: ${Number(node.x).toFixed(2)}%; --node-y: ${Number(node.y).toFixed(2)}%;">
                ${escapeHtml(node.label)}
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

function renderMapA11yList(nodes) {
    const list = document.getElementById('map-a11y-list');
    if (!list) return;
    list.innerHTML = nodes.map(node => `
        <li><button type="button" data-item-id="${escapeHtml(node.id)}">${escapeHtml(node.label)}</button></li>
    `).join('');
    list.querySelectorAll('[data-item-id]').forEach(button => {
        button.addEventListener('click', () => {
            workbenchState.selectedId = button.dataset.itemId;
            renderWorkbench();
        });
    });
}

function ensureGraphCanvas() {
    if (graphSim.canvas) return graphSim.canvas;
    const canvas = document.getElementById('map-canvas');
    if (!canvas) return null;
    graphSim.canvas = canvas;
    graphSim.ctx = canvas.getContext('2d');
    graphSim.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        graphSim.dpr = dpr;
        graphSim.width = rect.width;
        graphSim.height = rect.height;
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        graphSim.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawGraph();
    };
    resize();
    if ('ResizeObserver' in window) {
        new ResizeObserver(resize).observe(canvas);
    } else {
        window.addEventListener('resize', resize);
    }

    canvas.addEventListener('click', onGraphClick);
    canvas.addEventListener('mousemove', onGraphHover);
    canvas.addEventListener('mouseleave', () => {
        if (graphSim.hoveredId !== null) {
            graphSim.hoveredId = null;
            graphSim.canvas.style.cursor = 'grab';
            drawGraph();
        }
    });

    return canvas;
}

function seedInitialPosition(id, index, total) {
    // Sunflower (Vogel) spiral packs n points evenly inside a disk. Stable per
    // node because we hash the id into the angle, so re-renders keep nodes
    // anchored.
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const hash = Array.from(String(id)).reduce((h, ch) => ((h * 31) + ch.charCodeAt(0)) >>> 0, 2166136261);
    const angle = index * goldenAngle + (hash % 1000) / 1000 * 0.4;
    const radiusFrac = Math.sqrt((index + 0.5) / Math.max(total, 1));
    const r = 28 * radiusFrac;
    return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
}

function renderGraphCanvas(nodes, edges) {
    const panel = document.querySelector('.map-panel');
    if (panel && !panel.classList.contains('is-canvas')) {
        panel.classList.add('is-canvas');
    }
    if (!ensureGraphCanvas()) return;

    const previousById = new Map(graphSim.nodes.map(n => [n.id, n]));
    const isFirstRender = previousById.size === 0;
    graphSim.nodes = nodes.map((node, index) => {
        const prev = previousById.get(node.id);
        if (prev) {
            return {
                id: node.id,
                kind: node.kind,
                label: node.label,
                visible: node.visible,
                x: prev.x,
                y: prev.y,
                vx: prev.vx,
                vy: prev.vy
            };
        }
        const seed = seedInitialPosition(node.id, index, nodes.length);
        return {
            id: node.id,
            kind: node.kind,
            label: node.label,
            visible: node.visible,
            x: seed.x,
            y: seed.y,
            vx: 0,
            vy: 0
        };
    });
    graphSim.edges = (edges || []).filter(edge =>
        graphSim.nodes.some(n => n.id === edge.from) && graphSim.nodes.some(n => n.id === edge.to)
    );
    graphSim.settledFrames = 0;

    if (isFirstRender) {
        graphSim.temperature = 1.0;
        graphSim.tickCount = 0;
        for (let i = 0; i < SIM_WARMUP_STEPS; i++) {
            stepSimulation();
        }
    } else {
        graphSim.temperature = Math.max(graphSim.temperature, 0.6);
    }

    if (graphSim.reduceMotion) {
        for (let i = 0; i < 40; i++) stepSimulation();
        drawGraph();
        return;
    }
    drawGraph();
    startGraphLoop();
}

function stepSimulation() {
    if (!graphSim.nodes.length) return 0;
    const payload = JSON.stringify({
        nodes: graphSim.nodes,
        edges: graphSim.edges,
        selectedId: workbenchState.selectedId,
        dt: 1.0,
        temperature: graphSim.temperature
    });
    let result;
    if (workbenchEngineTick) {
        try {
            result = JSON.parse(workbenchEngineTick(payload));
        } catch (error) {
            console.warn('tick_layout failed, switching to JS fallback:', error);
            workbenchEngineTick = null;
            result = stepSimulationJS();
        }
    } else {
        result = stepSimulationJS();
    }
    graphSim.nodes = result.nodes;
    graphSim.tickCount += 1;
    graphSim.temperature = Math.max(graphSim.temperature * SIM_TEMP_DECAY, SIM_TEMP_FLOOR);
    return result.kineticEnergy ?? result.kinetic_energy ?? 0;
}

function stepSimulationJS() {
    const REPULSION = 12;
    const SPRING_K = 0.22;
    const SPRING_REST = 9;
    const DAMPING = 0.78;
    const FOCUS_PULL = 0.015;
    const CENTER_PULL = 0.16;
    const MIN_DIST = 2.0;
    const MIN_DIST_SQ = MIN_DIST * MIN_DIST;
    const MAX_VEL = 2.5;
    const BOUND_LOW = 8;
    const BOUND_HIGH = 92;
    const temperature = graphSim.temperature;

    const nodes = graphSim.nodes.map(n => ({ ...n }));
    const fx = new Array(nodes.length).fill(0);
    const fy = new Array(nodes.length).fill(0);

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            let dx = nodes[i].x - nodes[j].x;
            let dy = nodes[i].y - nodes[j].y;
            let distSq = dx * dx + dy * dy;
            if (distSq < MIN_DIST_SQ) {
                const bias = ((i * 17 + j * 31) % 7) * 0.01 + 0.05;
                dx += bias;
                dy -= bias;
                distSq = Math.max(dx * dx + dy * dy, MIN_DIST_SQ);
            }
            const dist = Math.sqrt(distSq);
            const force = REPULSION / dist;
            const ux = dx / dist;
            const uy = dy / dist;
            fx[i] += ux * force; fy[i] += uy * force;
            fx[j] -= ux * force; fy[j] -= uy * force;
        }
    }

    const indexById = new Map(nodes.map((n, idx) => [n.id, idx]));
    for (const edge of graphSim.edges) {
        const i = indexById.get(edge.from);
        const j = indexById.get(edge.to);
        if (i === undefined || j === undefined) continue;
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DIST);
        const force = SPRING_K * (dist - SPRING_REST);
        const ux = dx / dist;
        const uy = dy / dist;
        fx[i] += ux * force; fy[i] += uy * force;
        fx[j] -= ux * force; fy[j] -= uy * force;
    }

    const selectedIdx = workbenchState.selectedId ? indexById.get(workbenchState.selectedId) : undefined;
    const focusX = selectedIdx !== undefined ? nodes[selectedIdx].x : 50;
    const focusY = selectedIdx !== undefined ? nodes[selectedIdx].y : 50;
    for (let i = 0; i < nodes.length; i++) {
        fx[i] += (50 - nodes[i].x) * CENTER_PULL;
        fy[i] += (50 - nodes[i].y) * CENTER_PULL;
        if (selectedIdx !== undefined && i !== selectedIdx) {
            fx[i] += (focusX - nodes[i].x) * FOCUS_PULL;
            fy[i] += (focusY - nodes[i].y) * FOCUS_PULL;
        }
    }

    const maxStep = MAX_VEL * temperature;
    let ke = 0;
    for (let i = 0; i < nodes.length; i++) {
        if (i === selectedIdx) {
            nodes[i].vx = 0; nodes[i].vy = 0;
            continue;
        }
        let vx = (nodes[i].vx + fx[i]) * DAMPING;
        let vy = (nodes[i].vy + fy[i]) * DAMPING;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > maxStep) {
            vx = vx * maxStep / speed;
            vy = vy * maxStep / speed;
        }
        nodes[i].vx = vx;
        nodes[i].vy = vy;
        nodes[i].x = Math.min(BOUND_HIGH, Math.max(BOUND_LOW, nodes[i].x + vx));
        nodes[i].y = Math.min(BOUND_HIGH, Math.max(BOUND_LOW, nodes[i].y + vy));
        ke += vx * vx + vy * vy;
    }

    return { nodes, kineticEnergy: ke };
}

function startGraphLoop() {
    if (graphSim.rafId) return;
    const tick = () => {
        const ke = stepSimulation();
        drawGraph();
        if (ke < 0.02) {
            graphSim.settledFrames += 1;
        } else {
            graphSim.settledFrames = 0;
        }
        if (graphSim.settledFrames >= 12) {
            graphSim.rafId = null;
            return;
        }
        graphSim.rafId = requestAnimationFrame(tick);
    };
    graphSim.rafId = requestAnimationFrame(tick);
}

function nodeToPixel(node) {
    // Independent x/y scaling stretches the layout to fill the panel. Node
    // sizes stay in absolute pixels so circles never deform.
    return {
        x: (node.x / 100) * graphSim.width,
        y: (node.y / 100) * graphSim.height
    };
}

function drawGraph() {
    const ctx = graphSim.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, graphSim.width, graphSim.height);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const edgeStroke = isDark ? 'rgba(170, 190, 220, 0.22)' : 'rgba(60, 70, 95, 0.18)';
    const edgeStrokeActive = isDark ? 'rgba(196, 90, 39, 0.7)' : 'rgba(196, 90, 39, 0.55)';

    const nodeById = new Map(graphSim.nodes.map(n => [n.id, n]));
    const selectedId = workbenchState.selectedId;

    ctx.lineWidth = 1.2;
    for (const edge of graphSim.edges) {
        const a = nodeById.get(edge.from);
        const b = nodeById.get(edge.to);
        if (!a || !b) continue;
        const active = a.id === selectedId || b.id === selectedId
            || a.id === graphSim.hoveredId || b.id === graphSim.hoveredId;
        ctx.strokeStyle = active ? edgeStrokeActive : edgeStroke;
        ctx.beginPath();
        const ap = nodeToPixel(a);
        const bp = nodeToPixel(b);
        ctx.moveTo(ap.x, ap.y);
        ctx.lineTo(bp.x, bp.y);
        ctx.stroke();
    }

    for (const node of graphSim.nodes) {
        const { x, y } = nodeToPixel(node);
        const radius = NODE_KIND_RADIUS[node.kind] || 18;
        const isSelected = node.id === selectedId;
        const isHovered = node.id === graphSim.hoveredId;
        const baseColor = NODE_KIND_COLORS[node.kind] || '#444';
        const isTopic = node.kind === 'topic';

        ctx.globalAlpha = node.visible ? 1.0 : 0.32;

        if (isSelected || isHovered) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
            ctx.fillStyle = isDark
                ? 'rgba(196, 90, 39, 0.18)'
                : 'rgba(196, 90, 39, 0.16)';
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? '#1c2436' : '#fbf4e7';
        ctx.fill();
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = isSelected ? 3 : 1.8;
        ctx.stroke();

        ctx.font = `${isTopic ? 600 : 500} 12px "IBM Plex Sans", Arial, sans-serif`;
        ctx.textAlign = 'center';
        if (isTopic) {
            // Topic nodes are larger; render label inside, wrapped to two lines.
            ctx.fillStyle = baseColor;
            ctx.textBaseline = 'middle';
            drawWrappedLabel(ctx, node.label, x, y, radius * 1.6, 13);
        } else {
            // Other nodes get a label below the circle so the disc stays clean.
            ctx.fillStyle = isDark ? '#e8eef5' : '#1a2236';
            ctx.textBaseline = 'top';
            drawWrappedLabel(ctx, node.label, x, y + radius + 6, radius * 3.2, 13);
        }
    }
    ctx.globalAlpha = 1.0;
}

function drawWrappedLabel(ctx, label, cx, topY, maxWidth, lineHeight) {
    const words = String(label).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth || !current) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;
        }
        if (lines.length >= 2) break;
    }
    if (lines.length < 2 && current) lines.push(current);

    while (lines.length > 0 && ctx.measureText(lines[lines.length - 1]).width > maxWidth) {
        let last = lines[lines.length - 1];
        while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
            last = last.slice(0, -1);
        }
        lines[lines.length - 1] = last + '…';
        break;
    }

    const totalHeight = lines.length * lineHeight;
    const baseline = ctx.textBaseline;
    let startY = topY;
    if (baseline === 'middle') {
        startY = topY - totalHeight / 2 + lineHeight / 2;
    }
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cx, startY + i * lineHeight);
    }
}

function pickNodeAt(clientX, clientY) {
    const rect = graphSim.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best = null;
    let bestDistSq = Infinity;
    for (const node of graphSim.nodes) {
        const { x, y } = nodeToPixel(node);
        const dx = px - x;
        const dy = py - y;
        const dSq = dx * dx + dy * dy;
        const radius = NODE_KIND_RADIUS[node.kind] || 18;
        if (dSq <= (radius + 6) * (radius + 6) && dSq < bestDistSq) {
            best = node;
            bestDistSq = dSq;
        }
    }
    return best;
}

function onGraphClick(event) {
    const node = pickNodeAt(event.clientX, event.clientY);
    if (!node) return;
    workbenchState.selectedId = node.id;
    renderWorkbench();
    startGraphLoop();
}

function onGraphHover(event) {
    const node = pickNodeAt(event.clientX, event.clientY);
    const id = node ? node.id : null;
    if (id !== graphSim.hoveredId) {
        graphSim.hoveredId = id;
        graphSim.canvas.style.cursor = id ? 'pointer' : 'grab';
        drawGraph();
    }
}

function renderInspector(selected) {
    const kind = document.getElementById('inspector-kind');
    const title = document.getElementById('inspector-title');
    const summary = document.getElementById('inspector-summary');
    const tags = document.getElementById('inspector-tags');
    const link = document.getElementById('inspector-link');

    if (!kind || !title || !summary || !tags || !link) return;

    kind.textContent = selected.kind === 'post' ? 'Writing' : selected.kind === 'project' ? 'Open source' : selected.kind === 'case-study' ? 'Case study' : 'Thread';
    title.textContent = selected.title || selected.label;
    summary.textContent = selected.summary;
    tags.innerHTML = (selected.tags || []).map(tag => `<span class="inspector-tag">${escapeHtml(tag)}</span>`).join('');
    link.href = selected.url || './blog/';
    link.textContent = selected.kind === 'project' ? 'View project' : selected.kind === 'post' ? 'Read note' : selected.kind === 'case-study' ? 'Open case study' : 'Browse related writing';
    const external = /^https?:\/\//.test(link.href) && !link.href.startsWith(window.location.origin);
    link.target = external ? '_blank' : '';
    link.rel = external ? 'noopener noreferrer' : '';
}

function renderWorkbenchResults(results) {
    const container = document.getElementById('workbench-results');
    if (!container) return;

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
            <span class="result-meta">${item.kind === 'project' ? 'Open source' : item.kind === 'case-study' ? 'Case study' : 'Writing'}</span>
            <h3>${escapeHtml(item.title || item.label)}</h3>
            <p>${escapeHtml(item.summary || '')}</p>
            ${(item.tags || []).length ? `<div class="result-tags">${item.tags.slice(0, 3).map(tag => `<span class="result-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        </a>
    `).join('');

    revealLoadedCards(container, '.content-card-enter');
}

function renderWorkbench() {
    if (!workbenchState.initialized) return;

    const viewModel = buildWorkbenchViewModel();
    renderTopicStrip(viewModel.topics || []);
    renderMap(viewModel.nodes || [], viewModel.edges || []);
    renderInspector(viewModel.selected || selectedFromItem(topicBlueprints[1]));
    renderWorkbenchResults(viewModel.results || []);
}

async function loadWorkbenchEngine() {
    if (workbenchEngineLoadStarted) return;
    workbenchEngineLoadStarted = true;

    try {
        const module = await import(`${siteBasePath}assets/wasm/site_engine.js`);
        await module.default(`${siteBasePath}assets/wasm/site_engine_bg.wasm`);
        workbenchEngine = module.build_workbench;
        workbenchEngineTick = typeof module.tick_layout === 'function' ? module.tick_layout : null;
        graphSim.enabled = true;
        renderWorkbench();
    } catch (error) {
        console.warn('Rust workbench engine unavailable, using JavaScript fallback:', error);
    }
}

function initializeWorkbench() {
    const search = document.getElementById('workbench-search');
    const map = document.getElementById('map-orbit');
    if (!search || !map || workbenchState.initialized) return false;

    workbenchState.initialized = true;
    search.addEventListener('input', () => {
        workbenchState.query = search.value;
        renderWorkbench();
    });

    renderWorkbench();
    return true;
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

        workbenchState.contributions = contributions;
        renderWorkbench();
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
        workbenchState.caseStudies = Array.isArray(payload.items) ? payload.items : [];
        renderWorkbench();
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
    const loadBlogPosts = () => loadLatestBlogPosts();
    const hasWorkbench = initializeWorkbench();

    loadHeroStats();

    if (hasWorkbench) {
        loadWorkbenchEngine();
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
