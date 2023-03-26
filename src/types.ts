export interface Question {
  id: string;
  category: string;
  points: number;
  question: string;
  answer: string;
}

export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface GameState {
  players: Player[];
  questions: Question[];
  activeQuestion: Question | null;
  buzzedPlayer: Player | null;
}
