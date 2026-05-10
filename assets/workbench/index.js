import { createWorkbenchGraph } from './graph.js';
import { createWorkbenchRenderer } from './render.js';
import { createGraphState, createWorkbenchState } from './state.js';
import { createViewModelBuilder } from './view-model.js';

export function createWorkbench({ siteBasePath, escapeHtml, revealLoadedCards }) {
    const state = createWorkbenchState();
    const graphSim = createGraphState();
    let workbenchEngine = null;
    let workbenchEngineTick = null;
    let workbenchEngineLoadStarted = false;
    let renderer = null;

    const { buildWorkbenchViewModel, selectedFromItem } = createViewModelBuilder({
        state,
        siteBasePath,
        getEngineOutput(payload) {
            if (!workbenchEngine) return null;
            return workbenchEngine(payload);
        }
    });

    const graph = createWorkbenchGraph({
        state,
        graphSim,
        escapeHtml,
        getRustTick() {
            return workbenchEngineTick;
        },
        clearRustTick() {
            workbenchEngineTick = null;
        },
        requestRender() {
            renderer?.renderWorkbench();
        }
    });

    renderer = createWorkbenchRenderer({
        state,
        escapeHtml,
        revealLoadedCards,
        renderMap: graph.renderMap,
        buildWorkbenchViewModel,
        selectedFromItem
    });

    async function loadWorkbenchEngine() {
        if (workbenchEngineLoadStarted) return;
        workbenchEngineLoadStarted = true;

        try {
            const module = await import(`${siteBasePath}assets/wasm/site_engine.js`);
            await module.default(`${siteBasePath}assets/wasm/site_engine_bg.wasm`);
            workbenchEngine = module.build_workbench;
            workbenchEngineTick = typeof module.tick_layout === 'function' ? module.tick_layout : null;
            graphSim.enabled = true;
            renderer.renderWorkbench();
        } catch (error) {
            console.warn('Rust workbench engine unavailable, using JavaScript fallback:', error);
        }
    }

    function initializeWorkbench() {
        const search = document.getElementById('workbench-search');
        const map = document.getElementById('map-orbit');
        if (!search || !map || state.initialized) return false;

        state.initialized = true;
        search.addEventListener('input', () => {
            state.query = search.value;
            renderer.renderWorkbench();
        });

        renderer.renderWorkbench();
        return true;
    }

    return {
        state,
        renderWorkbench: renderer.renderWorkbench,
        initializeWorkbench,
        loadWorkbenchEngine
    };
}