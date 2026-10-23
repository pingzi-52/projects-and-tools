# v4 soil display crop correction · 2026-10-15

Original soil-patches-v2.png remains byte-identical. New soil-patches-v3.json is the active atlas mapping; the v2 JSON is retained for provenance/comparison. Runtime texture key remains farm-soil-patch-v2 for existing rendering code.

Original three source patches were654px square including wide grass-colored borders. Tightened crops are raw(98,99,546,546), dry(819,99,546,546), wet(1542,99,546,546), each6×6 quarter regions91px. This reduces excess visual padding so natural dirt edges meet their32px logical tiles; no map IDs or collision boundaries changed. The original PNG is not edited, resampled or regenerated.

Merchant v5 source also remains byte-identical: runtime display corrected from forced32×40 to uniform44/1096 scale, resulting23.124×44 with feet anchor preserved. See docs/VISUAL_ALIGNMENT_FIX.md and its runtime evidence.
