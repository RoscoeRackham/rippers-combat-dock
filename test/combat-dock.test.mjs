// COMBAT DOCK — headless coverage of the pure core (state, gates, VM, ruled thresholds).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const cd = await import('../scripts/rippers-combat-dock.mjs');
const { studyReveals, cardState, vitalsVisible, staggerVisible, factionLabel, dockVM, findPartySurfaces, STUDY_REVEAL_THRESHOLD } = cd;

test('studyReveals: the ruled 7+ gate (core p.319) — 6 veils, 7 reveals, garbage veils', () => {
	assert.equal(STUDY_REVEAL_THRESHOLD, 7);
	assert.equal(studyReveals(6), false);
	assert.equal(studyReveals(7), true);
	assert.equal(studyReveals(19), true);
	assert.equal(studyReveals(undefined), false);
	assert.equal(studyReveals('banana'), false);
});

test('cardState: defeated > active > spent (all turns taken) > available; multi-turn NPCs spend late', () => {
	assert.equal(cardState({ defeated: true, isActing: true }), 'defeated');
	assert.equal(cardState({ isActing: true }), 'active');
	assert.equal(cardState({ turnsTaken: 1, totalTurns: 1 }), 'spent');
	assert.equal(cardState({ turnsTaken: 1, totalTurns: 2 }), 'available'); // elite rank — one turn left
	assert.equal(cardState({ turnsTaken: 2, totalTurns: 2 }), 'spent');
	assert.equal(cardState({}), 'available');
	assert.equal(cardState({ turnsTaken: 1, totalTurns: 0 }), 'spent'); // degenerate totalTurns clamps to 1
});

test('vitalsVisible: allies always; enemies only studied / GM eye / GM viewer', () => {
	assert.equal(vitalsVisible({ enemy: false }), true);
	assert.equal(vitalsVisible({ enemy: true }), false);
	assert.equal(vitalsVisible({ enemy: true, studied: true }), true);
	assert.equal(vitalsVisible({ enemy: true, gmReveal: true }), true);
	assert.equal(vitalsVisible({ enemy: true, isGM: true }), true);
});

test('staggerVisible: ENEMY-ONLY (ruled) — a staggered ally never shows it on the dock', () => {
	assert.equal(staggerVisible({ enemy: true, staggered: true }), true);
	assert.equal(staggerVisible({ enemy: false, staggered: true }), false);
	assert.equal(staggerVisible({ enemy: true, staggered: false }), false);
});

test('factionLabel: natural case, never all-caps (Pirata law)', () => {
	assert.equal(factionLabel('friendly'), 'Allies act');
	assert.equal(factionLabel('hostile'), 'Enemies act');
	assert.equal(factionLabel(undefined), 'The table decides');
	for (const v of ['friendly', 'hostile', undefined]) assert.doesNotMatch(factionLabel(v), /^[A-Z\s]+$/);
});

const row = (o = {}) => ({ id: 'x', name: 'X', faction: 'friendly', defeated: false, staggered: false,
	studied: false, gmReveal: false, hidden: false, isOwner: false,
	hp: { value: 10, max: 20 }, mp: { value: 5, max: 10 }, guise: null, turnsTaken: 0, totalTurns: 1, ...o });

test('dockVM: splits factions, veils enemy vitals for players, GM sees through', () => {
	const rows = [
		row({ id: 'a', faction: 'friendly', guise: 'The Pale Coachman' }),
		row({ id: 'e1', faction: 'hostile' }),
		row({ id: 'e2', faction: 'hostile', studied: true }),
	];
	const player = dockVM(rows, { round: 3, currentTurn: 'friendly', isGM: false });
	assert.equal(player.allies.length, 1);
	assert.equal(player.enemies.length, 2);
	assert.equal(player.round, 3);
	assert.equal(player.factionLine, 'Allies act');
	assert.equal(player.allies[0].hp.value, 10);                    // ally vitals always
	assert.equal(player.allies[0].guise, 'The Pale Coachman');      // guise tag rides ally cards
	assert.equal(player.enemies[0].hp, null);                       // unstudied enemy → veiled
	assert.equal(player.enemies[0].showVitals, false);
	assert.equal(player.enemies[1].hp.value, 10);                   // studied enemy → revealed
	const gm = dockVM(rows, { isGM: true });
	assert.equal(gm.enemies[0].hp.value, 10);                       // GM viewer sees through
});

test('dockVM: hidden combatants exist only for the GM', () => {
	const rows = [row({ id: 'h', hidden: true }), row({ id: 'v' })];
	assert.equal(dockVM(rows, { isGM: false }).allies.length, 1);
	assert.equal(dockVM(rows, { isGM: true }).allies.length, 2);
});

test('dockVM: enemy guise never renders; stagger enemy-only; showVitals=false hides even allies', () => {
	const rows = [
		row({ id: 'a', staggered: true, guise: 'G' }),
		row({ id: 'e', faction: 'hostile', staggered: true, guise: 'G', studied: true }),
	];
	const vm = dockVM(rows, { isGM: true });
	assert.equal(vm.allies[0].stagger, false);
	assert.equal(vm.enemies[0].stagger, true);
	assert.equal(vm.enemies[0].guise, null);
	const off = dockVM(rows, { isGM: true, showVitals: false });
	assert.equal(off.allies[0].hp, null); // client display toggle
});

test('dockVM: canAct = available + (GM or owner); canEnd only on the acting card', () => {
	const rows = [
		row({ id: 'mine', isOwner: true }),
		row({ id: 'theirs', isOwner: false }),
		row({ id: 'act', isOwner: true }),
		row({ id: 'done', isOwner: true, turnsTaken: 1 }),
	];
	const vm = dockVM(rows, { actingId: 'act', isGM: false });
	const by = Object.fromEntries(vm.allies.map((c) => [c.id, c]));
	assert.equal(by.mine.canAct, true);
	assert.equal(by.theirs.canAct, false);
	assert.equal(by.act.canAct, false);       // active, not available
	assert.equal(by.act.canEnd, true);        // the one end-turn card
	assert.equal(by.done.canAct, false);      // spent
	assert.equal(by.done.canEnd, false);
	const gm = dockVM(rows, { actingId: 'act', isGM: true });
	assert.equal(gm.allies.find((c) => c.id === 'theirs').canAct, true); // GM routes anyone
});

test('findPartySurfaces: feature-detects known selectors, dedupes, tolerates no DOM', () => {
	assert.deepEqual(findPartySurfaces(null), []);
	const el = { matches: true };
	const fakeRoot = { querySelectorAll: (sel) => (sel === '#sah-party' || sel === '.sah-party-hud' ? [el] : []) };
	assert.deepEqual(findPartySurfaces(fakeRoot), [el]); // matched twice, listed once
});

// ── source-shape guards (hard-won runtime facts) ─────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const src = readFileSync(fileURLToPath(new URL('../scripts/rippers-combat-dock.mjs', import.meta.url)), 'utf8');

test('GUARD: turn routes only through the FU public paths — never core nextTurn/endTurn directly', () => {
	assert.match(src, /ui\?\.combat\?\.handleStartTurn/);
	assert.match(src, /ui\?\.combat\?\.handleEndTurn/);
	assert.doesNotMatch(src, /combat\.nextTurn\(|combat\.endTurn\(|combat\.startTurn\(/);
});

test('GUARD: status toggles are ActiveEffect create/delete, not updateActor — the dock listens to both', () => {
	assert.match(src, /createActiveEffect/);
	assert.match(src, /deleteActiveEffect/);
	assert.match(src, /updateActor/);
});

test('GUARD: party collapse re-scans every render and never hard-depends on one HUD', () => {
	assert.match(src, /collapsePartySurfaces\(\); \/\/ re-scan every render/);
	assert.doesNotMatch(src, /relationships[\s\S]*stylish-hud/);
});

test('GUARD: no untyped <button> in generated dock HTML (the Full-Rest reload lesson)', () => {
	const buttons = src.match(/<button(?![^>]*type="button")[^>]*>/g) ?? [];
	assert.equal(buttons.length, 0, `untyped buttons: ${buttons.join(' | ')}`);
});
