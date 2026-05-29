// Side-effect module — boots the durable sync outbox once at app start.
//
// startSyncQueue() wires the flush triggers (on reconnect, on a light
// interval while online, and an initial drain at boot) so any edits parked
// offline reach Supabase as soon as connectivity returns. Idempotent.
import { startSyncQueue } from './syncQueue';
// Side-effect: importing atomCloudSync registers the outbox flush handler, so
// edits queued in a previous session start draining at boot — even before the
// operator navigates to the PLM (which is what first loads the stores).
import './atomCloudSync';

startSyncQueue();
