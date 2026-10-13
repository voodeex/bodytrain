#!/usr/bin/env bash
# Сборка .ipa для установки на iPhone.
#
#   npm run ios:ipa                      → неподписанный BodyTrain-unsigned.ipa
#                                          (ставится через Sideloadly / AltStore / eSign — они подпишут сами)
#   TEAM_ID=XXXXXXXXXX npm run ios:ipa   → подписанный development-.ipa твоей командой
#                                          (Personal Team тоже подходит; Xcode должен быть залогинен в Apple ID)
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname "$0")/.."

OUT_DIR="${OUT_DIR:-$PWD/build/ipa}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
BUILD_DIR="ios/build"

echo "▶︎ web build + cap sync"
npm run build
npx cap sync ios
ruby scripts/ios-native-setup.rb

if [[ -z "${TEAM_ID:-}" ]]; then
  echo "▶︎ xcodebuild (Release, iphoneos, без подписи)"
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
    -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath "$BUILD_DIR" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
    -quiet build

  APP="$BUILD_DIR/Build/Products/Release-iphoneos/App.app"
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/Payload"
  cp -R "$APP" "$TMP/Payload/BodyTrain.app"
  rm -f "$OUT_DIR/BodyTrain-unsigned.ipa"
  ( cd "$TMP" && zip -qry "$OUT_DIR/BodyTrain-unsigned.ipa" Payload )
  rm -rf "$TMP"
  echo "✅ $OUT_DIR/BodyTrain-unsigned.ipa"
  ls -lh "$OUT_DIR/BodyTrain-unsigned.ipa"
  exit 0
fi

ARCHIVE="$BUILD_DIR/BodyTrain.xcarchive"
echo "▶︎ archive (team $TEAM_ID)"
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -archivePath "$ARCHIVE" -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic archive

EXPORT_PLIST="$(mktemp -t bodytrain-export).plist"
cat > "$EXPORT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key><string>development</string>
    <key>teamID</key><string>${TEAM_ID}</string>
    <key>signingStyle</key><string>automatic</string>
    <key>stripSwiftSymbols</key><true/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$OUT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" -allowProvisioningUpdates
echo "✅ $OUT_DIR/App.ipa"
