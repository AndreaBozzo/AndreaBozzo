export const topicBlueprints = [
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
        id: 'ml-systems',
        label: 'ML systems',
        kind: 'topic',
        summary: 'Embedded ML, TinyML, model-facing infrastructure, and the systems work around applied AI.',
        tags: ['TinyML', 'AI', 'Embassy', 'Robotics']
    }
];

// Fallback palette used when CSS tokens are unavailable. Drawing code in
// graph.js resolves the topic color from --color-accent at render time so it
// tracks the active theme.
export const NODE_KIND_COLORS = {
    topic: '#f97316',
    'case-study': '#7358ba',
    post: '#1e4f95',
    project: '#0e7065',
    paper: '#9f5a1a'
};

export const NODE_KIND_RADIUS = {
    topic: 27,
    'case-study': 21,
    post: 18,
    project: 18,
    paper: 18
};

export const NODE_KIND_SIM_RADIUS = {
    topic: 5.8,
    'case-study': 4.5,
    post: 3.8,
    project: 3.8,
    paper: 3.8
};

export const SIM_WARMUP_STEPS = 60;
export const SIM_TEMP_FLOOR = 0.05;
export const SIM_TEMP_DECAY = 0.985;

export function createWorkbenchState() {
    return {
        initialized: false,
        activeTopic: 'all',
        query: '',
        queryError: null,
        lastValidViewModel: null,
        selectedId: '',
        posts: [],
        contributions: [],
        caseStudies: [],
        papers: []
    };
}

export function createGraphState() {
    return {
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
        tickCount: 0,
        layoutSignature: ''
    };
}
