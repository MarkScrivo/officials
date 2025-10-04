# Officials Scraper - System Flow Diagram

```mermaid
flowchart TD
    Start([Start]) --> Input{Input Type?}

    Input -->|CLI| CLI[CLI: npm run scrape]
    Input -->|API| API[API: POST /api/scrape]

    CLI --> SchoolList[Load School Configuration]
    API --> SchoolList

    SchoolList --> Parallel[Process Schools in Parallel<br/>Max: 5 concurrent]

    Parallel --> School1[School 1]
    Parallel --> School2[School 2]
    Parallel --> School3[School N...]

    School1 --> Fetch1[Playwright Fetcher]
    School2 --> Fetch2[Playwright Fetcher]
    School3 --> Fetch3[Playwright Fetcher]

    Fetch1 --> Check1{Content Type?}
    Fetch2 --> Check2{Content Type?}
    Fetch3 --> Check3{Content Type?}

    Check1 -->|HTML| HTML1[Extract HTML Tables]
    Check1 -->|PDF| PDF1[Download PDF]

    Check2 -->|HTML| HTML2[Extract HTML Tables]
    Check2 -->|PDF| PDF2[Download PDF]

    Check3 -->|HTML| HTML3[Extract HTML Tables]
    Check3 -->|PDF| PDF3[Download PDF]

    HTML1 --> Parse1[Parse Table Rows<br/>Extract Officials Data]
    HTML2 --> Parse2[Parse Table Rows<br/>Extract Officials Data]
    HTML3 --> Parse3[Parse Table Rows<br/>Extract Officials Data]

    PDF1 --> AI1[Anthropic Claude API]
    PDF2 --> AI2[Anthropic Claude API]
    PDF3 --> AI3[Anthropic Claude API]

    AI1 --> Extract1[AI Extracts:<br/>• Date<br/>• Opponent<br/>• Officials<br/>• Positions]
    AI2 --> Extract2[AI Extracts:<br/>• Date<br/>• Opponent<br/>• Officials<br/>• Positions]
    AI3 --> Extract3[AI Extracts:<br/>• Date<br/>• Opponent<br/>• Officials<br/>• Positions]

    Parse1 --> Format1[Format Data]
    Parse2 --> Format2[Format Data]
    Parse3 --> Format3[Format Data]
    Extract1 --> Format1
    Extract2 --> Format2
    Extract3 --> Format3

    Format1 --> Aggregate[Aggregate Results]
    Format2 --> Aggregate
    Format3 --> Aggregate

    Aggregate --> Output{Output Type?}

    Output -->|CLI| File[Save to JSON File<br/>output/officials-TIMESTAMP.json]
    Output -->|API| Response[Return JSON Response]

    File --> End([End])
    Response --> End

    style Start fill:#90EE90
    style End fill:#FFB6C1
    style AI1 fill:#87CEEB
    style AI2 fill:#87CEEB
    style AI3 fill:#87CEEB
    style Parallel fill:#FFD700
```

## Flow Description

### 1. **Input Layer**
- **CLI Mode**: Direct execution via `npm run scrape`
- **API Mode**: REST API endpoint `/api/scrape`

### 2. **School Configuration**
- Loads school-specific configurations from `src/config/school-config.ts`
- Each school has a unique URL and scraping strategy

### 3. **Parallel Processing**
- Processes up to 5 schools concurrently (configurable)
- Each school runs independently to maximize throughput

### 4. **Content Fetching** (Playwright)
- Launches headless Chromium browser
- Navigates to school's officials page
- Handles JavaScript-rendered content
- Detects content type (HTML tables or PDF links)

### 5. **Content Type Detection**
```
IF content is HTML table:
  → Parse HTML directly
ELSE IF content is PDF:
  → Download PDF → Send to AI
```

### 6. **Data Extraction**

#### HTML Path:
- Parse table structure
- Extract rows with game data
- Map columns to fields (date, opponent, officials)

#### PDF Path:
- Download PDF file
- Send to Anthropic Claude API
- AI analyzes document structure
- AI extracts structured data
- Tracks token usage for cost monitoring

### 7. **Data Formatting**
Standardizes output format:
```json
{
  "school": "georgia",
  "games": [
    {
      "date": "2025-09-06",
      "opponent": "Clemson",
      "officials": [
        {"name": "John Smith", "position": "Referee"}
      ]
    }
  ]
}
```

### 8. **Output**
- **CLI**: Saves to `output/officials-[timestamp].json`
- **API**: Returns JSON response with results and metadata

---

## Key Technologies

| Component | Technology |
|-----------|-----------|
| Web Scraping | Playwright (Chromium) |
| AI Processing | Anthropic Claude API |
| Runtime | Node.js + TypeScript |
| API Server | Express.js |
| Concurrency | Promise.all with semaphore |

---

## Error Handling Flow

```mermaid
flowchart LR
    Error[Error Occurs] --> Retry{Retry < 3?}
    Retry -->|Yes| Wait[Wait 2s]
    Wait --> Reattempt[Retry Operation]
    Retry -->|No| Log[Log Error]
    Log --> Skip[Skip School]
    Skip --> Continue[Continue with Next]
    Reattempt --> Success{Success?}
    Success -->|Yes| Continue
    Success -->|No| Retry
```

---

## Performance Metrics

- **Average School Processing**: 5-15 seconds
- **HTML Parsing**: ~1-2 seconds
- **PDF AI Extraction**: ~3-10 seconds
- **Concurrent Limit**: 5 schools
- **Total Time (All Schools)**: ~2-5 minutes
