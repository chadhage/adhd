---
name: fullstack-ux-frontend-coding
description: "Use HTML, CSS, and JavaScript coding skills to translate UX designs into semantic, responsive, testable prototypes or authorized production UI."
---

# Coding Skills: HTML, CSS, JavaScript

## Procedure
1. Identify prototype versus production authority, the approved card, design intent, existing frontend stack, and acceptance criteria. Use approved product storage and synthetic test data.
2. Map UI structures to semantic HTML, responsive CSS, and explicit JavaScript state behavior. Prefer existing components and native controls over custom interactions.
3. Implement the smallest vertical task flow with loading, error, validation, and recovery states. Treat user input, URL parameters, imported content, and prototype data as untrusted; use framework-safe text/DOM APIs, avoid unsafe HTML injection, and validate any required rich content with an approved sanitizer and allowlist. Do not mistake client-side validation for backend authorization or security.
4. Run focused behavior, type/lint/build, keyboard, responsive-layout, and integration checks appropriate to the changed slice. For production UI that renders untrusted data, add a negative test proving markup/script payloads are rendered inert and do not execute; document any trusted/sanitized HTML boundary.
5. Compare the running experience with design intent and report observed behavior, intentional deviations, and remaining gaps. Prototype results cannot establish production readiness.

## Completion Checks
Controls work with semantics, input modes, and supported sizes; test evidence is actual. No external code playground uploads, installation, or deployment without applicable permission.

## Source
Original procedure informed by item 11 of [UX Playbook's UX skills article](https://uxplaybook.org/articles/top-skills-every-ux-designer-needs), accessed October 11, 2026.