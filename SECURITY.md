# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in PENUMBRA, please report it responsibly.

### How to Report

**Please DO NOT open a public issue** for security vulnerabilities.

Instead, contact us directly:

- **Email**: security@penumbra.wallet (placeholder - update with real contact)
- **GitHub**: Send a direct message to @MrAiKen007
- **Encrypted**: PGP key available upon request

### What to Include

When reporting a vulnerability, please include:

1. **Description**: Clear description of the vulnerability
2. **Impact**: What data/assets could be affected
3. **Steps to reproduce**: Detailed steps to reproduce the issue
4. **Environment**: OS, Python version, Bitcoin Core version
5. **Proof of concept**: If applicable, provide a PoC
6. **Suggested fix**: If you have ideas for remediation

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 7 days
- **Fix timeline**: Based on severity (see below)
- **Disclosure**: Coordinated disclosure after fix is released

## Severity Levels

| Severity | Description | Response Time | Disclosure |
|----------|-------------|---------------|------------|
| **Critical** | Funds at risk, private key exposure | 24 hours | After fix + 7 days |
| **High** | Privacy compromise, DoS | 7 days | After fix + 14 days |
| **Medium** | Information leak, UI spoofing | 30 days | After fix + 30 days |
| **Low** | Best practice violations | 90 days | Public disclosure |

## Security Features

### Current

- **Self-hosted**: All data stays on your machine
- **No external APIs**: Uses your own Bitcoin Core node
- **PSBT support**: Hardware wallet integration
- **No telemetry**: No data collection

### Planned

- [ ] Audited by third-party security firm
- [ ] Reproducible builds
- [ ] Signed releases

## Best Practices for Users

### Running PENUMBRA Securely

1. **Bitcoin Core**: Run your own node, don't trust external nodes
2. **Firewall**: Restrict RPC access to localhost only
3. **Updates**: Keep both PENUMBRA and Bitcoin Core updated
4. **Hardware Wallet**: Use PSBT with hardware wallets for large amounts
5. **Network**: Prefer Tor/VPN when using mempool.space API

### Configuration Security

```env
# .env - Security recommendations

# NEVER use weak RPC credentials
BITCOIN_RPC_USER=strong_random_username
BITCOIN_RPC_PASSWORD=strong_random_password_32+chars

# Use specific network port (not default)
BITCOIN_RPC_PORT=38332  # Signet recommended for testing

# Restrict CORS to specific origins only
CORS_ORIGINS=http://localhost:5173
```

### Privileged Operations

PENUMBRA requires:

- Access to Bitcoin Core RPC (read-only for analysis)
- Optional: Internet access for mempool.space API (can be disabled)

**Does NOT require:**

- Private keys (uses PSBT)
- External authentication
- Cloud services

## Known Limitations

1. **Regtest/Mainnet**: Currently optimized for Signet (testnet)
2. **Privacy Score**: Heuristic-based, not cryptographic guarantee
3. **Graph Analysis**: Limited by public blockchain data availability

## Security Changelog

### v0.1.0

- Initial security policy
- Basic input validation
- RPC authentication required

## Acknowledgments

We thank the following security researchers who have responsibly disclosed vulnerabilities:

- None yet - be the first!

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [Bitcoin Core Security](https://bitcoincore.org/en/security/)

---

Last updated: 2026-05
