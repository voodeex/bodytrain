# Идемпотентная донастройка Capacitor iOS-проекта:
# добавляет нативный плагин в таргет App, подменяет контроллер в storyboard,
# прописывает разрешения и прочие ключи Info.plist.
# Запуск: ruby scripts/ios-native-setup.rb (нужен gem xcodeproj — ставится вместе с CocoaPods)
require 'xcodeproj'

root = File.expand_path('..', __dir__)
app_dir = File.join(root, 'ios/App/App')
proj_path = File.join(root, 'ios/App/App.xcodeproj')

project = Xcodeproj::Project.open(proj_path)
target = project.targets.find { |t| t.name == 'App' }
group = project.main_group.find_subpath('App', false)

%w[BodyVisionPlugin.swift MainViewController.swift].each do |name|
  next if group.files.any? { |f| f.path == name }
  ref = group.new_reference(name)
  target.source_build_phase.add_file_reference(ref)
  puts "+ #{name}"
end

target.build_configurations.each do |c|
  c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  c.build_settings['TARGETED_DEVICE_FAMILY'] = '1'
  c.build_settings['SWIFT_VERSION'] = '5.0'
  c.build_settings['MARKETING_VERSION'] = '0.3.0'
  c.build_settings['BODYTRAIN_BUNDLE_ID'] = 'com.voodeex.bodytrain'
  c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = '$(BODYTRAIN_BUNDLE_ID)'
end
unless group.files.any? { |f| f.path == 'PrivacyInfo.xcprivacy' }
  ref = group.new_reference('PrivacyInfo.xcprivacy')
  target.resources_build_phase.add_file_reference(ref)
end
project.save

# Storyboard: наш MainViewController вместо CAPBridgeViewController
sb = File.join(app_dir, 'Base.lproj/Main.storyboard')
xml = File.read(sb)
xml = xml.sub('customClass="CAPBridgeViewController" customModule="Capacitor"',
              'customClass="MainViewController" customModule="App" customModuleProvider="target"')
File.write(sb, xml)

# Info.plist
plist_path = File.join(app_dir, 'Info.plist')
plist = Xcodeproj::Plist.read_from_path(plist_path)
plist['CFBundleDevelopmentRegion'] = 'ru'
plist['NSCameraUsageDescription'] = 'Камера нужна, чтобы фотографировать еду и сканировать штрихкоды продуктов.'
plist['NSPhotoLibraryUsageDescription'] = 'Доступ к фото нужен, чтобы распознать еду на снимке.'
plist['UIFileSharingEnabled'] = true
plist['LSSupportsOpeningDocumentsInPlace'] = true
plist['ITSAppUsesNonExemptEncryption'] = false
plist['UIUserInterfaceStyle'] = 'Dark'
# Для отладки с сервером на этом Mac (VITE_API_URL=http://localhost:8787); на HTTPS не влияет
plist['NSAppTransportSecurity'] = { 'NSAllowsLocalNetworking' => true }
plist['UIRequiredDeviceCapabilities'] = ['arm64']
plist['UISupportedInterfaceOrientations'] = ['UIInterfaceOrientationPortrait']
plist.delete('UISupportedInterfaceOrientations~ipad')
Xcodeproj::Plist.write_to_path(plist, plist_path)
puts 'iOS project patched'
