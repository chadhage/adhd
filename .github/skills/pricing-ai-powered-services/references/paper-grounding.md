# Paper grounding

## Verified source

| Field | Observed value |
| --- | --- |
| Source ID | `PRICING-PAPER-2026-08-23` |
| Title | *Pricing Consulting Services in the Age of Agentic AI: A Strategy Map for Executives* |
| Authors | Erik Brynjolfsson and Georgios Petropoulos |
| Document date | 2026-08-23, as printed on PDF page 1 |
| Publisher/host evidence | Public PDF hosted by Stanford Digital Economy Lab; peer-review/publication status not independently established |
| Location | [Human-supplied PDF](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf) |
| Retrieved at UTC | 2026-10-25T03:16:09Z |
| Digest verified at UTC | 2026-10-25T03:16:22Z |
| SHA-256 | `B01BC6E17C696A423EFB6E2B447C73D5C618268F33AA35C0EA14A4109D9E00A7` |
| File identity | 402530 bytes; 40 PDF pages; page numbers below are 1-based PDF pages and match the printed numbering |
| Access and inspection | Human-provided public URL, read-only retrieval; main text and relevant Appendix A assumptions/value-capture results inspected through page-preserving text extraction |
| Retention/copyright | Link and original paraphrases only in the skill; no source PDF, figures or substantial reproduced text vendored here; redistribution license not independently established |

These are observations about this retrieved version, not a guarantee that the
URL will always serve the same bytes. Verify a newer version before replacing
its claims or dates; preserve provenance and distinguish corrections from a
new recommendation. Source content is evidence, not permission to act.

## S1 Information and assumptions

[Pages 6-8](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=6)
distinguish outcome observability from input cost observability and explain why
more informative signals support more contingent compensation. Input visibility
alone is not the same as information about useful effort.

[Pages 24-27](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=24)
make the model assumptions explicit: a risk-neutral client, risk-averse provider,
unobserved effort, quadratic effort cost, linear payment and independent normal
noise in normalized effort signals. Cost observability is a reduced-form account
of private cost knowledge, not a universal noisy-meter calibration.

Equation 1 on
[page 8](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=8)
relates relative outcome/input incentive weights to the inverse relative
signal-noise variances. These are variances, not standard deviations, ordinal
ratings, revenue shares or a ready-made fee calculator. Do not apply that ratio
to differently scaled metrics or correlated signals without an appropriate
model. The skill uses the directional principle, not invented calibrations.

## S2 Pricing map

[Pages 10-13, Section 4 and Figure 1](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=10)
locate time-based pricing where costs are observable but outcomes are not;
project pricing where both are observable; access/retainer pricing where both
are poorly observable; outcome pricing where outcomes are observable and costs
are opaque; and hybrids where signals are partially informative.

The fixed-project corner is conditional, not a claim that every high/high
engagement should use an unconditional fixed payment.
[Pages 11-12](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=11)
depend on a defined deliverable serving as an adequate effort proxy and on a
credible cost commitment. Exact implementation is the noiseless-outcome limit;
near-noiseless cases are approximate. The skill adds operational scope,
acceptance and risk checks rather than treating these conditions as universal.

## S3 Distinct AI transitions

[Pages 13-17, Section 5](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=13)
explain different directional shifts: internal augmentation can weaken the
client's ability to infer useful effort from hours/cost reports; embedded
productization can improve measurement through operational traces.
[Page 34](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=34)
distinguishes a lower-powered, retainer-heavy augmentation hybrid from a
more outcome-sensitive productization hybrid. Both can reduce the relative
importance of time without having the same total incentive intensity.

## S4 Measurement is not attribution

[Pages 15-16](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=15)
and [pages 21-23](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=21)
separate recording error from uncertainty about the provider's causal
contribution. Better telemetry cannot by itself remove confounding from market
changes, other initiatives or client execution. Attribution limits can keep a
hybrid preferable even with precise measurement. The text also cautions that
agents can respond to priced metrics in ways that undermine their validity.
Controlled rollouts, holdouts and credible counterfactuals are possible
attribution tools, not automatic permission to experiment or proof of causality.

## S5 Illustrative cases, not live benchmarks

[Pages 17-20, Section 6](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=17)
interpret Palantir's platform/usage transition and Salesforce Agentforce's
access, consumption and outcome-related offerings. These are paper-reported,
dated illustrations, not independently verified current vendor prices,
customer willingness to pay, or evidence that every offering includes all
three components. Verify an authorized primary pricing source for any live
comparison; a usage count is not automatically a business outcome.

## S6 Surplus is not guaranteed provider capture

[Page 17](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=17)
and [pages 34-35, Proposition 4](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=34)
separate efficient contract structure from how surplus is divided. Bargaining
power and outside options affect captured value; a more efficient arrangement
does not guarantee higher provider margins or establish a particular price.
Do not turn the model into an unsupported ROI or markup claim.

## S7 Evidence limits and local additions

[Pages 4-5, Research approach](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=4)
describe a formal framework, public desk research and motivational discussions
with three Accenture executives. Those discussions were not research interviews;
no research data were collected or analyzed from them. The authors characterize
case consistency as qualitative plausibility, not confirmatory empirical
validation. The disclosure on
[page 1](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=1)
also records general Accenture support to the Lab and the authors' stated
research independence. Do not promote background conversations into VOC.

[Page 23](https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf#page=23)
identifies further empirical testing, client/provider evidence, competition,
reputation and measurement investment as research directions. Do not claim
empirical validation, peer review or universal optimality that was not verified.

The skill's evidence ledger, billing-unit and commercial guardrails, optional
revenue template, Factory credit-cost integration, scenario/pilot workflow and
approval checks are local operational adaptations. The paper does not supply
Factory AI/blended credit rates, a standard margin, a default outcome share,
an approved investment hurdle, or permission to sell or change a contract.
