# Figma Prompt — CCTV Multi-Feed Analyst Copilot Dashboard

Paste everything below into Figma's AI/First Draft prompt box (or use it as a brief for a designer).

---

## Product Context (give Figma this first)

Design a web dashboard for **security analysts** at a government SOC (Security Operations Center). The tool lets an analyst track a specific person across multiple CCTV cameras — identified by a carried object (e.g., "red backpack") and appearance, **never facial recognition** — and ask natural-language questions like *"Show every time someone carrying a red backpack was near Camera 3 after 6pm."* The system returns a plain-English answer plus the matching events on a timeline and map, each clickable to jump to that moment in the camera feed.

This is a professional, high-trust intelligence tool — not a consumer app. It should feel closer to **Palantir, Splunk, or a mission control console** than a typical SaaS product.

---

## Screens to Design

1. **Main Dashboard (primary screen)** — single-page layout, no heavy navigation needed since scope is small:
   - **Left sidebar (narrow, icon-based):** camera list/status (online/offline dot per camera), date/time range picker, object-attribute filters (color swatches + class tags like "backpack," "tote bag," "jacket")
   - **Center panel — Timeline + Camera Map (tabbed or split view):**
     - *Timeline view:* horizontal scrollable timeline showing event markers (small dots/pills) plotted by time, color-coded by object attribute, grouped by camera row (one row per camera, like a Gantt/DVR scrubber)
     - *Map view:* top-down floor plan or plaza layout with camera icons placed at their real positions, showing a track path (dotted line) connecting a person's ground-position across cameras
   - **Right panel — Analyst Copilot (chat-style):**
     - Natural-language query input at the bottom (like a chat input, with a mic/send icon)
     - Scrollable conversation thread above it: analyst's question, then the copilot's answer as a short text summary + a stacked list of "event cards" (see below)
     - A few example/suggested query chips above the input for first-time use ("Show all events after 6pm," "Find anyone with a yellow bag")
   - **Top bar:** system name/logo, live camera count, connection status, a small real-time cost/usage indicator (since cost tracking is a project deliverable), and a settings/privacy icon

2. **Event Detail Modal** — opens when an analyst clicks a timeline marker, map pin, or copilot result card:
   - Cropped frame/thumbnail of the detection (bounding box drawn around person + object)
   - Metadata: timestamp, camera ID, object class/color, confidence score (as a percentage + small progress bar), dwell time, track ID
   - "Confirm match" / "Reject match" buttons (human-in-the-loop review) with a confidence-score visual cue (e.g., green >85%, amber 60–85%, red <60%)
   - "Jump to camera feed" button

3. **Privacy & Redaction Panel** (secondary screen, reachable from settings icon):
   - Toggle for bystander face-blur in review footage
   - Data retention policy display (read-only text/settings)
   - Access/audit log of who ran which queries and when

4. **Empty/loading states:** a calm "no results found" state for the copilot when a query returns nothing, and a skeleton-loading state for the timeline while events are being fetched.

---

## Visual Style / Aesthetic

- **Theme:** Dark mode as default (SOC environments are typically dark rooms with wall monitors) — near-black background (`#0B0E13` or similar), not pure black, with subtle elevation via slightly lighter panel surfaces (`#12161D`, `#1A1F29`).
- **Accent color:** A single confident accent — cool cyan or electric blue (`#3DB8FF` / `#4FD1FF`) for interactive elements, active states, and the track/path lines. Avoid multiple competing bright colors; use accent sparingly so alerts and matches stand out.
- **Status/semantic colors:** green for high-confidence/confirmed matches, amber for medium confidence, red/coral for low confidence or alerts — but never rely on color alone, always pair with a text label or icon (accessibility, and because object *colors* like "red backpack" are already using color as data — don't let UI color coding collide with that).
- **Typography:** Clean, technical sans-serif for UI text (Inter, IBM Plex Sans, or similar). Use a monospace font (JetBrains Mono, IBM Plex Mono) specifically for timestamps, camera IDs, track IDs, and coordinates — this reinforces the "data/forensic" feel and makes scannable numbers easy to distinguish from prose.
- **Density:** Information-dense but organized — analysts scan a lot of data quickly, so prioritize clear grouping, generous use of dividers/subtle borders over whitespace-heavy consumer-app spacing, and consistent alignment grids.
- **Iconography:** Simple line icons (not filled/playful) — camera, clock, map-pin, shield (privacy), confidence/checkmark icons.
- **Motion:** Minimal, functional only — timeline scrubbing, panel transitions, a subtle pulse on new incoming events. No decorative animation.
- **Overall mood:** Calm, precise, trustworthy, "mission control" — not flashy, not playful, not consumer-startup-colorful.

---

## UX / Usability Requirements

- **Natural-language-first interaction:** the copilot query box should feel like the fastest way to get an answer — visually prominent, always accessible, not buried in a tab.
- **Every result must be traceable:** any answer the copilot gives must link back to concrete evidence (timestamp, camera, confidence score) — never present an AI summary without a way to verify it against the underlying event data. This should be a visible design pattern (e.g., every copilot answer bubble has attached "source" event cards beneath it).
- **Confidence must always be visible**, never hidden behind a hover or a second click, since these are the "human-in-the-loop" review points the analyst is responsible for confirming.
- **Filter and query should stay in sync:** if an analyst sets a sidebar filter (e.g., "red" + "after 6pm") and then also types a natural-language query, the two should visibly reconcile, not conflict silently.
- **Keyboard-friendly:** analysts will use this for extended sessions — support keyboard navigation for the timeline (arrow keys to scrub) and quick-focus on the query box (e.g., "/" to focus, like Slack/Linear).
- **Accessibility:** WCAG AA contrast minimum even in dark mode; color-blind-safe palette; don't encode meaning in color alone (pair with icons/text everywhere, as noted above).
- **Responsive scope:** design for a desktop analyst workstation (≥1440px) as the primary target — this is not a mobile-first product, but the layout shouldn't completely break at a 1280px laptop width.
- **Explicit "no facial recognition" visual cue:** somewhere persistent (e.g., a small badge near the camera feed or in settings) reinforce that faces are blurred/not used for identification — this is a core trust/compliance feature of the product, not just a backend detail, and should be visible in the UI itself.

---

## Deliverable Ask for Figma

Generate high-fidelity desktop screens (1440px frame width) for:
1. Main Dashboard (with Timeline view active)
2. Main Dashboard (with Map view active)
3. Event Detail Modal (overlaid on the dashboard)
4. Empty/no-results state for the copilot panel
5. Privacy & Redaction settings panel

Use a consistent dark-mode design system (color styles, text styles, and reusable components for: event card, camera status pill, confidence badge, filter chip, timeline marker) so the components can be reused across screens.