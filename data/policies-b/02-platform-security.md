# Orrin Freight Platform Security

Synthetic document for a fictional company, used for demonstration only.

## Authentication
Customer passwords must be at least 8 characters. Passwords are hashed with bcrypt. Sessions stay signed in for 14 days and do not expire on inactivity.
The web app sends a Strict-Transport-Security header with a one-year max-age on every response.
Vulnerability reports from outside researchers are accepted at security@orrin.example and reviewed by the on-call engineer.

## Network
The platform runs in one public cloud region behind the provider's load balancer and security groups. Traffic from the internet is TLS-encrypted and terminated at the load balancer; traffic from the load balancer to application servers inside the private network is plain HTTP.
Staff connect to internal tools through a company VPN with multi-factor authentication.
TLS settings use the cloud provider's default security policy and have not been reviewed separately.

## Operations
Operating system patches are applied automatically every week by the managed image service. There is no separate emergency patch process; urgent fixes wait for the weekly window.
Application and access logs are kept in the cloud provider's logging service for 30 days. Alerts on errors and downtime go to the on-call engineer.
Database snapshots are taken daily and stored in the same region. Restores have not been tested.
An external firm ran one penetration test two years ago. There is no scheduled vulnerability scanning.

## Changes
Code changes need one approving review in the source repository. There is no separate written change management process.
