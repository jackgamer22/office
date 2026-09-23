// Frontend Application Logic for MagxxxVot PRO
document.addEventListener('DOMContentLoaded', () => {
  let activeJobId = null;
  let eventSource = null;
  let extractedLeads = [];
  let selectedLeadForOutreach = null;

  // Range slider quality score value update
  const qualityThreshold = document.getElementById('quality-threshold');
  const valQuality = document.getElementById('val-quality');
  if (qualityThreshold && valQuality) {
    qualityThreshold.addEventListener('input', () => {
      valQuality.textContent = qualityThreshold.value;
    });
  }

  // Tab Navigation
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      if (targetTab === 'tab-linkedin') pageTitle.textContent = 'LinkedIn Leads Extractor';
      if (targetTab === 'tab-extractor') pageTitle.textContent = 'Multi-Source Email Extractor';
      if (targetTab === 'tab-queue') pageTitle.textContent = 'Automated Location Queue';
      if (targetTab === 'tab-results') pageTitle.textContent = 'Live Extracted Results';
      if (targetTab === 'tab-templates') pageTitle.textContent = 'Cold Outreach AI Generator';
    });
  });

  // Instant Search Table Filter
  const tableSearchInput = document.getElementById('table-search-input');
  if (tableSearchInput) {
    tableSearchInput.addEventListener('input', () => {
      renderLeadsTable(tableSearchInput.value.toLowerCase().trim());
    });
  }

  // Source selection toggle for custom URL input
  const platformSelect = document.getElementById('platform-select');
  const groupCustomUrl = document.getElementById('group-custom-url');
  if (platformSelect && groupCustomUrl) {
    platformSelect.addEventListener('change', () => {
      groupCustomUrl.style.display = platformSelect.value === 'custom' ? 'block' : 'none';
    });
  }

  // Load Sample 50 Cities
  const btnLoadSampleLocs = document.getElementById('btn-load-sample-locs');
  const locationQueueInput = document.getElementById('location-queue-input');
  if (btnLoadSampleLocs && locationQueueInput) {
    btnLoadSampleLocs.addEventListener('click', () => {
      const sampleCities = [
        "Miami, FL", "New York, NY", "Austin, TX", "Dallas, TX", "Los Angeles, CA",
        "Chicago, IL", "Houston, TX", "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX",
        "San Diego, CA", "San Jose, CA", "Jacksonville, FL", "Columbus, OH", "Charlotte, NC",
        "Indianapolis, IN", "San Francisco, CA", "Seattle, WA", "Denver, CO", "Washington, DC",
        "Boston, MA", "Nashville, TN", "El Paso, TX", "Detroit, MI", "Oklahoma City, OK",
        "Portland, OR", "Las Vegas, NV", "Memphis, TN", "Louisville, KY", "Baltimore, MD",
        "Milwaukee, WI", "Albuquerque, NM", "Tucson, AZ", "Fresno, CA", "Sacramento, CA",
        "Mesa, AZ", "Kansas City, MO", "Atlanta, GA", "Omaha, NE", "Colorado Springs, CO",
        "Raleigh, NC", "Virginia Beach, VA", "Long Beach, CA", "Miami Beach, FL", "Oakland, CA",
        "Minneapolis, MN", "Tulsa, OK", "Tampa, FL", "Arlington, TX", "New Orleans, LA"
      ];
      locationQueueInput.value = sampleCities.join('\n');
    });
  }

  // Controls & Actions
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const statLeadsCount = document.getElementById('stat-leads-count');
  const statLocationsProgress = document.getElementById('stat-locations-progress');
  const statStatus = document.getElementById('stat-status');
  const statusSpinner = document.getElementById('status-spinner');
  const statusGauge = document.getElementById('status-gauge');
  const activityText = document.getElementById('activity-text');
  const leadsTableBody = document.getElementById('leads-table-body');

  btnStart.addEventListener('click', async () => {
    const nicheSelect = document.getElementById('niche-select').value;
    const customKeywords = document.getElementById('custom-keywords').value;
    const minQuality = qualityThreshold ? qualityThreshold.value : 80;
    const platform = document.getElementById('platform-select').value;
    const customUrl = document.getElementById('input-custom-url') ? document.getElementById('input-custom-url').value : '';
    const maxResults = parseInt(document.getElementById('max-results').value, 10) || 200;

    const checkedDomains = Array.from(document.querySelectorAll('.domain-check:checked')).map(cb => cb.value);
    const locationsRaw = locationQueueInput.value;

    const payload = {
      platform,
      niche: nicheSelect,
      keywords: customKeywords,
      locations: locationsRaw,
      emailDomains: checkedDomains,
      customUrl,
      minQualityScore: minQuality,
      maxResults
    };

    try {
      btnStart.disabled = true;
      btnStop.disabled = false;
      statStatus.textContent = 'Running';
      statusSpinner.style.display = 'inline-block';
      statusGauge.style.display = 'none';

      extractedLeads = [];
      renderLeadsTable();

      document.querySelector('[data-tab="tab-results"]').click();

      const response = await fetch('/api/extract/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!data.success) {
        alert('Failed to start extraction: ' + data.message);
        resetUIState();
        return;
      }

      activeJobId = data.jobId;
      statLocationsProgress.textContent = `0 / ${data.totalLocations}`;

      connectStream(activeJobId);
    } catch (err) {
      console.error('Error starting extraction:', err);
      alert('Network error initiating extraction job.');
      resetUIState();
    }
  });

  btnStop.addEventListener('click', async () => {
    if (!activeJobId) return;

    try {
      await fetch('/api/extract/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: activeJobId })
      });
      stopStream();
      resetUIState();
    } catch (err) {
      console.error('Error stopping extraction:', err);
    }
  });

  function connectStream(jobId) {
    if (eventSource) eventSource.close();

    eventSource = new EventSource(`/api/extract/stream/${jobId}`);

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === 'init') {
        extractedLeads = data.leads || [];
        renderLeadsTable();
        statLeadsCount.textContent = extractedLeads.length;
        statLocationsProgress.textContent = `${data.processedLocations} / ${data.totalLocations}`;
      } else if (data.type === 'progress') {
        statLocationsProgress.textContent = `${data.processedLocations} / ${data.totalLocations}`;
        if (data.currentLocation) {
          activityText.textContent = `Extracting leads in: ${data.currentLocation} (${data.processedQueries}/${data.totalQueries} queries)...`;
        }
      } else if (data.type === 'new_leads') {
        extractedLeads.push(...data.newLeads);
        statLeadsCount.textContent = extractedLeads.length;
        renderLeadsTable();
      } else if (data.type === 'completed' || data.type === 'status_change') {
        activityText.textContent = data.message || 'Extraction process completed.';
        resetUIState();
        stopStream();
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      stopStream();
      resetUIState();
    };
  }

  function stopStream() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function resetUIState() {
    btnStart.disabled = false;
    btnStop.disabled = true;
    statStatus.textContent = 'Idle';
    statusSpinner.style.display = 'none';
    statusGauge.style.display = 'inline-block';
  }

  function renderLeadsTable(searchTerm = '') {
    const filteredLeads = extractedLeads.filter(lead => {
      if (!searchTerm) return true;
      return (
        (lead.name && lead.name.toLowerCase().includes(searchTerm)) ||
        (lead.email && lead.email.toLowerCase().includes(searchTerm)) ||
        (lead.location && lead.location.toLowerCase().includes(searchTerm)) ||
        (lead.niche && lead.niche.toLowerCase().includes(searchTerm))
      );
    });

    if (filteredLeads.length === 0) {
      leadsTableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="9">${extractedLeads.length === 0 ? 'No leads extracted yet. Click "Start Extraction" to run live scraper.' : 'No matching leads found for current search.'}</td>
        </tr>
      `;
      return;
    }

    leadsTableBody.innerHTML = filteredLeads.map((lead, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeHtml(lead.name)}</strong></td>
        <td><a href="mailto:${escapeHtml(lead.email)}" style="color:var(--primary);text-decoration:none;">${escapeHtml(lead.email)}</a></td>
        <td>${escapeHtml(lead.phone)}</td>
        <td>${escapeHtml(lead.location)}</td>
        <td>${escapeHtml(lead.niche)}</td>
        <td><span class="badge-source">${escapeHtml(lead.platform)}</span></td>
        <td><span class="badge-clean"><i class="fa-solid fa-shield-check"></i> ${lead.qualityScore}%</span></td>
        <td><button class="badge-action btn-outreach" data-id="${lead.id}"><i class="fa-solid fa-paper-plane"></i> Draft AI</button></td>
      </tr>
    `).join('');

    // Attach listener for outreach buttons
    document.querySelectorAll('.btn-outreach').forEach(btn => {
      btn.addEventListener('click', () => {
        const leadId = btn.getAttribute('data-id');
        const targetLead = extractedLeads.find(l => l.id === leadId);
        if (targetLead) {
          generateOutreachForLead(targetLead);
        }
      });
    });
  }

  function generateOutreachForLead(lead) {
    selectedLeadForOutreach = lead;
    document.getElementById('template-lead-preview').value = `${lead.name} (${lead.email}) - ${lead.location}`;
    document.querySelector('[data-tab="tab-templates"]').click();
    fetchColdEmailTemplate();
  }

  const templateTypeSelect = document.getElementById('template-type-select');
  if (templateTypeSelect) {
    templateTypeSelect.addEventListener('change', fetchColdEmailTemplate);
  }

  async function fetchColdEmailTemplate() {
    if (!selectedLeadForOutreach && extractedLeads.length > 0) {
      selectedLeadForOutreach = extractedLeads[0];
      document.getElementById('template-lead-preview').value = `${selectedLeadForOutreach.name} (${selectedLeadForOutreach.email}) - ${selectedLeadForOutreach.location}`;
    }

    if (!selectedLeadForOutreach) return;

    try {
      const type = templateTypeSelect ? templateTypeSelect.value : 'outreach';
      const res = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: selectedLeadForOutreach, templateType: type })
      });
      const data = await res.json();
      if (data.success && data.template) {
        document.getElementById('template-subject').value = data.template.subject;
        document.getElementById('template-body').value = data.template.body;
      }
    } catch (err) {
      console.error('Error generating template:', err);
    }
  }

  const btnCopyTemplate = document.getElementById('btn-copy-template');
  if (btnCopyTemplate) {
    btnCopyTemplate.addEventListener('click', () => {
      const subject = document.getElementById('template-subject').value;
      const body = document.getElementById('template-body').value;
      const fullText = `Subject: ${subject}\n\n${body}`;
      navigator.clipboard.writeText(fullText).then(() => {
        alert('Cold Email Sequence copied to clipboard!');
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Export File Triggers
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (!activeJobId && extractedLeads.length === 0) return alert('No leads available to export.');
    window.location.href = `/api/export/${activeJobId || 'latest'}/csv`;
  });

  document.getElementById('btn-export-xlsx').addEventListener('click', () => {
    if (!activeJobId && extractedLeads.length === 0) return alert('No leads available to export.');
    window.location.href = `/api/export/${activeJobId || 'latest'}/xlsx`;
  });

  document.getElementById('btn-export-txt').addEventListener('click', () => {
    if (!activeJobId && extractedLeads.length === 0) return alert('No leads available to export.');
    window.location.href = `/api/export/${activeJobId || 'latest'}/txt`;
  });

  document.getElementById('btn-copy-clipboard').addEventListener('click', () => {
    if (extractedLeads.length === 0) return alert('No leads available to copy.');
    const emails = extractedLeads.map(l => l.email).join('\n');
    navigator.clipboard.writeText(emails).then(() => {
      alert(`Copied ${extractedLeads.length} email addresses to clipboard!`);
    });
  });
});
