# AI Code Review Action

LLM-powered pull request review with a **security-first (DevSecOps) mindset**: bugs, injection, auth flaws, secret leaks, perf regressions — posted as **inline PR comments + summary**, with a **severity gate** to block merges and optional **SARIF** output for GitHub Code Scanning.

**Free by default**: uses [GitHub Models](https://github.com/marketplace/models) with the built-in `GITHUB_TOKEN` — no API keys, no cost. Point it at any OpenAI-compatible endpoint (OpenRouter, OpenAI, a self-hosted `opencode serve`, …) if you prefer.

## Usage

```yaml
name: ai-review
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write
  models: read          # GitHub Models
  security-events: write # SARIF upload

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: julio-arcila/ai-code-review-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-on: high                 # block merge on high/critical findings
          sarif-path: results.sarif     # optional
      - uses: github/codeql-action/upload-sarif@v3
        if: always() && hashFiles('results.sarif') != ''
        with:
          sarif_file: results.sarif
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `github-token` | `github.token` | Needs `pull-requests: write` |
| `model` | `openai/gpt-4o-mini` | Any model on the endpoint (GitHub Models catalog by default) |
| `base-url` | `https://models.github.ai/inference` | OpenAI-compatible endpoint |
| `api-key` | *(= github-token)* | Only needed for non-GitHub endpoints |
| `max-files` | `20` | Cost cap: max files reviewed |
| `max-diff-lines` | `4000` | Cost cap: max diff lines sent |
| `fail-on` | `high` | `none\|low\|medium\|high\|critical` — fail the check at this severity |
| `sarif-path` | *(empty)* | Write SARIF here for Code Scanning upload |
| `ignore` | lockfiles, dist… | Comma-separated globs to skip |

## Outputs

| Output | Description |
|---|---|
| `findings` | Number of findings |
| `max-severity` | `none\|low\|medium\|high\|critical` |

## Using another provider

```yaml
- uses: julio-arcila/ai-code-review-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    base-url: https://openrouter.ai/api/v1
    api-key: ${{ secrets.OPENROUTER_KEY }}
    model: anthropic/claude-haiku-4.5
```

## Design notes

- **Inline comments** are clamped to the nearest added line (LLMs hallucinate line numbers — we never 500 the review because of it).
- **Cost caps first**: files/diffs are capped *before* any token is spent; lockfiles, binaries and `dist/` never reach the model.
- **Tolerant parsing**: findings must validate against a strict schema; malformed entries are dropped, not posted.
- **Dogfooded**: this repo's own PRs are reviewed by this action (`.github/workflows/self-review.yml`).

Built by [Julio Arcila](https://github.com/julio-arcila) — write-up: [fullstack-devlog.pages.dev](https://fullstack-devlog.pages.dev). MIT licensed.
