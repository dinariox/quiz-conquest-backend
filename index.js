const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const logger = require("./logger");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Lade die Quiz-Daten aus der JSON-Datei und fange Fehler ab
let quizData = null;
try {
  quizData = JSON.parse(fs.readFileSync("quiz.json", "utf-8"));
} catch (error) {
  console.error("Failed to load quiz data:", error);
  process.exit(1);
}

// Middleware für statische Dateien
app.use(express.static("public"));

// Zustand des Spiels verwalten
const gameState = {
  players: {},
  boardState: {},
  currentQuestion: null,
  buzzerLocked: false,
};

// Funktion zum Generieren eines eindeutigen Tokens
function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

io.on("connection", (socket) => {
  logger.info(`User connected: ${socket.id}`);

  // Neuen Spieler hinzufügen
  socket.on("join", (data) => {
    const { name, isModerator, reconnectToken } = data;

    logger.info(
      `User joined: ${socket.id} | Name: ${data.name} | Moderator: ${data.isModerator}`
    );

    if (reconnectToken && gameState.players[reconnectToken]) {
      // Spieler wiederherstellen
      gameState.players[socket.id] = gameState.players[reconnectToken];
      delete gameState.players[reconnectToken];
      socket.emit("reconnectSuccess", { token: socket.id, gameState });
    } else {
      // Neuen Spieler hinzufügen
      gameState.players[socket.id] = {
        name,
        isModerator,
        score: 0,
      };
      const token = generateToken();
      socket.emit("initialize", { token, gameState });

      // Wenn der Spieler ein Moderator ist, senden Sie die vollständigen Quizdaten
      if (isModerator) {
        socket.emit("initializeQuizData", quizData);
      }
    }

    // Senden Sie den aktualisierten Spielzustand an alle Clients
    io.emit("updateGameState", gameState);
  });

  // Spieler entfernen, wenn sie die Verbindung trennen
  socket.on("disconnect", () => {
    logger.info(`User disconnected: ${socket.id}`);
    delete gameState.players[socket.id];
    io.emit("updateGameState", gameState);
  });

  // Buzzern logik
  socket.on("buzz", () => {
    if (!gameState.buzzerLocked) {
      logger.info(`User buzzed: ${socket.id}`);
      gameState.buzzerLocked = true;
      gameState.currentQuestion.buzzedBy = socket.id;
      io.emit("updateGameState", gameState);
    }
  });

  // Punkte aktualisieren
  socket.on("updateScore", (data) => {
    const { playerId, points } = data;
    logger.info(`Score updated: ${playerId} | Points: ${points}`);
    gameState.players[playerId].score += points;
    gameState.currentQuestion = null;
    gameState.buzzerLocked = false;
    io.emit("updateGameState", gameState);
  });

  // Frage auswählen
  socket.on("selectQuestion", (data) => {
    const { categoryId, questionId } = data;
    logger.info(
      `Question selected: CategoryID: ${categoryId} | QuestionID: ${questionId}`
    );
    gameState.currentQuestion = {
      ...quizData.categories[categoryId].questions[questionId],
      categoryId,
      questionId,
    };
    io.emit("updateGameState", gameState);
  });

  // Frage als beantwortet markieren
  socket.on("markQuestionAnswered", (data) => {
    const { categoryId, questionId } = data;
    logger.info(
      `Question marked as answered: CategoryID: ${categoryId} | QuestionID: ${questionId}`
    );
    gameState.boardState[`${categoryId}-${questionId}`] = true;
    io.emit("updateGameState", gameState);
  });
});

// Starte den Server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  logger.info(`Server is listening on port ${port}`);
});
