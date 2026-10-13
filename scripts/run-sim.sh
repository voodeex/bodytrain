#!/usr/bin/env bash
# Сборка веб-части + iOS и запуск в симуляторе.
# Использование: npm run ios:sim [-- "iPhone 17 Pro"]
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")/.."
DEVICE="${1:-iPhone 17 Pro}"
DERIVED="ios/DerivedData"

npm run build
npx cap sync ios
ruby scripts/ios-native-setup.rb

xcrun simctl boot "$DEVICE" 2>/dev/null || true
open -a Simulator

xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,name=$DEVICE" -derivedDataPath "$DERIVED" \
  -quiet build

APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
xcrun simctl install "$DEVICE" "$APP"
xcrun simctl launch "$DEVICE" com.voodeex.bodytrain
echo "✅ Запущено в симуляторе: $DEVICE"
