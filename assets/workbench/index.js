import { createWorkbenchGraph } from './graph.js';
import { createWorkbenchRenderer } from './render.js';
import { createGraphState, createWorkbenchState } from './state.js';
import { createViewModelBuilder } from './view-model.js';

const WORKBENCH_ENGINE_SCHEMA_VERSION = 1;

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

    function validateWorkbenchEngine(module) {
        if (typeof module.build_workbench !== 'function') {
            throw new Error('WASM workbench engine is missing build_workbench');
        }

        if (typeof module.workbench_engine_contract !== 'function') {
            throw new Error('WASM workbench engine is missing its versioned contract');
        }

        const contract = JSON.parse(module.workbench_engine_contract());
        if (contract.schemaVersion !== WORKBENCH_ENGINE_SCHEMA_VERSION) {
            throw new Error(`Unsupported WASM workbench contract: ${contract.schemaVersion}`);
        }

        const exports = Array.isArray(contract.exports) ? contract.exports : [];
        if (!exports.includes('build_workbench')) {
            throw new Error('WASM workbench contract does not claim build_workbench support');
        }

        return contract;
    }

    async function loadWorkbenchEngine() {
        if (workbenchEngineLoadStarted) return;
        workbenchEngineLoadStarted = true;

        try {
            const module = await import(`${siteBasePath}assets/wasm/site_engine.js`);
            await module.default(`${siteBasePath}assets/wasm/site_engine_bg.wasm`);
            const contract = validateWorkbenchEngine(module);
            workbenchEngine = module.build_workbench;
            workbenchEngineTick = contract.exports.includes('tick_layout') && typeof module.tick_layout === 'function'
                ? module.tick_layout
                : null;
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

    function setPosts(posts) {
        state.posts = Array.isArray(posts) ? posts : [];
        renderer.renderWorkbench();
    }

    function setContributions(contributions) {
        state.contributions = Array.isArray(contributions) ? contributions : [];
        renderer.renderWorkbench();
    }

    function setCaseStudies(caseStudies) {
        state.caseStudies = Array.isArray(caseStudies) ? caseStudies : [];
        renderer.renderWorkbench();
    }

    return {
        renderWorkbench: renderer.renderWorkbench,
        initializeWorkbench,
        loadWorkbenchEngine,
        setPosts,
        setContributions,
        setCaseStudies
    };
}
