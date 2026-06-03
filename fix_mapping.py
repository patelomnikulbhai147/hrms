import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """          const mappedBranches = fetchedBranches.map((b: any) => ({
             ...b,
             name: b.branchName || b.name,
             isHeadOffice: false
          }));"""

new_code = """          const mappedBranches = fetchedBranches.map((b: any) => ({
             ...b,
             name: b.branchName || b.name,
             isHeadOffice: false,
             parentCompanyId: b.companyId
          }));"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed branch mapping in App.tsx")
else:
    print("Old code not found.")
