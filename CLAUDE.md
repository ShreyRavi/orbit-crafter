# OrbitCraft

WebGPU N-body simulator.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

## Design System

Design tokens, palette, typography, and interaction overlays are documented in `DESIGN.md`.

Before any visual work: read `DESIGN.md` first. Do not invent new colors, fonts, or spacing units — use the tokens defined there. When running `/plan-design-review` or `/design-review`, instruct the skill to treat `DESIGN.md` as the established baseline.
