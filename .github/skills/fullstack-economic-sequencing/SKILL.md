---
name: fullstack-economic-sequencing
description: "Sequence authorized engineering cards or atomic tasks using WSJF and CD3 without taking product-priority authority. Use to choose the next highest-value work item, expose missing economic inputs, compare delay cost to duration, and record a traceable sequencing recommendation."
argument-hint: "Provide candidate IDs, authority, cost-of-delay inputs, duration estimates, dependencies, mandatory constraints, and scoring policy."
---

# Full-stack Economic Sequencing

## Procedure

1. Confirm that every candidate is authorized and comparable, who owns priority, the scoring policy, time unit, estimate source, and decision horizon. Exclude work blocked by mandatory ordering, safety, legal, or technical constraints before economic ranking.
2. Obtain cost-of-delay and duration or job-size inputs from accountable sources. Keep customer/business value, time criticality, risk reduction or opportunity enablement, and duration visible when the approved policy uses them. Never invent values or silently convert ordinal scores into money.
3. Apply the configured formula. Common forms are $WSJF = Cost\ of\ Delay / Job\ Size$ and $CD3 = Cost\ of\ Delay / Duration$, but use the repository's approved definitions when they differ.
4. Validate inputs before division: denominator/job size or duration must be strictly positive and expressed in the policy's compatible units; cost-of-delay inputs must satisfy the approved scale and semantics. Reject missing, zero, negative, or incompatible inputs as unscorable rather than substituting an epsilon, absolute value, or invented score. Normalize units and uncertainty. Show ranges or sensitivity when close scores could reverse under plausible estimates; do not present false precision.
5. Respect dependencies, WIP limits, indivisible vertical outcomes, and the cost of context switching. Prefer finishing active high-value work over pulling a marginally higher-scored card unless the authorized policy says otherwise.
6. Recommend a sequence and identify ties, missing inputs, assumptions, overrides, and the accountable decision owner. ProductOwner resolves disputed value or priority; engineering evidence may invalidate feasibility but does not silently rewrite product value.

## Output and Checks

Return the candidates, formula and units, sourced inputs, calculations, dependency/constraint adjustments, sensitivity, recommended order, authority, and required decision. A score is a sequencing aid, not authorization to start, expand scope, spend, deploy, or release.