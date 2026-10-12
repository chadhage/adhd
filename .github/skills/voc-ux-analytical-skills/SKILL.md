---
name: voc-ux-analytical-skills
description: "Use to analyze UX journeys and behavioral measures, evaluating data quality, funnel friction, uncertainty, and alternative explanations before recommending design changes."
---

# UX Analytical Skills

## Procedure
1. Define the authorized journey, decision, population, observation period, and approved data access/storage. Reuse [VOC Telemetry Analysis](../voc-telemetry-analysis/SKILL.md) for detailed behavioral methods and its experiment-integrity checks when comparing variants.
2. Audit event definitions, denominators, missing events, duplicates, bots, consent coverage, and sampling. Do not assume data is unbiased or infallible.
3. Choose task-oriented measures such as completion, abandonment, errors, and time on task. Specify metric meaning, baseline, observation window, and the smallest decision-relevant change/threshold with its accountable owner before analysis; if no threshold is authorized, report distributions and uncertainty without declaring success or failure. No fixed dashboard size or review frequency is mandatory.
4. Segment only on legitimate, authorized dimensions. Compare equivalent cohorts and preserve uncertainty; observational correlations do not establish causality or intent.
5. Triangulate anomalies with authorized qualitative evidence. Propose the smallest test that distinguishes a design defect from measurement or population effects.
6. Return evidence, limitations, counterevidence, and recommended next observation to ProductOwner; ask Fullstacker for separately authorized instrumentation work if data is missing.

## Completion Checks
Measures have reproducible definitions and traceable inputs. Do not collect new telemetry, infer sensitive attributes, or declare business impact without authority and observed evidence.

## Source
Original workflow informed by item 8 of [UX Playbook's UX skills article](https://uxplaybook.org/articles/top-skills-every-ux-designer-needs), Talia Hartwell; accessed October 11, 2026.