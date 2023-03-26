import { createServer } from "http";
import { Server, ServerOptions } from "socket.io";
import { readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Question, Participant, GameState, Category } from "./types";
import logger from "./logger";

const PORT = process.env.PORT || 3000;

// CORS-Options for Socket.io
const corsOptions = {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
} as ServerOptions;

let gameState: GameState;
let io: Server;

async function loadCategories(): Promise<Category[]> {
  try {
    const data = await readFile(path.join(__dirname, "..", "data", "questions.json"), "utf-8");
    const categories: Category[] = JSON.parse(data).categories;
    return categories;
  } catch (err) {
    console.error("Error while loading questions:", err);
    process.exit(1);
  }
}

function generateUniqueId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function addPlayer(socketId: string, name: string, uniqueId: string) {
  logger.info(`Adding player: ${socketId} | Name: ${name} | Unique ID: ${uniqueId}`);

  gameState.players.push({
    id: uniqueId,
    socketId,
    name,
    score: 0,
  });

  // Senden Sie den aktualisierten Spielzustand an alle Clients
  io.emit("updateGameState", gameState);
}

async function main() {
  const app = createServer();
  io = new Server(app, corsOptions);

  const categories = await loadCategories();

  gameState = {
    players: [],
    categories,
    activeQuestion: null,
    buzzedPlayer: null,
  };

  io.on("connection", (socket) => {
    logger.info(`A user has connected: ${socket.id}`);

    socket.on("disconnect", () => {
      logger.info(`A user has disconnected: ${socket.id}`);
    });

    // Neuen Spieler hinzufügen
    socket.on("join", (data) => {
      const { name } = data;
      const uniqueId = generateUniqueId();
      addPlayer(socket.id, name, uniqueId);

      // Sende die eindeutige ID an den Teilnehmer
      socket.emit("uniqueId", uniqueId);
    });

    // Zurückkehrenden Spieler verarbeiten
    socket.on("rejoin", (data) => {
      const { uniqueId, name } = data;
      const existingPlayer = gameState.players.find((player) => player.id === uniqueId);

      if (!existingPlayer) {
        logger.info(`User tried to rejoin but is unknown: ${socket.id} | Unique ID: ${uniqueId}`);
        socket.emit("uniqueIdUnknown");
        return;
      }

      logger.info(`User rejoined: ${socket.id} | Name: ${existingPlayer.name} | Unique ID: ${uniqueId}`);
      // Sende den aktuellen Spielzustand an den zurückkehrenden Teilnehmer
      io.emit("updateGameState", gameState);
    });

    socket.on("requestGameState", () => {
      socket.emit("updateGameState", gameState);
    });

    // Entfernen Sie den angegebenen Spieler aus dem Spiel
    socket.on("removePlayer", (playerId: string) => {
      const removedPlayer = gameState.players.find((player) => player.id === playerId);
      if (removedPlayer) {
        gameState.players = gameState.players.filter((player) => player.id !== playerId);
        io.emit("updateGameState", gameState);
        io.to(removedPlayer.socketId).emit("removedFromGame");
      }
    });

    // Punkte für den angegebenen Spieler aktualisieren
    socket.on("updatePoints", (data: { playerId: string; pointDelta: number }) => {
      const { playerId, pointDelta } = data;
      const player = gameState.players.find((player) => player.id === playerId);
      if (player) {
        player.score += pointDelta;
        io.emit("updateGameState", gameState);
      }
    });
  });

  app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
  });
}

main();
