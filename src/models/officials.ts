export interface GameOfficials {
  referee?: string;
  lineJudge?: string;
  sideJudge?: string;
  umpire?: string;
  backJudge?: string;
  centerJudge?: string;
  linesman?: string;
  fieldJudge?: string;
}

export interface GameInfo {
  date: string;
  homeTeam?: string;
  awayTeam?: string;
  opponent?: string; // Kept for backwards compatibility
  location?: string;
  time?: string;
  boxscoreUrl?: string;
}

export interface ScrapeResult {
  success: boolean;
  data?: {
    game: GameInfo;
    officials: GameOfficials;
    school: string;
    scrapedAt: string;
  };
  error?: string;
  metadata?: {
    url: string;
    processingTime: number;
  };
}

export interface ScrapeRequest {
  schoolDomain: string;
  gameDate: string; // Format: MM/DD/YY
  sport?: string; // Default: 'football'
}

export interface GameLinkExtractionResult {
  success: boolean;
  gameFound: boolean;
  game?: GameInfo;
  boxscoreUrl?: string;
  pdfUrl?: string;
  error?: string;
}

// Schema for Gemini structured output
export const OFFICIALS_SCHEMA = {
  type: "object",
  properties: {
    gameFound: {
      type: "boolean",
      description: "Whether a game was found on the specified date"
    },
    game: {
      type: "object",
      properties: {
        date: { type: "string" },
        homeTeam: { type: "string" },
        awayTeam: { type: "string" },
        opponent: { type: "string" },
        location: { type: "string" },
        time: { type: "string" }
      }
    },
    officials: {
      type: "object",
      properties: {
        referee: { type: "string" },
        lineJudge: { type: "string" },
        sideJudge: { type: "string" },
        umpire: { type: "string" },
        backJudge: { type: "string" },
        centerJudge: { type: "string" },
        linesman: { type: "string" },
        fieldJudge: { type: "string" }
      }
    }
  },
  required: ["gameFound"]
};