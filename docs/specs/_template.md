# NN · Feature name

- **Status:** Not started | In progress | Done
- **Feature:** letter from the brainstorm list, or "Core"
- **Depends on:** specs that must be done first

## Summary

Two or three sentences: what this adds and why it matters to the physio or patient.

## Goals

- …

## Non-goals

- … (and where they are handled, if anywhere)

## User stories

- As a physio, I want … so that …
- As a patient, I want … so that …

## Data model

Tables and columns this spec adds or changes. Follow `docs/architecture.md` (physio_id + RLS
on every table, shared column conventions). Include constraints and indexes.

## Routes and UI

| Route | Kind | Purpose |
| ----- | ---- | ------- |

Describe screens, empty states, loading and error states. Mobile behaviour.

## Behaviour and rules

Numbered business rules, edge cases, validation limits.

## Security and privacy

What is exposed to whom. RLS policies. Anything patient-facing.

## i18n

New message namespaces. Locale-sensitive formatting.

## Acceptance criteria

- [ ] …

## Test plan

- Unit: …
- Integration (incl. RLS): …
- E2E: …

## Open questions

Ask the user before planning.

## Decisions made during implementation

(Fill in while building.)
