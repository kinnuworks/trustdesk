# Halden Labs Access Control Policy

Owner: Security & IT. Synthetic document for a fictional company.

## Principles
Access to systems and data is granted on a need-to-know and least-privilege basis. Every access request must name the system, the access level and a business reason, and is approved by the requester's manager and the system owner.

## Authentication
All workforce accounts use single sign-on with phishing-resistant multi-factor authentication.
Customer-facing passwords must be at least 12 characters and are checked against a list of breached passwords. Passwords are stored only as salted hashes using bcrypt.
User sessions in the Halden web application expire after 30 minutes of inactivity.

## Administrative access
Administrators use a separate privileged account for administrative work and a standard account for email and daily tasks. Production servers are reached through a bastion host with personal accounts; shared root logins are disabled and elevation uses sudo.
Administrative access to production is reviewed every quarter by the system owners.

## Joiners, movers and leavers
When an employee, contractor or intern leaves, HR raises an offboarding ticket and all logical access is revoked within 24 hours. Badges for the office are deactivated on the last working day.
