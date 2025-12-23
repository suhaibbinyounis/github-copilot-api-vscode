#!/bin/bash

# Workflow Automation Script
# Usage: ./workflow.sh

echo "=========================================="
echo "   🚀 Copilot API Gateway - Dev Workflow"
echo "=========================================="
echo ""
echo "Select an action:"
echo "1) 🌟 Start a New Feature"
echo "2) 💾 Save & Push Changes"
echo "3) 📦 Publish New Release (Main Only)"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo ""
        echo "--- Starting New Feature ---"
        echo "Switching to main and updating..."
        git checkout main
        git pull
        echo ""
        read -p "Enter feature name (e.g., dark-mode): " feature_name
        git checkout -b "feature/$feature_name"
        echo ""
        echo "✅ Created branch 'feature/$feature_name'. Happy coding!"
        ;;
    2)
        echo ""
        echo "--- Saving & Pushing Changes ---"
        git add .
        echo "Staged all changes."
        read -p "Enter commit message: " commit_msg
        git commit -m "$commit_msg"
        current_branch=$(git branch --show-current)
        git push -u origin "$current_branch"
        echo ""
        echo "✅ Changes pushed to origin/$current_branch"
        echo "🔗 Go to GitHub to open a Pull Request."
        ;;
    3)
        echo ""
        echo "--- Publishing New Release ---"
        current_branch=$(git branch --show-current)
        if [ "$current_branch" != "main" ]; then
            echo "❌ Error: You must be on 'main' to release. You are on '$current_branch'."
            exit 1
        fi
        
        echo "Pulling latest changes..."
        git pull
        
        echo ""
        echo "Select release type:"
        echo "1) Patch (0.0.X) - Bug fixes"
        echo "2) Minor (0.X.0) - New features"
        echo "3) Major (X.0.0) - Breaking changes"
        read -p "Enter choice [1-3]: " release_type_choice
        
        case $release_type_choice in
            1) type="patch";;
            2) type="minor";;
            3) type="major";;
            *) echo "Invalid choice"; exit 1;;
        esac
        
        echo "Bumping version ($type)..."
        npm version $type
        
        echo "Pushing changes and tags..."
        git push --follow-tags
        
        echo ""
        echo "✅ Release pushed! GitHub Actions will now publish to Marketplace."
        ;;
    *)
        echo "Invalid choice."
        exit 1
        ;;
esac
