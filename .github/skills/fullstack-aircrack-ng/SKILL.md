---
name: fullstack-aircrack-ng
description: "Use Aircrack-ng for authorized wireless security assessment, Wi-Fi capture analysis, and defensive configuration reviews. Limit active testing to explicitly approved networks or isolated labs."
argument-hint: "Provide the authorized WLAN/BSSID, test window, permitted passive or active checks, lab status, and evidence-handling rules."
---

# Aircrack-ng Wireless Assessment

## When to Use
- Assess an owned or explicitly authorized Wi-Fi network.
- Review sanitized packet captures or validate wireless configuration in a lab.

## Procedure
1. Confirm written authorization for the SSID/BSSID, physical area, test window, permitted radio actions, and any client devices in scope. Do not infer permission from a visible network.
2. Record the adapter, driver, regulatory domain, tool version, capture location, and exact BSSID/channel filter. Prefer configuration review before passive capture and passive capture before transmitting frames. Configure capture filters to retain only the authorized BSSID and required management/data frames when technically possible; minimize capture duration and stop if unrelated networks or client traffic are being collected.
3. For active checks, use only the approved access point and test clients; agree on channel, duration, rate limits, and a stop contact. Avoid disrupting legitimate clients.
4. Analyze captures locally. Before analysis or retention, verify the capture is limited to authorized BSSIDs/clients and time bounds. Segregate unrelated traffic, securely delete it under the approved handling policy, and record the exclusion/deletion evidence without copying its contents. Redact device identifiers and other personal data from a derivative before sharing, and inspect the derivative for residual identifiers; do not retain unrelated traffic.
5. Report observed security settings, evidence, coverage limits, and practical remediation such as WPA3 or WPA2-AES, disabling WPS where not needed, firmware updates, and guest-network isolation.

## Boundaries
Do not capture traffic from third-party networks, impersonate access points, deauthenticate clients, or recover real users' credentials. Credential-recovery tests require a separate, explicitly approved isolated lab with synthetic credentials; do not use recovered secrets to access accounts or systems.
