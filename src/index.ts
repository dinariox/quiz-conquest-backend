import { createServer } from "http";
import { Server, ServerOptions } from "socket.io";
import { readFile } from "fs/promises";
import { Question, Player, GameState } from "./types";
import logger from "./logger";

const PORT = process.env.PORT || 3000;

// CORS-Optionen für Socket.io
const corsOptions = {
  cors: {
    origin: "*", // Erlaube allen Ursprüngen den Zugriff; ändere dies entsprechend deinen Anforderungen
    methods: ["GET", "POST"],
  },
} as ServerOptions;

async function loadQuestions(): Promise<Question[]> {
  try {
    const data = await readFile("../data/questions.json", "utf-8");
    const questions: Question[] = JSON.parse(data);
    return questions;
  } catch (err) {
    console.error("Fehler beim Laden der Fragen:", err);
    return [];
  }
}

async function main() {
  const app = createServer();
  const io = new Server(app, corsOptions);

  const questions = await loadQuestions();

  let gameState: GameState = {
    players: [],
    questions,
    activeQuestion: null,
    buzzedPlayer: null,
  };

  io.on("connection", (socket) => {
    logger.info(`Ein Benutzer hat sich verbunden: ${socket.id}`);

    // Hier kommen später die Event-Handler für Spielaktionen hin

    socket.on("disconnect", () => {
      logger.info(`Ein Benutzer hat sich getrennt: ${socket.id}`);
    });
  });

  app.listen(PORT, () => {
    logger.info(`Quiz Conquest Backend läuft auf Port ${PORT}`);
  });
}

main();
