# Rippers — Combat Dock

A faction-centric combat dock for Project FU (Foundry v13). Allies and enemies as portrait-card
ribbons around a compact round totem, docked to the top of the screen.

FU has no initiative queue: clicking a card selects the actor, and selection **is** the turn
choice — the dock routes turn start and end exclusively through the system's own
`ui.combat.handleStartTurn` / `handleEndTurn` paths and never advances core turn state itself.

- **Enemy vitals veiled until Studied** — a Study result of 7+ reveals HP/MP (core rulebook p.319).
  Studied state persists per combatant; the GM eye control overrides the gate; each player can
  toggle the vitals display client-side.
- **Stagger turn-loss is enemy-only** (ruled) — a red ribbon across the portrait.
- **Auto-open / auto-close** with active combat; while open, any live party HUD is feature-detected
  and collapsed (no hard dependency), restored when combat ends.
- Coexists with the native combat tracker — pure overlay, nothing patched.

Install via manifest:
`https://github.com/RoscoeRackham/rippers-combat-dock/releases/latest/download/module.json`
