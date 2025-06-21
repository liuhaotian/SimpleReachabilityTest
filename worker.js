/**
 * Cloudflare Worker for a Network Diagnostic Tool.
 * This single file serves both the frontend UI and the backend API.
 * It includes a Speed Test (ping, download, upload) and a Reachability Test (DNS).
 *
 * API Routes:
 * - /: Serves the main HTML user interface.
 * - /ip: Returns the client's IP address, country, and city.
 * - /ping: Responds with a minimal payload to measure latency.
 * - /download: Streams a configurable amount of random data.
 * - /upload: Accepts and discards POST data to measure upload speed.
 */

// --- START: Frontend HTML ---
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Network Diagnostic Tool</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            min-height: 100vh;
            min-height: 100dvh;
        }
        #startButton:disabled { cursor: not-allowed; opacity: 0.6; }
        .chart-container { 
            display: none;
            height: 150px;
            position: relative;
        }
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
        }
        .control-group input:disabled + label {
             cursor: not-allowed;
             opacity: 0.5;
        }
    </style>
</head>
<body class="bg-gray-100 text-gray-800 flex items-center justify-center p-2">

    <div class="w-full max-w-4xl mx-auto p-4 md:p-6 bg-white rounded-2xl shadow-lg">
        <header class="text-center mb-6">
            <h1 class="text-2xl md:text-3xl font-bold text-gray-900">Network Diagnostic Tool</h1>
            <div id="userInfo" class="text-xs text-gray-400 mt-2"></div>
        </header>

        <main class="space-y-6">
            <!-- Test Type Selector -->
            <div class="control-group flex flex-wrap justify-center gap-2">
                <input type="radio" id="typeSpeed" name="appType" value="speed" class="sr-only" checked>
                <label for="typeSpeed">Speed Test</label>
                <input type="radio" id="typeReachability" name="appType" value="reachability" class="sr-only">
                <label for="typeReachability">Reachability</label>
            </div>

            <!-- Speed Test Section -->
            <div id="speedTestSection" class="space-y-6">
                <div class="grid grid-cols-3 gap-2 md:gap-4 text-center">
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
                <div id="speedTestControls" class="space-y-4">
                    <div class="control-group flex flex-wrap justify-center gap-2">
                        <input type="radio" id="testFull" name="speedTestType" value="full" class="sr-only" checked>
                        <label for="testFull">Full Test</label>
                        <input type="radio" id="testDownload" name="speedTestType" value="download" class="sr-only">
                        <label for="testDownload">Download</label>
                        <input type="radio" id="testUpload" name="speedTestType" value="upload" class="sr-only">
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
            </div>

            <!-- Reachability Test Section -->
            <div id="reachabilityTestSection" class="hidden space-y-6">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain</th>
                                <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cloudflare DNS</th>
                                <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Google DNS</th>
                                <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">HTTP Ping (Avg)</th>
                            </tr>
                        </thead>
                        <tbody id="reachabilityResultsBody" class="bg-white divide-y divide-gray-200"></tbody>
                    </table>
                </div>
            </div>

            <!-- Start Button -->
            <div class="text-center pt-2">
                <button id="startButton" class="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300">
                    Start Test
                </button>
            </div>
        </main>
    </div>

    <script>
        const workerUrl = '';
        
        const dom = {
            startButton: document.getElementById('startButton'),
            appTypeRadios: document.querySelectorAll('input[name="appType"]'),
            speedTestSection: document.getElementById('speedTestSection'),
            reachabilityTestSection: document.getElementById('reachabilityTestSection'),
            userInfo: document.getElementById('userInfo'),
            
            // Speed Test elements
            pingResult: document.getElementById('pingResult'),
            downloadResult: document.getElementById('downloadResult'),
            uploadResult: document.getElementById('uploadResult'),
            downloadTag: document.getElementById('downloadTag'),
            uploadTag: document.getElementById('uploadTag'),
            downloadChartContainer: document.getElementById('downloadChartContainer'),
            uploadChartContainer: document.getElementById('uploadChartContainer'),
            speedTestControls: document.querySelectorAll('#speedTestControls input'),

            // Reachability elements
            reachabilityResultsBody: document.getElementById('reachabilityResultsBody'),
        };
        
        let downloadChart, uploadChart;
        
        const getSelectedPayloadSize = () => parseInt(document.querySelector('input[name="payloadSize"]:checked').value, 10);
        const getSelectedSpeedTestType = () => document.querySelector('input[name="speedTestType"]:checked').value;
        const getSelectedAppType = () => document.querySelector('input[name="appType"]:checked').value;

        // --- UI Switching Logic ---
        dom.appTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const appType = getSelectedAppType();
                dom.speedTestSection.style.display = appType === 'speed' ? 'block' : 'none';
                dom.reachabilityTestSection.style.display = appType === 'reachability' ? 'block' : 'none';
            });
        });

        // --- Generic Functions ---
        function setControlsState(disabled) {
            dom.startButton.disabled = disabled;
            dom.appTypeRadios.forEach(radio => radio.disabled = disabled);
            dom.speedTestControls.forEach(input => input.disabled = disabled);
            dom.startButton.textContent = disabled ? 'Testing...' : 'Start Test';
        }

        // --- Speed Test Functions ---
        function createChart(ctx, label) {
            return new Chart(ctx, {
                type: 'line', data: { labels: [], datasets: [{ label: label, data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, borderWidth: 2, tension: 0.4, pointRadius: 0 }] },
                options: { scales: { x: { display: false }, y: { beginAtZero: true, ticks: { callback: (v) => v + ' ' } } }, plugins: { legend: { display: false } }, animation: { duration: 200 }, maintainAspectRatio: false }
            });
        }
        function resetSpeedTestUI() {
            if (downloadChart) downloadChart.destroy();
            if (uploadChart) uploadChart.destroy();
            downloadChart = createChart(document.getElementById('downloadChart').getContext('2d'), 'Download');
            uploadChart = createChart(document.getElementById('uploadChart').getContext('2d'), 'Upload');
            dom.pingResult.textContent = '-';
            updateSpeedResult(dom.downloadResult, dom.downloadTag, '-');
            updateSpeedResult(dom.uploadResult, dom.uploadTag, '-');
        }
        function updateSpeedResult(element, tagElement, value, type = '') {
            if (value === '-') { element.textContent = '-'; tagElement.textContent = ''; return; }
            element.textContent = value.toFixed(2);
            tagElement.textContent = type ? type + ' ' : '';
        }
        function addChartData(chart, data) { chart.data.labels.push(''); chart.data.datasets[0].data.push(data); chart.update(); }
        async function testPing() {
            const pings = [];
            for (let i = 0; i < 5; i++) {
                const startTime = performance.now();
                try {
                    await fetch(\`/ping?nocache=\${Date.now()}\`);
                    pings.push(performance.now() - startTime);
                } catch (e) { console.warn('Ping request failed', e); }
                await new Promise(r => setTimeout(r, 100));
            }
            if (pings.length === 0) throw new Error("Ping test failed.");
            dom.pingResult.textContent = Math.min(...pings).toFixed(0);
        }
        async function testDownload() {
            const payloadSize = getSelectedPayloadSize();
            let bytesReceived = 0, lastBytesReceived = 0;
            const startTime = performance.now();
            let lastUpdateTime = startTime;
            const response = await fetch(\`/download?size=\${payloadSize}\`);
            if (!response.ok) throw new Error(\`Download failed: \${response.status}\`);
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                bytesReceived += value.length;
                const now = performance.now();
                if (now - lastUpdateTime > 250) {
                    const timeDiffSeconds = (now - lastUpdateTime) / 1000;
                    const bytesDiff = bytesReceived - lastBytesReceived;
                    const speedMbps = (bytesDiff * 8) / (timeDiffSeconds * 1000000);
                    updateSpeedResult(dom.downloadResult, dom.downloadTag, speedMbps, 'Live');
                    addChartData(downloadChart, speedMbps);
                    lastUpdateTime = now; lastBytesReceived = bytesReceived;
                }
            }
            const durationSeconds = (performance.now() - startTime) / 1000;
            const finalSpeedMbps = (bytesReceived * 8) / (durationSeconds * 1000000);
            updateSpeedResult(dom.downloadResult, dom.downloadTag, finalSpeedMbps, 'Avg');
        }
        function testUpload() {
            return new Promise((resolve, reject) => {
                const uploadSize = getSelectedPayloadSize();
                const uploadData = new Blob([new Uint8Array(uploadSize)], { type: 'application/octet-stream' });
                const xhr = new XMLHttpRequest();
                xhr.open('POST', \`/upload\`, true);
                let startTime = 0, lastTime = 0, lastLoaded = 0;
                xhr.upload.onprogress = (event) => {
                    const now = performance.now();
                    if (startTime === 0) { startTime = now; lastTime = now; }
                    if (event.lengthComputable) {
                        const timeDiff = (now - lastTime) / 1000;
                        if (timeDiff > 0.25) { 
                            const speedMbps = ((event.loaded - lastLoaded) * 8) / (timeDiff * 1000000);
                            updateSpeedResult(dom.uploadResult, dom.uploadTag, speedMbps, 'Live');
                            addChartData(uploadChart, speedMbps);
                            lastTime = now; lastLoaded = event.loaded;
                        }
                    }
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const durationSeconds = (performance.now() - startTime) / 1000;
                        const finalSpeedMbps = (uploadSize * 8) / (durationSeconds * 1000000);
                        updateSpeedResult(dom.uploadResult, dom.uploadTag, finalSpeedMbps, 'Avg');
                        resolve();
                    } else { reject(new Error(\`Upload failed: \${xhr.status}\`)); }
                };
                xhr.onerror = () => reject(new Error('Upload network error.'));
                xhr.send(uploadData);
            });
        }
        
        // --- Reachability Test Functions ---
        const DOH_PROVIDERS = {
            cloudflare: 'https://cloudflare-dns.com/dns-query',
            google: 'https://dns.google/resolve',
        };
        const PING_TARGETS = {
            'google.com': 'https://www.google.com/gen_204',
            'youtube.com': 'https://www.youtube.com/generate_204',
            'facebook.com': 'https://www.facebook.com/images/blank.gif',
            'default': (domain) => \`https://www.\${domain}/favicon.ico\`
        }

        async function resolveDoh(domain, provider) {
            const url = \`\${DOH_PROVIDERS[provider]}?name=\${domain}&type=A\`;
            const headers = (provider === 'cloudflare') ? { 'accept': 'application/dns-json' } : {};
            const startTime = performance.now();
            try {
                const res = await fetch(url, { headers });
                if (!res.ok) return { ip: 'Error', latency: 'N/A' };
                const data = await res.json();
                return { 
                    ip: data.Answer?.[0]?.data || 'N/A',
                    latency: (performance.now() - startTime).toFixed(0) 
                };
            } catch { return { ip: 'Error', latency: 'N/A' }; }
        }

        async function testHttpLatency(domain) {
            const PING_COUNT = 3;
            const latencies = [];
            const targetUrl = PING_TARGETS[domain] || PING_TARGETS['default'](domain);

            for (let i = 0; i < PING_COUNT; i++) {
                const url = \`\${targetUrl}?t=\${Date.now()}+\${Math.random()}\`;
                const startTime = performance.now();
                try {
                    await fetch(url, { mode: 'no-cors', cache: 'no-store' });
                    latencies.push(performance.now() - startTime);
                } catch (e) {
                    // This error is expected for no-cors, but if fetch itself fails, we skip.
                }
                if (i < PING_COUNT - 1) {
                    await new Promise(r => setTimeout(r, 200)); // Small delay between pings
                }
            }

            if (latencies.length === 0) return 'Error';
            
            const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            return avgLatency.toFixed(0);
        }
        
        async function runReachabilityTest() {
            dom.reachabilityResultsBody.innerHTML = '';
            const domains = [
                // Global & US
                'google.com',
                'youtube.com',
                'facebook.com',
                'amazon.com',
                'wikipedia.org',
                // China & Global
                'baidu.com',
                'qq.com',
                'taobao.com',
                'bilibili.com',
                'tiktok.com'
            ];
            
            for (const domain of domains) {
                const row = document.createElement('tr');
                row.innerHTML = \`
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">\${domain}</td>
                    <td class="px-4 py-3 text-center text-sm" id="cf-\${domain}">…</td>
                    <td class="px-4 py-3 text-center text-sm" id="gg-\${domain}">…</td>
                    <td class="px-4 py-3 text-center text-sm" id="ping-\${domain}">…</td>
                \`;
                dom.reachabilityResultsBody.appendChild(row);

                // Run each test individually and update UI as it completes for resilience
                resolveDoh(domain, 'cloudflare').then(cf => {
                    document.getElementById(\`cf-\${domain}\`).innerHTML = \`\${cf.ip}<br><span class="text-xs text-gray-500">\${cf.latency} ms</span>\`;
                });
                
                resolveDoh(domain, 'google').then(gg => {
                    document.getElementById(\`gg-\${domain}\`).innerHTML = \`\${gg.ip}<br><span class="text-xs text-gray-500">\${gg.latency} ms</span>\`;
                });
                
                testHttpLatency(domain).then(ping => {
                    document.getElementById(\`ping-\${domain}\`).textContent = (ping !== 'Error') ? \`\${ping} ms\` : 'Error';
                });
            }
        }
        
        function countryCodeToEmoji(countryCode) {
            if (!countryCode || countryCode.length !== 2) {
                return '';
            }
            // Formula to convert a two-letter country code to its regional indicator symbols (emojis)
            const codePoints = countryCode
                .toUpperCase()
                .split('')
                .map(char => 127397 + char.charCodeAt());
            return String.fromCodePoint(...codePoints);
        }

        async function showUserInfo() {
            try {
                const response = await fetch('/ip');
                if (!response.ok) throw new Error('Failed to fetch IP info');
                const data = await response.json();
                
                const userInfoParts = [];
                if (data.ip && data.ip !== 'N/A') userInfoParts.push(\`Your IP: \${data.ip}\`);
                if (data.city && data.city !== 'N/A') userInfoParts.push(\`City: \${data.city}\`);
                if (data.country && data.country !== 'N/A') {
                    const flag = countryCodeToEmoji(data.country);
                    userInfoParts.push(\`Country: \${flag} \${data.country}\`);
                }

                dom.userInfo.textContent = userInfoParts.length > 0 ? userInfoParts.join(' | ') : 'Could not retrieve IP information.';

            } catch (e) {
                console.error("Failed to show user info:", e);
                dom.userInfo.textContent = 'Could not retrieve IP information.';
            }
        }

        // --- Main Event Listener ---
        dom.startButton.addEventListener('click', async () => {
            setControlsState(true);
            const appType = getSelectedAppType();
            try {
                if (appType === 'speed') {
                    const speedTestType = getSelectedSpeedTestType();
                    resetSpeedTestUI();
                    dom.downloadChartContainer.style.display = (speedTestType === 'full' || speedTestType === 'download') ? 'block' : 'none';
                    dom.uploadChartContainer.style.display = (speedTestType === 'full' || speedTestType === 'upload') ? 'block' : 'none';
                    if (speedTestType !== 'upload') await testPing(); // Ping for full and download tests
                    if (speedTestType === 'full' || speedTestType === 'download') await testDownload();
                    if (speedTestType === 'full' || speedTestType === 'upload') await testUpload();
                } else if (appType === 'reachability') {
                    await runReachabilityTest();
                }
                dom.startButton.textContent = 'Run Again';
            } catch (error) {
                console.error('Test failed:', error);
                dom.startButton.textContent = 'Try Again';
            } finally {
                setControlsState(false);
            }
        });
        
        // Initial setup on page load
        showUserInfo();
    </script>
</body>
</html>
`;
// --- END: Frontend HTML ---


// --- START: Worker Logic ---
export default {
    async fetch(request) {
        const url = new URL(request.url);

        switch (url.pathname) {
            case '/':
                return new Response(html, {
                    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
                });
            case '/ip':
                const ipInfo = {
                    ip: request.headers.get('cf-connecting-ip') || 'N/A',
                    country: request.cf ? request.cf.country : 'N/A',
                    city: request.cf ? request.cf.city : 'N/A',
                };
                return new Response(JSON.stringify(ipInfo), {
                    headers: { 'Content-Type': 'application/json' },
                });
            case '/ping':
                return new Response(null, { status: 204 });
            case '/download':
                return handleDownload(request);
            case '/upload':
                return handleUpload(request);
            default:
                return new Response('Not Found', { status: 404 });
        }
    },
};

function handleDownload(request) {
  const url = new URL(request.url);
  const requestedSize = parseInt(url.searchParams.get('size') || '25000000', 10);
  const size = Math.min(requestedSize, 100 * 1024 * 1024);
  let bytesSent = 0;
  const chunkSize = 16 * 1024;
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
  return new Response(stream, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': size.toString() }});
}

async function handleUpload(request) {
  try {
    await request.arrayBuffer();
    return new Response('OK');
  } catch (e) {
    return new Response('Upload failed', { status: 400 });
  }
}
