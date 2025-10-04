import json
import re
from collections import Counter

with open('/Users/markscrivo/Downloads/officialstest1/test-results-09-06-25.json', 'r') as f:
    data = json.load(f)

# Collect all officials names
all_officials = []
suspicious_names = []
common_placeholder_names = ['john doe', 'jane doe', 'jane smith', 'john smith', 'test name', 'example name']

for result in data['results']:
    if result['success'] and result.get('officials'):
        officials = result['officials']
        if isinstance(officials, dict):
            for position, name in officials.items():
                if name:
                    all_officials.append(name)
                    
                    # Check for suspicious patterns
                    name_lower = name.lower()
                    
                    # Check for common placeholder names
                    if name_lower in common_placeholder_names:
                        suspicious_names.append({
                            'school': result['domain'],
                            'position': position,
                            'name': name,
                            'reason': 'Common placeholder name'
                        })
                    
                    # Check for repetitive patterns (like "Test Test" or "Name Name")
                    parts = name.split()
                    if len(parts) == 2 and parts[0] == parts[1]:
                        suspicious_names.append({
                            'school': result['domain'],
                            'position': position,
                            'name': name,
                            'reason': 'Repetitive pattern'
                        })
                    
                    # Check for numbered names (like "Official 1", "Referee 2")
                    if re.search(r'\d+$', name):
                        suspicious_names.append({
                            'school': result['domain'],
                            'position': position,
                            'name': name,
                            'reason': 'Contains numbers'
                        })

# Count name frequencies to find duplicates across different games
name_counts = Counter(all_officials)
duplicate_officials = {name: count for name, count in name_counts.items() if count > 1}

print(f"Total officials extracted: {len(all_officials)}")
print(f"Unique officials: {len(set(all_officials))}")
print()

# Show most common names (potential red flags if too common)
print("Top 10 Most Frequent Official Names (checking for unrealistic patterns):")
print("-" * 60)
for name, count in name_counts.most_common(10):
    print(f"  {name}: appears {count} times")

print("\n" + "=" * 60)

if suspicious_names:
    print(f"\n⚠️  SUSPICIOUS NAMES FOUND ({len(suspicious_names)}):")
    print("-" * 60)
    for sus in suspicious_names:
        print(f"  {sus['school']}: {sus['position']} = '{sus['name']}' ({sus['reason']})")
else:
    print("\n✅ No obviously suspicious placeholder names found")

# Sample some random officials to manually review
print("\n" + "=" * 60)
print("Sample of 20 random officials for manual review:")
print("-" * 60)
import random
sample_officials = random.sample(all_officials, min(20, len(all_officials)))
for i, name in enumerate(sample_officials, 1):
    print(f"  {i}. {name}")

# Check for any officials with single names only
single_names = [name for name in all_officials if len(name.split()) == 1]
if single_names:
    print("\n⚠️  Single-word names found (might be incomplete):")
    print("-" * 60)
    for name in single_names[:10]:
        print(f"  • {name}")
