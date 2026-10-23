# Original farm display additions v3

Generated with Codex built-in image_gen on 2026-10-14 for 灵镜档案. New original rural character, spring crops and tilled earth; no third-party characters or sprites used as edit targets.

| File | Actual dimensions | Format | Use |
| --- | --- | --- | --- |
| farmer-v1.png | 1086 × 1448 | RGBA, corner alpha 0 | 4 directions × idle/walk1/walk2 |
| spring-crops-v1.png | 1448 × 1086 | RGBA, corner alpha 0 | radish/bean/berry × 4 growth stages |
| soil-v1.png | 1774 × 887 | RGB, opaque | dry/wet, two 887px squares |

The output is high resolution pixel-styled art, **not certified native 16px/32px art**. Rendered with Phaser pixelArt nearest sampling at 32×40 (character) and 32×32 (crops/soil). Original PNG bytes preserved. Cropping and alignment are supplied by TexturePacker-style JSON, not destructive image processing. Sparse alpha was read at 2px spacing with 2px safety padding; actual row/column boundaries were measured rather than inferred from an equal grid.

Character source canvas208×312; crop source canvas368×352. Trim offsets center the plant/character with common 2px bottom padding. Farmer physics remains its separate existing32×28 proxy (logical tile32×32). Soil dry/wet selection reads existing watered state; growth rules and save format remain unchanged. Other seasonal crops retain the existing fallback art in this phase.

Full prompts: farmer-prompt.txt / crops-prompt.txt / soil-prompt.txt. Original generated files are preserved separately by Codex; SHA256 hashes and measurements recorded in provenance.json.
