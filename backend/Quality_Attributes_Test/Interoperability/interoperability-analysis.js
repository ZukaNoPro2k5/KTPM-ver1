/**
 * QAirLine Interoperability Analysis Script
 * Measures Interoperability Quality Attribute:
 * - Can it connect to external systems (Payment, Third-party APIs)?
 * 
 * Methodology:
 * 1. Analyze existing external integrations
 * 2. Evaluate API design standards (REST, JSON)
 * 3. Check authentication mechanisms
 * 4. Assess integration readiness
 * 5. Calculate interoperability score
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'd:/Software Achitecture/BTL/QAirLine_chua_cai_tien';

// ==================== CONFIGURATION ====================
const INTEROP_CRITERIA = {
    API_STANDARDS: {
        weight: 20,
        checks: ['REST endpoints', 'JSON responses', 'HTTP methods', 'Status codes']
    },
    AUTHENTICATION: {
        weight: 20,
        checks: ['JWT support', 'OAuth readiness', 'API key support', 'Session management']
    },
    EXTERNAL_INTEGRATIONS: {
        weight: 25,
        checks: ['Email service', 'Payment gateway', 'Third-party APIs', 'Webhooks']
    },
    PROTOCOL_STANDARDS: {
        weight: 15,
        checks: ['CORS support', 'HTTPS ready', 'Content-Type headers', 'Error handling']
    },
    DATA_EXCHANGE: {
        weight: 20,
        checks: ['JSON serialization', 'Request validation', 'Response structure', 'Versioning']
    }
};

// ==================== FILE SCANNER ====================
function readFileContent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
}

function getAllSourceFiles(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
    const files = [];
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory() && !['node_modules', '.next', 'dist'].includes(item)) {
                files.push(...getAllSourceFiles(fullPath, extensions));
            } else if (extensions.some(ext => item.endsWith(ext))) {
                files.push(fullPath);
            }
        }
    } catch { }
    return files;
}

// ==================== ANALYSIS FUNCTIONS ====================
function analyzeAPIStandards(files) {
    const results = {
        score: 0,
        findings: [],
        details: {}
    };

    let hasRESTEndpoints = false;
    let hasJSONResponses = false;
    let hasHTTPMethods = false;
    let hasStatusCodes = false;

    for (const file of files) {
        const content = readFileContent(file);

        // Check for REST endpoints
        if (/router\.(get|post|put|delete|patch)\s*\(/gi.test(content)) {
            hasRESTEndpoints = true;
        }

        // Check for JSON responses
        if (/res\.json\s*\(/g.test(content) || /res\.send\s*\(/g.test(content)) {
            hasJSONResponses = true;
        }

        // Check HTTP methods
        if (/app\.(get|post|put|delete|patch)/gi.test(content) || /router\.(get|post|put|delete|patch)/gi.test(content)) {
            hasHTTPMethods = true;
        }

        // Check status codes
        if (/res\.status\s*\(\s*\d{3}\s*\)/g.test(content)) {
            hasStatusCodes = true;
        }
    }

    results.details = {
        restEndpoints: hasRESTEndpoints,
        jsonResponses: hasJSONResponses,
        httpMethods: hasHTTPMethods,
        statusCodes: hasStatusCodes
    };

    let passed = 0;
    if (hasRESTEndpoints) { passed++; results.findings.push('✅ REST endpoints implemented'); }
    else { results.findings.push('❌ No REST endpoints found'); }

    if (hasJSONResponses) { passed++; results.findings.push('✅ JSON responses used'); }
    else { results.findings.push('❌ No JSON responses found'); }

    if (hasHTTPMethods) { passed++; results.findings.push('✅ HTTP methods (GET/POST/PUT/DELETE) used'); }
    else { results.findings.push('❌ No HTTP methods found'); }

    if (hasStatusCodes) { passed++; results.findings.push('✅ HTTP status codes used'); }
    else { results.findings.push('⚠️ Limited status code usage'); passed += 0.5; }

    results.score = (passed / 4) * INTEROP_CRITERIA.API_STANDARDS.weight;
    return results;
}

function analyzeAuthentication(files) {
    const results = {
        score: 0,
        findings: [],
        details: {}
    };

    let hasJWT = false;
    let hasOAuth = false;
    let hasAPIKey = false;
    let hasSession = false;

    for (const file of files) {
        const content = readFileContent(file);

        // Check for JWT
        if (/jsonwebtoken|jwt\.sign|jwt\.verify|Bearer/gi.test(content)) {
            hasJWT = true;
        }

        // Check for OAuth
        if (/oauth|passport|google-auth|facebook-auth/gi.test(content)) {
            hasOAuth = true;
        }

        // Check for API Key
        if (/api[_-]?key|x-api-key|authorization/gi.test(content)) {
            hasAPIKey = true;
        }

        // Check for session
        if (/express-session|session\s*:/gi.test(content)) {
            hasSession = true;
        }
    }

    results.details = {
        jwtSupport: hasJWT,
        oauthReady: hasOAuth,
        apiKeySupport: hasAPIKey,
        sessionManagement: hasSession
    };

    let passed = 0;
    if (hasJWT) { passed++; results.findings.push('✅ JWT authentication implemented'); }
    else { results.findings.push('❌ No JWT support'); }

    if (hasOAuth) { passed++; results.findings.push('✅ OAuth integration ready'); }
    else { results.findings.push('⚠️ No OAuth integration (can be added)'); passed += 0.25; }

    if (hasAPIKey) { passed++; results.findings.push('✅ API key support available'); }
    else { results.findings.push('⚠️ No API key authentication'); passed += 0.25; }

    if (hasSession) { passed++; results.findings.push('✅ Session management available'); }
    else { results.findings.push('⚠️ No session management'); passed += 0.25; }

    results.score = (passed / 4) * INTEROP_CRITERIA.AUTHENTICATION.weight;
    return results;
}

function analyzeExternalIntegrations(files) {
    const results = {
        score: 0,
        findings: [],
        details: {},
        existingIntegrations: [],
        potentialIntegrations: []
    };

    let hasEmail = false;
    let hasPayment = false;
    let hasThirdPartyAPI = false;
    let hasWebhooks = false;

    for (const file of files) {
        const content = readFileContent(file);
        const fileName = path.basename(file);

        // Check for email service
        if (/nodemailer|sendgrid|mailgun|ses\.sendEmail/gi.test(content)) {
            hasEmail = true;
            results.existingIntegrations.push({
                type: 'Email Service',
                provider: 'Nodemailer/SMTP',
                file: fileName
            });
        }

        // Check for payment
        if (/stripe|paypal|vnpay|momo|zalopay|payment/gi.test(content)) {
            hasPayment = true;
            results.existingIntegrations.push({
                type: 'Payment Gateway',
                provider: content.match(/stripe|paypal|vnpay|momo|zalopay/gi)?.[0] || 'Generic',
                file: fileName
            });
        }

        // Check for third-party APIs
        if (/axios|fetch\(|http\.request|https\.request/gi.test(content)) {
            if (!content.includes('localhost')) {
                hasThirdPartyAPI = true;
            }
        }

        // Check for webhooks
        if (/webhook|callback[_-]?url|notify[_-]?url/gi.test(content)) {
            hasWebhooks = true;
        }
    }

    results.details = {
        emailService: hasEmail,
        paymentGateway: hasPayment,
        thirdPartyAPI: hasThirdPartyAPI,
        webhookSupport: hasWebhooks
    };

    let passed = 0;
    if (hasEmail) { passed++; results.findings.push('✅ Email service integrated (Nodemailer)'); }
    else { results.findings.push('❌ No email service'); }

    if (hasPayment) { passed++; results.findings.push('✅ Payment gateway integrated'); }
    else {
        results.findings.push('⚠️ No payment gateway (integration ready)');
        passed += 0.5; // Can be integrated
        results.potentialIntegrations.push('Stripe, PayPal, VNPay, MoMo');
    }

    if (hasThirdPartyAPI) { passed++; results.findings.push('✅ Third-party API connectivity'); }
    else { results.findings.push('⚠️ No external API calls detected'); passed += 0.25; }

    if (hasWebhooks) { passed++; results.findings.push('✅ Webhook support available'); }
    else { results.findings.push('⚠️ No webhook endpoints'); passed += 0.25; }

    results.score = (passed / 4) * INTEROP_CRITERIA.EXTERNAL_INTEGRATIONS.weight;
    return results;
}

function analyzeProtocolStandards(files) {
    const results = {
        score: 0,
        findings: [],
        details: {}
    };

    let hasCORS = false;
    let hasHTTPS = false;
    let hasContentType = false;
    let hasErrorHandling = false;

    for (const file of files) {
        const content = readFileContent(file);

        // Check CORS
        if (/cors\(|Access-Control-Allow/gi.test(content)) {
            hasCORS = true;
        }

        // Check HTTPS readiness
        if (/https|ssl|tls|certificate/gi.test(content)) {
            hasHTTPS = true;
        }

        // Check Content-Type
        if (/content-type|application\/json/gi.test(content)) {
            hasContentType = true;
        }

        // Check error handling
        if (/try\s*{|catch\s*\(|\.catch\(|error\s*=>/gi.test(content)) {
            hasErrorHandling = true;
        }
    }

    results.details = {
        corsSupport: hasCORS,
        httpsReady: hasHTTPS,
        contentTypeHeaders: hasContentType,
        errorHandling: hasErrorHandling
    };

    let passed = 0;
    if (hasCORS) { passed++; results.findings.push('✅ CORS enabled for cross-origin requests'); }
    else { results.findings.push('❌ No CORS configuration'); }

    if (hasHTTPS) { passed++; results.findings.push('✅ HTTPS/SSL ready'); }
    else { results.findings.push('⚠️ HTTPS not explicitly configured (Docker/proxy can handle)'); passed += 0.5; }

    if (hasContentType) { passed++; results.findings.push('✅ Content-Type headers used'); }
    else { results.findings.push('⚠️ Limited Content-Type handling'); passed += 0.5; }

    if (hasErrorHandling) { passed++; results.findings.push('✅ Error handling implemented'); }
    else { results.findings.push('❌ Poor error handling'); }

    results.score = (passed / 4) * INTEROP_CRITERIA.PROTOCOL_STANDARDS.weight;
    return results;
}

function analyzeDataExchange(files) {
    const results = {
        score: 0,
        findings: [],
        details: {}
    };

    let hasJSONParsing = false;
    let hasValidation = false;
    let hasStructuredResponse = false;
    let hasVersioning = false;

    for (const file of files) {
        const content = readFileContent(file);

        // Check JSON parsing
        if (/express\.json\(\)|body-parser|JSON\.parse|JSON\.stringify/gi.test(content)) {
            hasJSONParsing = true;
        }

        // Check validation
        if (/validate|joi|yup|zod|express-validator|req\.body\./gi.test(content)) {
            hasValidation = true;
        }

        // Check structured responses
        if (/\{\s*(success|status|data|message|error)\s*:/gi.test(content)) {
            hasStructuredResponse = true;
        }

        // Check API versioning
        if (/\/v\d+\/|\/api\/v\d+|version/gi.test(content)) {
            hasVersioning = true;
        }
    }

    results.details = {
        jsonSerialization: hasJSONParsing,
        requestValidation: hasValidation,
        responseStructure: hasStructuredResponse,
        apiVersioning: hasVersioning
    };

    let passed = 0;
    if (hasJSONParsing) { passed++; results.findings.push('✅ JSON serialization configured'); }
    else { results.findings.push('❌ No JSON middleware'); }

    if (hasValidation) { passed++; results.findings.push('✅ Request validation present'); }
    else { results.findings.push('⚠️ Limited input validation'); passed += 0.25; }

    if (hasStructuredResponse) { passed++; results.findings.push('✅ Structured API responses'); }
    else { results.findings.push('⚠️ Inconsistent response structure'); passed += 0.25; }

    if (hasVersioning) { passed++; results.findings.push('✅ API versioning implemented'); }
    else { results.findings.push('⚠️ No API versioning'); passed += 0.25; }

    results.score = (passed / 4) * INTEROP_CRITERIA.DATA_EXCHANGE.weight;
    return results;
}

// ==================== INTEGRATION ASSESSMENT ====================
function assessPaymentIntegration(files) {
    const assessment = {
        currentState: 'Not Integrated',
        readiness: 0,
        requirements: [],
        recommendations: []
    };

    let hasPaymentEndpoint = false;
    let hasPaymentModel = false;
    let hasTransactionHandling = false;

    for (const file of files) {
        const content = readFileContent(file);
        const fileName = path.basename(file);

        if (/payment|transaction|checkout|order/gi.test(fileName) ||
            /payment|transaction|checkout/gi.test(content)) {
            hasPaymentEndpoint = true;
        }

        if (/Payments|PaymentStatus|amount|currency/gi.test(content)) {
            hasPaymentModel = true;
        }

        if (/transaction|commit|rollback/gi.test(content)) {
            hasTransactionHandling = true;
        }
    }

    if (hasPaymentEndpoint) assessment.readiness += 30;
    if (hasPaymentModel) assessment.readiness += 30;
    if (hasTransactionHandling) assessment.readiness += 20;

    // Check database for Payments table
    const sqlFile = path.join(ROOT_DIR, 'backend', 'src', 'database', 'create-database.sql');
    if (fs.existsSync(sqlFile)) {
        const sqlContent = readFileContent(sqlFile);
        if (/CREATE TABLE.*Payments/i.test(sqlContent)) {
            assessment.readiness += 20;
            assessment.requirements.push('✅ Payments table exists in database');
        }
    }

    if (assessment.readiness >= 70) {
        assessment.currentState = 'Integration Ready';
    } else if (assessment.readiness >= 40) {
        assessment.currentState = 'Partially Ready';
    }

    assessment.recommendations = [
        'Add Stripe/PayPal SDK integration',
        'Implement payment webhook handlers',
        'Add payment status tracking',
        'Implement refund functionality'
    ];

    return assessment;
}

function assessThirdPartyIntegration() {
    const integrations = [
        {
            name: 'Grab Food / Delivery',
            readiness: 'Possible',
            requirements: ['Add order tracking API', 'Implement webhook receivers', 'Add delivery status endpoints'],
            effort: 'Medium'
        },
        {
            name: 'SMS Gateway (Twilio)',
            readiness: 'Easy',
            requirements: ['Similar to email service', 'Add Twilio SDK', 'Modify notification service'],
            effort: 'Low'
        },
        {
            name: 'Social Login (Google/FB)',
            readiness: 'Possible',
            requirements: ['Add OAuth library', 'Modify auth controller', 'Add social user linking'],
            effort: 'Medium'
        },
        {
            name: 'Flight Data APIs',
            readiness: 'Easy',
            requirements: ['Add axios/fetch', 'Create API wrapper service', 'Add caching layer'],
            effort: 'Low'
        }
    ];

    return integrations;
}

// ==================== MAIN ====================
function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   QAirLine Interoperability Analysis - External Systems    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Evaluating capability to connect to external systems:');
    console.log('   - Payment Gateways (Stripe, PayPal, VNPay)');
    console.log('   - Third-party Services (Grab, Delivery APIs)');
    console.log('   - External APIs (Weather, Flight Data)\n');

    // Gather all source files
    const backendFiles = getAllSourceFiles(path.join(ROOT_DIR, 'backend', 'src'));
    const frontendFiles = getAllSourceFiles(path.join(ROOT_DIR, 'frontend', 'app'));
    const allFiles = [...backendFiles, ...frontendFiles];

    console.log(`📂 Analyzing ${allFiles.length} source files...\n`);

    // Run analyses
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('📊 INTEROPERABILITY ASSESSMENT');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const apiStandards = analyzeAPIStandards(allFiles);
    const authentication = analyzeAuthentication(allFiles);
    const externalIntegrations = analyzeExternalIntegrations(allFiles);
    const protocolStandards = analyzeProtocolStandards(allFiles);
    const dataExchange = analyzeDataExchange(allFiles);

    // Print results for each category
    const categories = [
        { name: 'API Standards (REST/JSON)', data: apiStandards, weight: INTEROP_CRITERIA.API_STANDARDS.weight },
        { name: 'Authentication', data: authentication, weight: INTEROP_CRITERIA.AUTHENTICATION.weight },
        { name: 'External Integrations', data: externalIntegrations, weight: INTEROP_CRITERIA.EXTERNAL_INTEGRATIONS.weight },
        { name: 'Protocol Standards', data: protocolStandards, weight: INTEROP_CRITERIA.PROTOCOL_STANDARDS.weight },
        { name: 'Data Exchange', data: dataExchange, weight: INTEROP_CRITERIA.DATA_EXCHANGE.weight }
    ];

    let totalScore = 0;

    for (const cat of categories) {
        console.log(`\n📌 ${cat.name} (${cat.weight} points max):`);
        for (const finding of cat.data.findings) {
            console.log(`   ${finding}`);
        }
        console.log(`   Score: ${cat.data.score.toFixed(1)}/${cat.weight}`);
        totalScore += cat.data.score;
    }

    // Payment integration assessment
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('💳 PAYMENT SYSTEM INTEGRATION ASSESSMENT');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const paymentAssessment = assessPaymentIntegration(allFiles);
    console.log(`   Current State: ${paymentAssessment.currentState}`);
    console.log(`   Readiness Score: ${paymentAssessment.readiness}%`);
    console.log('   Recommendations:');
    for (const rec of paymentAssessment.recommendations) {
        console.log(`      - ${rec}`);
    }

    // Third-party integration assessment
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('🔗 THIRD-PARTY INTEGRATION POSSIBILITIES');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const thirdPartyIntegrations = assessThirdPartyIntegration();
    console.log('┌────────────────────────┬────────────┬────────────┐');
    console.log('│ Integration            │ Readiness  │ Effort     │');
    console.log('├────────────────────────┼────────────┼────────────┤');
    for (const integration of thirdPartyIntegrations) {
        console.log(`│ ${integration.name.padEnd(22)} │ ${integration.readiness.padEnd(10)} │ ${integration.effort.padEnd(10)} │`);
    }
    console.log('└────────────────────────┴────────────┴────────────┘');

    // Overall score
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📈 INTEROPERABILITY SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const overallScore = Math.round(totalScore);
    console.log(`   ⭐ INTEROPERABILITY SCORE: ${overallScore}/100`);

    if (overallScore >= 80) {
        console.log('   ✅ Excellent - System is highly interoperable');
    } else if (overallScore >= 60) {
        console.log('   ⚠️ Good - System can integrate with external systems');
    } else if (overallScore >= 40) {
        console.log('   🟡 Moderate - Some integration capabilities exist');
    } else {
        console.log('   🔴 Limited - Major improvements needed for integration');
    }

    console.log(`\n   Payment Integration Readiness: ${paymentAssessment.readiness}%`);
    console.log(`   Third-party API Connectivity: ${externalIntegrations.details.thirdPartyAPI ? 'Available' : 'Limited'}`);

    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        summary: {
            overallScore: overallScore,
            paymentReadiness: paymentAssessment.readiness,
            canConnectToExternalSystems: overallScore >= 50
        },
        categories: {
            apiStandards: apiStandards,
            authentication: authentication,
            externalIntegrations: externalIntegrations,
            protocolStandards: protocolStandards,
            dataExchange: dataExchange
        },
        paymentAssessment: paymentAssessment,
        thirdPartyPossibilities: thirdPartyIntegrations
    };

    fs.writeFileSync(
        path.join(ROOT_DIR, 'backend', 'interoperability-results.json'),
        JSON.stringify(results, null, 2)
    );
    console.log('\n📁 Results saved to: interoperability-results.json');

    console.log('\n✅ Interoperability analysis complete!\n');
}

main();
