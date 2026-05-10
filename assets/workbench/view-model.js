import { itemTags, normalizeText, topicForItem } from './classify.js';
import { topicBlueprints } from './state.js';

export function createViewModelBuilder({ state, siteBasePath, getEngineOutput }) {
    function getWorkbenchItems() {
        const topicItems = topicBlueprints.filter(topic => topic.id !== 'all');
        const caseStudyItems = state.caseStudies.map((study) => {
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
        const postItems = state.posts.slice(0, 8).map((post, index) => {
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

        const contributionItems = state.contributions.map((contrib, index) => {
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
            posts: state.posts,
            contributions: state.contributions,
            caseStudies: state.caseStudies,
            activeTopic: state.activeTopic,
            query: state.query,
            selectedId: state.selectedId
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

    function matchesWorkbenchFilter(item) {
        const query = normalizeText(state.query);
        const activeTopic = state.activeTopic;
        const itemTopicIds = item.kind === 'topic' ? [item.id] : item.topics || [];
        const matchesTopic = activeTopic === 'all' || itemTopicIds.includes(activeTopic);
        const searchable = normalizeText(`${item.label} ${item.title || ''} ${item.summary || ''} ${(item.tags || []).join(' ')}`);

        return matchesTopic && (!query || searchable.includes(query));
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
        const selected = visibleItems.find(item => item.id === state.selectedId)
            || topicBlueprints.find(topic => topic.id === state.activeTopic && topic.id !== 'all')
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
        const output = getEngineOutput(JSON.stringify(buildWorkbenchPayload()));
        if (output) {
            try {
                return JSON.parse(output);
            } catch (error) {
                console.warn('Rust workbench engine failed, using JavaScript fallback:', error);
            }
        }

        return buildFallbackWorkbench();
    }

    return {
        buildWorkbenchViewModel,
        selectedFromItem
    };
}