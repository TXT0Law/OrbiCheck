# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in OrbiCheck, please report it responsibly.

**Do NOT open a public issue for security vulnerabilities.**

Instead, please use one of the following methods:

1. **GitHub Security Advisories** (preferred): Go to the [Security tab](https://github.com/TXT0Law/OrbiCheck/security/advisories) and click "Report a vulnerability".
2. **Email**: Contact the maintainer directly through their GitHub profile.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to expect

- Acknowledgment within 48 hours
- Status update within 7 days
- Credit in the fix release (unless you prefer to remain anonymous)

## Scope

The following are considered in scope:

- Authentication bypass or session hijacking
- SQL injection, XSS, CSRF vulnerabilities
- Unauthorized data access
- Remote code execution
- Secrets or credentials exposed in the codebase

The following are **out of scope**:

- Denial of service attacks against local development instances
- Vulnerabilities in third-party dependencies (report these upstream)
- Social engineering attacks
- Issues that require physical access to the server
