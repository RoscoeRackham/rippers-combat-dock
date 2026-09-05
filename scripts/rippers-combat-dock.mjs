/**
 * RIPPERS — COMBAT DOCK (v0.1.0). Design of record: ui_kits/unmasked-surfaces/combat-dock r2
 * (Austin: option 1). A faction-centric dock for Project FU combat — allies|enemies portrait
 * ribbons around a compact round totem, top-docked, auto-open with combat.
 *
 * FU combat facts this code leans on (read from projectfu 4.16.2 source, not guessed):
 *  - FU has NO initiative queue. `FUCombat.getCurrentTurn()` → 'friendly'|'hostile' (faction
 *    alternation); `combat.combatant` is a flag-backed "who is acting now" (null between turns);
 *    `getTurnsTaken()` → {round: [combatantId…]}; `combatant.totalTurns` can exceed 1 (NPC ranks).
 *  - The ONLY correct turn routes are the system's own: `ui.combat.handleStartTurn(combatant)`
 *    and `ui.combat.handleEndTurn(combatant)` — the exact methods both FU-native UIs call.
 *    Selection IS the turn choice; the dock never advances core turn state itself.
 *  - Stagger is FU's native status id 'stagger' (actor.statuses). Display is ENEMY-ONLY (ruled).
 *
 * Rulings honoured (never invented):
 *  - Enemy vitals HIDDEN until Studied; a Study result of 7+ reveals HP/MP (core rulebook p.319,
 *    ruled 5 Sep 2026). Studied state persists per combatant (flag). GM eye can override the gate
 *    for the table; each player can toggle the vitals display client-side.
 *  - Stagger turn-loss shows on ENEMY cards only.
 *  - Register: Pirata never all-caps; content and proper names natural case.
 *
 * The dock COEXISTS with the native tracker (pure overlay, no tracker/system patching) and
 * auto-collapses whatever party HUD is live (feature-detected, no hard dependency), restoring
 * it when combat ends.
 *
 * PURE core first (VM/state/gate math — headless-testable); Foundry wiring only when the
 * globals exist, so a bare `node --test` import is inert.
 */

export const MODULE_ID = 'rippers-combat-dock';
export const STUDY_REVEAL_THRESHOLD = 7; // core rulebook p.319 — ruled: HP/MP reveal at 7+
export const STAGGER_STATUS_ID = 'stagger'; // FU native status id

// ── pure: rulings and state math ─────────────────────────────────────────────

/** Does a Study check result reveal HP/MP? (core p.319: 7+ — the only tier our books rule on) */
export function studyReveals(result) {
	return Number(result) >= STUDY_REVEAL_THRESHOLD;
}

/**
 * Card state from FU turn facts. FU select model — no queue position:
 * 'defeated' > 'active' (is the flag-backed acting combatant) > 'spent' (all its turns taken
 * this round) > 'available'.
 */
export function cardState({ defeated = false, isActing = false, turnsTaken = 0, totalTurns = 1 } = {}) {
	if (defeated) return 'defeated';
	if (isActing) return 'active';
	if (turnsTaken >= Math.max(1, totalTurns)) return 'spent';
	return 'available';
}

/** Enemy vitals gate: allies always; enemies only when studied, GM-eye-overridden, or viewer is GM. */
export function vitalsVisible({ enemy = false, studied = false, gmReveal = false, isGM = false } = {}) {
	if (!enemy) return true;
	return studied || gmReveal || isGM;
}

/** Stagger display is enemy-only (ruled) — an ally's stagger never renders on the dock. */
export function staggerVisible({ enemy = false, staggered = false } = {}) {
	return enemy && staggered;
}

/**
 * Totem faction line — Pirata face, natural case, never all-caps (no CSS uppercasing).
 * RULED (Austin, 5 Sep 2026, superseding all prior label text): 'Rippers Turn' / 'Enemy Turn'.
 */
export function factionLabel(currentTurn) {
	if (currentTurn === 'friendly') return 'Rippers Turn';
	if (currentTurn === 'hostile') return 'Enemy Turn';
	return 'The table decides';
}

/**
 * The dock VM from plain data (one combatant row shape, no Foundry documents):
 * rows: {id, name, img, faction:'friendly'|'hostile', defeated, staggered, studied, gmReveal,
 *        hidden, isOwner, hp:{value,max}|null, mp:{value,max}|null, guise|null, turnsTaken, totalTurns}
 * opts: {round, currentTurn, actingId|null, isGM, showVitals (client display toggle)}
 */
export function dockVM(rows, { round = 0, currentTurn = null, actingId = null, isGM = false, showVitals = true } = {}) {
	const cards = [];
	for (const r of rows ?? []) {
		if (r.hidden && !isGM) continue; // hidden combatants exist only for the GM
		const enemy = r.faction === 'hostile';
		const state = cardState({ defeated: r.defeated, isActing: r.id === actingId, turnsTaken: r.turnsTaken ?? 0, totalTurns: r.totalTurns ?? 1 });
		const vitals = showVitals && vitalsVisible({ enemy, studied: !!r.studied, gmReveal: !!r.gmReveal, isGM });
		cards.push({
			id: r.id, name: String(r.name ?? ''), img: r.img ?? null, enemy,
			state, hidden: !!r.hidden,
			stagger: staggerVisible({ enemy, staggered: !!r.staggered }),
			studied: !!r.studied, gmReveal: !!r.gmReveal,
			showVitals: vitals,
			hp: vitals ? (r.hp ?? null) : null,
			mp: vitals ? (r.mp ?? null) : null,
			guise: enemy ? null : (r.guise ?? null),
			// selection IS the turn choice: selectable when the viewer could route a turn for it
			canAct: state === 'available' && (isGM || !!r.isOwner),
			canEnd: state === 'active' && (isGM || !!r.isOwner),
		});
	}
	return {
		allies: cards.filter((c) => !c.enemy),
		enemies: cards.filter((c) => c.enemy),
		round, factionLine: factionLabel(currentTurn), isGM,
	};
}

/**
 * Feature-detect the live party surface to collapse while the dock is open. One selector list,
 * NO hard dependency — SAH-family today, our own party card later. Returns matched elements.
 */
export const PARTY_SURFACE_SELECTORS = [
	'#sah-party', '.sah-party-hud', '.stylish-actor-hud-party', // SAH family
	'#rippers-party-card', '.rippers-party-card',               // ours, when it lands
	'#party-hud', '.party-overview',                            // generic fallbacks
];
export function findPartySurfaces(root) {
	if (!root?.querySelectorAll) return [];
	const out = [];
	for (const sel of PARTY_SURFACE_SELECTORS) {
		for (const el of root.querySelectorAll(sel)) if (!out.includes(el)) out.push(el);
	}
	return out;
}

// ── Foundry wiring (inert under bare node) ───────────────────────────────────

const RT = () => (globalThis.game ? globalThis : null);

function i18n(key, fallback) {
	return globalThis.game?.i18n?.localize?.(key) ?? fallback ?? key;
}

/** Read one combatant into a VM row (defensive against missing token/actor). */
function combatantRow(c, combat, turnsTakenIds) {
	const actor = c.actor ?? null;
	const res = actor?.system?.resources ?? {};
	const worn = actor?.items?.find?.((i) => i.type === 'classFeature' && i.system?.featureType === 'rippers-guise.guise' && i.system?.data?.mode === 'worn') ?? null;
	return {
		id: c.id, name: c.name, img: c.img ?? actor?.img ?? null,
		faction: c.faction ?? 'hostile',
		defeated: !!c.isDefeated,
		staggered: !!actor?.statuses?.has?.(STAGGER_STATUS_ID),
		studied: !!c.getFlag?.(MODULE_ID, 'studied'),
		gmReveal: !!c.getFlag?.(MODULE_ID, 'gmReveal'),
		hidden: !!c.hidden,
		isOwner: !!actor?.isOwner,
		hp: res.hp ? { value: res.hp.value, max: res.hp.max } : null,
		mp: res.mp ? { value: res.mp.value, max: res.mp.max } : null,
		guise: worn?.name ?? null,
		turnsTaken: turnsTakenIds.filter((id) => id === c.id).length,
		totalTurns: c.totalTurns ?? 1,
	};
}

function buildLiveVM(combat) {
	const g = globalThis.game;
	const turnsTakenIds = (combat.getTurnsTaken?.() ?? {})[combat.round] ?? [];
	const rows = combat.combatants.map((c) => combatantRow(c, combat, turnsTakenIds));
	return dockVM(rows, {
		round: combat.round,
		currentTurn: combat.getCurrentTurn?.() ?? null,
		actingId: combat.combatant?.id ?? null,
		isGM: !!g.user?.isGM,
		showVitals: g.settings?.get?.(MODULE_ID, 'showVitals') ?? true,
	});
}

// ── the dock overlay (plain DOM — coexists with the native tracker, patches nothing) ──

let dockEl = null;
let collapsedSurfaces = [];

function barHTML(label, kind, v) {
	const esc = globalThis.foundry?.utils?.escapeHTML ?? ((s) => String(s ?? ''));
	if (!v) {
		return `<div class="rcd-line"><div class="rcd-line-head"><span>${label}</span><span>—</span></div><div class="rcd-bar rcd-bar-veiled"></div></div>`;
	}
	const pct = Math.max(0, Math.min(100, (v.value / Math.max(1, v.max)) * 100));
	return `<div class="rcd-line"><div class="rcd-line-head"><span>${label}</span><span>${esc(v.value)} / ${esc(v.max)}</span></div><div class="rcd-bar"><span class="rcd-fill rcd-fill-${kind}" style="width:${pct}%"></span></div></div>`;
}

function cardHTML(c, isGM) {
	const esc = globalThis.foundry?.utils?.escapeHTML ?? ((s) => String(s ?? ''));
	const cls = ['rcd-card', `rcd-${c.state}`];
	if (c.stagger) cls.push('rcd-staggered');
	const controls = [
		isGM ? `<button type="button" class="rcd-ctl" data-ctl="defeated" title="${i18n('RCD.Ctl.Defeated', 'Toggle defeated')}">&#x2620;&#xFE0E;</button>` : '',
		isGM ? `<button type="button" class="rcd-ctl" data-ctl="hidden" title="${i18n('RCD.Ctl.Hidden', 'Toggle hidden')}">&#x25CC;</button>` : '',
		`<button type="button" class="rcd-ctl" data-ctl="ping" title="${i18n('RCD.Ctl.Ping', 'Ping')}">&#x25CE;</button>`,
		isGM && c.enemy ? `<button type="button" class="rcd-ctl rcd-ctl-eye${c.gmReveal ? ' rcd-on' : ''}" data-ctl="eye" title="${i18n('RCD.Ctl.Eye', 'GM — override the Study gate')}">&#x25C9;</button>` : '',
		isGM && c.enemy ? `<button type="button" class="rcd-ctl rcd-ctl-study${c.studied ? ' rcd-on' : ''}" data-ctl="studied" title="${i18n('RCD.Ctl.Studied', 'Toggle studied')}">&#x2315;</button>` : '',
	].filter(Boolean).join('');
	const stamp = c.state === 'spent' ? `<span class="rcd-stamp">${i18n('RCD.Card.Spent', 'Spent')}</span>`
		: c.state === 'defeated' ? `<span class="rcd-stamp rcd-stamp-dead">&#x2620;&#xFE0E; ${i18n('RCD.Card.Defeated', 'Defeated')}</span>` : '';
	const studyChip = c.enemy ? `<span class="rcd-study${c.studied ? ' rcd-studied' : ''}">${c.studied ? i18n('RCD.Card.Studied', 'Studied') : i18n('RCD.Card.Unstudied', 'Unstudied')}</span>` : '';
	const guise = c.guise ? `<span class="rcd-guise">&#x25D1; ${esc(c.guise)}</span>` : '';
	const endBtn = c.canEnd ? `<button type="button" class="rcd-end" data-end title="${i18n('RCD.Card.EndTurn', 'End the turn')}">${i18n('RCD.Card.EndTurn', 'End the turn')}</button>` : '';
	return `<div class="${cls.join(' ')}" data-combatant="${esc(c.id)}" data-can-act="${c.canAct}">
		<div class="rcd-controls">${controls}</div>
		<div class="rcd-portrait">${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}${c.stagger ? `<div class="rcd-ribbon"><span>${i18n('RCD.Card.Staggered', 'Staggered')}</span></div>` : ''}</div>
		${stamp}
		<div class="rcd-name">${esc(c.name)}</div>
		${guise}${studyChip}
		${barHTML(i18n('RCD.Card.HP', 'HP'), 'hp', c.hp)}
		${barHTML(i18n('RCD.Card.MP', 'MP'), 'mp', c.mp)}
		${endBtn}
	</div>`;
}

function dockHTML(vm) {
	return `<div class="rcd-inner">
		<div class="rcd-flank rcd-allies">
			<div class="rcd-flank-head">${i18n('RCD.Dock.Allies', 'Allies — the Rippers')}</div>
			<div class="rcd-cards">${vm.allies.map((c) => cardHTML(c, vm.isGM)).join('')}</div>
		</div>
		<div class="rcd-totem">
			<span class="rcd-round-label">${i18n('RCD.Dock.Round', 'Round')} <b>${vm.round}</b></span>
			<span class="rcd-faction">${vm.factionLine}</span>
		</div>
		<div class="rcd-flank rcd-enemies">
			<div class="rcd-flank-head">${i18n('RCD.Dock.Enemies', 'Enemies')}</div>
			<div class="rcd-cards">${vm.enemies.map((c) => cardHTML(c, vm.isGM)).join('')}</div>
		</div>
	</div>`;
}

async function onCardAction(ev) {
	const g = RT()?.game;
	const combat = g?.combat;
	if (!combat) return;
	const cardEl = ev.target.closest('[data-combatant]');
	if (!cardEl) return;
	const combatant = combat.combatants.get(cardEl.dataset.combatant);
	if (!combatant) return;
	const ctl = ev.target.closest('[data-ctl]')?.dataset.ctl;
	if (ctl) {
		ev.stopPropagation();
		if (ctl === 'defeated' && g.user.isGM) return combatant.update({ defeated: !combatant.isDefeated });
		if (ctl === 'hidden' && g.user.isGM) return combatant.update({ hidden: !combatant.hidden });
		if (ctl === 'ping' && combatant.token?.object) return globalThis.canvas?.ping?.(combatant.token.object.center);
		if (ctl === 'eye' && g.user.isGM) return combatant.setFlag(MODULE_ID, 'gmReveal', !combatant.getFlag(MODULE_ID, 'gmReveal'));
		if (ctl === 'studied' && g.user.isGM) return combatant.setFlag(MODULE_ID, 'studied', !combatant.getFlag(MODULE_ID, 'studied'));
		return;
	}
	if (ev.target.closest('[data-end]')) {
		ev.stopPropagation();
		// THE route: FU's own public end-turn path — never core advance (which FU overrides away).
		return globalThis.ui?.combat?.handleEndTurn?.(combatant);
	}
	// Click selects the actor — and in FU, selection IS the turn choice. Token control is
	// best-effort: only on a drawn canvas (an undrawn canvas throws deep in core PIXI code).
	if (globalThis.canvas?.ready) {
		try { combatant.token?.object?.control?.({ releaseOthers: true }); } catch { /* canvas edge — selection is cosmetic */ }
	}
	if (cardEl.dataset.canAct === 'true' && !combat.isTurnStarted) {
		return globalThis.ui?.combat?.handleStartTurn?.(combatant);
	}
}

export function renderDock() {
	const g = RT()?.game;
	const combat = g?.combat;
	if (!combat?.started) return closeDock();
	if (!dockEl) {
		dockEl = document.createElement('div');
		dockEl.id = 'rcd-dock';
		dockEl.addEventListener('click', onCardAction);
		document.body.appendChild(dockEl);
	}
	collapsePartySurfaces(); // re-scan every render — a party surface may appear after the dock opens
	dockEl.innerHTML = dockHTML(buildLiveVM(combat));
}

export function closeDock() {
	if (dockEl) { dockEl.remove(); dockEl = null; }
	restorePartySurfaces();
}

function collapsePartySurfaces() {
	for (const el of findPartySurfaces(document)) {
		if (el.classList.contains('rcd-collapsed')) continue;
		el.classList.add('rcd-collapsed');
		collapsedSurfaces.push(el);
	}
}
function restorePartySurfaces() {
	for (const el of collapsedSurfaces) el.classList.remove('rcd-collapsed');
	collapsedSurfaces = [];
}

// ── api: Study integration hook-point ────────────────────────────────────────
/**
 * Mark a combatant studied from a Study check result — applies the ruled 7+ gate (core p.319).
 * Returns true when the reveal took. Exposed on module.api for Study-roll wiring and macros.
 */
export async function applyStudyResult(combatant, result) {
	if (!combatant || !studyReveals(result)) return false;
	await combatant.setFlag?.(MODULE_ID, 'studied', true);
	return true;
}

// ── hooks ────────────────────────────────────────────────────────────────────
if (globalThis.Hooks?.on) {
	Hooks.once('init', () => {
		game.settings.register(MODULE_ID, 'showVitals', {
			name: 'RCD.Settings.ShowVitals',
			hint: 'RCD.Settings.ShowVitalsHint',
			scope: 'client', config: true, type: Boolean, default: true,
			onChange: () => renderDock(),
		});
	});
	Hooks.once('ready', () => {
		const mod = game.modules.get(MODULE_ID);
		if (mod) mod.api = { renderDock, closeDock, applyStudyResult, studyReveals, dockVM, cardState, vitalsVisible, staggerVisible, factionLabel };
		if (game.combat?.started) renderDock(); // auto-open on an already-active combat
	});
	// auto-open / live refresh / auto-close
	for (const h of ['createCombat', 'updateCombat', 'updateCombatant', 'createCombatant', 'deleteCombatant']) {
		Hooks.on(h, () => renderDock());
	}
	Hooks.on('deleteCombat', () => {
		// close only when no OTHER active combat remains (the hook fires per deleted document)
		setTimeout(() => (game.combat?.started ? renderDock() : closeDock()), 0);
	});
	Hooks.on('updateActor', (actor) => {
		if (game.combat?.started && game.combat.combatants.some((c) => c.actor?.id === actor.id)) renderDock();
	});
	// status toggles (stagger included) arrive as ActiveEffect create/delete, NOT updateActor
	for (const h of ['createActiveEffect', 'deleteActiveEffect', 'updateActiveEffect']) {
		Hooks.on(h, (effect) => {
			const actorId = effect?.parent?.id;
			if (game.combat?.started && game.combat.combatants.some((c) => c.actor?.id === actorId)) renderDock();
		});
	}
}
