# Relative usage trends (updated v1.25.1)

The selected design is `design/trend-scale-proposals/03-relative-change.svg`.
Existing quota cards stay unchanged; expanding Usage trends reveals the controls,
step chart and summary below the quota row.

- Default range: rolling 8 hours. Other ranges: 1 day, 7 days and 30 days.
- Default scale: relative change in percentage points, with an adaptive vertical
  axis. Absolute mode retains the actual used quota on a fixed 0–100% axis.
- Within the selected time range, one baseline is shared across all observations
  of the same quota cycle. The summary compares that cycle's first and last
  available readings, including the net change across gaps.
- Gaps/restarts still break the line, without rebasing. Changes to a future reset
  schedule and percentage corrections also keep the baseline. Confirmed resets
  or identity/source/window changes establish a new baseline. Missing data is
  never filled with zero, and there is no interpolation through gaps.
- A gap notice explains that the summary is a net reading difference, not a
  continuous record of when consumption occurred. Older history whose gap marker
  masks an elapsed reset is interpreted from reset timestamps without rewriting
  the stored readings. An unexplained decrease alone is not treated as proof of
  reset and can show a signed correction.
- A single reading shows an unknown change, rather than claiming zero usage.
- Since v1.26.1, a confirmed reset establishes a **0%** baseline, not the first
  post-reset reading. If the first observed new-cycle usage is 2%, it contributes
  +2 percentage points. A hollow 0 marker identifies the reset baseline (not a
  sampled reading); absolute-mode samples remain unchanged. A future reset
  deadline alone does not reset the current graph. Single-point post-reset
  summaries can show the difference from this known zero baseline.
- These are observed quota percentages, not token counts. Scale changes use
  already loaded history and do not trigger provider requests.
- Account/window selections remain independent; existing history retention and
  raw readings are unchanged. All controls support Chinese, English, Japanese
  and Korean, including keyboard chart inspection.

## Smart tooltip (v1.24.2)

The existing dark floating card evaluates all four chart corners. Avoiding the
inspected point has priority, followed by the density of plotted readings. A
score margin keeps the previous corner when differences are small; moving onto
the selected point overrides this hysteresis. No connector curve is drawn and
the chart's height is unchanged. Both scales and keyboard inspection use the
same positioning logic. Positions use measured tooltip dimensions, including
translated text. Very dense data can still be covered, as noted in proposal 03.
Placement scoring samples at most 500 readings per candidate.

Validation: `npm test`, `npm run test:trends`,
`QUOTA_TRENDS_SMALL_SCREEN=1 node scripts/usage-trends-test.cjs`, and
`npm run test:relative-trends`. The last test uses isolated demo readings
(70% → 76%, with three intervening gaps), verifies +6.0 percentage points, both scales, four locales,
keyboard tooltips and independent account baselines. Screenshots are demo data.
