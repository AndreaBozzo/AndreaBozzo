import { topicBlueprints } from './state.js';

export function createWorkbenchRenderer({
    state,
    escapeHtml,
    revealLoadedCards,
    renderMap,
    buildWorkbenchViewModel,
    selectedFromItem
}) {
    function renderTopicStrip(topicCounts = []) {
        const strip = document.getElementById('topic-strip');
        if (!strip) return;

        const countsById = new Map(topicCounts.map(topic => [topic.id, topic.count]));

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
        renderTopicStrip(viewModel.topics || []);
        renderMap(viewModel.nodes || [], viewModel.edges || []);
        renderInspector(viewModel.selected || selectedFromItem(topicBlueprints[1]));
        renderWorkbenchResults(viewModel.results || []);
    }

    return {
        renderWorkbench
    };
}