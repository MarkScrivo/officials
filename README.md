# Football Officials Data Scraper

An intelligent web scraper that uses Google's Gemini Flash 2.5 AI model to extract football game officials data from college sports websites. No brittle CSS selectors required - the AI understands the content semantically.

## Features

- **AI-Powered Extraction**: Uses Gemini Flash 2.5 for intelligent data extraction
- **Multi-School Support**: Configurable for different college sports websites  
- **Structured JSON Output**: Guaranteed structured output with schema validation
- **No Selector Maintenance**: AI adapts to website changes automatically
- **Screenshot Support**: Can use visual analysis for better accuracy
- **Retry Logic**: Built-in resilience with exponential backoff
- **Multiple Output Formats**: JSON and CSV export options

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Google AI Studio API key (free)

## Installation

1. Clone or download this repository:
```bash
cd officialstest1
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

4. Get your Gemini API key:
   - Visit https://aistudio.google.com/apikey
   - Create a new API key
   - Copy the key

5. Configure environment:
```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your Gemini API key
# GEMINI_API_KEY=your_actual_api_key_here
```

## Usage

### Basic Usage

Scrape officials data for a specific game:

```bash
npm run scrape seminoles.com 09/06/25
```

### Command Line Options

```bash
npm run scrape <school-domain> <game-date> [options]

Arguments:
  school-domain    The school's website domain (e.g., seminoles.com)
  game-date        The date of the game in MM/DD/YY format

Options:
  --save           Save results to a file in the output directory
  --csv            Output in CSV format (default is JSON)
  --help, -h       Show help message
```

### Examples

```bash
# Basic scraping
npm run scrape seminoles.com 09/06/25

# Save results to JSON file
npm run scrape seminoles.com 09/06/25 --save

# Save results as CSV
npm run scrape seminoles.com 09/06/25 --save --csv

# Different schools
npm run scrape clemsontigers.com 09/13/25
npm run scrape rolltide.com 09/20/25
```

## Output Format

The scraper returns data in the following JSON structure:

```json
{
  "school": "Florida State Seminoles",
  "game": {
    "date": "09/06/25",
    "opponent": "Team Name",
    "location": "Stadium Name",
    "time": "7:00 PM"
  },
  "officials": {
    "referee": "John Smith",
    "lineJudge": "Jane Doe",
    "sideJudge": "Bob Johnson",
    "umpire": "Mike Williams",
    "backJudge": "Tom Brown",
    "centerJudge": "Sarah Davis",
    "linesman": "Chris Wilson",
    "fieldJudge": "Pat Anderson"
  }
}
```

## Supported Schools

The scraper comes pre-configured for several schools:

- seminoles.com (Florida State)
- clemsontigers.com (Clemson)
- rolltide.com (Alabama)
- ohiostatebuckeyes.com (Ohio State)
- goduke.com (Duke)
- gohuskies.com (Washington)

New schools can be easily added to `src/config/schools.json`.

## Adding New Schools

Edit `src/config/schools.json` to add support for new schools:

```json
{
  "schools": {
    "newschool.com": {
      "name": "School Name",
      "scheduleUrl": "https://newschool.com/sports/football/schedule",
      "waitForSelector": ".schedule-table",
      "sport": "football"
    }
  }
}
```

## Project Structure

```
officialstest1/
├── src/
│   ├── scrapers/
│   │   ├── playwright-fetcher.ts   # Browser automation
│   │   ├── gemini-extractor.ts     # AI extraction logic
│   │   └── officials-scraper.ts    # Main orchestrator
│   ├── models/
│   │   └── officials.ts            # Data models & schemas
│   ├── config/
│   │   ├── environment.ts          # Environment config
│   │   ├── school-config.ts        # School configuration manager
│   │   └── schools.json            # School configurations
│   ├── utils/
│   │   ├── logger.ts               # Logging utility
│   │   └── output-formatter.ts     # Output formatting
│   └── index.ts                     # Entry point
├── output/                          # Generated output files
├── logs/                            # Log files
├── .env                             # Environment variables
└── package.json
```

## How It Works

1. **Page Fetching**: Playwright renders the JavaScript-heavy schedule page
2. **Content Capture**: Takes both HTML and screenshot for analysis
3. **AI Extraction**: Gemini Flash 2.5 analyzes the content to find:
   - The game on the specified date
   - Officials information if available
4. **Structured Output**: Returns data in guaranteed JSON format
5. **Error Handling**: Retries failed requests with exponential backoff

## Troubleshooting

### "GEMINI_API_KEY is required" Error
- Make sure you've created a `.env` file
- Verify your API key is correctly set in the `.env` file
- Get a free API key from https://aistudio.google.com/apikey

### No Game Found
- Verify the date format (MM/DD/YY)
- Check if the game exists on that date
- The schedule page might not have loaded properly

### Timeout Errors
- Increase the timeout in `.env`: `BROWSER_TIMEOUT=60000`
- Check your internet connection
- The website might be slow or down

### Missing Officials Data
- Not all games have officials data posted
- Officials might be posted closer to game day
- The data might be in a different format than expected

## Environment Variables

Create a `.env` file with:

```bash
# Required
GEMINI_API_KEY=your_api_key_here

# Optional
LOG_LEVEL=info              # debug, info, warn, error
HEADLESS=true              # Run browser in headless mode
BROWSER_TIMEOUT=30000      # Browser timeout in milliseconds
```

## Development

### Run in Development Mode
```bash
npm run dev
```

### Build TypeScript
```bash
npm run build
```

### Run Built Version
```bash
npm start
```

## Key Advantages

1. **No Selector Maintenance**: Unlike traditional scrapers that break when websites change their HTML structure, this uses AI to understand content semantically

2. **Multi-Domain Support**: Easily configure for any college sports website without writing custom parsing logic

3. **Intelligent Extraction**: Gemini understands context and can handle various formats of officials data

4. **Future-Proof**: As websites evolve, the AI adapts without code changes

## License

ISC

## Contributing

Feel free to submit issues and enhancement requests!