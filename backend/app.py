import os
import uuid
from flask import Flask, request, jsonify, url_for
from werkzeug.utils import secure_filename
from pathlib import Path
from email_processor import process_emails # Import the adapted script
import logging

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'uploads'
RESULTS_DATA_FOLDER = Path('static') / 'results_data' # Relative to backend app.py
ALLOWED_EXTENSIONS = {'txt'} # For now, only TXT as per script's design

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['RESULTS_DATA_FOLDER'] = RESULTS_DATA_FOLDER

# Ensure upload and base results directories exist
Path(UPLOAD_FOLDER).mkdir(exist_ok=True)
(Path(__file__).parent / RESULTS_DATA_FOLDER).mkdir(parents=True, exist_ok=True)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        logger.warning("No file part in request")
        return jsonify({"success": False, "message": "No file part in the request"}), 400

    file = request.files['file']
    if file.filename == '':
        logger.warning("No file selected")
        return jsonify({"success": False, "message": "No selected file"}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)

        # Save uploaded file temporarily
        temp_upload_path = Path(app.config['UPLOAD_FOLDER']) / filename
        try:
            file.save(str(temp_upload_path))
            logger.info(f"File {filename} uploaded successfully to {temp_upload_path}")
        except Exception as e:
            logger.error(f"Error saving uploaded file {filename}: {e}")
            return jsonify({"success": False, "message": f"Error saving file: {str(e)}"}), 500

        # Create a unique directory for this job's results
        job_id = str(uuid.uuid4())
        job_output_dir = Path(__file__).parent / app.config['RESULTS_DATA_FOLDER'] / job_id
        job_output_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created output directory for job {job_id}: {job_output_dir}")

        try:
            logger.info(f"Starting email processing for job {job_id} with input file {temp_upload_path}")
            # process_emails expects paths as strings or Path objects
            processing_results = process_emails(str(temp_upload_path), str(job_output_dir))
            logger.info(f"Email processing completed for job {job_id}. Stats: {processing_results['stats']}")

            # Construct URLs for the output files
            # url_for needs to know the endpoint that serves static files,
            # and the path relative to the static folder.
            # The 'static' endpoint is built-in in Flask.
            # The filename path should be relative to the 'static' folder.
            # e.g., results_data/<job_id>/valid_emails.txt

            # RESULTS_DATA_FOLDER is Path('static') / 'results_data'
            # Its .name is 'results_data'
            # The files are job_id / filename.txt inside this 'results_data' folder,
            # which itself is inside 'static'.
            base_static_relative_path = Path(app.config['RESULTS_DATA_FOLDER'].name) # This should be 'results_data'

            valid_emails_file_for_url = base_static_relative_path / job_id / processing_results['output_files']['valid_emails']
            results_csv_file_for_url = base_static_relative_path / job_id / processing_results['output_files']['results_csv']

            valid_emails_url = url_for('static', filename=valid_emails_file_for_url.as_posix(), _external=True)
            results_csv_url = url_for('static', filename=results_csv_file_for_url.as_posix(), _external=True)

            logger.info(f"File URLs: valid='{valid_emails_url}', csv='{results_csv_url}'")

            response_data = {
                "success": True,
                "message": "File processed successfully.",
                "data": {
                    "stats": processing_results['stats'],
                    "files": {
                        "valid_emails_url": valid_emails_url,
                        "results_csv_url": results_csv_url
                    },
                    "job_id": job_id
                }
            }
            return jsonify(response_data), 200

        except FileNotFoundError:
            logger.error(f"Processing error for job {job_id}: Input file {temp_upload_path} not found after saving.")
            return jsonify({"success": False, "message": "Internal server error: Uploaded file not found for processing."}), 500
        except Exception as e:
            logger.error(f"Error during email processing for job {job_id}: {e}", exc_info=True) # Log stack trace
            # Be cautious about returning raw error messages to clients in production
            return jsonify({"success": False, "message": f"An error occurred during processing: {str(e)}"}), 500
        finally:
            # Clean up the temporarily uploaded file
            try:
                if temp_upload_path.exists():
                    temp_upload_path.unlink()
                    logger.info(f"Cleaned up temporary file: {temp_upload_path}")
            except Exception as e:
                logger.error(f"Error cleaning up temporary file {temp_upload_path}: {e}")
    else:
        logger.warning(f"File type not allowed: {file.filename}")
        return jsonify({"success": False, "message": "File type not allowed. Please upload a .txt file."}), 400

# Basic route to check if server is running
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "Backend is running."})

if __name__ == '__main__':
    # Make sure to run this from the root directory of the project, or adjust paths accordingly
    # For development, Flask's built-in server is fine.
    # For production, use a proper WSGI server like Gunicorn.
    app.run(debug=True, host='0.0.0.0', port=5001) # Changed port to avoid conflict with React dev server
