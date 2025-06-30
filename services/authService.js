const axios = require('axios');

class AuthService {
    constructor() {
        this.initialized = false;
        this.AGENT_KEY = null;
    }

    validateConfig() {
        const required = ['AGENT_KEY', 'AGENT_ENDPOINT'];
        for (const key of required) {
            if (!process.env[key]) {
                throw new Error(`${key} is required`);
            }
        }
    }

    initialize() {
        if (this.initialized) return;
        this.validateConfig();
        this.AGENT_KEY = process.env.AGENT_KEY;
        console.log('[AuthService] Initialized');
        this.initialized = true;
    }

    async getApiKey() {
        this.initialize();
        return this.AGENT_KEY;
    }
}

module.exports = new AuthService(); 