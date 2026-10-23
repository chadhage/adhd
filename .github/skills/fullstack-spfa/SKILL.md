---
name: fullstack-spfa
description: "Use Single Point of Failure Analysis (SPFA) to identify dependencies whose individual loss can violate a required outcome, including shared failure domains, hidden control-plane dependencies, and unverified failover or recovery paths."
argument-hint: "Provide the required outcome and tolerance, system/dependency topology, operating and recovery scenarios, existing redundancy, and authorized evidence."
---

# Single Point of Failure Analysis (SPFA)

Fullstacker is the primary user; authorized VOC or AssociateProductOwner
practitioners may also use this reusable method. Identify dependencies whose
individual failure can defeat the required outcome
under defined conditions. Include runtime and recovery paths, people, authority,
tools, services, data, credentials' availability (not their values), and
infrastructure. Use independently or within
[RootCauseAnalysis](../fullstack-root-cause-analysis/SKILL.md).

## Boundaries

Follow [Artifact Storage and Engagement
Contracts](../artifact-storage-and-engagement-contracts/SKILL.md) and approved
product-owned storage guidance before persistence. Retain evidence/source IDs,
provenance, collection time, and access status. Exclude secrets. Topology review
does not authorize shutdowns, failover, fault injection, deployment, or access
to additional systems.

## Procedure

1. Define the required function/outcome, system revision and boundary,
   acceptable degradation, failure duration, and recovery/data-loss tolerances
   when applicable. Missing tolerances are gaps, not assumed targets.
2. Map dependency paths and failure domains from request/input to outcome,
   including startup, control plane, monitoring, authentication/authorization,
   storage, backup, restore, and human intervention. Record current topology
   sources, unknown edges, and conditional dependencies.
3. Analyze each dependency's loss or malfunction: what fails downstream,
   under which conditions, for how long, and whether an independent alternate
   can preserve the requirement. Classify confirmed versus suspected single
   points using cited evidence; a central node is not automatically critical.
4. Inspect nominal redundancy for common-cause exposure: shared host, region,
   power, network, identity/provider, mutable state, deployment, configuration,
   software defect, operator, or approval authority. Replicas in one failure
   domain may still have one shared point of failure. Record multi-component
   combinations separately rather than calling every combination a single
   component failure.
5. Check detection, switchover, capacity, state consistency, recovery ordering,
   and fallback permissions. A backup's existence is not restore proof, and
   an alternate needing the failed dependency is not independent recovery.
6. Define discriminating checks for candidate single points and failover
   claims. Perform only explicitly authorized safe tests in approved
   environments; otherwise report analytical findings with untested runtime
   assumptions. Measure actual failover/recovery time and data preservation
   against agreed tolerances when tested.
7. Propose elimination, isolation, independent redundancy, graceful
   degradation, or tested recovery with an owner, authority status,
   acceptance evidence, tradeoffs, and residual common-cause risks. Link
   failure modes/effects to    [FMEA](../fullstack-fmea/SKILL.md); risk acceptance remains
   with the responsible owner.

## Output

Return a dependency map and register: dependency ID, function/path, failure
domain, failure scenario, downstream effect/tolerance, alternate and its
independence evidence, detection/failover/recovery capability, source confidence,
confirmed/suspected/not-single-point status, validation result or gap,
proposed mitigation/owner, residual risk, and review trigger. Scope any
"no single points found" conclusion to the inspected boundary and scenarios.
