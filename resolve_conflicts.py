import os
import re

# 1. Resolve backend/fix.py
os.system('git rm backend/fix.py')

# 2. Resolve frontend/src/App.jsx
with open(r'frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'<<<<<<< HEAD\n// import ClientDetailsPage from \'\./pages/ClientDetailsPage\'\n// AI pipeline pages \n=======\n\n// AI pipeline pages\n>>>>>>> [a-f0-9]+\n', '// AI pipeline pages\n', text)
text = re.sub(r'<<<<<<< HEAD\nimport TrialBalancePage from \'\./pages/TrialBalancePage\'\nimport AccountMappingPage from \'\./pages/AccountMappingPage\'\n// App/management pages \n=======\n\n// App/management pages\n>>>>>>> [a-f0-9]+\n', 'import TrialBalancePage from \'./pages/TrialBalancePage\'\nimport AccountMappingPage from \'./pages/AccountMappingPage\'\n\n// App/management pages\n', text)

with open(r'frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

# 3. Resolve frontend/src/pages/Login.jsx
with open(r'frontend/src/pages/Login.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

c_login_pattern = re.compile(r'<<<<<<< HEAD\n.*?=======\n(.*?)>>>>>>> [a-f0-9]+\n', re.DOTALL)
text = c_login_pattern.sub(r'\1', text)

with open(r'frontend/src/pages/Login.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

# 4. Resolve frontend/src/pages/AnalysisPage.jsx
with open(r'frontend/src/pages/AnalysisPage.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

c_analysis_pattern = re.compile(r'<<<<<<< HEAD\n.*?=======\n(.*?)>>>>>>> [a-f0-9]+\n', re.DOTALL)
text = c_analysis_pattern.sub(r'\1', text)

with open(r'frontend/src/pages/AnalysisPage.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

# 5. Resolve backend/main.py
with open(r'backend/main.py', 'r', encoding='utf-8') as f:
    text = f.read()

c1_pattern = re.compile(r'<<<<<<< HEAD\n(def build_financial_analysis_context.*?return context\n)=======\n(# --- Report Generator helpers -----------------------------------------------.*?\]\n)>>>>>>> [a-f0-9]+\n', re.DOTALL)
text = c1_pattern.sub(r'\1\n\2', text)

# The shared mapping piece in main.py
shared_regex = r'(\s+if not mapping:\n\s+raise HTTPException\(\n\s+status_code=400,\n\s+detail="No saved mapping found for this client\. Please complete column mapping first\."\n\s+\)\n\n)'

c2_3_pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [a-f0-9]+\n' + shared_regex + r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [a-f0-9]+\n', re.DOTALL)

def repl_2_3(m):
    return m.group(1) + "\n" + m.group(3) + m.group(4) + "\n\n" + m.group(2) + "\n" + m.group(3) + m.group(5) + "\n"

text = c2_3_pattern.sub(repl_2_3, text)

with open(r'backend/main.py', 'w', encoding='utf-8') as f:
    f.write(text)

# 6. Resolve frontend/src/pages/Clients.jsx
with open(r'frontend/src/pages/Clients.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the first conflict (keep incoming + navigate)
text = re.sub(
    r'<<<<<<< HEAD\n  const navigate = useNavigate\(\);\n.*?\n=======\n(.*?)>>>>>>> [a-f0-9]+\n',
    r'  const navigate = useNavigate();\n\1',
    text,
    flags=re.DOTALL,
    count=1
)

# Replace the second conflict (keep incoming entirely first)
text = re.sub(
    r'<<<<<<< HEAD\n.*?\n=======\n(.*?)>>>>>>> [a-f0-9]+\n',
    r'\1',
    text,
    flags=re.DOTALL
)

# Insert the view button into the incoming layout details card
old_actions = """                  <div className="cl-detail-actions">
                    <button type="button" className="cl-btn-edit" onClick={() => openEdit(selectedClient)}>
                      Edit
                    </button>
                    <button type="button" className="cl-btn-delete" onClick={() => handleDelete(selectedClient)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>"""

new_actions = """                  <div className="cl-detail-actions">
                    <button type="button" className="cl-btn-edit" onClick={() => openEdit(selectedClient)}>
                      Edit
                    </button>
                    <button type="button" className="cl-btn-delete" onClick={() => handleDelete(selectedClient)}>
                      Delete
                    </button>
                    <button type="button" className="cl-btn-view" onClick={() => navigate(`/clients/${selectedClient.client_id}`)}>
                      View
                    </button>
                  </div>
                )}
                {!canEdit && (
                  <div className="cl-detail-actions">
                    <button type="button" className="cl-btn-view" onClick={() => navigate(`/clients/${selectedClient.client_id}`)}>
                      View
                    </button>
                  </div>
                )}
              </div>"""

text = text.replace(old_actions, new_actions)

with open(r'frontend/src/pages/Clients.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('All conflicts resolved successfully.')
