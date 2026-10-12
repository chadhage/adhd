---
name: fullstack-ux-motion-design
description: "Use motion design and micro-interactions to communicate state changes and relationships while respecting reduced-motion preferences, accessibility, and performance."
---

# Motion Design and Micro-Interactions

## Procedure
1. Identify the authorized interaction and the information motion should convey. Use approved product-owned storage and existing motion conventions.
2. Specify start/end states, trigger, cancellation, timing, and nonanimated equivalents. Prefer purposeful feedback over decoration.
3. Respect reduced-motion preferences and avoid flashing, forced movement, layout shifts, or animations that block task completion.
4. Define the performance measure and approved budget for the target device/browser (for example, animation frame drops, interaction blocking, or layout shift), then implement using established components. Test repeated actions, slow rendering, loading transitions, keyboard behavior, and reduced-motion mode on the agreed matrix.
5. Record device/browser/build, measurement method, observed metric versus approved budget, and whether feedback stays understandable without animation. If no performance budget exists, report the measured observations and request an owner criterion rather than claiming a pass.

## Completion Checks
Motion communicates a relevant state without hiding information or making the task less accessible. Do not claim emotional trust or user delight from animation alone.

## Source
Original procedure informed by item 13 of [UX Playbook's UX skills article](https://uxplaybook.org/articles/top-skills-every-ux-designer-needs), accessed October 11, 2026.