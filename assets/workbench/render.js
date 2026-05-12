import { topicBlueprints } from './state.js';

export function createWorkbenchRenderer({
    state,
    escapeHtml,
    revealLoadedCards,
    renderMap,
    buildWorkbenchViewModel,
    selectedFromItem
}) {
    let lastQueryErrorSignature = '';
    let lastGraphStatusSignature = '';
    let lastResultsSignature = '';

    function renderQueryState(viewModel) {
        const shell = document.querySelector('.command-search');
        const error = document.getElementById('query-error');
        if (!shell || !error) return;

        const queryError = viewModel.queryError || null;
        const queryErrorSignature = queryError?.message || '';

        if (queryErrorSignature === lastQueryErrorSignature) return;
        lastQueryErrorSignature = queryErrorSignature;

        shell.classList.toggle('is-error', Boolean(queryError));
        shell.title = queryError ? queryError.message : '';
        error.textContent = queryError ? queryError.message : '';
        error.hidden = !queryError;
    }

    function resetToAllWork() {
        state.activeTopic = 'all';
        state.selectedId = '';
        renderWorkbench();
    }

    function renderGraphStatus(topicCounts = []) {
        const status = document.getElementById('graph-status');
        if (!status) return;

        const countsById = new Map(topicCounts.map(topic => [topic.id, topic.count]));
        const activeTopic = topicBlueprints.find(topic => topic.id === state.activeTopic) || topicBlueprints[0];
        const activeCount = countsById.get(activeTopic.id) ?? '';
        const graphStatusSignature = JSON.stringify({
            activeTopic: state.activeTopic,
            activeCount
        });

        if (graphStatusSignature === lastGraphStatusSignature) return;
        lastGraphStatusSignature = graphStatusSignature;

        const isAllWork = activeTopic.id === 'all';
        const detail = isAllWork
            ? 'Search across case studies, writing, open source, and papers — or click a thread node to narrow the surface.'
            : `${activeCount} related item${activeCount === 1 ? '' : 's'} in this thread. The query above searches within it.`;

        status.innerHTML = `
            <div class="graph-status-copy">
                <span class="graph-status-label">Active thread</span>
                <strong>${escapeHtml(activeTopic.label)}</strong>
                <span>${escapeHtml(detail)}</span>
            </div>
            ${isAllWork ? '' : '<button class="graph-reset" type="button">Show all</button>'}
        `;

        status.querySelector('.graph-reset')?.addEventListener('click', resetToAllWork);
    }

    function renderInspector(selected) {
        const kind = document.getElementById('inspector-kind');
        const title = document.getElementById('inspector-title');
        const summary = document.getElementById('inspector-summary');
        const tags = document.getElementById('inspector-tags');
        const link = document.getElementById('inspector-link');

        if (!kind || !title || !summary || !tags || !link) return;

        kind.textContent = selected.kind === 'post' ? 'Writing' : selected.kind === 'project' ? 'Open source' : selected.kind === 'paper' ? 'Paper' : selected.kind === 'case-study' ? 'Case study' : 'Thread';
        title.textContent = selected.title || selected.label;
        summary.textContent = selected.summary;
        tags.innerHTML = (selected.tags || []).map(tag => `<span class="inspector-tag">${escapeHtml(tag)}</span>`).join('');
        link.href = selected.url || './blog/';
        link.textContent = selected.kind === 'project' ? 'View project' : selected.kind === 'paper' ? 'View companion repo' : selected.kind === 'post' ? 'Read note' : selected.kind === 'case-study' ? 'Open case study' : 'Browse related writing';
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
            <a class="result-card content-card-enter" href="${escapeHtml(item.url || './blog/')}" ${item.kind === 'project' || item.kind === 'paper' ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                <span class="result-meta">${item.kind === 'project' ? 'Open source' : item.kind === 'paper' ? 'Paper' : item.kind === 'case-study' ? 'Case study' : 'Writing'}</span>
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
        renderGraphStatus(viewModel.topics || []);
        renderMap(viewModel.nodes || [], viewModel.edges || []);
        renderInspector(viewModel.selected || selectedFromItem(topicBlueprints[1]));
        renderWorkbenchResults(viewModel.results || []);
    }

    return {
        renderWorkbench
    };
}
