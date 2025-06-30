document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');
    const themeToggle = document.getElementById('theme-toggle');
    const connectionStatus = document.getElementById('connection-status');
    const retryButton = document.getElementById('retry-button');
    let ws = null;
    let currentAIMessage = null;
    let isReconnecting = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 1000; // Start with 1 second


function getChatIdFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)chatId=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

//window.chatId = getChatIdFromCookie();
//console.log('Restored chatId from cookie:', window.chatId);

fetch('/chat/history')
  .then(res => res.json())
  .then(messages => {
    for (const message of messages) {
    console.log(`get message from history:` + message.content + " role:  "+ message.role);
    
      if (message.role === 'assistant' || message.role === 'user') {
        appendMessageToUI(message.content, message.role); // Your render function
        console.log(`adding message from history:` + message.content);
      }
    }
  });


function appendMessageToUI(text, role = 'user') {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const messageEl = document.createElement('div');
  messageEl.className = `message message-${role === 'assistant' ? 'ai' : 'user'} message-enter`;
  messageEl.dataset.content = text;

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';

  if (role === 'assistant') {
    // If assistant, render as Markdown (optional: use `marked()` if enabled)
    contentEl.innerHTML = marked ? marked.parse(text) : `<p>${text}</p>`;
  } else {
    contentEl.textContent = text;
  }

  const timestampEl = document.createElement('div');
  timestampEl.className = 'message-timestamp';
  const now = new Date();
  timestampEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageEl.appendChild(contentEl);
  messageEl.appendChild(timestampEl);

  // Add status icon for user messages
  if (role !== 'assistant') {
    const statusEl = document.createElement('div');
    statusEl.className = 'message-status sent';
    statusEl.innerHTML = `<i class="bi bi-check"></i>`;
    messageEl.appendChild(statusEl);
  }

  container.appendChild(messageEl);

  // Trigger animation
  requestAnimationFrame(() => {
    messageEl.classList.remove('message-enter');
  });

  container.scrollTop = container.scrollHeight;
}


    // Configure marked options
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });

    // Theme toggle handler
    themeToggle.addEventListener('click', () => {
        window.themeService.toggleTheme();
    });

    // Listen for theme changes to update syntax highlighting
    window.addEventListener('themechange', (e) => {
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    });



    function updateConnectionStatus(status, message) {
        const statusDot = connectionStatus.querySelector('.status-dot');
        const statusText = connectionStatus.querySelector('.status-text');
        
        statusDot.className = 'status-dot ' + status;
        statusText.textContent = message;
        
        if (status === 'disconnected') {
            retryButton.classList.remove('d-none');
            messageInput.disabled = true;
            chatForm.querySelector('button[type="submit"]').disabled = true;
        } else {
            retryButton.classList.add('d-none');
            messageInput.disabled = false;
            chatForm.querySelector('button[type="submit"]').disabled = false;
        }
    }

    function formatTimestamp(date) {
        return new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        }).format(date);
    }

    function createMessageElement(content, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${isUser ? 'user' : 'ai'}`;
        
        // Store the raw content for later use
        messageDiv.setAttribute('data-content', content);
        
        // Create content container
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (isUser) {
            // User messages are plain text
            contentDiv.textContent = content;
        } else {
            // AI messages support markdown
            // Escape <think> tags before markdown parsing
            const escapedContent = content
                .replace(/<think>/g, '`<think>`')
                .replace(/<\/think>/g, '`</think>`');
            contentDiv.innerHTML = marked.parse(escapedContent);
            // Highlight any code blocks
            contentDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
        
        messageDiv.appendChild(contentDiv);

        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = formatTimestamp(new Date());
        messageDiv.appendChild(timestamp);

        // Add status indicator for user messages
        if (isUser) {
            const status = document.createElement('div');
            status.className = 'message-status sent';
            status.innerHTML = '<i class="bi bi-check"></i>';
            messageDiv.appendChild(status);
        }



        // Add the message-enter class after a brief delay
        setTimeout(() => {
            messageDiv.classList.add('message-enter');
        }, 10);
        
        return messageDiv;
    }

    function addMessage(content, isUser = false) {
        if (!content.trim()) return;
        
        if (isUser) {
            // Always create new message for user
            const messageElement = createMessageElement(content, true);
            chatMessages.appendChild(messageElement);
        } else {
            // For AI responses, either create new or update existing
            if (!currentAIMessage) {
                currentAIMessage = createMessageElement(content, false);
                chatMessages.appendChild(currentAIMessage);
            } else {
                // Accumulate content and re-render with markdown
                const existingContent = currentAIMessage.getAttribute('data-content') || '';
                const newContent = existingContent + content;
                currentAIMessage.setAttribute('data-content', newContent);
                
                const contentDiv = currentAIMessage.querySelector('.message-content');
                // Escape <think> tags before markdown parsing
                const escapedContent = newContent
                    .replace(/<think>/g, '`<think>`')
                    .replace(/<\/think>/g, '`</think>`');
                contentDiv.innerHTML = marked.parse(escapedContent);
                
                // Re-highlight code blocks
                contentDiv.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = 'typing-indicator';
        indicator.textContent = 'Jeg tænker...';
        chatMessages.appendChild(indicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // Initialize WebSocket connection
    function initializeWebSocket() {
        if (ws) {
            ws.close();
            ws = null;
        }

        if (isReconnecting) {
            updateConnectionStatus('reconnecting', `Forbinder (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
        } else {
            updateConnectionStatus('connecting', 'Forbinder...');
            reconnectAttempts = 0;
        }

        console.log('Initializing WebSocket connection...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
 //       ws = new WebSocket(`${protocol}//${window.location.host}?chatId=${window.chatId}`);
          ws = new WebSocket(`${protocol}//${window.location.host}/ws?chatId=${window.chatId}`);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.error) {
                    console.error('WebSocket Error:', data.error);
                    removeTypingIndicator();
                    addMessage(`\`\`\`error\n${data.error}\n\`\`\``, false);
                    currentAIMessage = null; // Reset for next message
                } else if (data.content) {
                    if (data.content === 'Connected to chat stream') {
                        console.log('WebSocket Connected successfully');
                        updateConnectionStatus('connected', 'Connected');
                        isReconnecting = false;
                        reconnectAttempts = 0;
                    } else if (data.content === 'Connection closed') {
                        console.log('Server closed connection');
                        ws.close();
                    } else {
                        removeTypingIndicator();
                        addMessage(data.content, false);
                    }
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        ws.onclose = (event) => {
            console.log('WebSocket connection closed', event.code, event.reason);
            updateConnectionStatus('disconnected', 'Afbrudt');
            
            // Don't retry if it was an initialization failure
            if (event.code === 1011) {
                console.error('Connection initialization failed:', event.reason);
                updateConnectionStatus('disconnected', 'Connection failed: ' + event.reason);
                return;
            }
            
            // Implement exponential backoff for reconnection
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000);
                console.log(`Attempting to reconnect in ${delay}ms...`);
                isReconnecting = true;
                reconnectAttempts++;
                setTimeout(initializeWebSocket, delay);
            } else {
                console.log('Max reconnection attempts reached');
                updateConnectionStatus('disconnected', 'Connection failed');
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            removeTypingIndicator();
            currentAIMessage = null; // Reset for next message
        };
    }

    // Initialize WebSocket connection when page loads
    initializeWebSocket();

    // Retry button handler
    retryButton.addEventListener('click', () => {
        console.log('Manual reconnection attempt');
        isReconnecting = false;
        reconnectAttempts = 0;
        initializeWebSocket();
    });

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = messageInput.value.trim();
        if (!message) return;

        try {
            // Show user message immediately
            messageInput.value = '';
            addMessage(message, true);
            showTypingIndicator();
            currentAIMessage = null; // Reset for new response

            // Check WebSocket connection
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.log('WebSocket not connected, attempting to reconnect...');
                await new Promise((resolve) => {
                    isReconnecting = false;
                    reconnectAttempts = 0;
                    initializeWebSocket();
                    // Wait for connection or timeout
                    let timeout = setTimeout(() => {
                        resolve(false);
                    }, 5000);
                    ws.onopen = () => {
                        clearTimeout(timeout);
                        resolve(true);
                    };
                });
            }

            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message,
                    chatId: window.chatId
                })
            });

            if (!response.ok) {
                const error = await response.json();
                if (response.status === 401) {
                    // Token expired, show message and retry button
                    updateConnectionStatus('disconnected', 'Session expired. Please click Retry to reconnect.');
                    throw new Error('Session expired. Please retry.');
                }
                throw new Error(error.error || 'Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            removeTypingIndicator();
            addMessage(`\`\`\`error\n${error.message}\n\`\`\``, false);
            currentAIMessage = null;
        }
    });
}); 