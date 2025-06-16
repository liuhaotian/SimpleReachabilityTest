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
            /* Use a system font stack for maximum compatibility and performance */
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        .gauge-bg {
            fill: #e5e7eb; /* gray-200 */
        }
        .gauge-fg {
            fill: #3b82f6; /* blue-500 */
            transition: transform 0.3s ease-in-out;
            transform-origin: center bottom;
        }
        .gauge-text {
            font-size: 2.25rem;
            font-weight: 600;
            fill: #1f2937; /* gray-800 */
        }
        .unit-text {
            font-size: 1rem;
            font-weight: 500;
            fill: #4b5563; /* gray-600 */
        }
        #startButton {
            transition: all 0.2s ease-in-out;
        }
        #startButton:disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }
        .chart-container {
            display: none;
        }
    </style>
</head>
<body class="bg-gray-100 text-gray-800 flex items-center justify-center min-h-screen">

    <div class="w-full max-w-2xl mx-auto p-6 md:p-8 bg-white rounded-2xl shadow-lg">
        <header class="text-center mb-6">
            <h1 class="text-3xl font-bold text-gray-900">Cloudflare Worker Speed Test</h1>
            <p class="text-gray-500 mt-1">A lightweight, serverless application to measure your network performance.</p>
        </header>

        <main>
            <!-- Gauge Display -->
            <div class="mb-8">
                <svg viewBox="0 0 100 57" class="w-full max-w-xs mx-auto">
                    <path class="gauge-bg" d="M 5 50 A 45 45 0 0 1 95 50"></path>
                    <path class="gauge-fg" d="M 5 50 A 45 45 0 0 1 95 50" id="gauge-arc" style="transform: scaleX(0);"></path>
                    <text x="50" y="45" text-anchor="middle" class="gauge-text" id="gauge-value">0</text>
                    <text x="50" y="55" text-anchor="middle" class="unit-text" id="gauge-unit">Mbps</text>
                </svg>
            </div>
             <!-- Status Text -->
            <div class="text-center mb-8 h-6">
                <p id="statusText" class="text-lg text-gray-600 font-medium"></p>
            </div>


            <!-- Results Display -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-8">
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm font-medium text-gray-500">Ping</p>
                    <p class="text-2xl font-semibold" id="pingResult">-</p>
                    <p class="text-sm text-gray-400">ms</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm font-medium text-gray-500">Download</p>
                    <p class="text-2xl font-semibold" id="downloadResult">-</p>
                    <p class="text-sm text-gray-400">Mbps</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm font-medium text-gray-500">Upload</p>
                    <p class="text-2xl font-semibold" id="uploadResult">-</p>
                    <p class="text-sm text-gray-400">Mbps</p>
                </div>
            </div>

            <!-- Chart Display -->
            <div id="chartsContainer" class="space-y-4">
                 <div id="downloadChartContainer" class="chart-container">
                    <h3 class="text-center text-gray-600 font-medium mb-2">Download Trend (Mbps)</h3>
                    <canvas id="downloadChart"></canvas>
                </div>
                <div id="uploadChartContainer" class="chart-container">
                    <h3 class="text-center text-gray-600 font-medium mb-2">Upload Trend (Mbps)</h3>
                    <canvas id="uploadChart"></canvas>
                </div>
            </div>

            <!-- Start Button -->
            <div class="text-center mt-8">
                <button id="startButton" class="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transform hover:scale-105">
                    Start Test
                </button>
            </div>
        </main>
    </div>

    <script>
        // --- CONFIGURATION ---
        const workerUrl = ''; 
        
        // --- DOM ELEMENTS ---
        const startButton = document.getElementById('startButton');
        const statusText = document.getElementById('statusText');
        const pingResult = document.getElementById('pingResult');
        const downloadResult = document.getElementById('downloadResult');
        const uploadResult = document.getElementById('uploadResult');
        const gaugeValue = document.getElementById('gauge-value');
        const gaugeUnit = document.getElementById('gauge-unit');
        const gaugeArc = document.getElementById('gauge-arc');
        const downloadChartContainer = document.getElementById('downloadChartContainer');
        const uploadChartContainer = document.getElementById('uploadChartContainer');
        
        // --- CHART VARIABLES ---
        let downloadChart, uploadChart;

        // --- CHART LOGIC ---
        function createChart(ctx, label) {
            return new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: label,
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0
                    }]
                },
                options: {
                    scales: {
                        x: { display: false },
                        y: { 
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) { return value + ' Mbps' }
                            }
                        }
                    },
                    plugins: { legend: { display: false } },
                    animation: { duration: 200 }
                }
            });
        }
        
        function resetCharts() {
            if (downloadChart) downloadChart.destroy();
            if (uploadChart) uploadChart.destroy();
            downloadChart = createChart(document.getElementById('downloadChart').getContext('2d'), 'Download Speed');
            uploadChart = createChart(document.getElementById('uploadChart').getContext('2d'), 'Upload Speed');
            downloadChartContainer.style.display = 'none';
            uploadChartContainer.style.display = 'none';
        }

        function addChartData(chart, data) {
            chart.data.labels.push('');
            chart.data.datasets[0].data.push(data);
            chart.update();
        }

        // --- GAUGE LOGIC ---
        const MAX_GAUGE_SPEED = 1000; // Mbps
        function updateGauge(value, unit) {
            gaugeValue.textContent = value.toFixed(value < 10 ? 1 : 0);
            gaugeUnit.textContent = unit;
            const percentage = Math.min(value / MAX_GAUGE_SPEED, 1);
            gaugeArc.style.transform = \`scaleX(\${percentage})\`;
        }

        // --- TEST LOGIC ---
        startButton.addEventListener('click', async () => {
            startButton.disabled = true;
            startButton.textContent = 'Testing...';

            // Reset UI
            [pingResult, downloadResult, uploadResult].forEach(el => el.textContent = '-');
            statusText.classList.remove('text-red-500');
            updateGauge(0, 'Mbps');
            resetCharts();

            try {
                await testPing();
                await testDownload();
                await testUpload();
                statusText.textContent = 'Test complete!';
                startButton.textContent = 'Run Again';
            } catch (error) {
                console.error('Speed test failed:', error);
                statusText.textContent = \`Error: \${error.message}\`;
                statusText.classList.add('text-red-500');
                startButton.textContent = 'Try Again';
            } finally {
                startButton.disabled = false;
            }
        });

        async function testPing() {
            statusText.textContent = 'Testing ping...';
            updateGauge(0, 'ms');
            const pings = [];
            const pingCount = 5;
            for (let i = 0; i < pingCount; i++) {
                const startTime = performance.now();
                try {
                    await fetch(\`\${workerUrl}/ping?nocache=\${Date.now()}\`);
                    const endTime = performance.now();
                    pings.push(endTime - startTime);
                } catch (e) {
                    console.warn('Ping request failed', e);
                }
                await new Promise(r => setTimeout(r, 100));
            }
            if (pings.length === 0) {
                 throw new Error("Ping test failed. Check worker logs and CORS.");
            }
            const bestPing = Math.min(...pings);
            pingResult.textContent = bestPing.toFixed(0);
            updateGauge(bestPing, 'ms');
        }

        async function testDownload() {
            statusText.textContent = 'Testing download...';
            updateGauge(0, 'Mbps');
            downloadChartContainer.style.display = 'block';

            const downloadUrl = \`\${workerUrl}/download?size=25000000\`; 
            let bytesReceived = 0;
            const startTime = performance.now();
            let lastUpdateTime = startTime;
            let lastBytesReceived = 0;
            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error(\`Download test failed with status \${response.status}\`);
            if (!response.body) throw new Error('ReadableStream not supported by browser.');
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                bytesReceived += value.length;
                const now = performance.now();
                if (now - lastUpdateTime > 250) {
                    const durationSinceLast = (now - lastUpdateTime) / 1000;
                    const bytesSinceLast = bytesReceived - lastBytesReceived;
                    const speedMbps = (bytesSinceLast * 8) / (durationSinceLast * 1000 * 1000);
                    updateGauge(speedMbps, 'Mbps');
                    addChartData(downloadChart, speedMbps);
                    lastUpdateTime = now;
                    lastBytesReceived = bytesReceived;
                }
            }
            const totalDurationSeconds = (performance.now() - startTime) / 1000;
            const finalSpeedMbps = (bytesReceived * 8) / (totalDurationSeconds * 1000 * 1000);
            downloadResult.textContent = finalSpeedMbps.toFixed(2);
            updateGauge(finalSpeedMbps, 'Mbps');
        }

        function testUpload() {
            return new Promise((resolve, reject) => {
                statusText.textContent = 'Testing upload...';
                updateGauge(0, 'Mbps');
                uploadChartContainer.style.display = 'block';

                const uploadSize = 10 * 1024 * 1024; // 10MB
                const uploadData = new Blob([new Uint8Array(uploadSize)], { type: 'application/octet-stream' });
                const xhr = new XMLHttpRequest();
                xhr.open('POST', \`\${workerUrl}/upload\`, true);
                
                let startTime = 0;
                let lastTime = 0;
                let lastLoaded = 0;
                
                xhr.upload.onprogress = (event) => {
                    const now = performance.now();
                    if (startTime === 0) { // First progress event
                        startTime = now;
                        lastTime = now;
                    }

                    if (event.lengthComputable) {
                        const timeDiffSeconds = (now - lastTime) / 1000;
                        const bytesDiff = event.loaded - lastLoaded;
                        
                        // Update chart at regular intervals to get a smooth line
                        if (timeDiffSeconds > 0.25) { 
                            const speedMbps = (bytesDiff * 8) / (timeDiffSeconds * 1000 * 1000);
                            updateGauge(speedMbps, 'Mbps');
                            addChartData(uploadChart, speedMbps);
                            
                            lastTime = now;
                            lastLoaded = event.loaded;
                        }
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const now = performance.now();
                        // If onprogress didn't fire, startTime will be 0. Handle this case.
                        if(startTime === 0) startTime = now - 1; // Assume a tiny duration

                        const durationSeconds = (now - startTime) / 1000;
                        const finalSpeedMbps = (uploadSize * 8) / (durationSeconds * 1000 * 1000);
                        uploadResult.textContent = finalSpeedMbps.toFixed(2);
                        updateGauge(finalSpeedMbps, 'Mbps');
                        resolve();
                    } else {
                        reject(new Error(\`Upload test failed with status \${xhr.status}\`));
                    }
                };

                xhr.onerror = () => reject(new Error('Upload test failed due to a network error.'));
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
  const requestedSize = parseInt(url.searchParams.get('size') || '10000000', 10);
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
