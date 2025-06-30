const express = require('express');
const router = express.Router();
const chatService = require('../services/chatService');

//const ACCESS_KEY = 'cinecraft664438'; // Put this in an env variable for security
const ACCESS_KEY = process.env.ACCESS_KEY;

// Handle new chat messages
router.post('/chat', async (req, res) => {

//  const key = req.query.key;

//  if (key !== ACCESS_KEY) {
//    return res.status(403).send('Access Denied');
//  }
const { v4: uuidv4 } = require('uuid');

let chatId = req.cookies.chatId;

if (!chatId) {
    chatId = uuidv4();
    res.cookie('chatId', chatId, {
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      httpOnly: false,
      sameSite: 'Lax',
    });
    console.log('Assigned new chatId cookie:', chatId);
  } else {
    console.log('Existing chatId from cookie:', chatId);
  }
  
    
  try {
    const { message, chatId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (!chatId) {
      return res.status(400).json({ error: 'Chat ID is required' });
    }

    console.log('Processing message for session:', chatId);
console.log('User message:', message);
    // Get the WebSocket connection for this session
//    const ws = chatService.getConnection(chatId);
 // new method 
const ws = chatService.getConnection(chatId);

if (!ws || ws.readyState !== ws.OPEN) {
  console.error('No active WebSocket connection found for session:', chatId);
  return res.status(500).json({ error: 'No active connection' });
}

//ws.send(JSON.stringify({ content: 'Hello from server' }));

const stream = await chatService.sendMessage(message, chatId);
const success = await chatService.processStream(stream, ws, chatId);

if (!success) {
  return res.status(500).json({ error: 'Failed to process stream' });
}

res.status(200).json({ success: true });

  } catch (error) {
    console.error('Chat error:', {
      message: error.message,
      stack: error.stack,
      chatId: req.body.chatId
    });
    res.status(500).json({ error: error.message || 'Failed to process message' });
  }
});

// Serve the chat page
router.get('/', (req, res) => {

 const key = req.query.key;

  if (key !== ACCESS_KEY) {
    return res.status(400).json({ error: 'No access' });
  }

let chatId = req.cookies.chatId;

if (!chatId) {
    chatId = require('uuid').v4();
    res.cookie('chatId', chatId, {
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      httpOnly: false,
      sameSite: 'Lax',
    });
    console.log('New: Assigned new chatId cookie:', chatId);
  } else {
    console.log('New: Existing chatId from cookie:', chatId);
  }


  // Initialize session with chatId if not exists
 // if (!req.session.chatId) {
//    req.session.chatId = require('uuid').v4();
//  }
  res.render('chat', { chatId: chatId });
});

router.get('/chat/history', (req, res) => {
  const chatId = req.cookies.chatId;
  
  if (!chatId) {
    return res.status(400).json({ error: 'No chatId in cookie' });
  }


  const history = chatService.conversations.get(chatId) || [];
  res.json(history);
});

module.exports = router; 