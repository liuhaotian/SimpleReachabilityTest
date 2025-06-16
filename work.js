/**
 * Cloudflare Worker for a speed test.
 * This single file serves both the frontend HTML/JS/CSS and the backend API.
 * * - Root path ('/'): Serves the main HTML user interface.
 * - /ping: Responds with a minimal payload to measure latency.
 * - /download: Streams a configurable amount of random data.
 * - /upload: Accepts and discards POST data to measure upload speed.
 * - It also handles CORS pre-flight (OPTIONS) requests for the API endpoints.
 */

// --- START: Frontend HTML ---
// The entire frontend application is stored in this template literal.
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Speed Test</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        #startButton { transition: all 0.2s ease-in-out; }
        #startButton:disabled { cursor: not-allowed; opacity: 0.6; }
        .chart-container { 
            display: none; /* Use display:none to prevent layout shifts */
            height: 150px; /* Pre-allocate a fixed space to prevent jump */
            position: relative;
        }
        
        /* Style for the custom radio-button-like selectors */
        .control-group label {
            cursor: pointer;
            padding: 0.5rem 0.75rem;
            border-radius: 0.5rem;
            background-color: #f3f4f6;
            color: #4b5563;
            transition: all 0.2s;
            border: 1px solid #e5e7eb;
            font-size: 0.875rem;
        }
        .control-group input:checked + label {
            background-color: #3b82f6;
            color: white;
            border-color: #3b82f6;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }
        .control-group input:disabled + label {
             cursor: not-allowed;
             opacity: 0.5;
        }
    </style>
</head>
<body class="bg-gray-100 text-gray-800 flex items-center justify-center min-h-screen p-2 sm:p-4">

    <div class="w-full max-w-2xl mx-auto p-4 md:p-6 bg-white rounded-2xl shadow-lg">
        <header class="text-center mb-4 md:mb-6">
            <h1 class="text-2xl md:text-3xl font-bold text-gray-900">Cloudflare Worker Speed Test</h1>
            <p class="text-gray-500 text-sm md:text-base mt-1">A lightweight, serverless application to measure your network performance.</p>
        </header>

        <main>
            <!-- Results Display -->
            <div class="grid grid-cols-3 gap-2 md:gap-4 text-center my-8 mb-6">
                <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-xs md:text-sm font-medium text-gray-500">Ping</p>
                    <p class="text-xl md:text-2xl font-semibold" id="pingResult">-</p>
                    <p class="text-xs text-gray-400">ms</p>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-xs md:text-sm font-medium text-gray-500">Download</p>
                    <p class="text-xl md:text-2xl font-semibold" id="downloadResult">-</p>
                    <p class="text-xs text-gray-400"><span id="downloadTag"></span>Mbps</p>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-xs md:text-sm font-medium text-gray-500">Upload</p>
                    <p class="text-xl md:text-2xl font-semibold" id="uploadResult">-</p>
                    <p class="text-xs text-gray-400"><span id="uploadTag"></span>Mbps</p>
                </div>
            </div>

            <!-- Chart Display -->
            <div id="chartsContainer" class="space-y-4">
                 <div id="downloadChartContainer" class="chart-container">
                    <h3 class="text-center text-gray-600 font-medium text-sm mb-1">Download Trend (Mbps)</h3>
                    <canvas id="downloadChart"></canvas>
                </div>
                <div id="uploadChartContainer" class="chart-container">
                    <h3 class="text-center text-gray-600 font-medium text-sm mb-1">Upload Trend (Mbps)</h3>
                    <canvas id="uploadChart"></canvas>
                </div>
            </div>
            
             <!-- Controls -->
            <div class="mt-6 mb-6 space-y-4">
                <div class="control-group flex flex-wrap justify-center gap-2">
                    <input type="radio" id="testFull" name="testType" value="full" class="sr-only" checked>
                    <label for="testFull">Full Test</label>
                    <input type="radio" id="testDownload" name="testType" value="download" class="sr-only">
                    <label for="testDownload">Download</label>
                    <input type="radio" id="testUpload" name="testType" value="upload" class="sr-only">
                    <label for="testUpload">Upload</label>
                </div>
                <div class="control-group flex flex-wrap justify-center gap-2">
                    <input type="radio" id="size10" name="payloadSize" value="10000000" class="sr-only">
                    <label for="size10">10MB</label>
                    <input type="radio" id="size25" name="payloadSize" value="25000000" class="sr-only" checked>
                    <label for="size25">25MB</label>
                    <input type="radio" id="size50" name="payloadSize" value="50000000" class="sr-only">
                    <label for="size50">50MB</label>
                    <input type="radio" id="size100" name="payloadSize" value="100000000" class="sr-only">
                    <label for="size100">100MB</label>
                </div>
            </div>

            <!-- Start Button -->
            <div class="text-center">
                <button id="startButton" class="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transform hover:scale-105">
                    Start Test
                </button>
            </div>
        </main>
    </div>

    <script>
        const workerUrl = ''; 
        
        const dom = {
            startButton: document.getElementById('startButton'),
            pingResult: document.getElementById('pingResult'),
            downloadResult: document.getElementById('downloadResult'),
            uploadResult: document.getElementById('uploadResult'),
            downloadTag: document.getElementById('downloadTag'),
            uploadTag: document.getElementById('uploadTag'),
            downloadChartContainer: document.getElementById('downloadChartContainer'),
            uploadChartContainer: document.getElementById('uploadChartContainer'),
            controls: document.querySelectorAll('.control-group input'),
        };
        
        let downloadChart, uploadChart;
        
        const getSelectedPayloadSize = () => parseInt(document.querySelector('input[name="payloadSize"]:checked').value, 10);
        const getSelectedTestType = () => document.querySelector('input[name="testType"]:checked').value;

        function createChart(ctx, label) {
            return new Chart(ctx, {
                type: 'line', data: { labels: [], datasets: [{ label: label, data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, borderWidth: 2, tension: 0.4, pointRadius: 0 }] },
                options: { scales: { x: { display: false }, y: { beginAtZero: true, ticks: { callback: (v) => v + ' ' } } }, plugins: { legend: { display: false } }, animation: { duration: 200 }, maintainAspectRatio: false }
            });
        }
        
        function resetUI() {
            if (downloadChart) downloadChart.destroy();
            if (uploadChart) uploadChart.destroy();
            downloadChart = createChart(document.getElementById('downloadChart').getContext('2d'), 'Download');
            uploadChart = createChart(document.getElementById('uploadChart').getContext('2d'), 'Upload');
            dom.pingResult.textContent = '-';
            updateResult(dom.downloadResult, dom.downloadTag, '-');
            updateResult(dom.uploadResult, dom.uploadTag, '-');
        }

        function updateResult(element, tagElement, value, type = '') {
            if (value === '-') {
                element.textContent = '-';
                tagElement.textContent = '';
                return;
            }

            element.textContent = value.toFixed(2);
            tagElement.textContent = type ? type + ' ' : '';
        }

        function addChartData(chart, data) { chart.data.labels.push(''); chart.data.datasets[0].data.push(data); chart.update(); }
        
        function setControlsState(disabled) {
            dom.startButton.disabled = disabled;
            dom.controls.forEach(input => input.disabled = disabled);
            dom.startButton.textContent = disabled ? 'Testing...' : 'Start Test';
        }

        dom.startButton.addEventListener('click', async () => {
            setControlsState(true);
            const testType = getSelectedTestType();
            
            resetUI();
            
            // Set chart visibility based on the test type to prevent layout shifts
            dom.downloadChartContainer.style.display = (testType === 'full' || testType === 'download') ? 'block' : 'none';
            dom.uploadChartContainer.style.display = (testType === 'full' || testType === 'upload') ? 'block' : 'none';

            try {
                if (testType === 'full' || testType === 'download' || testType === 'upload') await testPing();
                if (testType === 'full' || testType === 'download') await testDownload();
                if (testType === 'full' || testType === 'upload') await testUpload();
                dom.startButton.textContent = 'Run Again';
            } catch (error) {
                console.error('Speed test failed:', error);
                dom.startButton.textContent = 'Try Again';
            } finally {
                setControlsState(false);
            }
        });

        async function testPing() {
            const pings = [];
            for (let i = 0; i < 5; i++) {
                const startTime = performance.now();
                try {
                    await fetch(\`\${workerUrl}/ping?nocache=\${Date.now()}\`);
                    pings.push(performance.now() - startTime);
                } catch (e) { console.warn('Ping request failed', e); }
                await new Promise(r => setTimeout(r, 100));
            }
            if (pings.length === 0) throw new Error("Ping test failed.");
            const bestPing = Math.min(...pings);
            dom.pingResult.textContent = bestPing.toFixed(0);
        }

        async function testDownload() {
            const payloadSize = getSelectedPayloadSize();
            const downloadUrl = \`\${workerUrl}/download?size=\${payloadSize}\`; 
            let bytesReceived = 0, lastBytesReceived = 0;
            const startTime = performance.now();
            let lastUpdateTime = startTime;
            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error(\`Download test failed: \${response.status}\`);
            if (!response.body) throw new Error('ReadableStream not supported.');
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                bytesReceived += value.length;
                const now = performance.now();
                if (now - lastUpdateTime > 250) {
                    const speedMbps = ((bytesReceived - lastBytesReceived) * 8) / ((now - lastUpdateTime) / 1000 * 1000 * 1000);
                    updateResult(dom.downloadResult, dom.downloadTag, speedMbps, 'Live');
                    addChartData(downloadChart, speedMbps);
                    lastUpdateTime = now; lastBytesReceived = bytesReceived;
                }
            }
            const finalSpeedMbps = (bytesReceived * 8) / ((performance.now() - startTime) / 1000 * 1000 * 1000);
            updateResult(dom.downloadResult, dom.downloadTag, finalSpeedMbps, 'Avg');
        }

        function testUpload() {
            return new Promise((resolve, reject) => {
                const uploadSize = getSelectedPayloadSize();
                const uploadData = new Blob([new Uint8Array(uploadSize)], { type: 'application/octet-stream' });
                const xhr = new XMLHttpRequest();
                xhr.open('POST', \`\${workerUrl}/upload\`, true);
                
                let startTime = 0, lastTime = 0, lastLoaded = 0;
                xhr.upload.onprogress = (event) => {
                    const now = performance.now();
                    if (startTime === 0) { startTime = now; lastTime = now; }
                    if (event.lengthComputable) {
                        const timeDiff = (now - lastTime) / 1000;
                        if (timeDiff > 0.25) { 
                            const speedMbps = ((event.loaded - lastLoaded) * 8) / (timeDiff * 1000 * 1000);
                            updateResult(dom.uploadResult, dom.uploadTag, speedMbps, 'Live');
                            addChartData(uploadChart, speedMbps);
                            lastTime = now; lastLoaded = event.loaded;
                        }
                    }
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const duration = (performance.now() - startTime) / 1000;
                        const finalSpeedMbps = (uploadSize * 8) / (duration * 1000 * 1000);
                        updateResult(dom.uploadResult, dom.uploadTag, finalSpeedMbps, 'Avg');
                        resolve();
                    } else { reject(new Error(\`Upload test failed: \${xhr.status}\`)); }
                };
                xhr.onerror = () => reject(new Error('Upload failed due to network error.'));
                xhr.send(uploadData);
            });
        }
    </script>
</body>
</html>
`;
// --- END: Frontend HTML ---


// Define CORS headers to be used in API responses.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// --- START: Worker Logic ---
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS pre-flight requests for the API.
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Router
    switch (url.pathname) {
      // Serve the HTML for the root path.
      case '/':
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8',
          },
        });

      // API endpoints
      case '/ping':
        return new Response(null, { status: 204, headers: corsHeaders });

      case '/download':
        return handleDownload(request);

      case '/upload':
        return handleUpload(request);

      // Handle not found.
      default:
        return new Response('Not Found', {
          status: 404,
          headers: corsHeaders,
        });
    }
  },
};

// --- API Handler Functions ---

function handleDownload(request) {
  const url = new URL(request.url);
  const requestedSize = parseInt(url.searchParams.get('size') || '25000000', 10);
  const size = Math.min(requestedSize, 100 * 1024 * 1024); // Cap at 100MB
  let bytesSent = 0;
  const chunkSize = 16 * 1024; // 16KB
  const chunk = new Uint8Array(chunkSize).fill('a'.charCodeAt(0));

  const stream = new ReadableStream({
    pull(controller) {
      if (bytesSent < size) {
        controller.enqueue(chunk);
        bytesSent += chunk.length;
      } else {
        controller.close();
      }
    },
  });

  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/octet-stream',
    'Content-Length': size.toString(),
  };

  return new Response(stream, { headers });
}

async function handleUpload(request) {
  try {
    await request.arrayBuffer();
  } catch (e) {
    return new Response('Upload failed', { status: 400, headers: corsHeaders });
  }
  return new Response('OK', { headers: corsHeaders });
}
