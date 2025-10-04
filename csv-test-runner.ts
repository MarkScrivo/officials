import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

interface SchoolEntry {
  school: string;
  date: string;
}

interface TestResult {
  school: string;
  domain: string;
  gameDate: string;
  success: boolean;
  officials?: any;
  gameInfo?: any;
  metadata?: {
    processingTime: number;
    cost: number;
    tokensUsed: number;
    operations: number;
  };
  error?: string;
  timestamp: string;
}

interface TestSummary {
  totalSchools: number;
  successful: number;
  failed: number;
  successRate: number;
  totalCost: number;
  totalTokens: number;
  totalTime: number;
  results: TestResult[];
  csvFile: string;
  testedAt: string;
}

class CsvSchoolTester {
  private apiUrl: string;
  private results: TestResult[] = [];
  private logFile: string;
  private csvEntries: SchoolEntry[] = [];
  private csvFile: string;

  constructor(apiUrl: string = 'http://localhost:3000') {
    this.apiUrl = apiUrl;
    this.csvFile = '';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(__dirname, `csv-test-results-${timestamp}.json`);
  }

  async loadCsvFile(csvPath: string): Promise<void> {
    this.csvFile = csvPath;
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file must have a header and at least one data row');
    }

    // Parse header
    const header = lines[0].toLowerCase();
    if (!header.includes('school') || !header.includes('date')) {
      throw new Error('CSV header must contain "Schools" and "Date" columns');
    }

    // Parse data rows
    this.csvEntries = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 2) {
        console.warn(`⚠️  Skipping invalid row ${i + 1}: ${line}`);
        continue;
      }

      this.csvEntries.push({
        school: parts[0],
        date: parts[1]
      });
    }

    console.log(`📋 Loaded ${this.csvEntries.length} schools from ${csvPath}`);
  }

  async checkApiHealth(): Promise<boolean> {
    try {
      console.log(`🔍 Checking API server health at ${this.apiUrl}...`);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const health = await response.json() as any;
        console.log(`✅ API server is healthy (version: ${health.version})`);
        return true;
      } else {
        console.log(`❌ API server returned status ${response.status}`);
        return false;
      }
    } catch (error) {
      console.log(`❌ Cannot connect to API server at ${this.apiUrl}`);
      console.log(`   Error: ${(error as Error).message}`);
      return false;
    }
  }

  async testSingleSchool(entry: SchoolEntry): Promise<TestResult> {
    const startTime = Date.now();
    console.log(`🏈 Testing ${entry.school} for date ${entry.date}...`);

    try {
      // Create abort controller for timeout (3 minutes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);
      
      const response = await fetch(`${this.apiUrl}/scrape-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schoolDomain: entry.school,
          gameDate: entry.date,
          provider: process.env.AI_PROVIDER || 'gemini',
          model: process.env.AI_MODEL || 'gemini-flash-lite-latest'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const data = await response.json() as any;
      const processingTime = Date.now() - startTime;

      if (data.success && data.data && data.data.officials) {
        const officialsCount = Object.values(data.data.officials).filter(official => official !== null).length;
        console.log(`✅ ${entry.school}: Found ${officialsCount} officials (${data.data.game?.opponent || 'Unknown opponent'})`);
        
        return {
          school: data.data.school || entry.school,
          domain: entry.school,
          gameDate: entry.date,
          success: true,
          officials: data.data.officials,
          gameInfo: data.data.game,
          metadata: data.metadata,
          timestamp: new Date().toISOString()
        };
      } else {
        console.log(`❌ ${entry.school}: ${data.error || 'No officials found'}`);
        return {
          school: entry.school,
          domain: entry.school,
          gameDate: entry.date,
          success: false,
          error: data.error || 'No officials found',
          metadata: data.metadata,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.log(`💥 ${entry.school}: API Error - ${(error as Error).message}`);
      
      return {
        school: entry.school,
        domain: entry.school,
        gameDate: entry.date,
        success: false,
        error: `API Error: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  async testBatch(startFrom?: string, limit?: number, resume?: boolean): Promise<TestSummary> {
    // Check API health first
    const apiHealthy = await this.checkApiHealth();
    if (!apiHealthy) {
      console.log('');
      console.log('⚠️  API server is not running or not healthy!');
      console.log('📝 Please start the API server first:');
      console.log('   npm run api');
      console.log('');
      console.log('Then run this test again in a new terminal.');
      process.exit(1);
    }

    console.log(`🚀 Starting CSV-based batch test with ${this.csvEntries.length} schools`);
    console.log('=' .repeat(80));

    // Load existing results if resuming
    if (resume) {
      this.loadExistingResults();
    }

    let startIndex = 0;
    if (startFrom) {
      startIndex = this.csvEntries.findIndex(entry => entry.school === startFrom);
      if (startIndex === -1) {
        console.log(`⚠️  School ${startFrom} not found in CSV, starting from beginning`);
        startIndex = 0;
      } else {
        console.log(`📍 Starting from ${startFrom} (index ${startIndex})`);
      }
    }

    const entriesToTest = limit ? 
      this.csvEntries.slice(startIndex, startIndex + limit) : 
      this.csvEntries.slice(startIndex);

    console.log(`📊 Testing ${entriesToTest.length} schools`);
    console.log('');

    let testCount = 0;
    for (const entry of entriesToTest) {
      testCount++;
      
      // Check if we already have a result for this school/date combination
      if (resume) {
        const existingResult = this.results.find(r => 
          r.domain === entry.school && r.gameDate === entry.date
        );
        if (existingResult) {
          console.log(`⏭️  ${entry.school} (${entry.date}): Already tested (${existingResult.success ? 'SUCCESS' : 'FAILED'})`);
          continue;
        }
      }

      const result = await this.testSingleSchool(entry);
      this.results.push(result);

      // Save progress after each test
      this.saveResults();

      // Add delay between requests to be respectful
      if (testCount < entriesToTest.length) {
        console.log(`⏳ Waiting 3 seconds before next test... (${testCount}/${entriesToTest.length})`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      console.log('');
    }

    return this.generateSummary();
  }

  private loadExistingResults(): void {
    try {
      // Look for most recent results file
      const files = fs.readdirSync(__dirname)
        .filter(f => f.startsWith('csv-test-results-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length > 0) {
        const latestFile = path.join(__dirname, files[0]);
        const data = fs.readFileSync(latestFile, 'utf-8');
        const summary = JSON.parse(data) as TestSummary;
        this.results = summary.results || [];
        console.log(`📋 Loaded ${this.results.length} existing test results from ${files[0]}`);
        
        // Update log file to continue in same file
        this.logFile = latestFile;
      }
    } catch (error) {
      console.log('📋 No existing results found, starting fresh');
      this.results = [];
    }
  }

  private saveResults(): void {
    const summary = this.generateSummary();
    fs.writeFileSync(this.logFile, JSON.stringify(summary, null, 2));
  }

  private generateSummary(): TestSummary {
    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const totalCost = this.results.reduce((sum, r) => sum + (r.metadata?.cost || 0), 0);
    const totalTokens = this.results.reduce((sum, r) => sum + (r.metadata?.tokensUsed || 0), 0);
    const totalTime = this.results.reduce((sum, r) => sum + (r.metadata?.processingTime || 0), 0);

    return {
      totalSchools: this.csvEntries.length,
      successful,
      failed,
      successRate: this.results.length > 0 ? (successful / this.results.length) * 100 : 0,
      totalCost,
      totalTokens,
      totalTime,
      results: this.results,
      csvFile: this.csvFile,
      testedAt: new Date().toISOString()
    };
  }

  printSummary(): void {
    const summary = this.generateSummary();
    
    console.log('');
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(80));
    console.log(`📄 CSV File: ${this.csvFile}`);
    console.log(`🎯 Total Schools in CSV: ${summary.totalSchools}`);
    console.log(`📝 Tests Completed: ${this.results.length}`);
    console.log(`✅ Successful: ${summary.successful}`);
    console.log(`❌ Failed: ${summary.failed}`);
    console.log(`📈 Success Rate: ${summary.successRate.toFixed(1)}%`);
    console.log(`💰 Total Cost: $${summary.totalCost.toFixed(4)}`);
    console.log(`🔢 Total Tokens: ${summary.totalTokens.toLocaleString()}`);
    console.log(`⏱️  Total Time: ${(summary.totalTime / 1000 / 60).toFixed(1)} minutes`);
    console.log(`📋 Results saved to: ${this.logFile}`);
    console.log('');

    if (summary.failed > 0) {
      console.log('❌ FAILED SCHOOLS:');
      console.log('-'.repeat(40));
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`• ${result.domain} (${result.gameDate}): ${result.error}`);
      });
      console.log('');
    }

    if (summary.successful > 0) {
      console.log('✅ SUCCESSFUL SCHOOLS:');
      console.log('-'.repeat(40));
      this.results.filter(r => r.success).forEach(result => {
        const officialsCount = Object.values(result.officials || {}).filter(o => o !== null).length;
        console.log(`• ${result.domain} (${result.gameDate}): ${officialsCount} officials (vs ${result.gameInfo?.opponent || 'Unknown'})`);
      });
    }
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  let csvFile = '';
  let startFrom = '';
  let limit = 0;
  let resume = false;
  let apiUrl = 'http://localhost:3000';

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv' && i + 1 < args.length) {
      csvFile = args[i + 1];
      i++;
    } else if (args[i] === '--start-from' && i + 1 < args.length) {
      startFrom = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && i + 1 < args.length) {
      limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--resume') {
      resume = true;
    } else if (args[i] === '--api-url' && i + 1 < args.length) {
      apiUrl = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('CSV School Tester - Test officials scraping from a CSV file');
      console.log('');
      console.log('Usage: npm run test-csv -- [options]');
      console.log('');
      console.log('Options:');
      console.log('  --csv <file>       Path to CSV file (required)');
      console.log('  --start-from <school>  Start testing from a specific school');
      console.log('  --limit <number>   Limit the number of schools to test');
      console.log('  --resume          Resume from previous test results');
      console.log('  --api-url <url>   API server URL (default: http://localhost:3000)');
      console.log('  --help, -h        Show this help message');
      console.log('');
      console.log('CSV Format:');
      console.log('  Schools,Date');
      console.log('  seminoles.com,09/06/25');
      console.log('  purduesports.com,08/30/25');
      console.log('');
      console.log('Examples:');
      console.log('  npm run test-csv -- --csv test-schools.csv');
      console.log('  npm run test-csv -- --csv test-schools.csv --start-from seminoles.com --limit 10');
      console.log('  npm run test-csv -- --csv test-schools.csv --resume');
      process.exit(0);
    }
  }

  if (!csvFile) {
    console.error('❌ Error: CSV file is required. Use --csv <file> to specify the CSV file.');
    console.log('Use --help for more information.');
    process.exit(1);
  }

  const tester = new CsvSchoolTester(apiUrl);
  
  try {
    await tester.loadCsvFile(csvFile);
    const summary = await tester.testBatch(startFrom, limit, resume);
    tester.printSummary();
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { CsvSchoolTester, TestResult, TestSummary, SchoolEntry };