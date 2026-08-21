import {
  getNavigationUrl,
  type DeviceInfo,
  type NavigationLaunchParams,
} from "../navigationLauncher";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

console.log("\n🧪 Running Navigation Launcher Deep Link Test Suite...\n");

const mockParams: NavigationLaunchParams = {
  origin: [14.6149, 120.9701],
  originName: "Tayuman",
  destination: [14.6200, 120.9800],
  destinationName: "SM City San Lazaro",
  mode: "driving",
};

const desktopDevice: DeviceInfo = {
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  isDesktop: true,
};

const iosDevice: DeviceInfo = {
  isMobile: true,
  isIOS: true,
  isAndroid: false,
  isDesktop: false,
};

const androidDevice: DeviceInfo = {
  isMobile: true,
  isIOS: false,
  isAndroid: true,
  isDesktop: false,
};

// 1. Google Maps Tests
console.log("── Test 1: Google Maps Deep Links ──");
const gmapsDrive = getNavigationUrl("google", mockParams, desktopDevice);
assert(gmapsDrive.includes("google.com/maps/dir/"), "Google Maps uses standard direction API");
assert(gmapsDrive.includes("travelmode=driving"), "Google Maps sets driving mode");
assert(gmapsDrive.includes("14.6149,120.9701"), "Google Maps includes origin coordinates");
assert(gmapsDrive.includes("14.62,120.98"), "Google Maps includes destination coordinates");

const gmapsWalk = getNavigationUrl("google", { ...mockParams, mode: "walking" }, desktopDevice);
assert(gmapsWalk.includes("travelmode=walking"), "Google Maps sets walking travelmode");

// 2. Apple Maps Tests
console.log("\n── Test 2: Apple Maps Deep Links ──");
const appleIOS = getNavigationUrl("apple", mockParams, iosDevice);
assert(appleIOS.startsWith("maps://"), "Apple Maps on iOS uses native maps:// deep link scheme");
assert(appleIOS.includes("dirflg=d"), "Apple Maps sets driving direction flag");

const appleWalkIOS = getNavigationUrl("apple", { ...mockParams, mode: "walking" }, iosDevice);
assert(appleWalkIOS.includes("dirflg=w"), "Apple Maps sets walking direction flag");

const appleWeb = getNavigationUrl("apple", mockParams, desktopDevice);
assert(appleWeb.startsWith("https://maps.apple.com/"), "Apple Maps on non-iOS uses https fallback");

// 3. Waze Tests
console.log("\n── Test 3: Waze Deep Links ──");
const wazeMobile = getNavigationUrl("waze", mockParams, androidDevice);
assert(wazeMobile.startsWith("waze://"), "Waze on mobile uses native waze:// deep link scheme");
assert(wazeMobile.includes("navigate=yes"), "Waze enables navigate=yes");

const wazeWeb = getNavigationUrl("waze", mockParams, desktopDevice);
assert(wazeWeb.startsWith("https://www.waze.com/ul"), "Waze on desktop uses web URL");

console.log("\n════════════════════════════════════════════════════════════");
console.log("  All Navigation Launcher Tests Passed Successfully! ");
console.log("════════════════════════════════════════════════════════════\n");
