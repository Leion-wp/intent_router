# Security Policy

## Supported Versions

We support the latest version of the extension. Please ensure you are running the most recent release to receive security updates.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please follow these steps:

1.  **Do not open a public issue.** This allows us to address the vulnerability before it can be exploited.
2.  **Email us** (or contact the maintainer directly) with details of the vulnerability.
3.  Include steps to reproduce the issue.

We will acknowledge your report and work to verify and fix the issue as quickly as possible.

## Security Best Practices for Users

*   **Review Pipelines:** Always review pipelines (`.intent.json` files) from untrusted sources before running them. Pipelines can execute shell commands.
*   **VS Code Safety:** Run this extension in a Trusted Workspace when dealing with project-specific settings.

Thank you for helping keep the community safe!
