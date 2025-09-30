#!/bin/bash

# Exit codes:
# 1 = Build (changes detected)
# 0 = Skip build (no changes)

echo "🔍 Checking if frontend changes were made..."

# Check if we're on main branch
if [[ "$VERCEL_GIT_COMMIT_REF" != "main" ]] ; then
  echo "✅ Not main branch, building anyway"
  exit 1
fi

# If VERCEL_GIT_PREVIOUS_SHA is not set, build
if [[ -z "$VERCEL_GIT_PREVIOUS_SHA" ]] ; then
  echo "✅ No previous commit to compare, building"
  exit 1
fi

# Check if files in frontend/ or root package-lock.json changed
echo "Comparing $VERCEL_GIT_PREVIOUS_SHA to $VERCEL_GIT_COMMIT_SHA"

if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- ../frontend/ ../package-lock.json ; then
  echo "⏭️  No frontend changes detected, skipping build"
  exit 0
else
  echo "✅ Frontend changes detected, building"
  exit 1
fi
