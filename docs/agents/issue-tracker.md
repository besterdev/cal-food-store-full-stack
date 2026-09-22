# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues at `besterdev/cal-food-store-full-stack`. Use the `gh` CLI for issue operations.

## Conventions

- Create an issue with `gh issue create --title "..." --body-file <file>`.
- Read an issue and its conversation with `gh issue view <number> --comments`.
- Apply or remove triage state with `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close completed or rejected work with `gh issue close <number>` and an explanatory comment when useful.
- Infer the repository from the configured `origin` remote.

## Pull requests as a triage surface

PRs as a request surface: no.

## Publishing

When a skill says to publish to the issue tracker, create a GitHub issue and apply the appropriate triage label.

## Fetching work

When a skill asks for a ticket, use `gh issue view <number> --comments` and inspect its current labels.
