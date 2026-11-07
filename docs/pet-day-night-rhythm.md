# Hidden pet rhythm — v1.27.0

Hardcoded behavior only: no setting, UI text or persisted preference is added.
Uses the computer's local hour, re-evaluated when choosing an action; no restart
is needed when crossing a time boundary. Applies to both title and stage residents
and all four characters sharing this scheduler.

- 22:00–06:59: sleep has weight 4; drinking cooldown remains 20 minutes.
- 07:00–21:59: drink has weight 3 when eligible; drinking cooldown is 10 minutes.
- Other eligible actions have weight 1. Weights are not guaranteed frequencies.
- Stage uses weighted random choice; title uses a shuffled weighted bag. Extra
  sleep tickets are separated by another eligible action instead of repeating
  immediately. Hello, sad, recharge and walking remain present.
- Walk delays and action durations are unchanged, including title actions lasting
  8–14 seconds. Explicit preview/apply and feeding still override the automatic
  schedule; time-boundary changes do not interrupt an action already playing.

Deterministic six-hour day/night simulations verify that sleep at night and
drinking by day each occur at least 1.5× their opposite-period frequency in both
locations, with cooldowns respected and no adjacent repeated actions. Tests also
cover 07:00/22:00 boundaries, duration and all-action availability. These are
simulations, not a claim that the app was observed for six wall-clock hours.
