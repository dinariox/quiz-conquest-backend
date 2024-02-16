export enum QuestionType {
  Normal = "normal",
  Enum = "enum",
  Img = "img",
  Estimate = "estimate",
  Choice = "choice",
}

export interface Question {
  value: number;
  question: string;
  answer: string;
  answered: boolean;
  type: QuestionType;
  notes?: string;
  choices?: string[];
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
  textInput: string;
  choice: number;
  teamId?: number;
}

export interface GameState {
  players: Participant[];
  categories: Category[];
  activeQuestion: Question | null;
  buzzedPlayer: Participant | null;
  playersTurn: Participant | null;
  exposeQuestion: boolean;
  exposeAnswer: boolean;
  showBoard: boolean;
  enumRevealAmount: number;
  lockTextInput: boolean;
  revealTextInput: boolean;
  lockChoice: boolean;
  revealChoice: boolean;
}
