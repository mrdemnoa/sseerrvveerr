const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: false
});

// Статические файлы
app.use(express.static('public'));

// Хранилище данных mrDemnoa
const mrDemnoaRooms = new Map();
const mrDemnoaClients = new Map();

console.log('🚀 mrDemnoa Server запускается...');

// ========== ДОБАВЬ ЭНДПОИНТ ДЛЯ ПИНГА ПРЯМО ЗДЕСЬ ==========
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: Date.now(),
        message: 'mrDemnoa Server is alive!',
        rooms: mrDemnoaRooms.size,
        players: mrDemnoaClients.size
    });
});
// ========== КОНЕЦ ДОБАВЛЕННОГО КОДА ==========

// Генерация кода комнаты (4 буквы)
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Проверяем, что код уникальный
    if (mrDemnoaRooms.has(result)) {
        return generateRoomCode();
    }
    return result;
}

// Отправка сообщения клиенту
function sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Отправка ошибки
function sendError(ws, message) {
    sendToClient(ws, {
        type: 'ERROR',
        message: message
    });
}

// Broadcast всем в комнате
function broadcastToRoom(roomCode, data, excludeWs = null) {
    const room = mrDemnoaRooms.get(roomCode);
    if (!room) return;

    room.participants.forEach(username => {
        const client = getClientByUsername(username);
        if (client && client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Поиск клиента по username
function getClientByUsername(username) {
    for (let [ws, clientData] of mrDemnoaClients) {
        if (clientData.username === username) {
            return ws;
        }
    }
    return null;
}

// Обработка подключения
wss.on('connection', (ws) => {
    console.log('🎮 Новый игрок подключился');
    
    // Инициализация клиента
    const clientId = Math.random().toString(36).substr(2, 9);
    mrDemnoaClients.set(ws, {
        id: clientId,
        username: `Player${Math.floor(Math.random() * 1000)}`,
        roomCode: null,
        isConnected: false
    });

    // Отправляем приветственное сообщение
    sendToClient(ws, {
        type: 'WELCOME',
        message: 'Добро пожаловать в mrDemnoa Multiplayer!',
        server: 'mrDemnoa Server 1.0',
        yourUsername: mrDemnoaClients.get(ws).username
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`📨 ${message.type} от ${mrDemnoaClients.get(ws)?.username}`);
            handleMessage(ws, message);
        } catch (error) {
            console.error('❌ Ошибка парсинга:', error);
            sendError(ws, 'Неверный формат сообщения');
        }
    });

    ws.on('close', () => {
        console.log(`👋 Игрок отключился: ${mrDemnoaClients.get(ws)?.username}`);
        handleDisconnect(ws);
    });

    ws.on('error', (error) => {
        console.error('💥 WebSocket ошибка:', error);
        handleDisconnect(ws);
    });
});

// Обработка сообщений
function handleMessage(ws, message) {
    const clientData = mrDemnoaClients.get(ws);
    if (!clientData) return;

    switch (message.type) {
        case 'SET_USERNAME':
            handleSetUsername(ws, message.username);
            break;

        case 'CREATE_PUBLIC_ROOM':
            handleCreateRoom(ws, 'public');
            break;

        case 'CREATE_PRIVATE_ROOM':
            handleCreateRoom(ws, 'private');
            break;

        case 'JOIN_ROOM_BY_CODE':
            handleJoinRoomByCode(ws, message.roomCode);
            break;

        case 'JOIN_RANDOM_ROOM':
            handleJoinRandomRoom(ws);
            break;

        case 'LEAVE_ROOM':
            handleLeaveRoom(ws);
            break;

        case 'SEND_MESSAGE':
            handleSendMessage(ws, message.message);
            break;

        case 'SET_GAME_STARTED':
            handleSetGameStarted(ws, message.started);
            break;

        case 'GET_ROOM_INFO':
            handleGetRoomInfo(ws);
            break;

        case 'PING':
            sendToClient(ws, { type: 'PONG' });
            break;

        default:
            sendError(ws, 'Неизвестная команда');
    }
}

// Установка username
function handleSetUsername(ws, username) {
    const clientData = mrDemnoaClients.get(ws);
    const oldUsername = clientData.username;
    
    if (username && username.trim().length > 0) {
        clientData.username = username.trim();
        
        // Обновляем username в комнате если он есть
        if (clientData.roomCode) {
            const room = mrDemnoaRooms.get(clientData.roomCode);
            if (room) {
                const index = room.participants.indexOf(oldUsername);
                if (index > -1) {
                    room.participants[index] = clientData.username;
                }
                
                // Если был владельцем - обновляем owner
                if (room.owner === oldUsername) {
                    room.owner = clientData.username;
                }
                
                // Уведомляем всех об изменении
                broadcastToRoom(clientData.roomCode, {
                    type: 'PLAYER_UPDATED',
                    oldUsername: oldUsername,
                    newUsername: clientData.username,
                    participants: room.participants
                });
            }
        }
        
        sendToClient(ws, {
            type: 'USERNAME_SET',
            username: clientData.username
        });
    }
}

// Создание комнаты
function handleCreateRoom(ws, roomType) {
    const clientData = mrDemnoaClients.get(ws);
    
    if (clientData.roomCode) {
        handleLeaveRoom(ws);
    }

    const roomCode = generateRoomCode();
    this.roomCode = roomCode;
    this.roomName = `Комната ${roomCode}`;
    this.roomType = roomType;
    this.isConnected = true;
    this.gameStarted = false;
    
    const room = {
        code: roomCode,
        name: `Комната ${roomCode}`,
        type: roomType,
        participants: [clientData.username],
        owner: clientData.username,
        messages: [],
        privateMessages: {},
        gameStarted: false,
        maxPlayers: 8,
        createdAt: Date.now()
    };

    mrDemnoaRooms.set(roomCode, room);
    clientData.roomCode = roomCode;
    clientData.isConnected = true;

    console.log(`🆕 Создана ${roomType} комната: ${roomCode} владелец: ${clientData.username}`);

    sendToClient(ws, {
        type: 'ROOM_CREATED',
        roomCode: roomCode,
        roomName: room.name,
        roomType: room.type,
        participants: room.participants
    });
}

// Присоединение по коду
function handleJoinRoomByCode(ws, roomCode) {
    const clientData = mrDemnoaClients.get(ws);
    const room = mrDemnoaRooms.get(roomCode.toUpperCase());

    if (!room) {
        sendError(ws, `Комната с кодом ${roomCode} не найдена`);
        return;
    }

    if (room.gameStarted) {
        sendError(ws, 'Игра уже начата, присоединиться нельзя');
        return;
    }

    if (room.participants.length >= room.maxPlayers) {
        sendError(ws, `Комната заполнена! Максимум ${room.maxPlayers} игроков`);
        return;
    }

    if (room.participants.includes(clientData.username)) {
        sendError(ws, 'Вы уже в этой комнате');
        return;
    }

    // Выходим из предыдущей комнаты если есть
    if (clientData.roomCode) {
        handleLeaveRoom(ws);
    }

    // Добавляем в комнату
    room.participants.push(clientData.username);
    clientData.roomCode = roomCode;
    clientData.isConnected = true;

    console.log(`🎯 ${clientData.username} присоединился к комнате ${roomCode}`);

    // Уведомляем нового участника
    sendToClient(ws, {
        type: 'ROOM_JOINED',
        roomCode: room.code,
        roomName: room.name,
        roomType: room.type,
        participants: room.participants,
        owner: room.owner,
        gameStarted: room.gameStarted
    });

    // Уведомляем всех в комнате о новом участнике
    broadcastToRoom(roomCode, {
        type: 'PLAYER_JOINED',
        username: clientData.username,
        participants: room.participants
    }, ws);
}

// Присоединение к случайной комнате
function handleJoinRandomRoom(ws) {
    const publicRooms = Array.from(mrDemnoaRooms.entries())
        .filter(([code, room]) => 
            room.type === 'public' && 
            !room.gameStarted && 
            room.participants.length < room.maxPlayers
        );

    if (publicRooms.length === 0) {
        sendError(ws, 'Нет доступных публичных комнат');
        return;
    }

    const randomRoom = publicRooms[Math.floor(Math.random() * publicRooms.length)];
    handleJoinRoomByCode(ws, randomRoom[0]);
}

// Выход из комнаты
function handleLeaveRoom(ws) {
    const clientData = mrDemnoaClients.get(ws);
    
    if (!clientData.roomCode) return;

    const room = mrDemnoaRooms.get(clientData.roomCode);
    if (room) {
        const index = room.participants.indexOf(clientData.username);
        if (index > -1) {
            room.participants.splice(index, 1);
        }

        // Уведомляем остальных о выходе
        broadcastToRoom(clientData.roomCode, {
            type: 'PLAYER_LEFT',
            username: clientData.username,
            participants: room.participants
        }, ws);

        // Если комната пустая - удаляем
        if (room.participants.length === 0) {
            mrDemnoaRooms.delete(clientData.roomCode);
            console.log(`🗑️ Комната ${clientData.roomCode} удалена (пустая)`);
        }
    }

    console.log(`🚪 ${clientData.username} покинул комнату ${clientData.roomCode}`);
    
    clientData.roomCode = null;
    clientData.isConnected = false;

    sendToClient(ws, { type: 'ROOM_LEFT' });
}

// Отправка сообщения в чат
function handleSendMessage(ws, message) {
    const clientData = mrDemnoaClients.get(ws);
    
    if (!clientData.roomCode || !message) return;

    const room = mrDemnoaRooms.get(clientData.roomCode);
    if (room) {
        const chatMessage = {
            sender: clientData.username,
            message: message,
            timestamp: Date.now(),
            type: 'public'
        };

        room.messages.push(chatMessage);

        // Отправляем всем в комнате
        broadcastToRoom(clientData.roomCode, {
            type: 'NEW_MESSAGE',
            sender: clientData.username,
            message: message,
            timestamp: chatMessage.timestamp
        });

        console.log(`💬 ${clientData.username}: ${message}`);
    }
}

// Установка статуса игры
function handleSetGameStarted(ws, started) {
    const clientData = mrDemnoaClients.get(ws);
    
    if (!clientData.roomCode) return;

    const room = mrDemnoaRooms.get(clientData.roomCode);
    if (room && room.owner === clientData.username) {
        room.gameStarted = started;
        
        broadcastToRoom(clientData.roomCode, {
            type: 'GAME_STATE_CHANGED',
            gameStarted: started,
            changedBy: clientData.username
        });

        console.log(`🎮 Игра в комнате ${clientData.roomCode} ${started ? 'начата' : 'остановлена'} владельцем ${clientData.username}`);
    }
}

// Получение информации о комнате
function handleGetRoomInfo(ws) {
    const clientData = mrDemnoaClients.get(ws);
    
    if (!clientData.roomCode) {
        sendError(ws, 'Вы не в комнате');
        return;
    }

    const room = mrDemnoaRooms.get(clientData.roomCode);
    if (room) {
        sendToClient(ws, {
            type: 'ROOM_INFO',
            roomCode: room.code,
            roomName: room.name,
            roomType: room.type,
            participants: room.participants,
            owner: room.owner,
            gameStarted: room.gameStarted,
            participantCount: room.participants.length
        });
    }
}

// Обработка отключения
function handleDisconnect(ws) {
    const clientData = mrDemnoaClients.get(ws);
    if (clientData) {
        handleLeaveRoom(ws);
        mrDemnoaClients.delete(ws);
    }
}

// Статус сервера
function printServerStatus() {
    console.log('\n=== mrDemnoa Server Status ===');
    console.log(`🏠 Комнат: ${mrDemnoaRooms.size}`);
    console.log(`👥 Игроков: ${mrDemnoaClients.size}`);
    
    mrDemnoaRooms.forEach((room, code) => {
        console.log(`   ${code} [${room.type}] - ${room.participants.length}/${room.maxPlayers} игроков - Игра: ${room.gameStarted ? 'начата' : 'ожидание'}`);
    });
    console.log('==============================\n');
}

// Периодический статус
setInterval(printServerStatus, 30000); // Каждые 30 секунд

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n✨ mrDemnoa Server запущен на порту ${PORT}`);
    console.log(`🌐 WebSocket: ws://localhost:${PORT}`);
    console.log(`📊 Ping: http://localhost:${PORT}/ping`);
    console.log(`🚀 Готов к мультиплееру!\n`);
    
    // Статус страница
    app.get('/status', (req, res) => {
        const roomsArray = Array.from(mrDemnoaRooms.entries()).map(([code, room]) => ({
            code: code,
            name: room.name,
            type: room.type,
            participants: room.participants,
            owner: room.owner,
            gameStarted: room.gameStarted,
            participantCount: room.participants.length
        }));

        res.json({
            server: 'mrDemnoa Multiplayer Server',
            version: '1.0',
            totalRooms: mrDemnoaRooms.size,
            totalPlayers: mrDemnoaClients.size,
            uptime: process.uptime(),
            rooms: roomsArray
        });
    });

    // Главная страница
    app.get('/', (req, res) => {
        res.json({
            name: 'mrDemnoa Multiplayer Server',
            version: '1.0',
            status: 'running',
            websocket: `wss://${req.get('host')}`,
            ping: `https://${req.get('host')}/ping`,
            status: `https://${req.get('host')}/status`
        });
    });
});