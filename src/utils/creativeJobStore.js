// Creative Job store — derived view aggregating briefs + renders by status.
// No separate DB table. All data comes from briefStore + renderStore.
//
// A "job" is a UI concept: one card in the Job Queue view that represents
// an in-flight agent task (brief generation or render dispatch).

import { listBriefs } from './briefStore';
import { listRenders } from './renderStore';
import { listSprints } from './sprintStore';

/**
 * @typedef {Object} CreativeJob
 * @property {string} id  brief or render id
 * @property {'brief'|'render'} kind
 * @property {string} sprint_id
 * @property {string} status  brief/render status
 * @property {string} lane
 * @property {number} sprint_number
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * Returns all in-flight jobs across briefs and renders, grouped by bucket.
 * Buckets: waiting_on_you | agent_running | waiting_on_creator | scheduled
 *
 * @returns {Promise<{ waiting_on_you: CreativeJob[], agent_running: CreativeJob[], waiting_on_creator: CreativeJob[], scheduled: CreativeJob[] }>}
 */
export async function listJobs() {
  const [sprints, briefs, renders] = await Promise.all([
    listSprints(),
    listBriefs(),
    listRenders(),
  ]);

  const sprintMap = {};
  sprints.forEach(s => { sprintMap[s.id] = s; });

  const briefJobs = briefs.map(b => {
    const sprint = sprintMap[b.sprint_id] || {};
    return {
      id: b.id,
      kind: 'brief',
      sprint_id: b.sprint_id,
      status: b.status,
      lane: sprint.lane || '',
      sprint_number: sprint.sprint_number || 0,
      created_at: b.created_at,
      updated_at: b.updated_at,
    };
  });

  const renderJobs = renders.map(r => {
    const sprint = sprintMap[r.sprint_id] || {};
    return {
      id: r.id,
      kind: 'render',
      sprint_id: r.sprint_id,
      status: r.status,
      lane: sprint.lane || '',
      sprint_number: sprint.sprint_number || 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  const all = [...briefJobs, ...renderJobs];

  return {
    // Needs human decision: approved brief waiting for render dispatch, done render waiting for approval
    waiting_on_you: all.filter(j =>
      (j.kind === 'brief' && j.status === 'approved') ||
      (j.kind === 'render' && j.status === 'done')
    ),
    // Agent is actively working: brief being generated, render processing
    agent_running: all.filter(j =>
      (j.kind === 'brief' && j.status === 'draft') ||
      (j.kind === 'render' && j.status === 'processing')
    ),
    // Waiting on creator: creator/founder lane renders pending shoot
    waiting_on_creator: all.filter(j =>
      j.kind === 'render' && j.status === 'pending' &&
      (j.lane === 'creator' || j.lane === 'founder')
    ),
    // Queued for AI render: ai/high_production lane renders pending
    scheduled: all.filter(j =>
      j.kind === 'render' && j.status === 'pending' &&
      (j.lane === 'ai' || j.lane === 'high_production')
    ),
  };
}

/**
 * Returns a single job by id. Checks briefs first, then renders.
 * @param {string} id
 * @returns {Promise<CreativeJob|null>}
 */
export async function getJob(id) {
  const jobs = await listJobs();
  const all = [
    ...jobs.waiting_on_you,
    ...jobs.agent_running,
    ...jobs.waiting_on_creator,
    ...jobs.scheduled,
  ];
  return all.find(j => j.id === id) || null;
}
