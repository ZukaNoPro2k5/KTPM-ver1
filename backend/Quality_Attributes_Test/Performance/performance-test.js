/**
 * QAirLine API Performance Test Script - Simplified Version
 * Measures Response Time for all backend endpoints
 */

const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001';

// Configuration
const ITERATIONS = 30;  // requests per endpoint for baseline
const VUS_NORMAL = 10;  // virtual users for normal load
const ITERATIONS_NORMAL = 50;

// Metrics storage
const metrics = {};
const allScenarioResults = {};

function recordMetric(endpoint, duration, isError) {
    if (!metrics[endpoint]) {
        metrics[endpoint] = { times: [], errors: 0, requests: 0 };
    }
    metrics[endpoint].times.push(duration);
    metrics[endpoint].requests++;
    if (isError) metrics[endpoint].errors++;
}

function clearMetrics() {
    Object.keys(metrics).forEach(k => delete metrics[k]);
}

// HTTP helper
function makeRequest(method, path, body = null) {
    return new Promise((resolve) => {
        const url = new URL(BASE_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        };

        const startTime = performance.now();

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = performance.now() - startTime;
                let parsedData = null;
                try { parsedData = data ? JSON.parse(data) : null; } catch { }
                resolve({
                    statusCode: res.statusCode,
                    duration,
                    data: parsedData,
                    isError: res.statusCode >= 400
                });
            });
        });

        req.on('error', () => {
            resolve({
                statusCode: 0,
                duration: performance.now() - startTime,
                isError: true
            });
        });

        req.setTimeout(30000, () => { req.destroy(); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Statistics
function calculateStats(times) {
    if (!times || times.length === 0) return null;
    const sorted = [...times].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const len = sorted.length;
    return {
        count: len,
        min: Math.round(sorted[0] * 100) / 100,
        max: Math.round(sorted[len - 1] * 100) / 100,
        avg: Math.round((sum / len) * 100) / 100,
        median: Math.round(sorted[Math.floor(len / 2)] * 100) / 100,
        p90: Math.round(sorted[Math.floor(len * 0.9)] * 100) / 100,
        p95: Math.round(sorted[Math.floor(len * 0.95)] * 100) / 100
    };
}

// Print results table
function printResults(scenarioName) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📈 RESULTS: ${scenarioName}`);
    console.log('═'.repeat(60));

    console.log('┌────────────────────────────────────────┬──────────┬────────┬─────────┬─────────┬─────────┬─────────┬─────────┐');
    console.log('│ Endpoint                               │ Requests │ Errors │ min(ms) │ avg(ms) │ med(ms) │ p95(ms) │ max(ms) │');
    console.log('├────────────────────────────────────────┼──────────┼────────┼─────────┼─────────┼─────────┼─────────┼─────────┤');

    for (const [endpoint, data] of Object.entries(metrics).sort((a, b) => a[0].localeCompare(b[0]))) {
        const stats = calculateStats(data.times);
        if (!stats) continue;
        const ep = endpoint.padEnd(38).substring(0, 38);
        console.log(`│ ${ep} │ ${String(data.requests).padStart(8)} │ ${String(data.errors).padStart(6)} │ ${String(stats.min).padStart(7)} │ ${String(stats.avg).padStart(7)} │ ${String(stats.median).padStart(7)} │ ${String(stats.p95).padStart(7)} │ ${String(stats.max).padStart(7)} │`);
    }
    console.log('└────────────────────────────────────────┴──────────┴────────┴─────────┴─────────┴─────────┴─────────┴─────────┘');
}

// Static endpoints that don't need dynamic data
const GUEST_ENDPOINTS = [
    { method: 'GET', path: '/api/Flights/GetAllFlights' },
    { method: 'GET', path: '/api/Offers/GetAllOffers' },
    { method: 'GET', path: '/api/User/GetAllUser' }
];

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   QAirLine API Performance Test - Response Time Analysis   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // ========== PREPARE TEST DATA ==========
    console.log('📋 Preparing test data...');

    // Get existing flights
    const flightsRes = await makeRequest('GET', '/api/Flights/GetAllFlights');
    const flights = Array.isArray(flightsRes.data) ? flightsRes.data : [];
    const flightIds = flights.map(f => f.FlightID);
    const aircraftModels = [...new Set(flights.map(f => f.AircraftModel))];
    console.log(`   ✓ Found ${flightIds.length} flights, ${aircraftModels.length} aircraft models`);

    // Create test user
    const testEmail = `perf${Date.now()}@test.com`;
    const signup1 = await makeRequest('POST', '/api/auth/signup', {
        name: 'PerfTest', username: `user${Date.now()}`, email: testEmail, password: 'Test123!', role: 'Customer'
    });
    let userID = null;
    if (signup1.data?.token) {
        userID = JSON.parse(Buffer.from(signup1.data.token.split('.')[1], 'base64').toString()).userid;
        console.log(`   ✓ Created test user ID: ${userID}`);
    }

    // Create admin user
    const adminEmail = `admin${Date.now()}@test.com`;
    const signup2 = await makeRequest('POST', '/api/auth/signup', {
        name: 'AdminTest', username: `admin${Date.now()}`, email: adminEmail, password: 'Admin123!', role: 'Admin'
    });
    let adminID = null;
    if (signup2.data?.token) {
        adminID = JSON.parse(Buffer.from(signup2.data.token.split('.')[1], 'base64').toString()).userid;
        console.log(`   ✓ Created admin user ID: ${adminID}`);
    }

    // Create a booking
    let bookingID = null;
    if (userID && flightIds.length > 0) {
        const bookRes = await makeRequest('POST', '/api/Bookings/BookFlights', { UserID: userID, FlightID: flightIds[0] });
        bookingID = bookRes.data?.bookingID;
        if (bookingID) console.log(`   ✓ Created booking ID: ${bookingID}`);
    }

    console.log('   ✓ Test data ready\n');

    // ========== WARMUP ==========
    console.log('🔥 Warming up...');
    for (let i = 0; i < 5; i++) {
        await makeRequest('GET', '/api/Flights/GetAllFlights');
        await makeRequest('GET', '/api/Offers/GetAllOffers');
    }
    console.log('   ✓ Warmup complete\n');

    // ========== SCENARIO 1: BASELINE (Sequential) ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SCENARIO 1: BASELINE (1 VU, Sequential, 30 iterations)');
    console.log('═══════════════════════════════════════════════════════════');

    for (let i = 0; i < ITERATIONS; i++) {
        // Guest endpoints
        for (const ep of GUEST_ENDPOINTS) {
            const r = await makeRequest(ep.method, ep.path);
            recordMetric(`${ep.method} ${ep.path}`, r.duration, r.isError);
        }

        // Auth endpoints
        const signinRes = await makeRequest('POST', '/api/auth/signin', { email: testEmail, password: 'Test123!' });
        recordMetric('POST /api/auth/signin', signinRes.duration, signinRes.isError);

        const signupRes = await makeRequest('POST', '/api/auth/signup', {
            name: 'T', username: `u${Date.now()}${i}`, email: `e${Date.now()}${i}@t.com`, password: 'P123!', role: 'Customer'
        });
        recordMetric('POST /api/auth/signup', signupRes.duration, signupRes.isError);

        // Booking endpoints (if we have data)
        if (userID && flightIds.length > 0) {
            const flightId = flightIds[i % flightIds.length];

            const searchRes = await makeRequest('POST', '/api/Flights/SearchFlight', { FlightID: flightId });
            recordMetric('POST /api/Flights/SearchFlight', searchRes.duration, searchRes.isError);

            const userFlightsRes = await makeRequest('POST', '/api/Flights/GetUserFlights', { userID });
            recordMetric('POST /api/Flights/GetUserFlights', userFlightsRes.duration, userFlightsRes.isError);
        }

        if ((i + 1) % 10 === 0) console.log(`   Progress: ${i + 1}/${ITERATIONS}`);
    }

    printResults('Scenario 1: BASELINE');
    allScenarioResults.baseline = JSON.parse(JSON.stringify(metrics));
    clearMetrics();

    // ========== SCENARIO 2: NORMAL LOAD (Concurrent VUs) ==========
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`📊 SCENARIO 2: NORMAL LOAD (${VUS_NORMAL} VUs, Mixed Traffic)`);
    console.log('═══════════════════════════════════════════════════════════');

    const vuPromises = [];
    for (let vu = 0; vu < VUS_NORMAL; vu++) {
        vuPromises.push((async () => {
            for (let i = 0; i < ITERATIONS_NORMAL / VUS_NORMAL; i++) {
                // 40% GetAllFlights
                const r1 = await makeRequest('GET', '/api/Flights/GetAllFlights');
                recordMetric('GET /api/Flights/GetAllFlights', r1.duration, r1.isError);

                // 30% GetAllOffers
                const r2 = await makeRequest('GET', '/api/Offers/GetAllOffers');
                recordMetric('GET /api/Offers/GetAllOffers', r2.duration, r2.isError);

                // 20% SearchFlight
                if (flightIds.length > 0) {
                    const r3 = await makeRequest('POST', '/api/Flights/SearchFlight', { FlightID: flightIds[0] });
                    recordMetric('POST /api/Flights/SearchFlight', r3.duration, r3.isError);
                }

                // 10% Signin
                const r4 = await makeRequest('POST', '/api/auth/signin', { email: testEmail, password: 'Test123!' });
                recordMetric('POST /api/auth/signin', r4.duration, r4.isError);
            }
        })());
    }
    await Promise.all(vuPromises);

    printResults('Scenario 2: NORMAL LOAD');
    allScenarioResults.normalLoad = JSON.parse(JSON.stringify(metrics));
    clearMetrics();

    // ========== SCENARIO 3: ADMIN-HEAVY ==========
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 SCENARIO 3: ADMIN-HEAVY (Complex Queries)');
    console.log('═══════════════════════════════════════════════════════════');

    if (adminID) {
        for (let i = 0; i < 20; i++) {
            // GetAll Aircrafts
            const r1 = await makeRequest('POST', '/api/Aircrafts/GetAll', { userID: adminID });
            recordMetric('POST /api/Aircrafts/GetAll', r1.duration, r1.isError);

            // ViewAndSummarize bookings
            const r2 = await makeRequest('POST', '/api/Bookings/ViewAndSummarize', { userID: adminID });
            recordMetric('POST /api/Bookings/ViewAndSummarize', r2.duration, r2.isError);

            // GetAllUsers
            const r3 = await makeRequest('GET', '/api/User/GetAllUser');
            recordMetric('GET /api/User/GetAllUser', r3.duration, r3.isError);

            // Add Flight
            const r4 = await makeRequest('POST', '/api/Flights/Add', {
                model: aircraftModels[0] || 'Boeing 737',
                departure: `City${i}A`,
                arrival: `City${i}B`,
                departureTime: new Date(Date.now() + 86400000 + i * 3600000).toISOString(),
                arrivalTime: new Date(Date.now() + 90000000 + i * 3600000).toISOString(),
                price: 199.99,
                seatsAvailable: 100,
                status: 'on-time',
                userID: adminID
            });
            recordMetric('POST /api/Flights/Add', r4.duration, r4.isError);

            if ((i + 1) % 5 === 0) console.log(`   Progress: ${i + 1}/20`);
        }

        printResults('Scenario 3: ADMIN-HEAVY');
        allScenarioResults.adminHeavy = JSON.parse(JSON.stringify(metrics));
    } else {
        console.log('   ⚠ Skipped - no admin user available');
    }

    // Export results
    fs.writeFileSync('performance-results.json', JSON.stringify(allScenarioResults, null, 2));
    console.log('\n📁 Full results saved to: performance-results.json');
    console.log('\n✅ Performance test complete!\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
