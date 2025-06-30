import re
import csv
import smtplib
import dns.resolver
from concurrent.futures import ThreadPoolExecutor, as_completed # Modified import
from email_validator import validate_email, EmailNotValidError
from pathlib import Path
import logging # Added for potential logging

# Configure basic logging (optional, can be enhanced)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ---------------------------
# Email Syntax & Format Check
# ---------------------------
def is_valid_syntax(email):
    try:
        validate_email(email, check_deliverability=False)
        return True
    except EmailNotValidError:
        return False

# ---------------------------
# MX Record Check
# ---------------------------
def has_mx_record(domain):
    try:
        answers = dns.resolver.resolve(domain, 'MX')
        return len(answers) > 0
    except dns.resolver.NoAnswer:
        logging.warning(f"No MX record found for domain: {domain}")
        return False
    except dns.resolver.NXDOMAIN:
        logging.warning(f"Domain does not exist: {domain}")
        return False
    except Exception as e:
        logging.error(f"Error checking MX for {domain}: {e}")
        return False

# ---------------------------
# SMTP Deliverability Check
# ---------------------------
def smtp_check(email):
    domain = email.split('@')[1]
    mx_record = None
    try:
        records = dns.resolver.resolve(domain, 'MX')
        if not records:
            return False
        mx_record = str(records[0].exchange)

        server = smtplib.SMTP(timeout=10) # Added timeout to constructor
        server.connect(mx_record)
        # server.set_debuglevel(1) # Uncomment for verbose SMTP logs
        server.helo("example.com")  # Use a generic or configurable helo domain
        server.mail("verify@example.com") # Use a generic or configurable from address
        code, message = server.rcpt(email)
        server.quit()

        # Codes 250 and 251 indicate success (recipient okay)
        # Some servers might also use 252 (cannot VRFY user, but will accept message and attempt delivery)
        # For strict validation, only 250 is usually considered.
        return code == 250
    except smtplib.SMTPConnectError as e:
        logging.warning(f"SMTP Connect Error for {email} on {mx_record}: {e}")
        return False
    except smtplib.SMTPServerDisconnected as e:
        logging.warning(f"SMTP Server Disconnected for {email} on {mx_record}: {e}")
        return False
    except smtplib.SMTPHeloError as e:
        logging.warning(f"SMTP Helo Error for {email} on {mx_record}: {e}")
        return False
    except smtplib.SMTPRecipientsRefused as e:
        # This can happen if the email is invalid, but also for other reasons.
        # The code in server.rcpt(email) should ideally be checked.
        logging.info(f"SMTP Recipient Refused for {email} on {mx_record}: {e}")
        return False
    except Exception as e:
        logging.error(f"SMTP Check Error for {email} on {mx_record}: {e}")
        return False

# ---------------------------
# Full Email Validation Logic
# ---------------------------
def validate_email_entry(email):
    email = email.strip()
    if not email: # Handle empty lines
        return None, None # Or some other indicator for invalid input

    if not is_valid_syntax(email):
        return email, 'Invalid Format'

    domain_parts = email.split('@')
    if len(domain_parts) < 2: # Should be caught by syntax check, but good to be safe
        return email, 'Invalid Format'
    domain = domain_parts[1]

    if not has_mx_record(domain):
        return email, 'No MX Record'

    # SMTP check can be time-consuming and sometimes unreliable due to anti-spam measures
    # Consider making this step optional or handle its failures gracefully.
    if not smtp_check(email):
        return email, 'Undeliverable (SMTP Check Failed)'

    return email, 'Valid'

# ---------------------------
# Main Processor Function (Modified)
# ---------------------------
def process_emails(input_file_path, output_dir_path):
    try:
        with open(input_file_path, 'r', encoding='utf-8') as f: # Added encoding
            emails = list(set(line.strip() for line in f if line.strip()))
    except FileNotFoundError:
        logging.error(f"Input file not found: {input_file_path}")
        raise
    except Exception as e:
        logging.error(f"Error reading input file {input_file_path}: {e}")
        raise

    if not emails:
        return {
            "stats": {'total': 0, 'valid': 0, 'invalid_format': 0, 'no_mx_record': 0, 'undeliverable_smtp': 0, 'other':0},
            "output_files": {}
        }

    total = len(emails)
    results = []
    stats = {'total': total, 'valid': 0, 'invalid_format': 0, 'no_mx_record': 0, 'undeliverable_smtp': 0, 'other': 0}

    # Ensure output directory exists
    Path(output_dir_path).mkdir(parents=True, exist_ok=True)

    valid_emails_file_name = "valid_emails.txt"
    results_csv_file_name = "results.csv"

    # Using as_completed from concurrent.futures
    with ThreadPoolExecutor(max_workers=10) as executor: # Reduced max_workers for stability with SMTP
        futures = [executor.submit(validate_email_entry, email) for email in emails]
        for i, future in enumerate(as_completed(futures)): # Corrected usage
            try:
                email, status = future.result()
                if email is None: # Skip if input was empty or unprocessable
                    stats['total'] -=1 # Adjust total if an email was skipped
                    continue

                results.append((email, status))

                if status == 'Valid':
                    stats['valid'] += 1
                elif status == 'Invalid Format':
                    stats['invalid_format'] += 1
                elif status == 'No MX Record':
                    stats['no_mx_record'] += 1
                elif status == 'Undeliverable (SMTP Check Failed)':
                    stats['undeliverable_smtp'] += 1
                else:
                    stats['other'] += 1

                # Logging progress instead of printing
                if (i + 1) % 50 == 0 or (i + 1) == total:
                    logging.info(f"Progress: {i+1}/{total} emails processed.")

            except Exception as e:
                # Log error for a specific email validation and continue
                logging.error(f"Error processing an email future: {e}")
                # Decide if this counts as 'other' or a specific error category
                stats['other'] += 1 # Or a new category like 'processing_error'


    # Save results
    valid_emails_full_path = Path(output_dir_path) / valid_emails_file_name
    with open(valid_emails_full_path, 'w', encoding='utf-8') as f:
        for email, status in results:
            if status == 'Valid':
                f.write(f"{email}\n")

    results_csv_full_path = Path(output_dir_path) / results_csv_file_name
    with open(results_csv_full_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["Email", "Status"])
        writer.writerows(results)

    logging.info("\n--- Validation Summary ---")
    logging.info(f"Total Emails Processed: {stats['total']}")
    logging.info(f"Valid: {stats['valid']}")
    logging.info(f"Invalid Format: {stats['invalid_format']}")
    logging.info(f"No MX Record: {stats['no_mx_record']}")
    logging.info(f"Undeliverable (SMTP): {stats['undeliverable_smtp']}")
    if stats['other'] > 0:
        logging.info(f"Other/Errors: {stats['other']}")

    return {
        "stats": stats,
        "output_files": {
            "valid_emails": valid_emails_file_name,
            "results_csv": results_csv_file_name
        }
    }

# ---------------------------
# Usage (Example for direct script execution)
# ---------------------------
if __name__ == "__main__":
    # This part is for testing the script directly, not used by Flask app
    test_input_file = "test_email_list.txt"
    test_output_folder = "test_output"

    # Create a dummy test file
    Path(test_input_file).write_text("test@example.com\ninvalid\nvalid@gmail.com\nnonexistentdomain@hopefullynonexistent12345.com", encoding='utf-8')

    logging.info(f"Running test processing for {test_input_file} into {test_output_folder}")
    results_summary = process_emails(test_input_file, test_output_folder)
    logging.info(f"Test run complete. Summary: {results_summary['stats']}")
    logging.info(f"Output files: {results_summary['output_files']}")
    logging.info(f"Check the '{test_output_folder}' directory for results.")

    # Clean up dummy file
    # Path(test_input_file).unlink()
    print(f"Note: For a real run, provide a comprehensive email list in '{test_input_file}'.")
    print(f"The SMTP checks can be slow and might be blocked by some email servers.")
    print("Consider the ethical implications and potential for your IP to be rate-limited or blocked.")
