content = open('Audit.py', 'r', encoding='utf-8').read()

# Remove the duplicate call
old = '''    auto_update_engagement_status(sub['engagement_id'], db)
    # Auto-update engagement status based on all section submission states
    auto_update_engagement_status(sub['engagement_id'], db)'''

new = '''    auto_update_engagement_status(sub['engagement_id'], db)'''

if old in content:
    content = content.replace(old, new)
    open('Audit.py', 'w', encoding='utf-8').write(content)
    print('Done')
else:
    print('Not found - checking single call')
    print('auto_update_engagement_status(sub' in content)