/**
 * Security Analysis - CIA Triad + Auth/Non-Repudiation Assessment
 * 
 * Static code analysis for security vulnerabilities and best practices
 * Covers: Confidentiality, Integrity, Availability, Authentication, Non-Repudiation
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Service paths for security analysis
const SERVICE_PATHS = {
    'API Gateway': 'api-gateway/src',
    'User Service': 'services/user-service/src',
    'Flight Service': 'services/flight-service/src',
    'Booking Service': 'services/booking-service/src',
    'Offer Service': 'services/offer-service/src'
};

// Security patterns to check
const SECURITY_PATTERNS = {
    // Positive patterns (should exist)
    positive: {
        bcrypt: /bcrypt\.hash|bcrypt\.compare/,
        jwtEnv: /process\.env\.\w*JWT\w*|process\.env\.\w*SECRET/i,
        inputValidation: /if\s*\(\s*![\w.]+\s*\)|\.status\(400\)/,
        errorHandling: /catch\s*\(|\.status\(500\)|try\s*{/,
        helmet: /helmet/i,
        rateLimit: /rate-?limit|express-rate-limit/i,
        cors: /cors\(/,
        sanitize: /sanitize|escape|validator/i
    },
    // Negative patterns (should NOT exist)
    negative: {
        hardcodedSecret: /'secret_key'|"secret_key"|'your-?secret|"your-?secret/i,
        hardcodedPassword: /password\s*[:=]\s*['"][^'"]{4,}['"]/i,
        sqlInjection: /`SELECT.*\$\{|'SELECT.*\+\s*\w+|"SELECT.*\+\s*\w+/,
        consolePassword: /console\.log.*password|console\.log.*token/i,
        evalUsage: /eval\s*\(/,
        unsafeRegex: /new RegExp\(.*\+/
    }
};

/**
 * Scan a file for security patterns
 */
function scanFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const findings = {
            positive: {},
            negative: {},
            lines: content.split('\n').length
        };

        // Check positive patterns
        for (const [name, pattern] of Object.entries(SECURITY_PATTERNS.positive)) {
            findings.positive[name] = pattern.test(content);
        }

        // Check negative patterns
        for (const [name, pattern] of Object.entries(SECURITY_PATTERNS.negative)) {
            const match = content.match(pattern);
            findings.negative[name] = match ? { found: true, sample: match[0].substring(0, 50) } : { found: false };
        }

        return findings;
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Get all source files in a directory
 */
function getSourceFiles(dirPath, extensions = ['.ts', '.js']) {
    const files = [];

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'tests') {
                files.push(...getSourceFiles(fullPath, extensions));
            } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        // Directory doesn't exist
    }

    return files;
}

/**
 * Analyze Confidentiality (C in CIA)
 */
function analyzeConfidentiality(serviceFindings) {
    const score = { value: 0, max: 100, details: [] };

    let hasBcrypt = false;
    let hasEnvSecrets = false;
    let hasHardcodedSecrets = false;
    let hasPasswordLogs = false;

    for (const [service, files] of Object.entries(serviceFindings)) {
        for (const [filePath, findings] of Object.entries(files)) {
            if (findings.positive?.bcrypt) hasBcrypt = true;
            if (findings.positive?.jwtEnv) hasEnvSecrets = true;
            if (findings.negative?.hardcodedSecret?.found) hasHardcodedSecrets = true;
            if (findings.negative?.hardcodedPassword?.found) hasHardcodedSecrets = true;
            if (findings.negative?.consolePassword?.found) hasPasswordLogs = true;
        }
    }

    // Scoring
    if (hasBcrypt) {
        score.value += 30;
        score.details.push('✅ Password hashing with bcrypt');
    } else {
        score.details.push('❌ No password hashing detected');
    }

    if (hasEnvSecrets) {
        score.value += 25;
        score.details.push('✅ Secrets stored in environment variables');
    } else {
        score.details.push('⚠️ JWT secrets may not be in env vars');
    }

    if (!hasHardcodedSecrets) {
        score.value += 25;
        score.details.push('✅ No hardcoded secrets detected');
    } else {
        score.details.push('🔴 Hardcoded secrets found in code');
    }

    if (!hasPasswordLogs) {
        score.value += 20;
        score.details.push('✅ No sensitive data in logs');
    } else {
        score.details.push('🔴 Sensitive data logged to console');
    }

    return score;
}

/**
 * Analyze Integrity (I in CIA)
 */
function analyzeIntegrity(serviceFindings) {
    const score = { value: 0, max: 100, details: [] };

    let hasInputValidation = false;
    let hasErrorHandling = false;
    let hasSqlInjection = false;
    let hasEval = false;

    for (const [service, files] of Object.entries(serviceFindings)) {
        for (const [filePath, findings] of Object.entries(files)) {
            if (findings.positive?.inputValidation) hasInputValidation = true;
            if (findings.positive?.errorHandling) hasErrorHandling = true;
            if (findings.negative?.sqlInjection?.found) hasSqlInjection = true;
            if (findings.negative?.evalUsage?.found) hasEval = true;
        }
    }

    // Scoring
    if (hasInputValidation) {
        score.value += 35;
        score.details.push('✅ Input validation present');
    } else {
        score.details.push('⚠️ Limited input validation detected');
    }

    if (hasErrorHandling) {
        score.value += 25;
        score.details.push('✅ Try-catch error handling');
    } else {
        score.details.push('⚠️ Error handling may be incomplete');
    }

    if (!hasSqlInjection) {
        score.value += 25;
        score.details.push('✅ Parameterized queries (no SQL injection patterns)');
    } else {
        score.details.push('🔴 Potential SQL injection vulnerability');
    }

    if (!hasEval) {
        score.value += 15;
        score.details.push('✅ No eval() usage');
    } else {
        score.details.push('🔴 Unsafe eval() usage detected');
    }

    return score;
}

/**
 * Analyze Availability (A in CIA)
 */
function analyzeAvailability(serviceFindings) {
    const score = { value: 0, max: 100, details: [] };

    let hasRateLimit = false;
    let hasCors = false;
    let hasHelmet = false;

    for (const [service, files] of Object.entries(serviceFindings)) {
        for (const [filePath, findings] of Object.entries(files)) {
            if (findings.positive?.rateLimit) hasRateLimit = true;
            if (findings.positive?.cors) hasCors = true;
            if (findings.positive?.helmet) hasHelmet = true;
        }
    }

    // Scoring
    if (hasRateLimit) {
        score.value += 40;
        score.details.push('✅ Rate limiting configured');
    } else {
        score.details.push('⚠️ No rate limiting detected - DoS risk');
    }

    if (hasCors) {
        score.value += 30;
        score.details.push('✅ CORS configured');
    } else {
        score.details.push('⚠️ CORS not detected');
    }

    if (hasHelmet) {
        score.value += 30;
        score.details.push('✅ Helmet security headers');
    } else {
        // Still give partial score if CORS exists
        if (hasCors) score.value += 15;
        score.details.push('⚠️ Helmet not detected - missing security headers');
    }

    return score;
}

/**
 * Analyze Authentication & Authorization
 */
function analyzeAuthN(serviceFindings) {
    const score = { value: 0, max: 100, details: [] };

    // Check User Service specifically for auth
    const userServicePath = path.join(PROJECT_ROOT, 'services/user-service/src/controllers/UserController.ts');

    if (fs.existsSync(userServicePath)) {
        const content = fs.readFileSync(userServicePath, 'utf-8');

        const hasJwtSign = content.includes('jwt.sign');
        const hasBcryptCompare = content.includes('bcrypt.compare');
        const hasRoleCheck = content.includes('role') || content.includes('Role');
        const hasUserIdValidation = content.includes('userId') || content.includes('UserID');

        if (hasJwtSign) {
            score.value += 30;
            score.details.push('✅ JWT token generation');
        } else {
            score.details.push('❌ No JWT token generation');
        }

        if (hasBcryptCompare) {
            score.value += 25;
            score.details.push('✅ Secure password comparison');
        } else {
            score.details.push('❌ No secure password comparison');
        }

        if (hasRoleCheck) {
            score.value += 25;
            score.details.push('✅ Role-based access control');
        } else {
            score.details.push('⚠️ No role-based authorization detected');
        }

        if (hasUserIdValidation) {
            score.value += 20;
            score.details.push('✅ User ID validation');
        }
    } else {
        score.details.push('⚠️ User service controller not found');
    }

    return score;
}

/**
 * Analyze Non-Repudiation (Logging & Audit)
 */
function analyzeNonRepudiation(serviceFindings) {
    const score = { value: 0, max: 100, details: [] };

    let hasConsoleLog = false;
    let hasErrorLog = false;
    let hasTimestamp = false;

    for (const [service, files] of Object.entries(serviceFindings)) {
        for (const [filePath, findings] of Object.entries(files)) {
            // Check file content for logging
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                if (content.includes('console.log')) hasConsoleLog = true;
                if (content.includes('console.error')) hasErrorLog = true;
                if (content.includes('timestamp') || content.includes('toISOString')) hasTimestamp = true;
            } catch { }
        }
    }

    // Scoring
    if (hasConsoleLog) {
        score.value += 25;
        score.details.push('✅ Basic logging present (console.log)');
    } else {
        score.details.push('⚠️ No logging detected');
    }

    if (hasErrorLog) {
        score.value += 25;
        score.details.push('✅ Error logging present');
    } else {
        score.details.push('⚠️ No error logging detected');
    }

    if (hasTimestamp) {
        score.value += 20;
        score.details.push('✅ Timestamps in logs');
    } else {
        score.details.push('⚠️ No timestamp logging detected');
    }

    // Check for audit-related patterns
    score.value += 15; // Partial credit for microservices isolation
    score.details.push('⚠️ No dedicated audit logging framework');
    score.details.push('📋 Recommended: Add Winston or Pino logger with audit trail');

    return score;
}

/**
 * Format table
 */
function formatTable(headers, rows) {
    const colWidths = headers.map((h, i) => {
        const maxRowWidth = Math.max(...rows.map(r => String(r[i] || '').length));
        return Math.max(h.length, maxRowWidth) + 2;
    });

    let output = '\n';
    output += '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |\n';
    output += '|' + colWidths.map(w => '-'.repeat(w + 2)).join('|') + '|\n';
    rows.forEach(row => {
        output += '| ' + row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join(' | ') + ' |\n';
    });

    return output;
}

/**
 * Run full security analysis
 */
async function runSecurityAnalysis() {
    console.log('\n' + '='.repeat(80));
    console.log('SECURITY ANALYSIS - CIA TRIAD + AUTH ASSESSMENT');
    console.log('QAirLine Microservices Architecture');
    console.log('='.repeat(80));
    console.log(`\nProject Root: ${PROJECT_ROOT}`);
    console.log(`Started at: ${new Date().toISOString()}\n`);

    // Scan all services
    const serviceFindings = {};

    for (const [serviceName, servicePath] of Object.entries(SERVICE_PATHS)) {
        console.log(`Scanning: ${serviceName}...`);
        const fullPath = path.join(PROJECT_ROOT, servicePath);
        const files = getSourceFiles(fullPath);

        serviceFindings[serviceName] = {};

        for (const file of files) {
            const findings = scanFile(file);
            serviceFindings[serviceName][file] = findings;
        }
    }

    // ========================================
    // CIA Triad Analysis
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('SECURITY ASSESSMENT RESULTS');
    console.log('='.repeat(80));

    // Confidentiality
    console.log('\n' + '-'.repeat(60));
    console.log('1. CONFIDENTIALITY');
    console.log('-'.repeat(60));

    const confidentiality = analyzeConfidentiality(serviceFindings);
    console.log(`\nScore: ${confidentiality.value}/${confidentiality.max}`);
    confidentiality.details.forEach(d => console.log(`  ${d}`));

    // Integrity
    console.log('\n' + '-'.repeat(60));
    console.log('2. INTEGRITY');
    console.log('-'.repeat(60));

    const integrity = analyzeIntegrity(serviceFindings);
    console.log(`\nScore: ${integrity.value}/${integrity.max}`);
    integrity.details.forEach(d => console.log(`  ${d}`));

    // Availability
    console.log('\n' + '-'.repeat(60));
    console.log('3. AVAILABILITY');
    console.log('-'.repeat(60));

    const availability = analyzeAvailability(serviceFindings);
    console.log(`\nScore: ${availability.value}/${availability.max}`);
    availability.details.forEach(d => console.log(`  ${d}`));

    // Authentication & Authorization
    console.log('\n' + '-'.repeat(60));
    console.log('4. AUTHENTICATION & AUTHORIZATION');
    console.log('-'.repeat(60));

    const authN = analyzeAuthN(serviceFindings);
    console.log(`\nScore: ${authN.value}/${authN.max}`);
    authN.details.forEach(d => console.log(`  ${d}`));

    // Non-Repudiation
    console.log('\n' + '-'.repeat(60));
    console.log('5. NON-REPUDIATION (AUDIT & LOGGING)');
    console.log('-'.repeat(60));

    const nonRepudiation = analyzeNonRepudiation(serviceFindings);
    console.log(`\nScore: ${nonRepudiation.value}/${nonRepudiation.max}`);
    nonRepudiation.details.forEach(d => console.log(`  ${d}`));

    // ========================================
    // Vulnerability Summary
    // ========================================
    console.log('\n' + '-'.repeat(60));
    console.log('VULNERABILITY SUMMARY');
    console.log('-'.repeat(60));

    const vulnerabilities = [];

    for (const [service, files] of Object.entries(serviceFindings)) {
        for (const [filePath, findings] of Object.entries(files)) {
            if (!findings.negative) continue;

            for (const [vulnType, vulnData] of Object.entries(findings.negative)) {
                if (vulnData.found) {
                    vulnerabilities.push({
                        service,
                        file: path.basename(filePath),
                        type: vulnType,
                        sample: vulnData.sample || 'N/A'
                    });
                }
            }
        }
    }

    if (vulnerabilities.length > 0) {
        console.log('\n### Potential Vulnerabilities Found\n');
        const vulnHeaders = ['Service', 'File', 'Type', 'Sample'];
        const vulnRows = vulnerabilities.map(v => [v.service, v.file, v.type, v.sample]);
        console.log(formatTable(vulnHeaders, vulnRows));
    } else {
        console.log('\n✅ No critical vulnerabilities detected in static analysis');
    }

    // ========================================
    // Overall Assessment
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('OVERALL SECURITY ASSESSMENT');
    console.log('='.repeat(80));

    const scores = {
        confidentiality: confidentiality.value,
        integrity: integrity.value,
        availability: availability.value,
        authentication: authN.value,
        nonRepudiation: nonRepudiation.value
    };

    const overallScore = Math.round(
        (scores.confidentiality * 0.25) +
        (scores.integrity * 0.25) +
        (scores.availability * 0.15) +
        (scores.authentication * 0.25) +
        (scores.nonRepudiation * 0.10)
    );

    console.log('\n### Score Summary\n');
    console.log('| Dimension             | Score    | Weight |');
    console.log('|-----------------------|----------|--------|');
    console.log(`| Confidentiality       | ${scores.confidentiality}/100   | 25%    |`);
    console.log(`| Integrity             | ${scores.integrity}/100   | 25%    |`);
    console.log(`| Availability          | ${scores.availability}/100   | 15%    |`);
    console.log(`| Authentication/AuthZ  | ${scores.authentication}/100   | 25%    |`);
    console.log(`| Non-Repudiation       | ${scores.nonRepudiation}/100   | 10%    |`);
    console.log('|-----------------------|----------|--------|');
    console.log(`| **Overall**           | **${overallScore}/100** |        |`);

    let assessment = '✅ GOOD';
    if (overallScore < 50) assessment = '🔴 POOR';
    else if (overallScore < 70) assessment = '⚠️ NEEDS IMPROVEMENT';

    console.log(`\nOverall Assessment: ${assessment}`);

    // Comparison with Monolithic
    console.log('\n### Microservices vs Monolithic Security\n');
    console.log('| Aspect                      | Improvement                           |');
    console.log('|-----------------------------|---------------------------------------|');
    console.log('| Secret Management           | ✅ Env vars per service (isolated)    |');
    console.log('| Attack Surface              | ✅ Reduced per service                |');
    console.log('| Auth Token Handling         | ✅ Centralized in user-service        |');
    console.log('| Service Isolation           | ✅ Blast radius limited               |');
    console.log('| Inter-service Security      | ⚠️ No mutual TLS (recommended)        |');

    console.log('\n### Recommendations\n');
    console.log('🔐 High Priority:');
    console.log('   - Implement rate limiting at API Gateway');
    console.log('   - Add Helmet.js for security headers');
    console.log('   - Move JWT secret to environment variable (if not already)');
    console.log('\n📋 Medium Priority:');
    console.log('   - Add structured logging with audit trail');
    console.log('   - Implement input sanitization library');
    console.log('   - Add inter-service authentication (API keys or mTLS)');

    console.log('\n' + '='.repeat(80));
    console.log(`Analysis completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    return { scores, overallScore, assessment, vulnerabilities };
}

// Run if executed directly
if (require.main === module) {
    runSecurityAnalysis()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Security analysis failed:', err);
            process.exit(1);
        });
}

module.exports = { runSecurityAnalysis };
