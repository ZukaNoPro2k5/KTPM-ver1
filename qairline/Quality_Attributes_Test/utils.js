/**
 * Shared Utilities for Quality Attribute Tests
 * 
 * Provides HTTP client, statistics calculation, and report generation utilities
 */

const http = require('http');
const https = require('https');

// Configuration
const CONFIG = {
    API_GATEWAY_URL: 'http://localhost:3006',
    SERVICES: {
        'user-service': 'http://localhost:3004',
        'flight-service': 'http://localhost:3002',
        'booking-service': 'http://localhost:3003',
        'offer-service': 'http://localhost:3005'
    },
    TIMEOUT: 30000, // 30 seconds
    HEALTH_TIMEOUT: 5000 // 5 seconds for health checks
};

// Test endpoints configuration
const ENDPOINTS = {
    // Guest endpoints (no auth required)
    guest: [
        { method: 'GET', path: '/api/Flights/GetAllFlights', name: 'Get All Flights' },
        { method: 'GET', path: '/api/Offers/GetAllOffers', name: 'Get All Offers' }
    ],
    // Auth endpoints
    auth: [
        { method: 'POST', path: '/api/auth/signin', name: 'Sign In', body: { email: 'test@test.com', password: 'password123' } },
        { method: 'POST', path: '/api/auth/signup', name: 'Sign Up', body: { name: 'Test User', username: 'testuser_' + Date.now(), email: `test_${Date.now()}@test.com`, password: 'password123' } }
    ],
    // Booking endpoints (require auth in real scenario)
    booking: [
        { method: 'POST', path: '/api/Bookings/BookFlights', name: 'Book Flight', body: { flightId: 1, userId: 1 } },
        { method: 'POST', path: '/api/Bookings/CancelBooking', name: 'Cancel Booking', body: { bookingId: 1 } },
        { method: 'POST', path: '/api/Flights/GetUserFlights', name: 'Get User Flights', body: { userID: 1 } }
    ],
    // Admin endpoints
    admin: [
        { method: 'GET', path: '/api/User/GetAllUser', name: 'Get All Users' },
        { method: 'POST', path: '/api/Bookings/ViewAndSummarize', name: 'View And Summarize', body: {} },
        { method: 'POST', path: '/api/Aircrafts/GetAll', name: 'Get All Aircrafts', body: {} },
        { method: 'POST', path: '/api/Offers/CreateOffer', name: 'Create Offer', body: { title: 'Test Offer', content: 'Test Content', userID: 1 } }
    ],
    // Health endpoints
    health: [
        { method: 'GET', path: '/health', name: 'API Gateway Health' }
    ]
};

/**
 * Make HTTP request and measure response time
 */
async function makeRequest(url, options = {}) {
    const startTime = process.hrtime.bigint();

    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;

        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            timeout: options.timeout || CONFIG.TIMEOUT
        };

        const req = client.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const endTime = process.hrtime.bigint();
                const responseTime = Number(endTime - startTime) / 1e6; // Convert to ms

                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data,
                    responseTime,
                    success: res.statusCode >= 200 && res.statusCode < 400
                });
            });
        });

        req.on('error', (err) => {
            const endTime = process.hrtime.bigint();
            const responseTime = Number(endTime - startTime) / 1e6;

            resolve({
                statusCode: 0,
                error: err.message,
                responseTime,
                success: false
            });
        });

        req.on('timeout', () => {
            req.destroy();
            const endTime = process.hrtime.bigint();
            const responseTime = Number(endTime - startTime) / 1e6;

            resolve({
                statusCode: 0,
                error: 'Request timeout',
                responseTime,
                success: false
            });
        });

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

/**
 * Calculate statistics from an array of numbers
 */
function calculateStats(values) {
    if (values.length === 0) {
        return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
        min: Math.round(sorted[0] * 100) / 100,
        max: Math.round(sorted[sorted.length - 1] * 100) / 100,
        avg: Math.round((sum / sorted.length) * 100) / 100,
        median: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
        p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
        p99: Math.round(sorted[Math.floor(sorted.length * 0.99)] * 100) / 100
    };
}

/**
 * Format table for console output
 */
function formatTable(headers, rows) {
    const colWidths = headers.map((h, i) => {
        const maxRowWidth = Math.max(...rows.map(r => String(r[i] || '').length));
        return Math.max(h.length, maxRowWidth) + 2;
    });

    let output = '\n';

    // Header
    output += '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |\n';
    output += '|' + colWidths.map(w => '-'.repeat(w + 2)).join('|') + '|\n';

    // Rows
    rows.forEach(row => {
        output += '| ' + row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join(' | ') + ' |\n';
    });

    return output;
}

/**
 * Run concurrent requests
 */
async function runConcurrent(fn, concurrency, count) {
    const results = [];
    const batches = Math.ceil(count / concurrency);

    for (let batch = 0; batch < batches; batch++) {
        const batchSize = Math.min(concurrency, count - batch * concurrency);
        const promises = [];

        for (let i = 0; i < batchSize; i++) {
            promises.push(fn());
        }

        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
    }

    return results;
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get traffic light assessment
 */
function getAssessment(value, thresholds) {
    if (value >= thresholds.good) return '✅';
    if (value >= thresholds.warning) return '⚠️';
    return '🔴';
}

/**
 * Generate timestamp
 */
function timestamp() {
    return new Date().toISOString();
}

/**
 * Log with timestamp
 */
function log(message) {
    console.log(`[${timestamp()}] ${message}`);
}

module.exports = {
    CONFIG,
    ENDPOINTS,
    makeRequest,
    calculateStats,
    formatTable,
    runConcurrent,
    sleep,
    getAssessment,
    timestamp,
    log
};
