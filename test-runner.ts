import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

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
  testedAt: string;
}

const SCHOOLS = [
  'rolltide.com',
  'floridagators.com',
  'ukathletics.com',
  'lsusports.net',
  'olemisssports.com',
  'hailstate.com',
  'mutigers.com',
  'gamecocksonline.com',
  'utsports.com',
  '12thman.com',
  'texaslonghorns.com',
  'vucommodores.com',
  'arkansasrazorbacks.com',
  'auburntigers.com',
  'georgiadogs.com',
  'soonersports.com',
  'fightingillini.com',
  'iuhoosiers.com',
  'hawkeyesports.com',
  'umterps.com',
  'mgoblue.com',
  'msuspartans.com',
  'gophersports.com',
  'huskers.com',
  'nusports.com',
  'ohiostatebuckeyes.com',
  'goducks.com',
  'gopsusports.com',
  'purduesports.com',
  'scarletknights.com',
  'uclabruins.com',
  'usctrojans.com',
  'gohuskies.com',
  'uwbadgers.com',
  'arizonawildcats.com',
  'thesundevils.com',
  'calbears.com',
  'cubuffs.com',
  'gostanford.com',
  'utahutes.com',
  'cyclones.com',
  'byucougars.com',
  'texastech.com',
  'wvusports.com',
  'kstatesports.com',
  'ucfknights.com',
  'gobearcats.com',
  'gofrogs.com',
  'uhcougars.com',
  'kuathletics.com',
  'osubeavers.com',
  'wsucougars.com',
  'goarmywestpoint.com',
  'navysports.com',
  'tulanegreenwave.com',
  'gotigersgo.com',
  'meangreensports.com',
  'ecupirates.com',
  'charlotte49ers.com',
  'gousfbulls.com',
  'goutsa.com',
  'tulsahurricane.com',
  'riceowls.com',
  'owlsports.com',
  'fausports.com',
  'uabsports.com',
  'broncosports.com',
  'csurams.com',
  'goaztecs.com',
  'gobulldogs.com',
  'unlvrebels.com',
  'sjsuspartans.com',
  'golobos.com',
  'hawaiiathletics.com',
  'utahstateaggies.com',
  'gowyo.com',
  'nevadawolfpack.com',
  'goairforcefalcons.com',
  'gseagles.com',
  'odusports.com',
  'herdzone.com',
  'jmusports.com',
  'goccusports.com',
  'appstatesports.com',
  'georgiastatesports.com',
  'ragincajuns.com',
  'ulmwarhawks.com',
  'usajaguars.com',
  'txst.com',
  'troytrojans.com',
  'southernmiss.com',
  'smumustangs.com',
  'clemsontigers.com',
  'miamihurricanes.com',
  'gocards.com',
  'pittsburghpanthers.com',
  'ramblinwreck.com',
  'goduke.com',
  'cuse.com',
  'virginiasports.com',
  'hokiesports.com',
  'goheels.com',
  'bceagles.com',
  'godeacs.com',
  'gopack.com',
  'seminoles.com',
  'jaxstatesports.com',
  'gobearkats.com',
  'wkusports.com',
  'libertyflames.com',
  'latechsports.com',
  'fiusports.com',
  'goblueraiders.com',
  'utepminers.com',
  'nmstatesports.com',
  'ksuowls.com',
  'uncbears.com',
  'nauathletics.com',
  'msubobcats.com',
  'gogriz.com',
  'isubengals.com',
  'weberstatesports.com',
  'hornetsports.com',
  'goviks.com',
  'gopoly.com',
  'goeags.com',
  'bucknellbison.com',
  'colgateathletics.com',
  'goholycross.com',
  'goleopards.com',
  'lehighsports.com'
];

class SchoolTester {
  private apiUrl: string;
  private gameDate: string;
  private results: TestResult[] = [];
  private logFile: string;

  constructor(apiUrl: string = 'http://localhost:3000', gameDate: string = '09/06/25') {
    this.apiUrl = apiUrl;
    this.gameDate = gameDate;
    this.logFile = path.join(__dirname, `test-results-${gameDate.replace(/\//g, '-')}.json`);
  }

  async testSingleSchool(domain: string): Promise<TestResult> {
    const startTime = Date.now();
    console.log(`🏈 Testing ${domain}...`);

    try {
      const response = await fetch(`${this.apiUrl}/scrape-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schoolDomain: domain,
          gameDate: this.gameDate,
          provider: 'gemini',
          model: 'gemini-flash-lite-latest'
        }),
      });

      const data = await response.json() as any;
      const processingTime = Date.now() - startTime;

      if (data.success && data.data && data.data.officials) {
        const officialsCount = Object.values(data.data.officials).filter(official => official !== null).length;
        console.log(`✅ ${domain}: Found ${officialsCount} officials (${data.data.game?.opponent || 'Unknown opponent'})`);
        
        return {
          school: data.data.school || domain,
          domain,
          gameDate: this.gameDate,
          success: true,
          officials: data.data.officials,
          gameInfo: data.data.game,
          metadata: data.metadata,
          timestamp: new Date().toISOString()
        };
      } else {
        console.log(`❌ ${domain}: ${data.error || 'No officials found'}`);
        return {
          school: domain,
          domain,
          gameDate: this.gameDate,
          success: false,
          error: data.error || 'No officials found',
          metadata: data.metadata,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.log(`💥 ${domain}: API Error - ${(error as Error).message}`);
      
      return {
        school: domain,
        domain,
        gameDate: this.gameDate,
        success: false,
        error: `API Error: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  async testAllSchools(startFrom?: string, limit?: number): Promise<TestSummary> {
    console.log(`🚀 Starting comprehensive test of ${SCHOOLS.length} schools for game date ${this.gameDate}`);
    console.log('=' .repeat(80));

    let startIndex = 0;
    if (startFrom) {
      startIndex = SCHOOLS.findIndex(school => school === startFrom);
      if (startIndex === -1) {
        console.log(`⚠️  School ${startFrom} not found in list, starting from beginning`);
        startIndex = 0;
      }
    }

    const schoolsToTest = limit ? 
      SCHOOLS.slice(startIndex, startIndex + limit) : 
      SCHOOLS.slice(startIndex);

    console.log(`Testing ${schoolsToTest.length} schools starting from index ${startIndex}`);
    console.log('');

    // Load existing results if any
    this.loadExistingResults();

    let testCount = 0;
    for (const school of schoolsToTest) {
      testCount++;
      
      // Check if we already have a result for this school
      const existingResult = this.results.find(r => r.domain === school);
      if (existingResult) {
        console.log(`⏭️  ${school}: Already tested (${existingResult.success ? 'SUCCESS' : 'FAILED'})`);
        continue;
      }

      const result = await this.testSingleSchool(school);
      this.results.push(result);

      // Save progress after each test
      this.saveResults();

      // Add delay between requests to be respectful
      if (testCount < schoolsToTest.length) {
        console.log(`⏳ Waiting 3 seconds before next test... (${testCount}/${schoolsToTest.length})`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      console.log('');
    }

    return this.generateSummary();
  }

  private loadExistingResults(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        const data = fs.readFileSync(this.logFile, 'utf-8');
        const summary = JSON.parse(data) as TestSummary;
        this.results = summary.results || [];
        console.log(`📋 Loaded ${this.results.length} existing test results`);
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
      totalSchools: SCHOOLS.length,
      successful,
      failed,
      successRate: this.results.length > 0 ? (successful / this.results.length) * 100 : 0,
      totalCost,
      totalTokens,
      totalTime,
      results: this.results,
      testedAt: new Date().toISOString()
    };
  }

  printSummary(): void {
    const summary = this.generateSummary();
    
    console.log('');
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(80));
    console.log(`🎯 Total Schools: ${SCHOOLS.length}`);
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
        console.log(`• ${result.domain}: ${result.error}`);
      });
      console.log('');
    }

    if (summary.successful > 0) {
      console.log('✅ SUCCESSFUL SCHOOLS:');
      console.log('-'.repeat(40));
      this.results.filter(r => r.success).forEach(result => {
        const officialsCount = Object.values(result.officials || {}).filter(o => o !== null).length;
        console.log(`• ${result.domain}: ${officialsCount} officials (vs ${result.gameInfo?.opponent || 'Unknown'})`);
      });
    }
  }

  getFailedSchools(): string[] {
    return this.results.filter(r => !r.success).map(r => r.domain);
  }

  getSuccessfulSchools(): string[] {
    return this.results.filter(r => r.success).map(r => r.domain);
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  const startFrom = args[0]; // Optional: start from specific school
  const limit = args[1] ? parseInt(args[1]) : undefined; // Optional: limit number of tests
  
  const tester = new SchoolTester();
  
  try {
    const summary = await tester.testAllSchools(startFrom, limit);
    tester.printSummary();
  } catch (error) {
    console.error('❌ Test runner failed:', error);
  }
}

if (require.main === module) {
  main();
}

export { SchoolTester, TestResult, TestSummary };