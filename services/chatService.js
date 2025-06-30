const { OpenAI } = require('openai');
const authService = require('./authService');

class ChatService {
  constructor() {
    this.AGENT_ENDPOINT = process.env.AGENT_ENDPOINT;
    this.activeConnections = new Map();
    this.conversations = new Map();
    this.connectionTimeouts = new Map();
    this.lastLoggedError = new Map(); // Track last error log time per session
    this.CLEANUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    console.log('ChatService initialized with endpoint:', this.AGENT_ENDPOINT);

    // Store interval ID for cleanup
    this.cleanupInterval = setInterval(() => this.cleanupOldConversations(), this.CLEANUP_TIMEOUT);
  }

  cleanupOldConversations() {
    console.log('Running conversation cleanup...');
    for (const [sessionId, connection] of this.activeConnections.entries()) {
      if (connection.readyState !== 1) { // Not OPEN
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.conversations.delete(sessionId);
        this.activeConnections.delete(sessionId);
        this.connectionTimeouts.delete(sessionId);
      }
    }
  }

  async getClient() {
    try {
      console.log('Getting API key...');
      const apiKey = await authService.getApiKey();
      console.log('Got API key, creating OpenAI client...');
      
      return new OpenAI({
        baseURL: this.AGENT_ENDPOINT,
        apiKey: apiKey,
        defaultHeaders: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error creating OpenAI client:', {
        error: error.message,
        name: error.name,
        status: error.status,
        stack: error.stack
      });
      throw error;
    }
  }

  addConnection(id, ws) {
    console.log('Adding new WebSocket connection for session:', id);
    
    // Clear any existing connection
    if (this.activeConnections.has(id)) {
      console.log('Removing existing connection for session:', id);
      this.removeConnection(id);
    }

    // Clear any existing timeout
    if (this.connectionTimeouts.has(id)) {
      console.log('Clearing existing timeout for session:', id);
      clearTimeout(this.connectionTimeouts.get(id));
      this.connectionTimeouts.delete(id);
    }

    // Store the new connection
    this.activeConnections.set(id, ws);
    console.log(`Active connections count: ${this.activeConnections.size}`);

    // Handle WebSocket close
    ws.on('close', () => {
      console.log('WebSocket connection closed for session:', id);
      this.removeConnection(id);
      
      // Set a timeout to clean up the conversation if no reconnection happens
      console.log('Setting cleanup timeout for session:', id);
      this.connectionTimeouts.set(id, setTimeout(() => {
        console.log('Cleaning up conversation for session:', id);
        this.conversations.delete(id);
        this.connectionTimeouts.delete(id);
      }, this.CLEANUP_TIMEOUT));
    });

    return true;
  }

  removeConnection(id) {
    console.log('Removing WebSocket connection for session:', id);
    const connection = this.activeConnections.get(id);
    if (connection) {
      if (connection.readyState === 1) { // 1 = OPEN
        try {
          connection.send(JSON.stringify({ content: 'Connection closed' }));
        } catch (error) {
          console.error('Error sending close message:', error);
        }
      }
      // Remove all listeners to prevent memory leaks
      connection.removeAllListeners();
    }
    this.activeConnections.delete(id);
    this.lastLoggedError.delete(id); // Clean up error logging state
    console.log(`Remaining active connections: ${this.activeConnections.size}`);
  }

  getConnection(id) {
    const connection = this.activeConnections.get(id);
    
    // Only log errors if we haven't logged recently (within last 5 seconds)
    if (!connection || (connection && connection.readyState > 1)) {
      const now = Date.now();
      const lastLog = this.lastLoggedError.get(id) || 0;
      
      if (now - lastLog > 5000) { // Only log every 5 seconds
        console.log(`WebSocket connection issue for ${id}: ${connection ? `state: ${connection.readyState}` : 'not found'}`);
        this.lastLoggedError.set(id, now);
      }
    }
    return connection;
  }

  async sendMessage(message, sessionId, isRetry = false) {
    console.log(`Attempting to send message for session ${sessionId}:`, message);
    
    try {
      console.log('Getting OpenAI client...');
      const client = await this.getClient();
      console.log('Got OpenAI client');
      
      // Get or initialize conversation history
      if (!this.conversations.has(sessionId)) {
        console.log('Initializing new conversation history for session:', sessionId);
        this.conversations.set(sessionId, []);
      }
      const conversationHistory = this.conversations.get(sessionId);
      
      // Only add message to history if this is not a retry attempt
      if (!isRetry) {
        conversationHistory.push({ role: 'user', content: message });
        // Keep only the last 4 messages (2 user + 2 assistant ideally)
if (conversationHistory.length > 4) {
  this.conversations.set(sessionId, conversationHistory.slice(-4));
  console.log('Trimmed conversation history:', this.conversations.get(sessionId));
}
        console.log('Updated conversation history:', conversationHistory);
      }

      console.log('Sending message to API...');
      const response = await client.chat.completions.create({
        model: 'n/a', // Model is handled by the GenAI Platform
        messages: conversationHistory,
        stream: true,
      });

      console.log('Got initial response from API');
      return response;
    } catch (error) {
      console.error('Error sending message:', {
        error: error.message,
        name: error.name,
        status: error.status,
        response: {
          data: error.response?.data,
          status: error.response?.status,
          headers: error.response?.headers
        },
        stack: error.stack
      });

      // If the error is due to an invalid token, try to refresh and retry once
      if (error.status === 401 && !isRetry) {
        console.log('Got 401 error, attempting token refresh...');
        try {
          await authService.ensureValidToken();
          console.log('Token refreshed, retrying message...');
          return this.sendMessage(message, sessionId, true);
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          if (refreshError.message.includes('Too many failed token refresh attempts')) {
            // Let the user know they need to wait
            throw new Error('Service is temporarily unavailable. Please try again in 30 seconds.');
          }
          throw new Error('Authentication failed. Please try again.');
        }
      }

      // For retry attempts or other errors, throw immediately
      if (isRetry || error.status === 401) {
        throw new Error('Failed to authenticate with the service. Please refresh the page and try again.');
      }

      throw new Error(`Failed to send message to AI: ${error.message}`);
    }
  }

  async processStream(stream, ws, sessionId) {
    console.log(`Starting to process stream for session: ${sessionId}`);
    try {
      const conversationHistory = this.conversations.get(sessionId);
      if (!conversationHistory) {
        console.error(`No conversation history found for session: ${sessionId}`);
        return false;
      }

      const fullResponse = [];
      let currentChunk = [];
      let wordCount = 0;

      console.log('Processing stream chunks...');
      for await (const chunk of stream) {
        // Check if connection is still active
        if (!this.activeConnections.has(sessionId)) {
          console.log('Connection closed during stream processing');
          return false;
        }

        if (chunk.choices[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          currentChunk.push(content);
          
          // Count words in current token
          const words = content.trim().split(/\s+/).filter(Boolean);
          wordCount += words.length;

          // Send chunk when we have enough words or hit punctuation
          if (wordCount >= 3 || /[.!?;]\s*$/.test(content)) {
            const message = currentChunk.join('');
            if (message.trim()) {
              fullResponse.push(message);
  //            console.log(`Sending chunk to client: ${message}`);
              ws.send(JSON.stringify({ content: message }));
            }
            currentChunk = [];
            wordCount = 0;
          }
        }
      }

      // Send any remaining content
      if (currentChunk.length > 0) {
        const message = currentChunk.join('');
        if (message.trim()) {
          fullResponse.push(message);
 //         console.log(`Sending final chunk to client: ${message}`);
          ws.send(JSON.stringify({ content: message }));
        }
      }

 //     console.log('Stream processing complete');
      
      // Store the complete response in conversation history
      if (fullResponse.length > 0) {
        const completeResponse = fullResponse.join('');
        console.log(`Storing complete response in history: ${completeResponse}`);
        conversationHistory.push({
          role: 'assistant',
          content: completeResponse
        });
      }

      return true;
    } catch (error) {
      console.error('Error processing stream:', {
        error: error.message,
        name: error.name,
        stack: error.stack,
        sessionId
      });
      
      if (this.activeConnections.has(sessionId)) {
        console.log('Sending error message to client');
        ws.send(JSON.stringify({ error: 'Error processing response' }));
      }
      return false;
    }
  }

  // Add cleanup method
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Clear all maps
    this.activeConnections.clear();
    this.conversations.clear();
    this.connectionTimeouts.clear();
    this.lastLoggedError.clear(); // Clean up error logging state
  }
}

module.exports = new ChatService(); 