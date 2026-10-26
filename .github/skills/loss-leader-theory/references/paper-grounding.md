# Paper grounding

## Verified source

| Field | Observed value |
| --- | --- |
| Source ID | `LOSS-LEADERS-WINE-2007` |
| Title | *A Theory of Loss-Leaders: Making Money by Pricing Below Cost* |
| Authors | Maria-Florina Balcan, Avrim Blum, T-H. Hubert Chan, MohammadTaghi Hajiaghayi |
| Bibliographic imprint | WINE 2007, LNCS 4858, pp. 293-299 (2007), as printed on PDF page 1 |
| Location | [Human-supplied public PDF](https://i.cs.hku.hk/%7Ehubert/wine07.pdf) |
| Host | University of Hong Kong computer-science author-site URL; hosting is not independent verification of current author affiliations |
| Retrieved and hashed at UTC | 2026-10-25T03:40:48Z |
| SHA-256 | `82D5418A7B6ADFDCFA81B04A397CCDCF9B26BA7AF6C1D59C378D84FB68B70BAF` |
| File identity | 351818 bytes; 7 PDF pages |
| Page map | PDF pages 1-7 correspond to printed pages 293-299; URL fragments below use PDF page numbers |
| Access and inspection | Human-provided public URL, read-only retrieval; all seven pages inspected through page-preserving text extraction |
| Rights/retention | PDF carries a Springer-Verlag Berlin Heidelberg 2007 copyright notice; no redistribution license independently verified; only links and original paraphrases are retained here, not the PDF, figures or proofs |

This digest identifies the retrieved version, not all future content at the
URL. Revalidate a changed source and preserve provenance before changing
claims. The short conference version refers to CMU-CS-07-142, July 2007, for
full proofs; that technical report was not retrieved or independently checked.

## S1 Problem and behavioral assumptions

[PDF pages 1-2 / printed 293-294](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=1)
explain how below-cost components can improve aggregate profit even with fixed
marginal costs and rational buyers; psychology and falling marginal costs are
not necessary to the modeled effect.
[PDF pages 3-4 / printed 295-296](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=3)
specify unlimited supply, known single-minded bundles/valuations and
all-or-nothing purchases. The coupon discussion explicitly disallows buying
a cheaper superset to harvest credits. These are strong demand assumptions,
not evidence that real buyers will not substitute, cherry-pick or resell.

## S2 Discount models and reduced prices

[PDF pages 3-5 / printed 295-297](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=3)
translate actual prices into margins after subtracting marginal costs from
both prices and customer valuations. Negative reduced prices mean below-cost
sales, not necessarily negative customer payments. The discount objective
includes negative contribution from any buyer who purchases.

The positive-price comparator requires nonnegative margins. General bounded
discounts keep actual prices nonnegative by bounding margins below by minus
the item's cost. The paper's `B`-bounded specialization gives all items the
same production cost `B`; the unbounded model removes the margin floor.
The source's `B` is not a marketing budget, default AI credit rate, or
guarantee for heterogeneous service costs. Preserve the relevant cost,
valuation, scaling/integrality and structural assumptions before applying
an algorithmic result.

## S3 Coupon model is not ordinary cost-bearing discounting

[PDF pages 2-3 / printed 294-295](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=2)
and [PDF page 5 / printed 297](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=5)
use zero marginal cost and floor the total payable bundle charge at zero.
Signed credits can reduce charges but cannot produce a cash payout; under
zero costs, revenue equals the model's profit. This is a floor on charge,
not a license to erase production, inference or support costs. A real
zero-priced bundle can lose money when those costs are positive.

## S4 Non-monotonicity and existence gaps

[PDF page 2 / printed 294](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=2)
shows that increasing a buyer's valuation can reduce attainable discount-model
profit when it induces loss-making purchases. The paper contrasts this with
the coupon model's monotonicity. A larger customer base is not automatically
a larger profitable base under cost-bearing loss-leading.

[PDF page 5 / printed 297, Theorems 1-2](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=5)
states logarithmic-size gaps among the models for constructed highway and
graph-pricing instances, including a gap depending on `B` in a bipartite
graph. These are existence/worst-case separation results, not expected
uplift, upper bounds on every promotion, or a constant percentage forecast.

## S5 Algorithmic results and their scope

[PDF pages 3-4 / printed 295-296](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=3)
define highway bundles as intervals in an ordered item set and graph vertex
pricing as buyers wanting at most two items. A general service catalog does
not automatically have either structure.

| Source location | Stated result | Restriction to preserve |
| --- | --- | --- |
| [PDF page 6 / printed 298, Theorem 3](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=6) | 2.33-approximation for highway coupon pricing | All customer valuations are 1; do not apply it to arbitrary heterogeneous valuations or nonzero-cost discounting. |
| [PDF page 6 / printed 298, Theorem 4](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=6) | FPTAS for hierarchical desired subsets | Coupon model and the hierarchy assumed in the paper; confirm the structure rather than treating any roadmap as a hierarchy. |
| [PDF page 7 / printed 299, Theorem 5](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=7) | PTAS for minor-free graph vertex pricing | Coupon model; graph/minor restrictions are essential. |
| [PDF page 7 / printed 299, Theorem 6 and following paragraph](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=7) | O(B)-approximation for B-bounded vertex pricing; additional PTAS statement | The PTAS requires minor-free graphs, fixed B, and either all customer valuations at least 1 or no multi-edge. Preserve the paper's input normalization. |
| [PDF page 7 / printed 299, Theorem 7](https://i.cs.hku.hk/%7Ehubert/wine07.pdf#page=7) | FPTAS for hierarchical desired subsets | Discount and B-bounded discount models, not arbitrary overlapping bundle families. |

PTAS/FPTAS are approximation schemes for specified optimization inputs, not
empirical performance or profit-growth promises. Many results are stated
without full proofs in this short version. The skill summarizes the claimed
scope; it neither independently proves the results nor implements a solver.
Do not claim that a bound was achieved without a matching implementation,
verified preconditions and an observed run.

## S6 Limits and local operational additions

The paper's offline static model takes valuation inputs as known; it does not
estimate demand, acquisition, conversion, retention or causal incrementality.
It does not model a general dynamic lifetime-value campaign, inventory
constraints, variable AI costs, competitor reactions or legal compliance.
No numerical discount, subsidy limit, investment hurdle or approval follows
from it.

The skill's evidence ledger, counterfactual/cannibalization checks, daily
Factory-rate integration, abuse/capacity scenarios, commercial/legal review,
subsidy limits and pilot/rollback workflow are local adaptations. Its worked
arithmetic fixtures are hypothetical checks, not reproduced case data or
proofs of market behavior. Keep each adaptation's evidence and decision
authority separate from the paper's theoretical claims.
