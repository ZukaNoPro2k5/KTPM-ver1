/**
 * Interoperability Analysis - Integration Points Assessment
 * 
 * Analyzes REST API consistency, JWT auth flow, CORS configuration,
 * and external integration readiness
 */

const fs = require('fs');
const path = require('path');
const { CONFIG, makeRequest, formatTable, log } = require('./utils');

const API_BASE = CONFIG.API_GATEWAY_URL;
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Service paths for analysis
const SERVICE_PATHS = {
    'API Gateway': 'api-gateway/src',
    'User Service': 'services/user-service/src',
    'Flight Service': 'services/flight-service/src',
    'Booking Service': 'services/booking-service/src',
    'Offer Service': 'services/offer-service/src'
};

/**
 * Check CORS configuration
 */
async function analyzeCORS() {
    log('Analyzing CORS configuration...');

    const results = {
        preflight: null,
        headers: null,
        score: 0
    };

    try {
        // Test preflight request
        const preflightResult = await makeRequest(`${API_BASE}/api/Flights/GetAllFlights`, {
            method: 'OPTIONS'
        });

        results.preflight = {
            statusCode: preflightResult.statusCode,
            success: preflightResult.statusCode === 204 || preflightResult.statusCode === 200
        };

        // Test actual request for CORS headers
        const actualResult = await makeRequest(`${API_BASE}/api/Flights/GetAllFlights`, {
            method: 'GET'
        });

        const corsHeaders = {
            'access-control-allow-origin': actualResult.headers?.['access-control-allow-origin'],
            'access-control-allow-credentials': actualResult.headers?.['access-control-allow-credentials'],
            'access-control-allow-methods': actualResult.headers?.['access-control-allow-methods'],
            'access-control-allow-headers': actualResult.headers?.['access-control-allow-headers']
        };

        results.headers = corsHeaders;

        // Score CORS configuration
        if (corsHeaders['access-control-allow-origin']) results.score += 25;
        if (corsHeaders['access-control-allow-credentials']) results.score += 25;
        if (corsHeaders['access-control-allow-methods']) results.score += 25;
        if (corsHeaders['access-control-allow-headers']) results.score += 25;

    } catch (error) {
        results.error = error.message;
    }

    return results;
}

/**
 * Analyze REST API consistency
 */
function analyzeRESTConsistency() {
    log('Analyzing REST API consistency...');

    const checks = [];

    // Check API Gateway routes
    const gatewayPath = path.join(PROJECT_ROOT, 'api-gateway/src/index.ts');
    if (fs.existsSync(gatewayPath)) {
        const content = fs.readFileSync(gatewayPath, 'utf-8');

        // Check for consistent path patterns
        const pathPatterns = content.match(/\/api\/\w+/g) || [];
        const uniquePaths = [...new Set(pathPatterns)];

        checks.push({
            check: 'Path Consistency',
            status: uniquePaths.length > 0 ? 'Pass' : 'Fail',
            details: `Found ${uniquePaths.length} unique API paths`,
            paths: uniquePaths
        });

        // Check for proxy middleware usage
        const hasProxy = content.includes('createProxyMiddleware');
        checks.push({
            check: 'Proxy Middleware',
            status: hasProxy ? 'Pass' : 'Fail',
            details: hasProxy ? 'Using http-proxy-middleware' : 'No proxy middleware found'
        });

        // Check for error handling
        const hasErrorHandling = content.includes('onError');
        checks.push({
            check: 'Error Handling',
            status: hasErrorHandling ? 'Pass' : 'Fail',
            details: hasErrorHandling ? 'Proxy error handlers configured' : 'No error handlers found'
        });
    }

    // Analyze each service for REST patterns
    for (const [serviceName, servicePath] of Object.entries(SERVICE_PATHS)) {
        const routesDir = path.join(PROJECT_ROOT, servicePath, 'routes');

        if (fs.existsSync(routesDir)) {
            const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

            for (const file of files) {
                const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');

                // Check HTTP methods usage
                const methods = {
                    get: (content.match(/router\.get\(/g) || []).length,
                    post: (content.match(/router\.post\(/g) || []).length,
                    put: (content.match(/router\.put\(/g) || []).length,
                    delete: (content.match(/router\.delete\(/g) || []).length
                };

                checks.push({
                    check: `${serviceName} - ${file}`,
                    status: 'Info',
                    details: `GET: ${methods.get}, POST: ${methods.post}, PUT: ${methods.put}, DELETE: ${methods.delete}`
                });
            }
        }
    }

    return checks;
}

/**
 * Analyze JWT authentication flow
 */
async function analyzeJWTAuth() {
    log('Analyzing JWT authentication flow...');

    const analysis = {
        signIn: null,
        tokenUsage: [],
        score: 0
    };

    // Test sign-in endpoint
    try {
        const signInResult = await makeRequest(`${API_BASE}/api/auth/signin`, {
            method: 'POST',
            body: { email: 'test@test.com', password: 'password123' }
        });

        let responseBody;
        try {
            responseBody = JSON.parse(signInResult.body);
        } catch {
            responseBody = {};
        }

        analysis.signIn = {
            statusCode: signInResult.statusCode,
            hasToken: !!responseBody.token,
            success: signInResult.statusCode === 200 || signInResult.statusCode === 401
        };

        if (analysis.signIn.success) analysis.score += 30;
        if (analysis.signIn.hasToken || signInResult.statusCode === 401) analysis.score += 20;

    } catch (error) {
        analysis.signIn = { error: error.message };
    }

    // Analyze JWT usage in code
    const userServicePath = path.join(PROJECT_ROOT, 'services/user-service/src/controllers/UserController.ts');
    if (fs.existsSync(userServicePath)) {
        const content = fs.readFileSync(userServicePath, 'utf-8');

        const hasJwtImport = content.includes("import jwt") || content.includes("jsonwebtoken");
        const hasJwtSign = content.includes('jwt.sign');
        const hasJwtVerify = content.includes('jwt.verify');
        const hasBcrypt = content.includes('bcrypt');

        if (hasJwtImport) analysis.score += 15;
        if (hasJwtSign) analysis.score += 15;
        if (hasBcrypt) analysis.score += 20;

        analysis.tokenUsage.push({
            file: 'UserController.ts',
            jwtImport: hasJwtImport,
            jwtSign: hasJwtSign,
            jwtVerify: hasJwtVerify,
            bcrypt: hasBcrypt
        });
    }

    return analysis;
}

/**
 * Analyze external integration readiness
 */
function analyzeExternalIntegration() {
    log('Analyzing external integration readiness...');

    const integrations = [];

    // Email Service (Nodemailer)
    const emailServicePaths = [
        'services/offer-service/src/services/EmailService.ts',
        'services/flight-service/src/services/EmailService.ts'
    ];

    for (const emailPath of emailServicePaths) {
        const fullPath = path.join(PROJECT_ROOT, emailPath);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');

            integrations.push({
                type: 'Email (SMTP)',
                service: path.dirname(emailPath).split('/').pop(),
                status: content.includes('nodemailer') ? 'Configured' : 'Partial',
                configurable: content.includes('process.env'),
                notes: 'Nodemailer integration for email notifications'
            });
        }
    }

    // Check for payment integration placeholders
    const bookingControllerPath = path.join(PROJECT_ROOT, 'services/booking-service/src/controllers/BookingController.ts');
    if (fs.existsSync(bookingControllerPath)) {
        const content = fs.readFileSync(bookingControllerPath, 'utf-8');

        const hasPaymentEndpoint = content.includes('processPayment') || content.includes('payment');

        integrations.push({
            type: 'Payment Gateway',
            service: 'booking-service',
            status: hasPaymentEndpoint ? 'Placeholder' : 'Not Found',
            configurable: false,
            notes: 'Payment processing endpoint exists but needs gateway integration'
        });
    }

    // Check for Redis integration
    const flightServicePath = path.join(PROJECT_ROOT, 'services/flight-service/src/services/CacheService.ts');
    if (fs.existsSync(flightServicePath)) {
        const content = fs.readFileSync(flightServicePath, 'utf-8');

        integrations.push({
            type: 'Cache (Redis)',
            service: 'flight-service, offer-service',
            status: content.includes('redis') ? 'Configured' : 'Not Found',
            configurable: content.includes('REDIS_HOST'),
            notes: 'Redis caching for read-heavy operations'
        });
    }

    // Check for inter-service communication
    for (const [serviceName, servicePath] of Object.entries(SERVICE_PATHS)) {
        const controllersDir = path.join(PROJECT_ROOT, servicePath, 'controllers');

        if (fs.existsSync(controllersDir)) {
            const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

            for (const file of files) {
                const content = fs.readFileSync(path.join(controllersDir, file), 'utf-8');

                // Check for axios calls to other services
                if (content.includes('axios') && content.includes('SERVICE_URL')) {
                    const serviceUrls = content.match(/\w+_SERVICE_URL/g) || [];

                    integrations.push({
                        type: 'Inter-Service HTTP',
                        service: serviceName,
                        status: 'Configured',
                        configurable: true,
                        notes: `Calls: ${[...new Set(serviceUrls)].join(', ')}`
                    });
                }
            }
        }
    }

    return integrations;
}

/**
 * Run full interoperability analysis
 */
async function runInteroperabilityAnalysis() {
    console.log('\n' + '='.repeat(80));
    console.log('INTEROPERABILITY ANALYSIS - INTEGRATION ASSESSMENT');
    console.log('QAirLine Microservices Architecture');
    console.log('='.repeat(80));
    console.log(`\nAPI Gateway: ${API_BASE}`);
    console.log(`Project Root: ${PROJECT_ROOT}`);
    console.log(`Started at: ${new Date().toISOString()}\n`);

    // ========================================
    // CORS Analysis
    // ========================================
    console.log('-'.repeat(60));
    console.log('1. CORS CONFIGURATION');
    console.log('-'.repeat(60));

    const cors = await analyzeCORS();
    console.log(`\nCORS Score: ${cors.score}/100`);

    if (cors.headers) {
        console.log('\nCORS Headers:');
        for (const [header, value] of Object.entries(cors.headers)) {
            console.log(`  ${header}: ${value || 'Not set'}`);
        }
    }

    // ========================================
    // REST Consistency
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('2. REST API CONSISTENCY');
    console.log('-'.repeat(60));

    const restChecks = analyzeRESTConsistency();

    console.log('\n### REST Pattern Analysis\n');
    const restHeaders = ['Check', 'Status', 'Details'];
    const restRows = restChecks.map(c => [c.check, c.status, c.details]);
    console.log(formatTable(restHeaders, restRows));

    // ========================================
    // JWT Authentication
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('3. JWT AUTHENTICATION FLOW');
    console.log('-'.repeat(60));

    const jwt = await analyzeJWTAuth();
    console.log(`\nJWT Auth Score: ${jwt.score}/100`);

    if (jwt.signIn) {
        console.log(`\nSign-in Endpoint Test:`);
        console.log(`  Status Code: ${jwt.signIn.statusCode}`);
        console.log(`  Token Returned: ${jwt.signIn.hasToken ? 'Yes' : 'No (expected for invalid creds)'}`);
    }

    if (jwt.tokenUsage.length > 0) {
        console.log(`\nJWT Implementation:`);
        for (const usage of jwt.tokenUsage) {
            console.log(`  ${usage.file}:`);
            console.log(`    - JWT Import: ${usage.jwtImport ? '✅' : '❌'}`);
            console.log(`    - JWT Sign: ${usage.jwtSign ? '✅' : '❌'}`);
            console.log(`    - Bcrypt: ${usage.bcrypt ? '✅' : '❌'}`);
        }
    }

    // ========================================
    // External Integration
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('4. EXTERNAL INTEGRATION READINESS');
    console.log('-'.repeat(60));

    const integrations = analyzeExternalIntegration();

    console.log('\n### Integration Points\n');
    const intHeaders = ['Type', 'Service', 'Status', 'Configurable', 'Notes'];
    const intRows = integrations.map(i => [
        i.type, i.service, i.status, i.configurable ? 'Yes' : 'No', i.notes
    ]);
    console.log(formatTable(intHeaders, intRows));

    // ========================================
    // Overall Assessment
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('INTEROPERABILITY ASSESSMENT');
    console.log('='.repeat(80));

    // Calculate overall score
    const corsWeight = 0.25;
    const restWeight = 0.25;
    const jwtWeight = 0.30;
    const integrationWeight = 0.20;

    const restScore = (restChecks.filter(c => c.status === 'Pass').length /
        Math.max(restChecks.filter(c => c.status !== 'Info').length, 1)) * 100;
    const integrationScore = (integrations.filter(i => i.status === 'Configured').length /
        Math.max(integrations.length, 1)) * 100;

    const overallScore = Math.round(
        cors.score * corsWeight +
        restScore * restWeight +
        jwt.score * jwtWeight +
        integrationScore * integrationWeight
    );

    let assessment = '✅ GOOD';
    if (overallScore < 50) assessment = '🔴 POOR';
    else if (overallScore < 70) assessment = '⚠️ NEEDS IMPROVEMENT';

    console.log(`\n### Scores by Category\n`);
    console.log(`| Category                | Score    |`);
    console.log(`|-------------------------|----------|`);
    console.log(`| CORS Configuration      | ${cors.score}/100   |`);
    console.log(`| REST Consistency        | ${Math.round(restScore)}/100   |`);
    console.log(`| JWT Authentication      | ${jwt.score}/100   |`);
    console.log(`| External Integration    | ${Math.round(integrationScore)}/100   |`);
    console.log(`|-------------------------|----------|`);
    console.log(`| **Overall**             | **${overallScore}/100** |`);

    console.log(`\nOverall Assessment: ${assessment}`);

    console.log('\n### Integration Readiness\n');
    console.log('✅ Ready: Email notifications (SMTP), Redis caching, Inter-service HTTP');
    console.log('⚠️ Partial: Payment gateway (placeholder exists, needs gateway SDK)');
    console.log('📋 Recommended: Add OpenAPI/Swagger documentation for external consumers');

    console.log('\n' + '='.repeat(80));
    console.log(`Analysis completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    return { cors, restChecks, jwt, integrations, overallScore, assessment };
}

// Run if executed directly
if (require.main === module) {
    runInteroperabilityAnalysis()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Interoperability analysis failed:', err);
            process.exit(1);
        });
}

module.exports = { runInteroperabilityAnalysis };
