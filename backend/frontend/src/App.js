import React, { useState } from 'react';
import './App.css';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setResults(null); // Reset previous results
    setError(''); // Reset previous errors
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setProcessing(true);
    setError('');
    setResults(null);

    try {
      // The proxy in package.json will forward this to http://localhost:5001/api/upload
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Server error: ${response.status}`);
      }

      if (data.success) {
        setResults(data.data);
      } else {
        setError(data.message || 'An unknown error occurred during processing.');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to the server or other network error.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Email List Verifier</h1>
      </header>

      <section className="upload-section">
        <h2>Upload Email List</h2>
        <input type="file" onChange={handleFileChange} accept=".txt" />
        <button onClick={handleUpload} disabled={processing || !selectedFile}>
          {processing ? 'Processing...' : 'Upload and Verify'}
        </button>
      </section>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {processing && <div className="loading-spinner">Processing emails, please wait...</div>}

      {results && !error && (
        <section className="results-section">
          <h2>Validation Results</h2>
          {results.stats && (
            <div className="stats-grid">
              <div className="stat-item"><strong>{results.stats.total}</strong><span>Total</span></div>
              <div className="stat-item"><strong>{results.stats.valid}</strong><span>Valid</span></div>
              <div className="stat-item"><strong>{results.stats.invalid_format}</strong><span>Invalid Format</span></div>
              <div className="stat-item"><strong>{results.stats.no_mx_record}</strong><span>No MX Record</span></div>
              <div className="stat-item"><strong>{results.stats.undeliverable_smtp}</strong><span>Undeliverable</span></div>
              {results.stats.other > 0 && <div className="stat-item"><strong>{results.stats.other}</strong><span>Other/Errors</span></div>}
            </div>
          )}
          {results.files && (
            <div className="download-links">
              <p>Download your processed files:</p>
              {results.files.valid_emails_url && (
                <a href={results.files.valid_emails_url} target="_blank" rel="noopener noreferrer">
                  Download Valid Emails (TXT)
                </a>
              )}
              {results.files.results_csv_url && (
                <a href={results.files.results_csv_url} target="_blank" rel="noopener noreferrer">
                  Download Full Results (CSV)
                </a>
              )}
            </div>
          )}
          {results.job_id && <p><small>Job ID: {results.job_id}</small></p>}
        </section>
      )}
    </div>
  );
}

export default App;
