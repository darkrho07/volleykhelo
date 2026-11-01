import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from './rooms/RoomManager';

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
    pingInterval: 5000,
    pingTimeout: 10000,
  });

  const roomManager = new RoomManager(io);

  io.on('connection', (socket) => {
    roomManager.registerSocket(socket);
  });

  return io;
}
