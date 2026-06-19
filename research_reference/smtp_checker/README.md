# SMTP Bulk Scanner - Defensive Analysis

This directory contains a script for bulk checking SMTP server availability and security features (e.g., STARTTLS). From a defensive perspective, it is important to understand how such tools are used for reconnaissance and how to detect and mitigate their impact.

## Purpose of the Script
The `smtp_checker.py` script is a diagnostic tool designed to verify if a list of SMTP servers is responsive and to identify supported security extensions like STARTTLS. While useful for network administration, these techniques are also employed by actors to map out mail infrastructure and identify targets for further exploitation, such as credential stuffing or relay abuse.

## Detection Strategies

### 1. Monitoring Connection Frequency and Patterns
Bulk connectivity scans often involve a high volume of connections to many different servers or ports from a single source in a short period. Defenders should monitor for:
- IP addresses attempting to connect to numerous SMTP servers or ports (e.g., 25, 465, 587) within a brief window.
- Repetitive `EHLO/HELO` and `STARTTLS` sequences that do not result in mail transmission.
- Rapid "connection and quit" behavior across a range of internal or external IP addresses.

### 2. Log Analysis
Reviewing SMTP logs can reveal the signature of scanning tools:
- High volume of logs showing successful connections but no subsequent `MAIL FROM` commands.
- Consistent patterns in `EHLO` hostnames provided by the scanner.
- Timeouts or aborted connections from specific IP ranges known for hosting scanning infrastructure.

## Mitigation and Defense

### 1. Rate Limiting and Connection Throttling
Implement rate limiting on SMTP ports to restrict the number of connection attempts from a single source IP. This can effectively degrade the performance of bulk scanning tools and make reconnaissance more expensive.

### 2. Intrusion Detection and Prevention Systems (IDS/IPS)
Configure IDS/IPS rules to flag and potentially block IP addresses that exhibit scanning behavior. Many modern security solutions have signatures for common network scanning tools and patterns.

### 3. IP Reputation and Threat Intelligence
Utilize threat intelligence feeds to identify and block connections from known malicious IP addresses or ranges associated with botnets and scanning activities.

### 4. Minimizing Information Disclosure
Configure SMTP servers to provide only the necessary information in their banners and `EHLO` responses. While STARTTLS support must be advertised to be used, other unnecessary extensions or version information should be hidden to reduce the information available to a scanner.

## Conclusion
Reconnaissance is often the first step in a larger attack. By understanding how connectivity and feature scanning are performed, security teams can implement proactive monitoring and mitigation strategies to protect their infrastructure from being effectively mapped and targeted.
