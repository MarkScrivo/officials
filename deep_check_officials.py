import json
import re
from collections import Counter

with open('/Users/markscrivo/Downloads/officialstest1/test-results-09-06-25.json', 'r') as f:
    data = json.load(f)

# Check specific schools known to have good data
print("Checking specific well-known schools for data quality:")
print("-" * 60)

schools_to_check = ['rolltide.com', 'floridagators.com', 'georgiadogs.com', 'texaslonghorns.com', 'ohiostatebuckeyes.com']

for school in schools_to_check:
    for result in data['results']:
        if result['domain'] == school and result['success']:
            print(f"\n{school} (vs {result['gameInfo']['opponent']}):")
            officials = result.get('officials', {})
            for position, name in officials.items():
                if name:
                    print(f"  {position}: {name}")
            break

# Check for any patterns in repeated names across schools
print("\n" + "=" * 60)
print("Checking schools that share the EXACT same officials (legitimate for conference games):")
print("-" * 60)

officials_by_school = {}
for result in data['results']:
    if result['success'] and result.get('officials'):
        officials = result['officials']
        if isinstance(officials, dict):
            school = result['domain']
            officials_list = []
            for position, name in officials.items():
                if name:
                    officials_list.append(f"{position}:{name}")
            if officials_list:
                officials_by_school[school] = set(officials_list)

# Find schools with identical official crews
identical_crews = []
schools_list = list(officials_by_school.keys())
for i in range(len(schools_list)):
    for j in range(i+1, len(schools_list)):
        school1 = schools_list[i]
        school2 = schools_list[j]
        if officials_by_school[school1] == officials_by_school[school2]:
            identical_crews.append((school1, school2))

if identical_crews:
    print("⚠️  Schools with IDENTICAL official crews:")
    for school1, school2 in identical_crews:
        print(f"  • {school1} and {school2}")
else:
    print("✅ No schools have identical official crews (good sign)")

# Check for generic patterns
print("\n" + "=" * 60)
print("Checking for generic/template-like patterns in names:")
print("-" * 60)

generic_patterns = []
all_names = []

for result in data['results']:
    if result['success'] and result.get('officials'):
        for position, name in result['officials'].items():
            if name:
                all_names.append((result['domain'], position, name))
                
                # Check for overly simple patterns
                if re.match(r'^[A-Z][a-z]+ [A-Z][a-z]+$', name) and len(name) < 12:
                    if name.count(' ') == 1:
                        parts = name.split()
                        if len(parts[0]) < 5 and len(parts[1]) < 6:
                            generic_patterns.append((result['domain'], position, name, "Very short simple name"))

# Show unique position distributions
print("\nPosition frequency (should be roughly equal):")
position_counts = Counter()
for result in data['results']:
    if result['success'] and result.get('officials'):
        for position, name in result['officials'].items():
            if name:
                position_counts[position] += 1

for position, count in position_counts.most_common():
    print(f"  {position}: {count}")

# Final check - look for any "Test" or "Example" strings
print("\n" + "=" * 60)
print("Final check for test/debug strings:")
suspicious_keywords = ['test', 'example', 'sample', 'demo', 'placeholder', 'temp', 'dummy']
found_suspicious = []

for result in data['results']:
    if result['success'] and result.get('officials'):
        for position, name in result['officials'].items():
            if name:
                name_lower = name.lower()
                for keyword in suspicious_keywords:
                    if keyword in name_lower:
                        found_suspicious.append((result['domain'], position, name))

if found_suspicious:
    print("⚠️  Found suspicious test/debug strings:")
    for school, position, name in found_suspicious:
        print(f"  {school}: {position} = {name}")
else:
    print("✅ No test/debug strings found in names")
