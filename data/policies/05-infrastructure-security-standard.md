# Halden Labs Infrastructure Security Standard

Owner: Platform Engineering. Synthetic document for a fictional company.

## Hosting
The Halden platform runs entirely in a major public cloud provider's data centers. Halden Labs does not operate its own data centers; physical security of those facilities is the provider's responsibility and is covered by the provider's SOC 2 report.

## Network
Cloud security groups and a managed web application firewall restrict inbound and outbound traffic. Internet-facing services sit in a separate public subnet; databases and internal services run in private subnets with no public addresses.
All traffic between services is encrypted with TLS 1.2 or higher, including traffic inside the private network. The TLS configuration is reviewed every quarter and only modern cipher suites are enabled.
Employees reach internal tools through a zero-trust access proxy. Halden Labs does not operate a traditional VPN.

## Hardening and patching
Servers are built from hardened, versioned images defined in code. Security patches are applied monthly. Critical vulnerabilities are patched within 72 hours under an emergency change.

## Backups
Production databases are backed up continuously to a second cloud region. Restores are tested every quarter.

## Testing
An independent firm performs a manual penetration test of the platform once a year. Automated vulnerability scans of all production hosts run weekly.

## Change management
Production changes go through a documented change process. Changes are classified as standard, normal or emergency by impact, and every change record is retained.
