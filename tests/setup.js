// Mock environment variables for testing
process.env.AGENT_KEY = 'test-agent-key';
process.env.AGENT_ENDPOINT = 'https://test.endpoint/api/v1/';
process.env.SESSION_SECRET = 'test-session-secret';

// Silence console logs during tests unless explicitly testing them
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
}; 