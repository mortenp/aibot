const chatService = require('../../../services/chatService');
const authService = require('../../../services/authService');
const { OpenAI } = require('openai');

// Mock dependencies
jest.mock('../../../services/authService', () => ({
    getApiKey: jest.fn()
}));
jest.mock('openai');

// Mock timers
jest.useFakeTimers();

describe('ChatService Unit Tests', () => {
    const sessionId = 'test-session';
    let mockWs;

    beforeEach(() => {
        jest.clearAllMocks();
        chatService.cleanup();
        
        // Initialize conversation history
        chatService.conversations.set(sessionId, []);
        
        // Mock WebSocket
        mockWs = {
            send: jest.fn(),
            on: jest.fn(),
            readyState: 1,
            removeAllListeners: jest.fn()
        };

        // Mock AuthService
        authService.getApiKey.mockResolvedValue('mock-api-key');
    });

    afterAll(() => {
        chatService.cleanup();
    });

    describe('getClient', () => {
        it('should create an OpenAI client with valid API key', async () => {
            const client = await chatService.getClient();
            expect(client).toBeInstanceOf(OpenAI);
            expect(authService.getApiKey).toHaveBeenCalled();
        });
    });

    describe('processStream', () => {
        beforeEach(() => {
            chatService.addConnection(sessionId, mockWs);
        });

        it('should process stream and update conversation history', async () => {
            const mockStream = {
                async *[Symbol.asyncIterator]() {
                    yield { choices: [{ delta: { content: 'Hello' } }] };
                    yield { choices: [{ delta: { content: ' World!' } }] };
                }
            };

            const success = await chatService.processStream(mockStream, mockWs, sessionId);

            expect(success).toBe(true);
            expect(mockWs.send).toHaveBeenCalledWith(
                JSON.stringify({ content: 'Hello World!' })
            );
        });

        it('should handle stream errors', async () => {
            const mockStream = {
                async *[Symbol.asyncIterator]() {
                    throw new Error('Stream error');
                }
            };

            const success = await chatService.processStream(mockStream, mockWs, sessionId);

            expect(success).toBe(false);
            expect(mockWs.send).toHaveBeenCalledWith(
                JSON.stringify({ error: 'Error processing response' })
            );
        });
    });
}); 