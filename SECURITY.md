# Security policy

## Supported versions

Security fixes are provided for the latest revision of the `main` branch only.
There are currently no published releases or maintained older release branches.
Older commits, forks, and modified deployments are not supported; self-hosted
users should update to the latest `main` revision to receive fixes.

This policy covers both the browser-only GitHub Pages planner and the
self-hosted frontend and backend in this repository.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through
[GitHub's Report a vulnerability form](https://github.com/GrimOutlook/hima/security/advisories/new).
You can also find it under this repository's **Security → Advisories → Report a
vulnerability**. A GitHub account is required. Reports are shared privately with
repository maintainers, who can discuss the issue with you in the advisory.

Include, where possible:

- The affected commit or deployment version and whether it is browser-only or
  self-hosted.
- Steps to reproduce, a minimal proof of concept, and the expected versus actual
  behavior.
- The potential impact and any relevant configuration or environment details.
- Suggested mitigations, if known.

Use synthetic data and redact credentials, session tokens, and personal planner
data. Test only systems you own or have permission to test.

Do not disclose vulnerability details in public issues, pull requests, or
discussions before a fix and disclosure have been coordinated. Maintainers will
review the report, request additional information if needed, and coordinate
mitigation, a fix, and public disclosure through the private advisory. Response
and fix timelines depend on maintainer availability and severity; no guaranteed
response time or bug bounty is offered.

For ordinary bugs and feature requests without sensitive security details, use
[public issues](https://github.com/GrimOutlook/hima/issues).
