import {
    NODE_KIND_COLORS,
    NODE_KIND_RADIUS,
    NODE_KIND_SIM_RADIUS,
    SIM_TEMP_DECAY,
    SIM_TEMP_FLOOR,
    SIM_WARMUP_STEPS,
    topicBlueprints
} from './state.js';

export function createWorkbenchGraph({
    state,
    graphSim,
    escapeHtml,
    getRustTick,
    clearRustTick,
    requestRender
}) {
    function renderMap(nodes, edges) {
        if (graphSim.enabled) {
            renderGraphCanvas(nodes, edges);
            renderMapA11yList(nodes);
            return;
        }
        renderMapDom(nodes);
        renderMapA11yList(nodes);
    }

    function selectNode(node) {
        if (!node) return;

        state.selectedId = node.id;
        if (node.kind === 'topic' && topicBlueprints.some(topic => topic.id === node.id)) {
            state.activeTopic = node.id;
        }

        requestRender();
    }

    function renderMapDom(nodes) {
        const map = document.getElementById('map-orbit');
        if (!map) return;

        map.innerHTML = nodes.map((node) => {
            const muted = node.visible ? '' : ' is-muted';
            const selected = node.id === state.selectedId ? ' is-selected' : '';

            return `
                <button class="map-node${muted}${selected}" type="button" data-item-id="${escapeHtml(node.id)}" data-kind="${escapeHtml(node.kind)}" style="--node-x: ${Number(node.x).toFixed(2)}%; --node-y: ${Number(node.y).toFixed(2)}%;">
                    ${escapeHtml(node.label)}
                </button>
            `;
        }).join('');

        map.querySelectorAll('[data-item-id]').forEach(button => {
            button.addEventListener('click', () => {
                selectNode({
                    id: button.dataset.itemId,
                    kind: button.dataset.kind
                });
            });
        });
    }

    function renderMapA11yList(nodes) {
        const list = document.getElementById('map-a11y-list');
        if (!list) return;
        list.innerHTML = nodes.map(node => `
            <li><button type="button" data-item-id="${escapeHtml(node.id)}" data-kind="${escapeHtml(node.kind)}">${escapeHtml(node.label)}</button></li>
        `).join('');
        list.querySelectorAll('[data-item-id]').forEach(button => {
            button.addEventListener('click', () => {
                selectNode({
                    id: button.dataset.itemId,
                    kind: button.dataset.kind
                });
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
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const hash = Array.from(String(id)).reduce((h, ch) => ((h * 31) + ch.charCodeAt(0)) >>> 0, 2166136261);
        const angle = index * goldenAngle + (hash % 1000) / 1000 * 0.4;
        const radiusFrac = Math.sqrt((index + 0.5) / Math.max(total, 1));
        const r = 22 * radiusFrac;
        return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
    }

    function renderGraphCanvas(nodes, edges) {
        const panel = document.querySelector('.map-panel');
        if (panel && !panel.classList.contains('is-canvas')) {
            panel.classList.add('is-canvas');
        }
        if (!ensureGraphCanvas()) return;

        const layoutSignature = JSON.stringify({
            nodes: nodes.map(node => [node.id, node.kind, node.label, node.visible]),
            edges: (edges || []).map(edge => [edge.from, edge.to, edge.kind])
        });

        if (layoutSignature === graphSim.layoutSignature) {
            graphSim.temperature = Math.max(graphSim.temperature, 0.35);
            graphSim.settledFrames = 0;
            drawGraph();
            if (!graphSim.reduceMotion) {
                startGraphLoop();
            }
            return;
        }
        graphSim.layoutSignature = layoutSignature;

        const previousById = new Map(graphSim.nodes.map(n => [n.id, n]));
        let newNodeCount = 0;
        graphSim.nodes = nodes.map((node, index) => {
            const radius = NODE_KIND_SIM_RADIUS[node.kind] || 4.0;
            const prev = previousById.get(node.id);
            if (prev) {
                return {
                    id: node.id,
                    kind: node.kind,
                    label: node.label,
                    visible: node.visible,
                    radius,
                    x: prev.x,
                    y: prev.y,
                    vx: prev.vx,
                    vy: prev.vy
                };
            }
            newNodeCount += 1;
            const seed = seedInitialPosition(node.id, index, nodes.length);
            return {
                id: node.id,
                kind: node.kind,
                label: node.label,
                visible: node.visible,
                radius,
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

        if (newNodeCount > 0) {
            graphSim.temperature = 1.0;
            graphSim.tickCount = 0;
            for (let i = 0; i < SIM_WARMUP_STEPS; i++) {
                stepSimulation();
            }
        } else {
            graphSim.temperature = Math.max(graphSim.temperature, 0.4);
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
            selectedId: state.selectedId,
            dt: 1.0,
            temperature: graphSim.temperature
        });
        let result;
        const rustTick = getRustTick();
        if (rustTick) {
            try {
                result = JSON.parse(rustTick(payload));
            } catch (error) {
                console.warn('tick_layout failed, switching to JS fallback:', error);
                clearRustTick();
                result = stepSimulationJS();
            }
        } else {
            result = stepSimulationJS();
        }
        const updates = new Map(result.nodes.map(n => [n.id, n]));
        graphSim.nodes = graphSim.nodes.map(node => {
            const updated = updates.get(node.id);
            if (!updated) return node;
            return {
                ...node,
                x: updated.x,
                y: updated.y,
                vx: updated.vx ?? 0,
                vy: updated.vy ?? 0
            };
        });
        graphSim.tickCount += 1;
        graphSim.temperature = Math.max(graphSim.temperature * SIM_TEMP_DECAY, SIM_TEMP_FLOOR);
        return result.kineticEnergy ?? result.kinetic_energy ?? 0;
    }

    function stepSimulationJS() {
        const REPULSION = 8;
        const SPRING_K = 0.18;
        const SPRING_REST = 16;
        const DAMPING = 0.80;
        const FOCUS_PULL = 0.015;
        const CENTER_PULL = 0.13;
        const COLLISION_PAD = 1.2;
        const COLLISION_K = 1.2;
        const MIN_DIST = 2.0;
        const MIN_DIST_SQ = MIN_DIST * MIN_DIST;
        const MAX_VEL = 2.5;
        const BOUND_LOW = 14;
        const BOUND_HIGH = 86;
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
                const ux = dx / dist;
                const uy = dy / dist;
                let force = REPULSION / dist;
                const target = (nodes[i].radius || 0) + (nodes[j].radius || 0) + COLLISION_PAD;
                if (dist < target) force += COLLISION_K * (target - dist);
                fx[i] += ux * force;
                fy[i] += uy * force;
                fx[j] -= ux * force;
                fy[j] -= uy * force;
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
            fx[i] += ux * force;
            fy[i] += uy * force;
            fx[j] -= ux * force;
            fy[j] -= uy * force;
        }

        const selectedIdx = state.selectedId ? indexById.get(state.selectedId) : undefined;
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
                nodes[i].vx = 0;
                nodes[i].vy = 0;
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
        const edgeStroke = isDark ? 'rgba(170, 190, 220, 0.10)' : 'rgba(60, 70, 95, 0.07)';
        const edgeStrokeActive = isDark ? 'rgba(249, 115, 22, 0.72)' : 'rgba(196, 90, 39, 0.58)';

        const nodeById = new Map(graphSim.nodes.map(n => [n.id, n]));
        const selectedId = state.selectedId;

        ctx.lineWidth = 0.9;
        for (const edge of graphSim.edges) {
            const a = nodeById.get(edge.from);
            const b = nodeById.get(edge.to);
            if (!a || !b) continue;
            const active = a.id === selectedId || b.id === selectedId
                || a.id === graphSim.hoveredId || b.id === graphSim.hoveredId;
            if (!active && a.kind !== 'topic' && b.kind !== 'topic') continue;
            ctx.strokeStyle = active ? edgeStrokeActive : edgeStroke;
            ctx.lineWidth = active ? 1.65 : 0.85;
            ctx.beginPath();
            const ap = nodeToPixel(a);
            const bp = nodeToPixel(b);
            ctx.moveTo(ap.x, ap.y);
            ctx.lineTo(bp.x, bp.y);
            ctx.stroke();
        }

        const circleRects = [];
        const drawn = [];
        for (const node of graphSim.nodes) {
            const { x, y } = nodeToPixel(node);
            const radius = NODE_KIND_RADIUS[node.kind] || 18;
            const isSelected = node.id === selectedId;
            const isHovered = node.id === graphSim.hoveredId;
            const baseColor = NODE_KIND_COLORS[node.kind] || '#444';

            ctx.globalAlpha = node.visible ? 1.0 : 0.24;

            if (isSelected || isHovered) {
                ctx.beginPath();
                ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
                ctx.fillStyle = isDark ? 'rgba(249, 115, 22, 0.18)' : 'rgba(249, 115, 22, 0.14)';
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isDark ? '#111a29' : '#fffaf2';
            ctx.fill();
            ctx.strokeStyle = baseColor;
            ctx.lineWidth = isSelected ? 3 : 1.55;
            ctx.stroke();

            if (isSelected || isHovered) {
                ctx.beginPath();
                ctx.arc(x, y, Math.max(2.5, radius * 0.18), 0, Math.PI * 2);
                ctx.fillStyle = baseColor;
                ctx.fill();
            }

            circleRects.push({ x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 });
            drawn.push({ node, x, y, radius, isSelected, isHovered, baseColor });
        }

        const labelRects = [];
        const intersects = (a, b) =>
            a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        const lineHeight = 13;

        const ordered = drawn.slice().sort((a, b) => {
            const score = d => (d.isSelected ? -3 : 0)
                + (d.isHovered ? -2 : 0)
                + (d.node.kind === 'topic' ? -4 : 0)
                + (d.node.visible ? 0 : 1);
            return score(a) - score(b);
        });

        for (const item of ordered) {
            const { node, x, y, radius, isSelected, isHovered, baseColor } = item;
            const isTopic = node.kind === 'topic';
            const forceShow = isSelected || isHovered;

            ctx.globalAlpha = node.visible ? 1.0 : 0.24;
            ctx.font = `${isTopic ? 600 : 500} 12px "IBM Plex Sans", Arial, sans-serif`;

            if (isTopic) {
                ctx.fillStyle = baseColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                drawWrappedLabel(ctx, node.label, x, y, radius * 1.6, lineHeight);
                continue;
            }

            if (!forceShow) continue;

            const maxWidth = Math.min(radius * 4.2, graphSim.width * 0.34);
            const lines = layoutLines(ctx, node.label, maxWidth);
            const labelHeight = lines.length * lineHeight;
            const labelWidth = Math.min(
                maxWidth,
                Math.max(...lines.map(line => ctx.measureText(line).width))
            );

            const placeBelow = y + radius + 6 + labelHeight < graphSim.height - 4;
            const labelTop = placeBelow ? y + radius + 6 : y - radius - 6 - labelHeight;
            let labelLeft = x - labelWidth / 2;
            if (labelLeft < 4) labelLeft = 4;
            if (labelLeft + labelWidth > graphSim.width - 4) labelLeft = graphSim.width - 4 - labelWidth;
            const candidate = { x: labelLeft - 2, y: labelTop - 1, w: labelWidth + 4, h: labelHeight + 2 };

            if (!forceShow) {
                let blocked = false;
                for (const rect of labelRects) if (intersects(candidate, rect)) { blocked = true; break; }
                if (!blocked) for (const rect of circleRects) {
                    if (rect.x === x - radius && rect.y === y - radius) continue;
                    if (intersects(candidate, rect)) { blocked = true; break; }
                }
                if (blocked) continue;
            }

            labelRects.push(candidate);
            ctx.fillStyle = isDark ? '#e8eef5' : '#1a2236';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], labelLeft, labelTop + i * lineHeight);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    function layoutLines(ctx, label, maxWidth) {
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
        return lines;
    }

    function drawWrappedLabel(ctx, label, cx, topY, maxWidth, lineHeight) {
        const lines = layoutLines(ctx, label, maxWidth);
        const totalHeight = lines.length * lineHeight;
        const baseline = ctx.textBaseline;
        let startY = topY;
        if (baseline === 'middle') {
            startY = topY - totalHeight / 2 + lineHeight / 2;
        } else if (baseline === 'bottom') {
            startY = topY - totalHeight + lineHeight;
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
        selectNode(node);
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

    return {
        renderMap
    };
}
