export interface Question {
  value: number;
  question: string;
  answer: string;
}

export interface Category {
  name: string;
  questions: Question[];
}

export interface Participant {
  id: string;
  socketId: string;
  name: string;
  score: number;
}

export interface GameState {
  players: Participant[];
  categories: Category[];
  activeQuestion: Question | null;
  buzzedPlayer: Participant | null;
}
