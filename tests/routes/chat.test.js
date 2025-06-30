const request = require('supertest');
const express = require('express');
const session = require('express-session');
const path = require('path');
const chatService = require('../../services/chatService');

// Create a complete mock instead of using requireActual
jest.mock('../../services/chatService', () => ({
    activeConnections: new Map(),
    conversations: new Map(),
    connectionTimeouts: new Map(),
    getConnection: jest.fn(),
    sendMessage: jest.fn(),
    processStream: jest.fn(),
    cleanup: jest.fn(),
    addConnection: jest.fn(),
    removeConnection: jest.fn()
}));

describe('Chat Routes', () => {
    let app;
    let mockWs;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        
        // Add session middleware for tests
        app.use(session({
            secret: 'test-secret',
            resave: false,
            saveUninitialized: true
        }));

        // Set up view engine
        app.set('views', path.join(__dirname, '../../views'));
        app.set('view engine', 'ejs');

        app.use('/', require('../../routes/chat'));

        // Mock WebSocket
        mockWs = {
            send: jest.fn(),
            on: jest.fn(),
            readyState: 1,
            removeAllListeners: jest.fn()
        };

        // Reset all mocks
        jest.clearAllMocks();
        chatService.cleanup();
    });

    afterAll(() => {
        chatService.cleanup();
    });

    describe('POST /chat', () => {
        it('should require message', async () => {
            const response = await request(app)
                .post('/chat')
                .send({ chatId: 'test-id' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Message is required');
        });

        it('should require chatId', async () => {
            const response = await request(app)
                .post('/chat')
                .send({ message: 'test' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Chat ID is required');
        });

        it('should handle missing WebSocket connection', async () => {
            chatService.getConnection.mockReturnValue(null);

            const response = await request(app)
                .post('/chat')
                .send({ message: 'test', chatId: 'test-id' });

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('No active connection');
        });

        it('should process messages successfully', async () => {
            const mockStream = {};
            chatService.getConnection.mockReturnValue(mockWs);
            chatService.sendMessage.mockResolvedValue(mockStream);
            chatService.processStream.mockResolvedValue(true);

            const response = await request(app)
                .post('/chat')
                .send({ message: 'test', chatId: 'test-id' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(chatService.sendMessage).toHaveBeenCalledWith('test', 'test-id');
            expect(chatService.processStream).toHaveBeenCalled();
        });

        it('should handle stream processing failures', async () => {
            chatService.getConnection.mockReturnValue(mockWs);
            chatService.sendMessage.mockResolvedValue({});
            chatService.processStream.mockResolvedValue(false);

            const response = await request(app)
                .post('/chat')
                .send({ message: 'test', chatId: 'test-id' });

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Failed to process stream');
        });

        it('should handle service errors', async () => {
            chatService.getConnection.mockReturnValue(mockWs);
            chatService.sendMessage.mockRejectedValue(new Error('Service error'));

            const response = await request(app)
                .post('/chat')
                .send({ message: 'test', chatId: 'test-id' });

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Service error');
        });
    });

    describe('GET /', () => {
        it('should initialize session with chatId', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);

            // Verify that a session was created with a chatId
            const cookies = response.headers['set-cookie'];
            expect(cookies).toBeDefined();
            expect(cookies.length).toBeGreaterThan(0);
        });
    });
}); 