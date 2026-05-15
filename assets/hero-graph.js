// Decorative orbiting graph rendered in the hero. Mirrors the workbench's
// visual language (topic nodes + connective edges) so the landing zone
// previews the interaction the rest of the page is built around. The
// animation is purely cosmetic — no data, no selection, no input.

const SATELLITES = [
    { label: 'Rust', angle: 0 },
    { label: 'Data', angle: 1.05 },
    { label: 'Lakehouse', angle: 2.1 },
    { label: 'Python', angle: 3.6 },
    { label: 'Go', angle: 4.7 },
    { label: 'Open source', angle: 5.55 }
];

const ORBIT_RADIUS = 0.34; // fraction of min(width, height)
const NODE_RADIUS_CENTER = 26;
const NODE_RADIUS_SAT = 16;
const SPEED = 0.00018; // radians per ms — slow, ambient

export function mountHeroGraph(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const state = {
        width: 0,
        height: 0,
        dpr: 1,
        nodes: SATELLITES.map((sat, index) => ({
            ...sat,
            // Per-satellite drift so the orbit feels organic, not robotic.
            speed: SPEED * (0.78 + (index * 0.08)),
            bob: 0.04 + (index % 3) * 0.015,
            phase: index * 1.2
        })),
        last: 0,
        running: false,
        rafId: null,
        reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        visible: true,
        hovered: false
    };

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        state.dpr = dpr;
        state.width = rect.width;
        state.height = rect.height;
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(performance.now());
    }

    function readTokens() {
        const styles = getComputedStyle(document.documentElement);
        const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
        return {
            accent: read('--color-accent', '#00a98f'),
            accentStrong: read('--color-accent-strong', '#007f6d'),
            nodeFill: read('--color-bg-tertiary', '#ffffff'),
            text: read('--color-text-primary', '#10201c'),
            textMuted: read('--color-text-muted', '#7f948c'),
            border: read('--color-border', '#dde3df')
        };
    }

    function positionFor(node, t) {
        const cx = state.width / 2;
        const cy = state.height / 2;
        const radius = Math.min(state.width, state.height) * ORBIT_RADIUS;
        const angle = node.angle + node.speed * t;
        // Gentle radial breathing keeps satellites from looking like a rigid carousel.
        const breath = 1 + Math.sin(t * 0.0006 + node.phase) * node.bob;
        return {
            x: cx + Math.cos(angle) * radius * breath,
            y: cy + Math.sin(angle) * radius * breath * 0.82
        };
    }

    function draw(now) {
        if (!ctx || state.width === 0 || state.height === 0) return;
        const tokens = readTokens();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.clearRect(0, 0, state.width, state.height);

        const cx = state.width / 2;
        const cy = state.height / 2;

        // Soft halo behind the central node anchors the composition.
        const haloRadius = Math.min(state.width, state.height) * 0.42;
        const halo = ctx.createRadialGradient(cx, cy, haloRadius * 0.15, cx, cy, haloRadius);
        halo.addColorStop(0, `color-mix(in srgb, ${tokens.accent} ${isDark ? 22 : 16}%, transparent)`);
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
        ctx.fill();

        // Edges first so nodes sit on top.
        const edgeColor = `color-mix(in srgb, ${tokens.accent} ${isDark ? 48 : 36}%, transparent)`;
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 1.1;
        for (const node of state.nodes) {
            const pos = positionFor(node, now);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }

        // Satellites.
        ctx.font = '500 12px "IBM Plex Sans", "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const node of state.nodes) {
            const pos = positionFor(node, now);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, NODE_RADIUS_SAT + 6, 0, Math.PI * 2);
            ctx.fillStyle = `color-mix(in srgb, ${tokens.accent} ${isDark ? 14 : 10}%, transparent)`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, NODE_RADIUS_SAT, 0, Math.PI * 2);
            ctx.fillStyle = tokens.nodeFill;
            ctx.fill();
            ctx.strokeStyle = tokens.accentStrong;
            ctx.lineWidth = 1.4;
            ctx.stroke();

            ctx.fillStyle = tokens.text;
            ctx.fillText(node.label, pos.x, pos.y + NODE_RADIUS_SAT + 12);
        }

        // Center node — represents the site itself.
        ctx.beginPath();
        ctx.arc(cx, cy, NODE_RADIUS_CENTER + 8, 0, Math.PI * 2);
        ctx.fillStyle = `color-mix(in srgb, ${tokens.accent} ${isDark ? 24 : 18}%, transparent)`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, NODE_RADIUS_CENTER, 0, Math.PI * 2);
        ctx.fillStyle = tokens.accent;
        ctx.fill();
        ctx.strokeStyle = tokens.accentStrong;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = isDark ? tokens.text : '#ffffff';
        ctx.font = '600 13px "IBM Plex Sans", "Inter", system-ui, sans-serif';
        ctx.fillText('andrea', cx, cy);
    }

    function loop(now) {
        if (!state.running) return;
        draw(now);
        state.rafId = requestAnimationFrame(loop);
    }

    function start() {
        if (state.reduceMotion || !state.visible) return;
        if (state.running) return;
        state.running = true;
        state.rafId = requestAnimationFrame(loop);
    }

    function stop() {
        state.running = false;
        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = null;
        }
    }

    resize();
    if ('ResizeObserver' in window) {
        new ResizeObserver(resize).observe(canvas);
    } else {
        window.addEventListener('resize', resize);
    }

    // Pause when off-screen to keep the hero from animating once users scroll past.
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                state.visible = entry.isIntersecting;
                if (state.visible) start();
                else stop();
            }
        }, { threshold: 0 });
        io.observe(canvas);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else start();
    });

    // Respect users who change their motion preference at runtime.
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => {
        state.reduceMotion = motionQuery.matches;
        if (state.reduceMotion) {
            stop();
            draw(performance.now());
        } else {
            start();
        }
    };
    if (typeof motionQuery.addEventListener === 'function') {
        motionQuery.addEventListener('change', onMotionChange);
    }

    start();
    if (state.reduceMotion) draw(performance.now());

    return { start, stop };
}
