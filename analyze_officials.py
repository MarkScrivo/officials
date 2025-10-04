import json

with open('/Users/markscrivo/Downloads/officialstest1/test-results-09-06-25.json', 'r') as f:
    data = json.load(f)

# Find schools that found games but got no officials
no_officials = []

for result in data['results']:
    if result['success']:
        # Check if officials exist and if they have any non-null values
        officials = result.get('officials', {})
        if isinstance(officials, dict):
            # Check if all values are null or if dict is empty
            non_null_count = sum(1 for v in officials.values() if v is not None)
            if non_null_count == 0:
                no_officials.append({
                    'domain': result['domain'],
                    'school': result.get('school', result['domain']),
                    'opponent': result.get('gameInfo', {}).get('opponent', 'Unknown'),
                    'officials_data': officials
                })

print(f"Schools that found games but extracted NO officials ({len(no_officials)} total):")
print("-" * 60)
for school in no_officials:
    print(f"• {school['domain']}: vs {school['opponent']}")
