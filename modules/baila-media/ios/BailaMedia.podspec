Pod::Spec.new do |s|
  s.name = 'BailaMedia'
  s.version = '0.1.0'
  s.summary = 'Private on-device video trimming for BailaCue'
  s.description = 'AVFoundation video metadata and separate trimmed MP4 exports.'
  s.license = { :type => 'MIT' }
  s.author = 'BailaCue'
  s.homepage = 'https://github.com/dn-lx/BailaCue'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/dn-lx/BailaCue.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'UIKit'
  s.source_files = '**/*.{h,m,mm,swift}'
end
