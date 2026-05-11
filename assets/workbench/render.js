import { topicBlueprints } from './state.js';

export function createWorkbenchRenderer({
    state,
    escapeHtml,
    revealLoadedCards,
    renderMap,
    buildWorkbenchViewModel,
    selectedFromItem
}) {
    let lastQueryStateSignature = '';
    let lastTopicStripSignature = '';
    let lastResultsSignature = '';

    function applyQuerySuggestion(suggestion) {
        const input = document.getElementById('workbench-search');
        if (!input) return;

        const query = state.query || '';
        const match = query.match(/(?:^|[\s(])([^\s()]+)$/);
        if (!match) {
            state.query = query ? `${query.trimEnd()} ${suggestion}` : suggestion;
        } else {
            const tokenStart = query.length - match[1].length;
            state.query = `${query.slice(0, tokenStart)}${suggestion}`;
        }

        input.value = state.query;
        input.focus();
        renderWorkbench();
    }

    function renderQueryState(viewModel) {
        const shell = document.querySelector('.command-search');
        const error = document.getElementById('query-error');
        const suggestions = document.getElementById('query-suggestions');
        if (!shell || !error || !suggestions) return;

        const queryError = viewModel.queryError || null;
        const querySuggestions = viewModel.querySuggestions || [];
        const queryStateSignature = JSON.stringify({
            error: queryError?.message || '',
            suggestions: querySuggestions
        });

        if (queryStateSignature === lastQueryStateSignature) return;
        lastQueryStateSignature = queryStateSignature;

        shell.classList.toggle('is-error', Boolean(queryError));
        shell.title = queryError ? queryError.message : '';
        error.textContent = queryError ? queryError.message : '';
        error.hidden = !queryError;

        suggestions.hidden = !querySuggestions.length;
        suggestions.innerHTML = querySuggestions.map(suggestion => `
            <button class="query-suggestion" type="button" data-query-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>
        `).join('');
        suggestions.querySelectorAll('[data-query-suggestion]').forEach(button => {
            button.addEventListener('click', () => applyQuerySuggestion(button.dataset.querySuggestion));
        });
    }

    function renderTopicStrip(topicCounts = []) {
        const strip = document.getElementById('topic-strip');
        if (!strip) return;

        const countsById = new Map(topicCounts.map(topic => [topic.id, topic.count]));
        const topicStripSignature = JSON.stringify({
            activeTopic: state.activeTopic,
            counts: topicBlueprints.map(topic => [topic.id, countsById.get(topic.id) ?? ''])
        });

        if (topicStripSignature === lastTopicStripSignature) return;
        lastTopicStripSignature = topicStripSignature;

        strip.innerHTML = topicBlueprints.map(topic => `
            <button class="topic-pill${topic.id === state.activeTopic ? ' is-active' : ''}" type="button" data-topic="${topic.id}">
                ${escapeHtml(topic.label)} <span>${escapeHtml(countsById.get(topic.id) ?? '')}</span>
            </button>
        `).join('');

        strip.querySelectorAll('[data-topic]').forEach(button => {
            button.addEventListener('click', () => {
                state.activeTopic = button.dataset.topic;
                const topic = topicBlueprints.find(item => item.id === state.activeTopic);
                if (topic && topic.id !== 'all') state.selectedId = topic.id;
                renderWorkbench();
            });
        });
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

        const resultsSignature = JSON.stringify((results || []).map(item => ({
            id: item.id,
            kind: item.kind,
            title: item.title || item.label,
            summary: item.summary || '',
            tags: item.tags || [],
            url: item.url || './blog/'
        })));
        if (resultsSignature === lastResultsSignature) return;
        lastResultsSignature = resultsSignature;

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
        if (!state.initialized) return;

        const viewModel = buildWorkbenchViewModel();
        renderQueryState(viewModel);
        renderTopicStrip(viewModel.topics || []);
        renderMap(viewModel.nodes || [], viewModel.edges || []);
        renderInspector(viewModel.selected || selectedFromItem(topicBlueprints[1]));
        renderWorkbenchResults(viewModel.results || []);
    }

    return {
        renderWorkbench
    };
}
