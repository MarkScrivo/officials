import { OfficialsScraper } from './scrapers/officials-scraper';
import { OutputFormatter } from './utils/output-formatter';
import { validateConfig } from './config/environment';
import { ScrapeRequest } from './models/officials';

async function main() {
  console.log('🏈 Football Officials Data Scraper');
  console.log('=' .repeat(50));
  
  try {
    // Validate configuration
    validateConfig();
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      printHelp();
      return;
    }
    
    // Parse arguments
    const schoolDomain = args[0];
    const gameDate = args[1];
    const outputFormat = args.includes('--csv') ? 'csv' : 'json';
    const saveFile = args.includes('--save');
    
    if (!schoolDomain || !gameDate) {
      console.error('❌ Error: School domain and game date are required');
      printHelp();
      process.exit(1);
    }
    
    // Create scrape request
    const request: ScrapeRequest = {
      schoolDomain,
      gameDate,
      sport: 'football'
    };
    
    // Initialize scraper
    const scraper = new OfficialsScraper();
    
    try {
      // Perform scraping
      console.log(`\n🔍 Scraping ${schoolDomain} for game on ${gameDate}...`);
      const result = await scraper.scrape(request);
      
      // Display result
      OutputFormatter.printResult(result);
      
      // Save to file if requested
      if (saveFile) {
        const filepath = OutputFormatter.saveToFile(result, outputFormat);
        console.log(`\n💾 Results saved to: ${filepath}`);
      }
      
      // Output JSON to console if successful
      if (result.success && result.data) {
        console.log('\n📋 JSON Output:');
        console.log(OutputFormatter.formatSimpleJSON(result));
      }
      
      // Display token usage information prominently
      const tokenSummary = scraper.extractor.tokenTracker.getSummary();
      if (tokenSummary.operationCount > 0) {
        const modelUsed = tokenSummary.operations[0]?.model || 'Unknown';
        console.log('\n💰 COST SUMMARY');
        console.log('=' .repeat(50));
        console.log(`🤖 Model: ${modelUsed}`);
        console.log(`💸 Total Cost: $${tokenSummary.totalCost.toFixed(6)}`);
        console.log(`🔢 Total Tokens: ${tokenSummary.totalTokens.toLocaleString()}`);
        console.log(`⚡ AI Operations: ${tokenSummary.operationCount}`);
        console.log(`📊 Avg Cost/Operation: $${tokenSummary.averageCostPerOperation.toFixed(6)}`);
      }
      
    } finally {
      // Clean up
      await scraper.close();
    }
    
  } catch (error) {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Usage: npm run scrape <school-domain> <game-date> [options]

Arguments:
  school-domain    The school's website domain (e.g., seminoles.com)
  game-date        The date of the game in MM/DD/YY format

Options:
  --save           Save results to a file in the output directory
  --csv            Output in CSV format (default is JSON)
  --help, -h       Show this help message

Examples:
  npm run scrape seminoles.com 09/06/25
  npm run scrape seminoles.com 09/06/25 --save
  npm run scrape seminoles.com 09/06/25 --save --csv

Environment Variables:
  GEMINI_API_KEY   Your Google AI Studio API key (required)
  LOG_LEVEL        Logging level (debug, info, warn, error)
  HEADLESS         Run browser in headless mode (true/false)

Note: Create a .env file with your GEMINI_API_KEY to run the scraper.
Get your API key from: https://aistudio.google.com/apikey
`);
}

// Run the main function if this is the entry point
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { OfficialsScraper, OutputFormatter };