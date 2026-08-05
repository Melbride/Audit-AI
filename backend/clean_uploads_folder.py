import os
import shutil

def clean_uploads_folder():
    """
    Delete all files from the uploads folder.
    """
    uploads_path = "uploads"
    
    if not os.path.exists(uploads_path):
        print(f"Uploads folder '{uploads_path}' does not exist.")
        return
    
    try:
        # Delete all files in the uploads folder
        for filename in os.listdir(uploads_path):
            file_path = os.path.join(uploads_path, filename)
            if os.path.isfile(file_path):
                os.unlink(file_path)
                print(f"✓ Deleted {filename}")
        
        print(f"\n✅ Uploads folder cleaned successfully!")
        
    except Exception as e:
        print(f"❌ Error during uploads folder cleanup: {e}")

if __name__ == "__main__":
    print("⚠️  WARNING: This will delete ALL files from the uploads folder!")
    confirm = input("Type 'yes' to confirm: ")
    
    if confirm.lower() == 'yes':
        clean_uploads_folder()
    else:
        print("Operation cancelled.")
