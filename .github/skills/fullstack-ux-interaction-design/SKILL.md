---
name: fullstack-ux-interaction-design
description: "Use interaction design to define and validate control behavior, state transitions, feedback, error recovery, and keyboard/touch parity for an authorized UI workflow."
---

# Interaction Design

## Procedure
1. Identify the authorized user task, evidence, existing patterns, and acceptance criteria. Persist artifacts only in approved product-owned locations.
2. Inventory controls and states: idle, focus, loading, success, invalid input, disabled, failure, cancellation, retry, and stale/out-of-order response where relevant.
3. Specify triggers, state transitions, feedback, focus behavior, data preservation, and recovery. For asynchronous work, define cancellation, timeout, repeated submission, response ordering, stale-result rejection, and behavior after navigation/unmount. Never depend on hover alone or allow duplicate submissions without appropriate protection.
4. Implement the smallest flow using existing components; check keyboard, pointer, touch, and assistive-technology behavior with the accessibility skill as needed.
5. Validate happy and failure paths against observable acceptance criteria; report actual tests and unresolved usability evidence.

## Completion Checks
Every relevant transition has a predictable result and recoverable failure behavior. Do not pursue addictive use, hidden actions, or coercive interactions as UX goals.

## Source
Original procedure informed by item 4 of [UX Playbook's UX skills article](https://uxplaybook.org/articles/top-skills-every-ux-designer-needs), accessed October 11, 2026.