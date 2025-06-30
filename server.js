require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const { WebSocketServer } = require('ws');
const chatService = require('./services/chatService');

// Configuration constants
const WS_PING_INTERVAL = 30000; // 30 seconds
const WS_SHUTDOWN_TIMEOUT = 10000; // 10 seconds

const app = express();


const cookieParser = require('cookie-parser');
app.use(cookieParser());

function isValidUUID(uuid) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

// Session middleware
if (!process.env.SESSION_SECRET) {
    console.error('SESSION_SECRET environment variable is required');
    process.exit(1);
}

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
app.use('/', require('./routes/chat'));

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Something broke!' });
});

// Add health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Create HTTP server
const server = require('http').createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ noServer: true });

// Keep track of ping intervals
const pingIntervals = new Map();

// Handle WebSocket connections for regular chat
wss.on('connection', async (ws, req) => {
    const chatId = new URL(req.url, 'ws://localhost').searchParams.get('chatId');

    if (!chatId || !isValidUUID(chatId) ) {
        ws.close(1008, 'Chat ID is required');
        return;
    }

    console.log('WebSocket connection established for session:', chatId);

    try {
        // Store the WebSocket connection
        chatService.addConnection(chatId, ws);

        // Set up ping interval
        const pingInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.ping();
            }
        }, WS_PING_INTERVAL);
        pingIntervals.set(chatId, pingInterval);

        // Handle pong responses
        ws.on('pong', () => {
            console.log(`Received pong from ${chatId}`);
        });

        // Send initial connection message
        ws.send(JSON.stringify({ content: 'Connected to chat stream' }));

        // Handle WebSocket closure
        ws.on('close', () => {
            console.log('WebSocket connection closed for session:', chatId);
            // Clear ping interval
            const interval = pingIntervals.get(chatId);
            if (interval) {
                clearInterval(interval);
                pingIntervals.delete(chatId);
            }
            chatService.removeConnection(chatId);
        });

        // Handle WebSocket errors
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            // Clear ping interval
            const interval = pingIntervals.get(chatId);
            if (interval) {
                clearInterval(interval);
                pingIntervals.delete(chatId);
            }
            chatService.removeConnection(chatId);
        });
    } catch (error) {
        console.error('Error setting up WebSocket connection:', error);
        ws.close(1011, 'Failed to initialize connection');
    }
});

// Set up WebSocket upgrade handling
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Clean up intervals on shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    
    // Clear all ping intervals
    for (const interval of pingIntervals.values()) {
        clearInterval(interval);
    }
    pingIntervals.clear();
    
    // Close WebSocket server
    wss.close(() => {
        console.log('WebSocket server closed.');
        // Close HTTP server
        server.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
    });
    
    // Force close after timeout
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, WS_SHUTDOWN_TIMEOUT);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 