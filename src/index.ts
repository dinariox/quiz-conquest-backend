import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, ServerOptions } from "socket.io";
import { readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Question, Participant, GameState, Category, QuestionType } from "./types";
import logger from "./logger";
import { isDoublePoints } from "./util";

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
    textInput: "",
    choice: -1,
  });

  // Senden Sie den aktualisierten Spielzustand an alle Clients
  io.emit("updateGameState", gameState);
}

function nextPlayersTurn() {
  if (!gameState.playersTurn) return;
  const playerIndex = gameState.players.findIndex((player) => player.id === gameState.playersTurn!.id);
  const nextPlayerIndex = playerIndex + 1 >= gameState.players.length ? 0 : playerIndex + 1;
  gameState.playersTurn = gameState.players[nextPlayerIndex];
  io.emit("updateGameState", gameState);
}

function emptyTextInputsAndChoices() {
  gameState.players.forEach((p) => {
    p.textInput = "";
    p.choice = -1;
  });
}

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.static(path.join(__dirname, "..", "public")));

  const httpServer = createServer(app);
  io = new Server(httpServer, corsOptions);

  const categories = await loadCategories();

  gameState = {
    players: [],
    categories,
    activeQuestion: null,
    buzzedPlayer: null,
    playersTurn: null,
    exposeQuestion: false,
    exposeAnswer: false,
    showBoard: false,
    enumRevealAmount: 0,
    lockTextInput: false,
    revealTextInput: false,
    lockChoice: false,
    revealChoice: false,
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

      existingPlayer.socketId = socket.id;

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

        logger.info(`Removed player: ${removedPlayer.name} (${removedPlayer.id})`);

        io.emit("updateGameState", gameState);
        io.to(removedPlayer.socketId).emit("removedFromGame");
        io.to(removedPlayer.socketId).disconnectSockets();
      }
    });

    // Punkte für den angegebenen Spieler aktualisieren
    socket.on("updatePoints", (data: { playerId: string; pointDelta: number }) => {
      const { playerId, pointDelta } = data;
      const player = gameState.players.find((player) => player.id === playerId);
      if (player) {
        player.score += pointDelta;

        logger.info(`Updated points for player ${player.name}: ${pointDelta} (-> ${player.score})`);

        io.emit("updateGameState", gameState);
      }
    });

    socket.on("openQuestion", (data: { categoryName: string; question: Question }) => {
      const { categoryName, question } = data;
      const category = gameState.categories.find((category) => category.name === categoryName);
      if (category) {
        const q = category.questions.find((q) => q.question === question.question);
        if (q) {
          gameState.activeQuestion = question;
          gameState.exposeQuestion = false;
          gameState.exposeAnswer = false;
          gameState.enumRevealAmount = 0;
          gameState.revealTextInput = false;
          gameState.lockTextInput = false;
          gameState.revealChoice = false;
          gameState.lockChoice = false;
          emptyTextInputsAndChoices();

          logger.info(`Question opened: ${question.question.slice(0, 40)}...`);

          io.emit("updateGameState", gameState);
        }
      }
    });

    socket.on("abortQuestion", () => {
      if (!gameState.activeQuestion) return;

      logger.info(`Question aborted: ${gameState.activeQuestion.question.slice(0, 40)}...`);

      gameState.activeQuestion = null;
      gameState.buzzedPlayer = null;
      gameState.exposeAnswer = false;
      gameState.exposeQuestion = false;
      gameState.enumRevealAmount = 0;
      gameState.revealTextInput = false;
      gameState.lockTextInput = false;
      gameState.revealChoice = false;
      gameState.lockChoice = false;
      emptyTextInputsAndChoices();
      io.emit("updateGameState", gameState);
    });

    socket.on("completeQuestion", () => {
      if (!gameState.activeQuestion) return;

      logger.info(`Question completed: ${gameState.activeQuestion.question.slice(0, 40)}...`);

      gameState.categories.forEach((category) => {
        const question = category.questions.find((q) => q.question === gameState.activeQuestion!.question);
        if (question) {
          question.answered = true;
        }
      });

      gameState.activeQuestion = null;
      gameState.buzzedPlayer = null;
      gameState.exposeAnswer = false;
      gameState.exposeQuestion = false;
      gameState.enumRevealAmount = 0;
      gameState.revealTextInput = false;
      gameState.lockTextInput = false;
      gameState.revealChoice = false;
      gameState.lockChoice = false;
      emptyTextInputsAndChoices();
      io.emit("updateGameState", gameState);
      nextPlayersTurn();
    });

    socket.on("selectRandomPlayersTurn", () => {
      logger.info("Selecting random player's turn...");

      const randomPlayer = gameState.players[Math.floor(Math.random() * gameState.players.length)];
      gameState.playersTurn = randomPlayer;
      io.emit("updateGameState", gameState);

      let cnt = 0;
      let limit = Math.floor(Math.random() * 8) + 8;
      const interval = setInterval(() => {
        if (cnt++ > limit) {
          clearInterval(interval);
          logger.info("Random player's turn selected: " + randomPlayer.name);
          return;
        }
        nextPlayersTurn();
      }, 250);
    });

    socket.on("buzz", () => {
      if (gameState.buzzedPlayer) return;

      logger.info("Buzzed");

      const player = gameState.players.find((player) => player.socketId === socket.id);
      if (player) {
        gameState.buzzedPlayer = player;

        logger.info(`Player buzzed: ${player.name}`);

        io.emit("updateGameState", gameState);
        io.emit("playBuzzerSound");
      }
    });

    socket.on("resetBuzzer", () => {
      gameState.buzzedPlayer = null;

      logger.info("Resetting buzzer");

      io.emit("updateGameState", gameState);
    });

    socket.on("correctAnswer", () => {
      if (gameState.buzzedPlayer && gameState.activeQuestion) {
        gameState.buzzedPlayer.score += isDoublePoints(gameState.categories) ? gameState.activeQuestion.value * 2 : gameState.activeQuestion.value;

        logger.info(`Player answered correctly: ${gameState.buzzedPlayer.name}. Added ${gameState.activeQuestion.value} points (-> ${gameState.buzzedPlayer.score}).`);
      }
      gameState.exposeAnswer = true;
      gameState.buzzedPlayer = null;
      io.emit("updateGameState", gameState);
      io.emit("playCorrectAnswerSound");
    });

    socket.on("wrongAnswer", () => {
      if (gameState.buzzedPlayer && gameState.activeQuestion) {
        gameState.buzzedPlayer.score -= isDoublePoints(gameState.categories) ? gameState.activeQuestion.value : gameState.activeQuestion.value / 2;

        logger.info(`Player answered incorrectly: ${gameState.buzzedPlayer.name}. Removed ${gameState.activeQuestion.value / 2} points (-> ${gameState.buzzedPlayer.score}).`);
      }
      gameState.buzzedPlayer = null;
      io.emit("updateGameState", gameState);
      io.emit("playWrongAnswerSound");
    });

    socket.on("exposeQuestion", () => {
      gameState.exposeQuestion = true;
      io.emit("updateGameState", gameState);
      logger.info("Exposed question");
    });

    socket.on("exposeAnswer", () => {
      gameState.exposeAnswer = true;
      io.emit("updateGameState", gameState);
      logger.info("Exposed answer");
    });

    socket.on("showBoard", () => {
      gameState.showBoard = true;
      io.emit("updateGameState", gameState);
      logger.info("Showed board");
    });

    socket.on("revealEnumItem", () => {
      if (!gameState.activeQuestion) return;
      if (gameState.activeQuestion.type !== QuestionType.Enum) return;
      gameState.enumRevealAmount++;
      io.emit("updateGameState", gameState);
      logger.info("Revealed enum item " + gameState.enumRevealAmount);
    });

    socket.on("updateTextInput", (text: string) => {
      const player = gameState.players.find((p) => p.socketId === socket.id);
      if (player) {
        player.textInput = text;
        io.emit("updateGameState", gameState);
        logger.info(`Updated user input of ${player.name}: ${player.textInput}`);
      }
    });

    socket.on("lockTextInput", () => {
      gameState.lockTextInput = true;
      io.emit("updateGameState", gameState);
      logger.info("Locked text inputs");
    });

    socket.on("revealTextInput", () => {
      if (!gameState.lockTextInput) return;
      gameState.revealTextInput = true;
      io.emit("updateGameState", gameState);
      logger.info("Revealed text inputs");
    });

    socket.on("updateChoice", (choice: number) => {
      const player = gameState.players.find((p) => p.socketId === socket.id);
      if (player) {
        player.choice = choice;
        io.emit("updateGameState", gameState);
        logger.info(`Updated choice of ${player.name}: ${player.textInput}`);
      }
    });

    socket.on("lockChoice", () => {
      gameState.lockChoice = true;
      io.emit("updateGameState", gameState);
      logger.info("Locked choice inputs");
    });

    socket.on("revealChoice", () => {
      if (!gameState.lockChoice) return;
      gameState.revealChoice = true;
      io.emit("updateGameState", gameState);
      logger.info("Revealed choice inputs");
    });

    socket.on("launch-fireworks", () => {
      const player = gameState.players.reduce((highestScorer, player) => {
        if (player.score > highestScorer.score) {
          return player;
        }
        return highestScorer;
      }, gameState.players[0]);
      if (player) {
        io.emit("launch-fireworks", player);
        logger.info(`Launched fireworks for ${player.name}`);
      }
    });
  });

  httpServer.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
  });
}

main();
