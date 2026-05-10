use crate::models::{SimResult, SimState};
use std::collections::HashMap;

const REPULSION: f32 = 8.0;
const SPRING_K: f32 = 0.18;
const SPRING_REST: f32 = 16.0;
const DAMPING: f32 = 0.80;
const FOCUS_PULL: f32 = 0.015;
const CENTER_PULL: f32 = 0.13;
const COLLISION_PAD: f32 = 1.2;
const COLLISION_K: f32 = 1.2;
const MIN_DIST: f32 = 2.0;
const MAX_VEL: f32 = 2.5;
pub(crate) const BOUND_LOW: f32 = 14.0;
pub(crate) const BOUND_HIGH: f32 = 86.0;

pub(crate) fn simulate(mut state: SimState) -> SimResult {
	let dt = if state.dt > 0.0 && state.dt <= 2.0 {
		state.dt
	} else {
		1.0
	};
	let temperature = if state.temperature > 0.0 && state.temperature <= 1.0 {
		state.temperature
	} else {
		1.0
	};
	let n = state.nodes.len();
	if n == 0 {
		return SimResult {
			nodes: Vec::new(),
			kinetic_energy: 0.0,
		};
	}

	let mut fx = vec![0.0_f32; n];
	let mut fy = vec![0.0_f32; n];

	let min_dist_sq = MIN_DIST * MIN_DIST;
	for i in 0..n {
		for j in (i + 1)..n {
			let mut dx = state.nodes[i].x - state.nodes[j].x;
			let mut dy = state.nodes[i].y - state.nodes[j].y;
			let mut dist_sq = dx * dx + dy * dy;
			if dist_sq < min_dist_sq {
				let bias = ((i * 17 + j * 31) % 7) as f32 * 0.01 + 0.05;
				dx += bias;
				dy -= bias;
				dist_sq = (dx * dx + dy * dy).max(min_dist_sq);
			}
			let dist = dist_sq.sqrt();
			let ux = dx / dist;
			let uy = dy / dist;
			let mut force = REPULSION / dist;

			let target = state.nodes[i].radius + state.nodes[j].radius + COLLISION_PAD;
			if dist < target {
				force += COLLISION_K * (target - dist);
			}

			fx[i] += ux * force;
			fy[i] += uy * force;
			fx[j] -= ux * force;
			fy[j] -= uy * force;
		}
	}

	let id_to_index: HashMap<&str, usize> = state
		.nodes
		.iter()
		.enumerate()
		.map(|(idx, node)| (node.id.as_str(), idx))
		.collect();
	for edge in &state.edges {
		let (Some(&i), Some(&j)) = (
			id_to_index.get(edge.from.as_str()),
			id_to_index.get(edge.to.as_str()),
		) else {
			continue;
		};
		let dx = state.nodes[j].x - state.nodes[i].x;
		let dy = state.nodes[j].y - state.nodes[i].y;
		let dist = (dx * dx + dy * dy).sqrt().max(MIN_DIST);
		let displacement = dist - SPRING_REST;
		let force = SPRING_K * displacement;
		let ux = dx / dist;
		let uy = dy / dist;
		fx[i] += ux * force;
		fy[i] += uy * force;
		fx[j] -= ux * force;
		fy[j] -= uy * force;
	}

	let selected_idx = if state.selected_id.is_empty() {
		None
	} else {
		id_to_index.get(state.selected_id.as_str()).copied()
	};
	let (focus_x, focus_y) = match selected_idx {
		Some(idx) => (state.nodes[idx].x, state.nodes[idx].y),
		None => (50.0, 50.0),
	};
	for i in 0..n {
		fx[i] += (50.0 - state.nodes[i].x) * CENTER_PULL;
		fy[i] += (50.0 - state.nodes[i].y) * CENTER_PULL;
		if selected_idx.is_some() && Some(i) != selected_idx {
			fx[i] += (focus_x - state.nodes[i].x) * FOCUS_PULL;
			fy[i] += (focus_y - state.nodes[i].y) * FOCUS_PULL;
		}
	}

	let max_step = MAX_VEL * temperature;
	let mut ke = 0.0_f32;
	for i in 0..n {
		if Some(i) == selected_idx {
			state.nodes[i].vx = 0.0;
			state.nodes[i].vy = 0.0;
			continue;
		}
		let mut vx = (state.nodes[i].vx + fx[i] * dt) * DAMPING;
		let mut vy = (state.nodes[i].vy + fy[i] * dt) * DAMPING;
		let speed = (vx * vx + vy * vy).sqrt();
		if speed > max_step {
			let scale = max_step / speed;
			vx *= scale;
			vy *= scale;
		}
		state.nodes[i].vx = vx;
		state.nodes[i].vy = vy;
		state.nodes[i].x = (state.nodes[i].x + vx * dt).clamp(BOUND_LOW, BOUND_HIGH);
		state.nodes[i].y = (state.nodes[i].y + vy * dt).clamp(BOUND_LOW, BOUND_HIGH);
		ke += vx * vx + vy * vy;
	}

	SimResult {
		nodes: state.nodes,
		kinetic_energy: ke,
	}
}