// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require("path");
const session = require('express-session');
require('dotenv').config();   // ← loads .env into process.env

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true })); // needed for post

// app.use(express.static('public'));
app.use(express.static(path.join(__dirname, "public")));

const players = {}; // id → { id, x, y, color, name, health }

let intervalId = null;

io.on('connection', (socket) => {
    console.log('In Connection');
    const { token } = socket.handshake.auth;
    
    if (token === "_") {
        console.log("This user is not logged in - not adding.");
        return;
    }    
    
    if (typeof token === "undefined") {
        console.log("Connection NOT established - undefined token");
        return;
    }
        
    const id = uuidv4();
    console.log("Connection established with name: " + token + " and socket id: " + socket.id + " user id: " + id);
    
    const color = '#1133CC';
    const color2 = '#FF1122';
    players[id] = { 
        id, 
        x: Math.floor(Math.random() * 600), 
        y: Math.floor(Math.random() * 400), 
        color,
        name: token, 
        health: 100,
        alive: true  // NEW: track if player is alive
    };

    // Send the current state and current set of players to client
    socket.emit('init', { id, players });

    // Notify all others that this player joined
    socket.broadcast.emit('join', players[id]);

    // Client has moved, update state and let everyone know
    socket.on('move', ({ x, y }) => {
        if (players[id] && players[id].alive) {  // Only allow movement if alive
            // Check canvas boundaries (assuming 800x600 canvas)
            const hitEdge = (x <= 20 || x >= 780 || y <= 20 || y >= 580);
            
            if (hitEdge && players[id].health > 0) {
                // Lose 20% of current health when hitting edge
                players[id].health = Math.max(0, players[id].health * 0.8);
                
                // Check if player died from edge collision
                if (players[id].health <= 0) {
                    players[id].alive = false;
                }
            }
            
            players[id].x = x;
            players[id].y = y;
            io.emit('move', { id, x, y });
        }
    });

socket.on('hitEdge', () => {
    if (players[id] && players[id].alive && players[id].health > 0) {
        // Lose 20% of current health when hitting edge
        players[id].health = Math.max(0, players[id].health * 0.8);
        
        // Check if player died from edge collision
        if (players[id].health <= 0) {
            players[id].alive = false;
        }
        
        console.log(`Player ${players[id].name} hit edge, health now: ${players[id].health}`);
    }
});
    
    // Every quarter second, broadcast an update to ALL clients
    let counter = 0;

    if (!intervalId) {
        intervalId = setInterval(() => {
            for (const id in players) {
                // REMOVED: constant health depletion
                
                if (counter++ > 3) { // toggle color periodically
                    players[id].color = (players[id].color === color) ? color2 : color;
                    counter = 0;
                }
            }
            io.emit('update', { players });
        }, 250);    
    }
    
    socket.on('disconnect', () => {
        clearInterval(intervalId);
        intervalId = null;
        delete players[id];
        io.emit('leave', id);
    });        
});
    

// ========= Authentication related
// 2) Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        // secure: true, // enable if you serve over HTTPS
        maxAge: 1000 * 60 * 60 // 1 hour
    }
}));

// 3) Middleware to protect routes
function requireAuth(req, res, next) {
    if (req.session.authenticated) return next();
    res.redirect('/login');
}

// 4) Login form
app.get('/login', (req, res) => {
    console.log('in app GET /login');
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

// 5) Login handler
app.post('/login', (req, res) => {
    const { name, password } = req.body;
    console.log('in app POST /login');
    console.log(req.body);
    if (password === process.env.SHARED_PASSWORD) {
        req.session.authenticated = true;
        return res.redirect('/canvas');
    }
    // on failure, you might re‑render with an error message
    res.redirect('/login?error=1');
});

// 6) Protected canvas page
app.get('/canvas', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'participate_game_93.html'));
});

// 7) Optionally allow logout
app.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});


const PORT = 3003;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.IO server running at http://localhost:${PORT}`);
});