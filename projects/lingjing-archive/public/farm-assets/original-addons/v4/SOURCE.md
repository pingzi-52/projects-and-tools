# Original soil patches v4

Built-in image_gen, 2026-10-14, original low-noise farming ground for 灵镜档案. Full prompt retained in soil-patches-prompt.txt. Original generated file exec-af0b8e82-4d79-4c85-b661-10f5ae0817a2.png retained; project PNG copied without pixel editing.

Actual PNG2172×724 RGBA, corner alpha0. Three measured earth patches: raw/unworked, dry cultivated, wet cultivated. Crop squares654×654 at(41,36),(762,36),(1484,36). Each patch is interpreted as3×3 terrain cells; 109×109 quarter crops supplied by JSON, rendered16×16 for each quarter of a logical32×32 tile. 108frames total, 48quarter variants used across three states and all cardinal neighbor masks. The PNG is high-resolution pixel-styled art, not certified native32px.

Sparse read-only alpha measurement at2px spacing recorded in bounds.json. Source shapes preserve a thin grass fringe and calm earth; outer thirds used only at exposed edges, center thirds on connected sides. No code-drawn raster soil or destructive resampling of original PNG. FarmSoilSurface is a display layer with no body or save writes. Existing v3 dirt is retained as missing-art fallback.

Source SHA256 in provenance.json. No third-party sprite edit target or paid assets used for this addition.
