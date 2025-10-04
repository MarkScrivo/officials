import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

interface SchoolTest {
  domain: string;
  gameDate: string;
  description: string;
}

interface TestResult {
  school: string;
  domain: string;
  gameDate: string;
  success: boolean;
  officials?: any;
  gameInfo?: any;
  metadata?: any;
  error?: string;
  timestamp: string;
}

const SCHOOLS_TO_TEST: SchoolTest[] = [
  { domain: 'umterps.com', gameDate: '08/30/25', description: 'Maryland - previously no game found' },
  { domain: 'nusports.com', gameDate: '08/30/25', description: 'Northwestern - previously no game found' },
  { domain: 'gofrogs.com', gameDate: '08/30/25', description: 'TCU - previously no game found' },
  { domain: 'jmusports.com', gameDate: '09/01/25', description: 'James Madison - previously no game found' },
  { domain: 'broncosports.com', gameDate: '08/28/25', description: 'Boise State - previously no officials' },
  { domain: 'goairforcefalcons.com', gameDate: '08/30/25', description: 'Air Force - previously no officials' },
  { domain: 'gocards.com', gameDate: '08/30/25', description: 'Louisville - previously no officials' }
];

async function testSchoolWithDate(school: SchoolTest): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`\n🏈 Testing ${school.domain} for game on ${school.gameDate}`);
  console.log(`   ${school.description}`);
  
  try {
    const response = await fetch('http://localhost:3000/scrape-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schoolDomain: school.domain,
        gameDate: school.gameDate,
        provider: 'gemini',
        model: 'gemini-flash-lite-latest'
      }),
    });

    const data = await response.json() as any;
    const processingTime = Date.now() - startTime;

    if (data.success && data.data) {
      const hasOfficials = data.data.officials && 
        Object.values(data.data.officials).some(official => official !== null);
      
      if (hasOfficials) {
        const officialsCount = Object.values(data.data.officials)
          .filter(official => official !== null).length;
        console.log(`   ✅ SUCCESS: Found ${officialsCount} officials!`);
        console.log(`   Opponent: ${data.data.game?.opponent || 'Unknown'}`);
      } else if (data.data.game) {
        console.log(`   ⚠️  Game found but NO officials data`);
        console.log(`   Opponent: ${data.data.game?.opponent || 'Unknown'}`);
      } else {
        console.log(`   ❌ No game found on ${school.gameDate}`);
      }
      
      return {
        school: data.data.school || school.domain,
        domain: school.domain,
        gameDate: school.gameDate,
        success: true,
        officials: data.data.officials,
        gameInfo: data.data.game,
        metadata: {
          ...data.metadata,
          processingTime
        },
        timestamp: new Date().toISOString()
      };
    } else {
      console.log(`   ❌ FAILED: ${data.error || 'No data returned'}`);
      return {
        school: school.domain,
        domain: school.domain,
        gameDate: school.gameDate,
        success: false,
        error: data.error || 'No data returned',
        metadata: {
          ...data.metadata,
          processingTime
        },
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.log(`   💥 ERROR: ${(error as Error).message}`);
    
    return {
      school: school.domain,
      domain: school.domain,
      gameDate: school.gameDate,
      success: false,
      error: `API Error: ${(error as Error).message}`,
      timestamp: new Date().toISOString()
    };
  }
}

async function runTests() {
  console.log('🚀 Testing schools with specific game dates');
  console.log('=' .repeat(70));
  console.log('These schools either had no game on 09/06/25 or had no officials data.');
  console.log('Testing with their correct game dates...\n');

  const results: TestResult[] = [];
  
  for (const school of SCHOOLS_TO_TEST) {
    const result = await testSchoolWithDate(school);
    results.push(result);
    
    // Add delay between requests
    if (SCHOOLS_TO_TEST.indexOf(school) < SCHOOLS_TO_TEST.length - 1) {
      console.log('   ⏳ Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Save results
  const outputFile = path.join(__dirname, 'test-results-specific-dates.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  // Print summary
  console.log('\n' + '=' .repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(70));
  
  const successful = results.filter(r => {
    return r.success && r.officials && 
      Object.values(r.officials).some(o => o !== null);
  });
  
  const gamesFoundNoOfficials = results.filter(r => {
    return r.success && r.gameInfo && 
      (!r.officials || Object.values(r.officials).every(o => o === null));
  });
  
  const failed = results.filter(r => !r.success || !r.gameInfo);
  
  console.log(`✅ Found officials: ${successful.length} schools`);
  successful.forEach(r => {
    const count = Object.values(r.officials || {}).filter(o => o !== null).length;
    console.log(`   • ${r.domain} (${r.gameDate}): ${count} officials vs ${r.gameInfo?.opponent}`);
  });
  
  if (gamesFoundNoOfficials.length > 0) {
    console.log(`\n⚠️  Games found but no officials: ${gamesFoundNoOfficials.length} schools`);
    gamesFoundNoOfficials.forEach(r => {
      console.log(`   • ${r.domain} (${r.gameDate}): vs ${r.gameInfo?.opponent}`);
    });
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length} schools`);
    failed.forEach(r => {
      console.log(`   • ${r.domain} (${r.gameDate}): ${r.error}`);
    });
  }
  
  const totalCost = results.reduce((sum, r) => sum + (r.metadata?.cost || 0), 0);
  const totalTokens = results.reduce((sum, r) => sum + (r.metadata?.tokensUsed || 0), 0);
  
  console.log(`\n💰 Total cost: $${totalCost.toFixed(4)}`);
  console.log(`🔢 Total tokens: ${totalTokens.toLocaleString()}`);
  console.log(`📁 Results saved to: ${outputFile}`);
}

// Run the tests
runTests().catch(console.error);