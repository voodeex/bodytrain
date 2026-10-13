#!/usr/bin/env bash
# Изолированный bundle ID: не меняет дневник обычного BodyTrain.
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")/.."
DEVICE="${1:-iPhone 17 Pro}"
BUNDLE="com.voodeex.bodytrain.selftest"
VITE_SELFTEST=1 npm run build
npx cap sync ios
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,name=$DEVICE" -derivedDataPath ios/SelftestDerivedData \
  BODYTRAIN_BUNDLE_ID="$BUNDLE" -quiet build
xcrun simctl install "$DEVICE" ios/SelftestDerivedData/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
node scripts/selftest-console.mjs "$DEVICE" "$BUNDLE"
