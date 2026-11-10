# Halden Labs Logging and Monitoring Standard

Owner: Platform Engineering. Synthetic document for a fictional company.

## What is logged
Production servers, network devices and identity systems log security-relevant events, including sign-ins, privilege changes and access to customer data. Company laptops send endpoint security events to the endpoint protection console.

## Where logs go
All production and network logs are forwarded to a central log platform. Engineers cannot delete or edit forwarded logs.

## Retention
Security event logs are retained for 90 days in the central log platform and then deleted.

## Monitoring
Network and service availability is monitored around the clock, with alerts paged to the on-call engineer. Security alerts from the log platform are triaged by the Security & IT team every business day.
