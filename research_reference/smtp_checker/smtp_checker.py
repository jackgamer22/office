import smtplib
import socket
import sys
import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configure logging for professional observability
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class SMTPScanner:
    """
    A diagnostic tool for network administrators to verify the availability
    and security features (e.g., STARTTLS) of SMTP servers in bulk.
    """

    def check_single_server(self, host, port, use_ssl=False, use_tls=True):
        """
        Attempts to connect to an SMTP server and verify its responsiveness.
        Returns a status message indicating success or failure.
        """
        try:
            # Attempt connection
            if use_ssl:
                server = smtplib.SMTP_SSL(host, port, timeout=10)
            else:
                server = smtplib.SMTP(host, port, timeout=10)

            with server:
                server.ehlo()
                features = []

                # Check for STARTTLS support if not using Implicit SSL
                if not use_ssl and use_tls:
                    if server.has_extn('STARTTLS'):
                        features.append("STARTTLS supported")
                        server.starttls()
                        server.ehlo()
                    else:
                        features.append("STARTTLS NOT supported")

                features_str = f" [{', '.join(features)}]" if features else ""
                return f"[+] {host}:{port} - Responsive{features_str}"

        except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, socket.timeout, socket.error) as e:
            return f"[-] {host}:{port} - Unresponsive or connection error. ({e})"
        except Exception as e:
            return f"[?] {host}:{port} - Unexpected error: {e}"

    def run(self, server_list, num_threads=10):
        """Processes a list of (host, port, use_ssl, use_tls) tuples using a thread pool."""
        if not server_list:
            logger.warning("No servers provided to scan.")
            return

        logger.info(f"Initiating bulk SMTP connectivity scan with {num_threads} threads.")

        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            future_to_server = {
                executor.submit(self.check_single_server, s[0], s[1], s[2], s[3]): s
                for s in server_list
            }
            for future in as_completed(future_to_server):
                res = future.result()
                if res:
                    print(res)

        logger.info("Connectivity scan completed.")

def parse_server_list(input_file):
    """
    Parses an input file for server configurations.
    Expected format: host|port|tls|ssl|...
    """
    servers = []
    if not os.path.exists(input_file):
        logger.error(f"Input file '{input_file}' not found.")
        return servers

    with open(input_file, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('|')
            if len(parts) >= 4:
                try:
                    host = parts[0]
                    port = int(parts[1])
                    use_tls = parts[2].upper() == 'Y'
                    use_ssl = parts[3].upper() == 'Y'
                    servers.append((host, port, use_ssl, use_tls))
                except ValueError:
                    logger.warning(f"Skipping malformed line: {line}")
    return servers

if __name__ == "__main__":
    # Usage: python smtp_checker.py <list_file> <threads>
    input_list_path = sys.argv[1] if len(sys.argv) > 1 else 'servers.txt'
    threads = 10
    if len(sys.argv) > 2:
        try:
            threads = int(sys.argv[2])
        except ValueError:
            logger.error("Thread count must be an integer. Defaulting to 10.")

    # Create dummy sample if needed
    if not os.path.exists(input_list_path) and input_list_path == 'servers.txt':
        with open(input_list_path, 'w') as f:
            f.write('smtp.gmail.com|587|Y|N\n')
            f.write('smtp.office365.com|587|Y|N\n')
        logger.info(f"Prepared sample '{input_list_path}' with connectivity check format.")

    scanner = SMTPScanner()
    server_configs = parse_server_list(input_list_path)
    scanner.run(server_configs, num_threads=threads)
