use serde::{Deserialize, Serialize};

use crate::query::QueryError;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Payload {
    #[serde(default)]
    pub(crate) topics: Vec<Topic>,
    #[serde(default)]
    pub(crate) posts: Vec<Post>,
    #[serde(default)]
    pub(crate) contributions: Vec<Contribution>,
    #[serde(default)]
    pub(crate) case_studies: Vec<CaseStudy>,
    #[serde(default)]
    pub(crate) papers: Vec<Paper>,
    #[serde(default)]
    pub(crate) packages: Vec<Package>,
    #[serde(default)]
    pub(crate) active_topic: String,
    #[serde(default)]
    pub(crate) query: String,
    #[serde(default)]
    pub(crate) selected_id: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
pub(crate) struct Topic {
    #[serde(default)]
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) label: String,
    #[serde(default)]
    pub(crate) summary: String,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
}

#[derive(Debug, Default, Clone, Deserialize)]
pub(crate) struct Post {
    #[serde(default)]
    pub(crate) title: String,
    #[serde(default)]
    pub(crate) summary: String,
    #[serde(default)]
    pub(crate) permalink: String,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
    #[serde(default)]
    pub(crate) content: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
pub(crate) struct Contribution {
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) desc: String,
    #[serde(default)]
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) stars: String,
    #[serde(default)]
    pub(crate) prs: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CaseStudy {
    #[serde(default)]
    pub(crate) slug: String,
    #[serde(default)]
    pub(crate) title: String,
    #[serde(default)]
    pub(crate) subtitle: String,
    #[serde(default)]
    pub(crate) summary: String,
    #[serde(default)]
    pub(crate) stack: Vec<String>,
    #[serde(default)]
    pub(crate) status: String,
    #[serde(default)]
    pub(crate) repo_url: String,
    #[serde(default)]
    pub(crate) related_posts: Vec<String>,
    #[serde(default)]
    pub(crate) cover_image: String,
    #[serde(default)]
    pub(crate) media_slots: Vec<MediaSlot>,
    #[serde(default)]
    pub(crate) sections: Vec<CaseSection>,
    #[serde(default)]
    pub(crate) system_anatomy: SystemAnatomy,
}

#[derive(Debug, Default, Clone, Deserialize)]
pub(crate) struct SystemAnatomy {
    #[serde(default)]
    pub(crate) inputs: Vec<String>,
    #[serde(default)]
    pub(crate) core: Vec<String>,
    #[serde(default)]
    pub(crate) outputs: Vec<String>,
    #[serde(default)]
    pub(crate) constraints: Vec<String>,
}

#[derive(Debug, Default, Clone, Deserialize)]
pub(crate) struct MediaSlot {
    #[serde(default)]
    pub(crate) label: String,
    #[serde(default)]
    pub(crate) kind: String,
    #[serde(default)]
    pub(crate) placeholder: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
pub(crate) struct CaseSection {
    #[serde(default)]
    pub(crate) heading: String,
    #[serde(default)]
    pub(crate) body: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
pub(crate) struct Paper {
    #[serde(default)]
    pub(crate) kicker: String,
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) desc: String,
    #[serde(default)]
    pub(crate) meta: String,
    #[serde(default)]
    pub(crate) url: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Package {
    #[serde(default)]
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) ecosystem: String,
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) display_name: String,
    #[serde(default)]
    pub(crate) summary: String,
    #[serde(default)]
    pub(crate) version: String,
    #[serde(default)]
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) repository_url: String,
    #[serde(default)]
    pub(crate) homepage_url: String,
    #[serde(default)]
    pub(crate) documentation_url: String,
    #[serde(default)]
    pub(crate) license: String,
    #[serde(default)]
    pub(crate) runtime_requirement: String,
    #[serde(default)]
    pub(crate) related_case_studies: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct WorkItem {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) label: String,
    pub(crate) title: String,
    pub(crate) summary: String,
    pub(crate) tags: Vec<String>,
    pub(crate) topics: Vec<String>,
    pub(crate) url: String,
    pub(crate) base_score: f32,
    pub(crate) stars: f32,
    pub(crate) prs: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Output {
    pub(crate) nodes: Vec<Node>,
    pub(crate) edges: Vec<Edge>,
    pub(crate) results: Vec<ResultCard>,
    pub(crate) selected: Selected,
    pub(crate) topics: Vec<TopicCount>,
    #[serde(rename = "queryError", skip_serializing_if = "Option::is_none")]
    pub(crate) query_error: Option<QueryError>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Edge {
    pub(crate) from: String,
    pub(crate) to: String,
    pub(crate) kind: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Node {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) label: String,
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) score: f32,
    pub(crate) visible: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct ResultCard {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) title: String,
    pub(crate) summary: String,
    pub(crate) tags: Vec<String>,
    pub(crate) url: String,
    pub(crate) score: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Selected {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) title: String,
    pub(crate) summary: String,
    pub(crate) tags: Vec<String>,
    pub(crate) url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct TopicCount {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) count: usize,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SimState {
    #[serde(default)]
    pub(crate) nodes: Vec<SimNode>,
    #[serde(default)]
    pub(crate) edges: Vec<Edge>,
    #[serde(default)]
    pub(crate) selected_id: String,
    #[serde(default)]
    pub(crate) dt: f32,
    #[serde(default)]
    pub(crate) temperature: f32,
}

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
pub(crate) struct SimNode {
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) kind: String,
    pub(crate) x: f32,
    pub(crate) y: f32,
    #[serde(default)]
    pub(crate) vx: f32,
    #[serde(default)]
    pub(crate) vy: f32,
    #[serde(default)]
    pub(crate) radius: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SimResult {
    pub(crate) nodes: Vec<SimNode>,
    pub(crate) kinetic_energy: f32,
}
