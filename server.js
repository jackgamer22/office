const express = require('express');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');
const { buildSearchQueries, extractFromQuery, generateColdEmailTemplate } = require('./lib/extractor');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store extraction jobs in-memory
const activeJobs = new Map();

/**
 * POST /api/extract/start
 * Starts a new extraction session with location queue, quality filter, and query options
 */
app.post('/api/extract/start', (req, res) => {
  const {
    platform = 'linkedin',
    niche = 'Real Estate',
    keywords = '',
    locations = [],
    emailDomains = ['@gmail.com', '@yahoo.com'],
    customUrl = '',
    minQualityScore = 80,
    maxResults = 200
  } = req.body;

  let locationList = [];
  if (Array.isArray(locations)) {
    locationList = locations.map(l => l.trim()).filter(Boolean);
  } else if (typeof locations === 'string') {
    locationList = locations.split('\n').map(l => l.trim()).filter(Boolean);
  }

  if (locationList.length === 0) {
    locationList = ['United States'];
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const queries = buildSearchQueries({
    platform,
    niche,
    keywords,
    locations: locationList,
    emailDomains,
    customUrl
  });

  const jobState = {
    jobId,
    status: 'running',
    platform,
    niche,
    keywords,
    minQualityScore: parseInt(minQualityScore, 10) || 80,
    totalLocations: locationList.length,
    processedLocations: 0,
    totalQueries: queries.length,
    processedQueries: 0,
    queriesQueue: [...queries],
    leads: [],
    seenEmails: new Set(),
    listeners: new Set(),
    createdAt: new Date().toISOString()
  };

  activeJobs.set(jobId, jobState);

  processJobQueue(jobId, maxResults);

  return res.json({
    success: true,
    jobId,
    message: `Job started with ${queries.length} query variations across ${locationList.length} locations.`,
    totalLocations: locationList.length,
    totalQueries: queries.length
  });
});

/**
 * SSE Stream endpoint for live progress and result population
 */
app.get('/api/extract/stream/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const listener = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  job.listeners.add(listener);

  listener({
    type: 'init',
    status: job.status,
    totalQueries: job.totalQueries,
    processedQueries: job.processedQueries,
    processedLocations: job.processedLocations,
    totalLocations: job.totalLocations,
    leadsCount: job.leads.length,
    leads: job.leads
  });

  req.on('close', () => {
    job.listeners.delete(listener);
  });
});

/**
 * POST /api/extract/stop
 */
app.post('/api/extract/stop', (req, res) => {
  const { jobId } = req.body;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  job.status = 'stopped';
  broadcastJobUpdate(job, {
    type: 'status_change',
    status: 'stopped',
    message: 'Job stopped by user.'
  });

  return res.json({ success: true, message: 'Job stopped successfully.' });
});

/**
 * GET /api/extract/status/:jobId
 */
app.get('/api/extract/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json({
    jobId: job.jobId,
    status: job.status,
    totalLocations: job.totalLocations,
    processedLocations: job.processedLocations,
    totalQueries: job.totalQueries,
    processedQueries: job.processedQueries,
    leadsCount: job.leads.length
  });
});

/**
 * POST /api/templates/generate
 * Generates personalized cold email sequences for a lead
 */
app.post('/api/templates/generate', (req, res) => {
  const { lead, templateType = 'outreach' } = req.body;
  if (!lead) {
    return res.status(400).json({ error: 'Lead data required' });
  }

  const template = generateColdEmailTemplate(lead, templateType);
  return res.json({ success: true, template });
});

/**
 * GET /api/export/:jobId/:format
 */
app.get('/api/export/:jobId/:format', (req, res) => {
  const { jobId, format } = req.params;
  const job = activeJobs.get(jobId);

  let leads = [];
  if (job) {
    leads = job.leads;
  } else if (jobId === 'latest' && activeJobs.size > 0) {
    const lastJob = Array.from(activeJobs.values()).pop();
    leads = lastJob ? lastJob.leads : [];
  }

  if (leads.length === 0) {
    return res.status(404).json({ error: 'No leads available to export.' });
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=leads_${jobId}.csv`);

    const headers = ['Name', 'Email', 'Phone', 'Niche', 'Platform', 'Location', 'Domain', 'Quality Score'];
    const rows = leads.map(l => [
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      `"${(l.niche || '').replace(/"/g, '""')}"`,
      `"${(l.platform || '').replace(/"/g, '""')}"`,
      `"${(l.location || '').replace(/"/g, '""')}"`,
      `"${(l.domain || '').replace(/"/g, '""')}"`,
      `"${l.qualityScore}%"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    return res.send(csvContent);
  }

  if (format === 'xlsx') {
    const dataForSheet = leads.map(l => ({
      'Name': l.name,
      'Email': l.email,
      'Phone': l.phone,
      'Niche': l.niche,
      'Platform': l.platform,
      'Location': l.location,
      'Domain': l.domain,
      'Quality Score': `${l.qualityScore}%`,
      'Extracted At': l.extractedAt
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=leads_${jobId}.xlsx`);
    return res.send(buffer);
  }

  if (format === 'txt') {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=leads_${jobId}.txt`);
    const txtContent = leads.map(l => l.email).join('\n');
    return res.send(txtContent);
  }

  return res.status(400).json({ error: 'Unsupported format. Choose csv, xlsx, or txt.' });
});

async function processJobQueue(jobId, maxResults) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  const processedLocationsSet = new Set();

  while (job.queriesQueue.length > 0 && job.status === 'running') {
    if (job.leads.length >= maxResults) {
      job.status = 'completed';
      broadcastJobUpdate(job, { type: 'completed', message: 'Target lead threshold reached.' });
      break;
    }

    const currentQuery = job.queriesQueue.shift();
    job.processedQueries++;

    if (currentQuery.location && !processedLocationsSet.has(currentQuery.location)) {
      processedLocationsSet.add(currentQuery.location);
      job.processedLocations = processedLocationsSet.size;
    }

    broadcastJobUpdate(job, {
      type: 'progress',
      currentLocation: currentQuery.location,
      currentQuery: currentQuery.query || currentQuery.url,
      processedQueries: job.processedQueries,
      totalQueries: job.totalQueries,
      processedLocations: job.processedLocations,
      totalLocations: job.totalLocations
    });

    try {
      const extracted = await extractFromQuery(currentQuery, { niche: job.niche });

      const newLeads = [];
      for (const lead of extracted) {
        if (!job.seenEmails.has(lead.email)) {
          // Apply min quality score threshold filter
          if (lead.qualityScore >= job.minQualityScore) {
            job.seenEmails.add(lead.email);
            job.leads.push(lead);
            newLeads.push(lead);
          }
        }
      }

      if (newLeads.length > 0) {
        broadcastJobUpdate(job, {
          type: 'new_leads',
          newLeads,
          leadsCount: job.leads.length
        });
      }
    } catch (err) {
      console.error(`Error processing query for job ${jobId}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  if (job.status === 'running') {
    job.status = 'completed';
    broadcastJobUpdate(job, {
      type: 'completed',
      message: 'Queue execution finished!',
      totalLeads: job.leads.length
    });
  }
}

function broadcastJobUpdate(job, payload) {
  for (const listener of job.listeners) {
    listener(payload);
  }
}

app.listen(PORT, () => {
  console.log(`MagxxxVot PRO Email Extractor Server running on http://localhost:${PORT}`);
});

module.exports = app;
