# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take the security of PacificOceanAI seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please Do Not

- **Do not** open a public GitHub issue for security vulnerabilities
- **Do not** disclose the vulnerability publicly until it has been addressed

### Please Do

1. **Email us** at [your-email@example.com] with:
   - A description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Any suggested fixes (if available)

2. **Allow time** for us to respond and fix the issue before public disclosure

3. **Provide your contact information** so we can follow up with you

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Updates**: We will keep you informed about our progress
- **Timeline**: We aim to release a fix within 30 days for critical vulnerabilities
- **Credit**: We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices for Users

### API Key Security

- **Never share** your API keys publicly
- **Use environment-specific keys** for development and production
- **Rotate keys regularly** if you suspect they may be compromised
- **Revoke immediately** if a key is exposed

### Extension Security

- **Download only** from official sources (Chrome Web Store, GitHub releases)
- **Verify** the extension's permissions before installation
- **Keep updated** to the latest version for security patches
- **Review** the privacy policy and understand data handling

### Data Privacy

- **Be aware** that your text content is sent to third-party AI services
- **Review** the privacy policies of AI providers you use
- **Avoid** sending sensitive or confidential information
- **Use** your own API keys rather than shared accounts

## Known Security Considerations

### Third-Party AI Services

When using PacificOceanAI, your text content is sent to third-party AI services (OpenAI, Anthropic, Google, etc.) based on your configuration. Please:

- Review the privacy policies of these services
- Understand their data retention policies
- Be cautious with sensitive information

### Local Storage

- API keys are stored in browser's local storage
- Data is not encrypted at rest (browser's responsibility)
- Clearing browser data will remove all stored information

### Network Security

- All API communications use HTTPS
- No data is sent to our servers (we don't have any)
- Extension only operates on Overleaf domains

## Security Updates

Security updates will be released as soon as possible after a vulnerability is confirmed. Users will be notified through:

- GitHub Security Advisories
- Release notes
- Extension update notifications

## Scope

This security policy applies to:

- The PacificOceanAI browser extension
- Official distribution channels
- Documentation and examples

It does not apply to:

- Third-party forks or modifications
- User-configured API endpoints
- Third-party AI services

## Contact

For security concerns, please contact:
- Email: [your-email@example.com]
- GitHub: [@yourusername](https://github.com/yourusername)

For general questions, please use GitHub Issues or Discussions.

---

**Last Updated**: January 21, 2026
