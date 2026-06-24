content = open('Audit.py', 'r', encoding='utf-8').read()

# Check what export/diff routes exist
if 'export-cleaned' in content:
    print('export-cleaned route found - needs removal')
if 'submit-corrected-excel' in content:
    print('submit-corrected-excel route found - needs removal')
if 'diff_uploaded_against_snapshot' in content:
    print('diff function still referenced')
if 'build_cleaning_workbook' in content:
    print('build_cleaning_workbook still referenced')