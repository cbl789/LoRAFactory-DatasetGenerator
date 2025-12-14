/**
 * LoRAFactory - Comprehensive Monitoring & Logging
 * Tracks all API calls, errors, state changes, and performance metrics
 */

class Monitor {
    constructor() {
        this.logs = [];
        this.errors = [];
        this.apiCalls = [];
        this.startTime = Date.now();
        this.enabled = true;
        this.fileLoggingEnabled = true;
        this.logServerUrl = 'http://localhost:3101/log';

        // Intercept console methods
        this._interceptConsole();

        // Track unhandled errors
        window.addEventListener('error', (e) => this.logError('UNHANDLED', e.error));
        window.addEventListener('unhandledrejection', (e) => this.logError('PROMISE_REJECTION', e.reason));

        // Test connection to log server
        this._testLogServer();
    }

    async _testLogServer() {
        try {
            await fetch(this.logServerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timestamp: Date.now(),
                    type: 'SYSTEM',
                    message: 'Monitor initialized'
                })
            });
            console.log('📁 File logging enabled → logs/lorafactory_*.log');
        } catch (e) {
            this.fileLoggingEnabled = false;
            console.warn('⚠️ File logging unavailable (log server not running)');
        }
    }

    async _writeToFile(log) {
        if (!this.fileLoggingEnabled) return;

        try {
            await fetch(this.logServerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(log)
            });
        } catch (e) {
            // Silently fail - don't spam console with logging errors
        }
    }

    _interceptConsole() {
        const originalError = console.error;
        const originalWarn = console.warn;

        console.error = (...args) => {
            this.logError('CONSOLE', args.join(' '));
            originalError.apply(console, args);
        };

        console.warn = (...args) => {
            this.logWarning(args.join(' '));
            originalWarn.apply(console, args);
        };
    }

    logApiCall(provider, method, params, result, error = null) {
        const log = {
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            type: 'API_CALL',
            provider: provider,
            method: method,
            params: this._sanitize(params),
            result: error ? null : this._sanitize(result),
            error: error ? String(error) : null,
            success: !error
        };

        this.apiCalls.push(log);
        this.logs.push(log);
        this._writeToFile(log); // Write to file

        if (this.enabled) {
            const icon = error ? '❌' : '✅';
            const color = error ? 'color: red' : 'color: green';
            console.log(
                `%c${icon} [API] ${provider}.${method}`,
                color,
                error ? `ERROR: ${error}` : 'SUCCESS'
            );
            if (params) console.log('  📤 Request:', params);
            if (result) console.log('  📥 Response:', result);
            if (error) console.error('  ⚠️ Error:', error);
        }

        return log;
    }

    logError(source, error) {
        const log = {
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            type: 'ERROR',
            source: source,
            message: error?.message || String(error),
            stack: error?.stack
        };

        this.errors.push(log);
        this.logs.push(log);
        this._writeToFile(log); // Write to file

        if (this.enabled) {
            console.error(`🔴 [ERROR] ${source}:`, error);
        }
    }

    logWarning(message) {
        const log = {
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            type: 'WARNING',
            message: message
        };

        this.logs.push(log);
    }

    logEvent(category, action, details = null) {
        const log = {
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            type: 'EVENT',
            category: category,
            action: action,
            details: details
        };

        this.logs.push(log);

        if (this.enabled) {
            console.log(`📍 [${category}] ${action}`, details || '');
        }
    }

    _sanitize(obj) {
        if (!obj) return obj;

        // Don't log huge base64 strings
        const str = JSON.stringify(obj);
        if (str.length > 10000) {
            return { _truncated: true, size: str.length, preview: str.substring(0, 200) + '...' };
        }

        return obj;
    }

    getStats() {
        const totalCalls = this.apiCalls.length;
        const successCalls = this.apiCalls.filter(c => c.success).length;
        const failedCalls = this.apiCalls.filter(c => !c.success).length;

        const byProvider = {};
        this.apiCalls.forEach(call => {
            if (!byProvider[call.provider]) {
                byProvider[call.provider] = { total: 0, success: 0, failed: 0 };
            }
            byProvider[call.provider].total++;
            if (call.success) {
                byProvider[call.provider].success++;
            } else {
                byProvider[call.provider].failed++;
            }
        });

        return {
            uptime: Date.now() - this.startTime,
            totalLogs: this.logs.length,
            totalErrors: this.errors.length,
            apiCalls: {
                total: totalCalls,
                success: successCalls,
                failed: failedCalls,
                successRate: totalCalls > 0 ? ((successCalls / totalCalls) * 100).toFixed(1) + '%' : 'N/A',
                byProvider: byProvider
            }
        };
    }

    printStats() {
        const stats = this.getStats();
        console.log('\n' + '='.repeat(60));
        console.log('📊 LORAFACTORY MONITORING STATS');
        console.log('='.repeat(60));
        console.log(`⏱️  Uptime: ${(stats.uptime / 1000).toFixed(1)}s`);
        console.log(`📝 Total Logs: ${stats.totalLogs}`);
        console.log(`❌ Total Errors: ${stats.totalErrors}`);
        console.log(`\n🌐 API Calls:`);
        console.log(`   Total: ${stats.apiCalls.total}`);
        console.log(`   Success: ${stats.apiCalls.success}`);
        console.log(`   Failed: ${stats.apiCalls.failed}`);
        console.log(`   Success Rate: ${stats.apiCalls.successRate}`);
        console.log(`\n📍 By Provider:`);
        Object.entries(stats.apiCalls.byProvider).forEach(([provider, data]) => {
            console.log(`   ${provider}: ${data.success}/${data.total} (${((data.success/data.total)*100).toFixed(0)}%)`);
        });
        console.log('='.repeat(60) + '\n');
    }

    getRecentErrors(count = 10) {
        return this.errors.slice(-count);
    }

    getRecentApiCalls(count = 10) {
        return this.apiCalls.slice(-count);
    }

    clear() {
        this.logs = [];
        this.errors = [];
        this.apiCalls = [];
        console.log('🧹 Monitor cleared');
    }

    enable() {
        this.enabled = true;
        console.log('👁️ Monitor enabled');
    }

    disable() {
        this.enabled = false;
        console.log('🙈 Monitor disabled');
    }
}

// Global monitor instance
window.monitor = new Monitor();

// Helper functions
window.printStats = () => monitor.printStats();
window.showErrors = () => console.table(monitor.getRecentErrors());
window.showApiCalls = () => console.table(monitor.getRecentApiCalls());
window.clearMonitor = () => monitor.clear();

console.log('👁️ Monitor initialized. Available commands:');
console.log('  monitor.printStats()  - Show statistics');
console.log('  monitor.getRecentErrors()  - Get recent errors');
console.log('  monitor.getRecentApiCalls()  - Get recent API calls');
console.log('  printStats()  - Shortcut for stats');
console.log('  showErrors()  - Show errors table');
console.log('  showApiCalls()  - Show API calls table');
