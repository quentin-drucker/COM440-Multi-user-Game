const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require("path");
const session = require('express-session');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ========== Middleware Setup (MUST BE IN THIS ORDER!) ==========

// 1) Body parser middleware
app.use(express.urlencoded({ extended: true }));

// 2) Static files
app.use(express.static(path.join(__dirname, "public")));

// 3) Session middleware (MUST COME BEFORE ROUTES!)
app.use(session({
  secret: process.env.SESSION_SECRET || 'xx0x-game-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // secure: true, // enable if you serve over HTTPS
    maxAge: 1000 * 60 * 60 // 1 hour
  }
}));

// ========== Authentication Related ==========

// Middleware to protect routes
function requireAuth(req, res, next) {
    if (req.session.authenticated) return next();
    res.redirect('/login');
}

// ========== Routes (MUST COME AFTER SESSION MIDDLEWARE!) ==========

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Login form
app.get('/login', (req, res) => {
    console.log('in app GET /login');
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

// Login POST handler
app.post('/login', (req, res) => {
    const { name, password } = req.body;
    console.log('in app POST /login');
    console.log(req.body);
    if (password === process.env.SHARED_PASSWORD || password === 'xx0x') {
        req.session.authenticated = true;
        return res.redirect('/canvas');
    }
    res.redirect('/login?error=1');
});

// Protected canvas route
app.get('/canvas', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'participate_game_93.html'));
});

// Logout handler
app.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// ========== Socket.IO Game Logic ==========

const players = {};
let intervalId = null;

io.on('connection', (socket) => {
    const token = socket.handshake.auth.token;
    const color = socket.handshake.auth.color;
    const id = uuidv4();
    
    console.log("New connection with token: " + token + " and socket id: " + socket.id + " user id: " + id);
    
    const defaultColor = color || '#152da4ff';

    // Safe spawn area (stay away from the 20px edge margin)
    const SPAWN_BUFFER = 60;
    const minX = 20 + SPAWN_BUFFER;
    const maxX = 800 - 20 - SPAWN_BUFFER;
    const minY = 20 + SPAWN_BUFFER;
    const maxY = 600 - 20 - SPAWN_BUFFER;

    players[id] = { 
        id,
        x: Math.floor(minX + Math.random() * (maxX - minX)),
        y: Math.floor(minY + Math.random() * (maxY - minY)),
        color: defaultColor,
        name: token,
        health: 100,
        alive: true
    };

    // Send the current state and current set of players to client
    socket.emit('init', { id, players });

    // Notify all others that this player joined
    socket.broadcast.emit('join', players[id]);

    // Start broadcasting updates if not already running
    if (!intervalId) {
        intervalId = setInterval(() => {
            io.emit('update', { players });
        }, 250);
    }

    // Client has moved, update state and let everyone know
    socket.on('move', ({ x, y }) => {
        if (players[id] && players[id].alive) {
            const hitEdge = (x <= 20 || x >= 780 || y <= 20 || y >= 580);
            
            if (hitEdge && players[id].health > 0) {
                // Lose 20 health when hitting edge (flat damage)
                players[id].health = Math.max(0, players[id].health - 20);
                
                // Check if player died from edge collision
                if (players[id].health <= 0) {
                    players[id].alive = false;
                }
            }
            
            players[id].x = x;
            players[id].y = y;
            socket.broadcast.emit('move', { id, x, y });
        }
    });

    socket.on('hitEdge', () => {
        if (players[id] && players[id].alive && players[id].health > 0) {
            // Lose 20% of current health when hitting edge
            players[id].health = players[id].health * 0.8;

            // Check if player died from edge collision
            if (players[id].health <= 0) {
                players[id].alive = false;
            }
        }
    });

    socket.on('jump', ({ xy }) => {
        if (players[id]) {
            players[id].x += xy;
            players[id].y += xy;
            io.emit('move', { id, x: players[id].x, y: players[id].y });
        }
    });

    socket.on('bump', ({ targetId, impulseX, impulseY }) => {
        const target = players[targetId];
        if (!target || !target.alive) return;

        // Apply impulse to target's position
        target.x += impulseX;
        target.y += impulseY;

        // Clamp to arena bounds
        target.x = Math.max(20, Math.min(780, target.x));
        target.y = Math.max(20, Math.min(580, target.y));

        // Check if target hit edge after being bumped
        const hitEdge = (target.x <= 20 || target.x >= 780 || target.y <= 20 || target.y >= 580);
        if (hitEdge && target.health > 0) {
            target.health = Math.max(0, target.health - 20);
            if (target.health <= 0) {
                target.alive = false;
            }
            console.log(`Player ${targetId} bumped into wall, health now: ${target.health}`);
        }

        // Broadcast updated position immediately
        io.emit('move', { id: targetId, x: target.x, y: target.y });
    });

    socket.on('disconnect', () => {
        clearInterval(intervalId);
        intervalId = null;
        delete players[id];
        io.emit('leave', id);
    });
});

// ========== Start Server ==========

const PORT = 3003;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.IO server running at http://localhost:${PORT}`);
});