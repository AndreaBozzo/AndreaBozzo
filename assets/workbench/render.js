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
    let lastResultsSignature = '';

    function kindLabel(kind) {
        return kind === 'post'
            ? 'Writing'
            : kind === 'project'
                ? 'Open source'
                : kind === 'paper'
                    ? 'Paper'
                    : kind === 'package'
                        ? 'Package'
                        : kind === 'case-study'
                            ? 'Case study'
                            : 'Thread';
    }

    function linkLabel(kind) {
        return kind === 'project'
            ? 'View project'
            : kind === 'paper'
                ? 'View companion repo'
                : kind === 'package'
                    ? 'View package'
                    : kind === 'post'
                        ? 'Read note'
                        : kind === 'case-study'
                            ? 'Open case study'
                            : 'Browse related writing';
    }

    function opensExternal(kind) {
        return kind === 'project' || kind === 'paper' || kind === 'package';
    }

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

    function renderInspector(selected) {
        const kind = document.getElementById('inspector-kind');
        const title = document.getElementById('inspector-title');
        const summary = document.getElementById('inspector-summary');
        const tags = document.getElementById('inspector-tags');
        const link = document.getElementById('inspector-link');

        if (!kind || !title || !summary || !tags || !link) return;

        kind.textContent = kindLabel(selected.kind);
        title.textContent = selected.title || selected.label;
        summary.textContent = selected.summary;
        tags.innerHTML = (selected.tags || []).map(tag => `<span class="inspector-tag">${escapeHtml(tag)}</span>`).join('');
        link.href = selected.url || './blog/';
        link.textContent = linkLabel(selected.kind);
        const external = /^https?:\/\//.test(link.href) && !link.href.startsWith(window.location.origin);
        link.target = external ? '_blank' : '';
        link.rel = external ? 'noopener noreferrer' : '';
    }

    function renderWorkbenchResults(results, topicCounts = []) {
        const container = document.getElementById('workbench-results');
        if (!container) return;

        const activeTopic = topicBlueprints.find(topic => topic.id === state.activeTopic) || topicBlueprints[0];
        const activeCount = topicCounts.find(topic => topic.id === activeTopic.id)?.count;
        const showThreadFilter = activeTopic.id !== 'all';
        const resultsSignature = JSON.stringify((results || []).map(item => ({
            id: item.id,
            kind: item.kind,
            title: item.title || item.label,
            summary: item.summary || '',
            tags: item.tags || [],
            url: item.url || './blog/'
        })).concat([{
            activeTopic: activeTopic.id,
            activeCount
        }]));
        if (resultsSignature === lastResultsSignature) return;
        lastResultsSignature = resultsSignature;

        const threadFilterCard = showThreadFilter ? `
            <button class="result-card thread-filter-card" type="button">
                <span class="result-meta">Thread filter</span>
                <h3>${escapeHtml(activeTopic.label)}</h3>
                <p>${escapeHtml(activeCount ? `${activeCount} related item${activeCount === 1 ? '' : 's'} shown. Click to show everything again.` : 'Click to show everything again.')}</p>
            </button>
        ` : '';

        if (!results.length) {
            container.innerHTML = threadFilterCard + topicBlueprints.slice(1, 4).map(topic => `
                <article class="result-card">
                    <span class="result-meta">Thread</span>
                    <h3>${escapeHtml(topic.label)}</h3>
                    <p>${escapeHtml(topic.summary)}</p>
                </article>
            `).join('');
            container.querySelector('.thread-filter-card')?.addEventListener('click', () => {
                state.activeTopic = 'all';
                state.selectedId = '';
                renderWorkbench();
            });
            return;
        }

        container.innerHTML = threadFilterCard + results.map(item => `
            <a class="result-card content-card-enter" href="${escapeHtml(item.url || './blog/')}" ${opensExternal(item.kind) ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                <span class="result-meta">${kindLabel(item.kind)}</span>
                <h3>${escapeHtml(item.title || item.label)}</h3>
                <p>${escapeHtml(item.summary || '')}</p>
                ${(item.tags || []).length ? `<div class="result-tags">${item.tags.slice(0, 3).map(tag => `<span class="result-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
            </a>
        `).join('');

        container.querySelector('.thread-filter-card')?.addEventListener('click', () => {
            state.activeTopic = 'all';
            state.selectedId = '';
            renderWorkbench();
        });
        revealLoadedCards(container, '.content-card-enter');
    }

    function renderWorkbench() {
        if (!state.initialized) return;

        const viewModel = buildWorkbenchViewModel();
        renderQueryState(viewModel);
        renderMap(viewModel.nodes || [], viewModel.edges || []);
        renderInspector(viewModel.selected || selectedFromItem(topicBlueprints[1]));
        renderWorkbenchResults(viewModel.results || [], viewModel.topics || []);
    }

    return {
        renderWorkbench
    };
}
