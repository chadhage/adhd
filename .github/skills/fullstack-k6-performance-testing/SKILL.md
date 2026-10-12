---
name: fullstack-k6-performance-testing
description: "Adapt and run the repository's k6 demo for bounded performance testing of owned static assets and API endpoints. Use only with explicit target authorization, agreed load limits, and business-approved thresholds."
argument-hint: "Provide owned test targets, environment, approved VU/stage limits, test window, SLO thresholds, and monitoring/stop contacts."
---

# k6 Performance Testing

## When to Use
- Measure latency and request-error rates for static assets or APIs in a controlled environment.
- Establish a repeatable baseline before or after a performance change.

## Procedure
1. Read the [k6 demo README](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/Perf/k6/README.md) and [script](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/Perf/k6/script.js). Inventory every URL and request before running; the sample includes a disabled eventually-failing third-party API scenario that must remain disabled unless its owner explicitly authorizes testing.
2. Obtain explicit authorization for each hostname and endpoint, environment, test window, maximum virtual users, stages, hard request-rate/iteration-rate cap, redirect policy, and monitoring/stop contact. Prefer staging or a dedicated test deployment; never load-test a third-party service or production system without separate written approval.
3. Set conservative `stages`, an explicit k6 rate-limiting executor or equivalent hard request cap, and thresholds based on agreed SLOs, not demo defaults. Calculate request fan-out per iteration, including retries and redirects, and enforce the aggregate cap at the generator or an approved gateway; VU/stage limits alone do not bound request rate. Disable automatic redirects or validate every redirect destination against the exact authorized host/endpoint allowlist. Confirm duration and worst-case request volume before running.
4. Run a smoke-level test first. Increase load only in approved increments while monitoring latency, error rate, saturation, and service health. Stop immediately on instability, unexpected costs, third-party routing, or threshold breach requiring stop.
5. Record k6 version, script revision, target build, configuration, exact command, runtime, and observed metrics. Distinguish test-generated failures from service defects and account for network/client limits.
6. Retain sanitized results, compare with a baseline under equivalent conditions, and report limitations. Do not infer production capacity from a single low-scale test.

## Safety and Limits
k6 generates traffic and can degrade a system or incur cost. Do not use stress, spike, soak, or high-concurrency profiles unless the owner has approved those exact conditions and a recovery plan. Do not test shared production or public demo endpoints by default.

## Source Basis
- [k6 demo script](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/Perf/k6/script.js)
- [k6 demo documentation](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/Perf/k6/README.md)
- [Upstream MIT license](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/LICENSE)
