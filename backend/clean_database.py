from database import get_connection, DB_CONFIG

def clean_database():
    """
    Delete all uploaded files, mappings, and workflow data to test workflow from scratch.
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        print("Cleaning database tables...")
        
        # Delete workflow stages
        cursor.execute("DELETE FROM workflow_stages")
        print(f"✓ Deleted {cursor.rowcount} records from workflow_stages")
        
        # Delete cleaning corrections
        cursor.execute("DELETE FROM cleaning_corrections")
        print(f"✓ Deleted {cursor.rowcount} records from cleaning_corrections")
        
        # Delete cleaning snapshots
        cursor.execute("DELETE FROM cleaning_snapshots")
        print(f"✓ Deleted {cursor.rowcount} records from cleaning_snapshots")
        
        # Delete cleaned registry
        cursor.execute("DELETE FROM cleaned_registry")
        print(f"✓ Deleted {cursor.rowcount} records from cleaned_registry")
        
        # Delete column mappings
        cursor.execute("DELETE FROM column_mappings")
        print(f"✓ Deleted {cursor.rowcount} records from column_mappings")
        
        # Delete uploads
        cursor.execute("DELETE FROM uploads")
        print(f"✓ Deleted {cursor.rowcount} records from uploads")
        
        # Delete fingerprints
        cursor.execute("DELETE FROM fingerprints")
        print(f"✓ Deleted {cursor.rowcount} records from fingerprints")
        
        conn.commit()
        print("\n✅ Database cleaned successfully!")
        print("You can now test the workflow from scratch.")
        
    except Exception as e:
        print(f"❌ Error during database cleanup: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    print("⚠️  WARNING: This will delete ALL uploaded files, mappings, and workflow data!")
    confirm = input("Type 'yes' to confirm: ")
    
    if confirm.lower() == 'yes':
        clean_database()
    else:
        print("Operation cancelled.")
