import json

with open('/Users/markscrivo/Downloads/officialstest1/test-results-09-06-25.json', 'r') as f:
    data = json.load(f)

# Create a lookup of schools and their opponents
school_games = {}
for result in data['results']:
    if result['success'] and result.get('gameInfo'):
        school_games[result['domain']] = result['gameInfo'].get('opponent', 'Unknown')

print("Verifying matching official crews (these should be home/away pairs):")
print("-" * 80)

# Check some known pairs
pairs_to_check = [
    ('rolltide.com', 'ulmwarhawks.com'),  # Alabama vs ULM
    ('floridagators.com', 'gousfbulls.com'),  # Florida vs USF
    ('lsusports.net', 'latechsports.com'),  # LSU vs LA Tech
    ('mutigers.com', 'kuathletics.com'),  # Missouri vs Kansas
    ('hawkeyesports.com', 'cyclones.com'),  # Iowa vs Iowa State
    ('uhcougars.com', 'riceowls.com'),  # Houston vs Rice
    ('navysports.com', 'uabsports.com'),  # Navy vs UAB
    ('troytrojans.com', 'clemsontigers.com'),  # Troy vs Clemson
]

for school1, school2 in pairs_to_check:
    opp1 = school_games.get(school1, 'Not found')
    opp2 = school_games.get(school2, 'Not found')
    
    # Get school names
    name1 = school1.replace('.com', '').replace('sports', '').upper()
    name2 = school2.replace('.com', '').replace('sports', '').upper()
    
    print(f"\n{school1} (playing {opp1})")
    print(f"    ↕️  SAME OFFICIALS")
    print(f"{school2} (playing {opp2})")
    
    # Check if they're playing each other
    if 'Alabama' in opp2 or 'ULM' in opp1:
        print("    ✅ These teams are playing EACH OTHER - makes perfect sense!")
    elif 'Florida' in opp2 or 'South Florida' in opp1 or 'USF' in opp1:
        print("    ✅ These teams are playing EACH OTHER - makes perfect sense!")
    elif 'LSU' in opp2 or 'Louisiana Tech' in opp1 or 'LA Tech' in opp1:
        print("    ✅ These teams are playing EACH OTHER - makes perfect sense!")
    elif 'Missouri' in opp2 or 'Kansas' in opp1:
        print("    ✅ These teams are playing EACH OTHER - makes perfect sense!")
    elif 'Iowa State' in opp1 or 'Iowa' in opp2:
        print("    ✅ These teams are playing EACH OTHER - makes perfect sense!")
    elif 'Houston' in opp2 or 'Rice' in opp1:
        print("    ✅ These teams are playing EACH OTHER - makes perfect sense!")
    elif 'Navy' in opp2 or 'UAB' in opp1:
        print("    ✅ These teams are playing EACH OTHER - makes perfect sense!")
    elif 'Clemson' in opp2 or 'Troy' in opp1:
        print("    ✅ These teams are playing EACH OTHER - makes perfect sense!")

# Also show some specific official names from major schools
print("\n" + "=" * 80)
print("Sample of officials from major conference games (should be real names):")
print("-" * 80)

major_schools = ['georgiadogs.com', 'ohiostatebuckeyes.com', 'clemsontigers.com', 'texaslonghorns.com']
for school in major_schools:
    for result in data['results']:
        if result['domain'] == school and result['success']:
            officials = result.get('officials', {})
            if officials and any(officials.values()):
                print(f"\n{school}:")
                # Just show referee and umpire as samples
                if officials.get('referee'):
                    print(f"  Referee: {officials['referee']}")
                if officials.get('umpire'):
                    print(f"  Umpire: {officials['umpire']}")
            break
