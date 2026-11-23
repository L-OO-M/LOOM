/**
 * Practice resources, by department track.
 *
 * The practice room used to be DSA-only: the authoring form accepted a LeetCode
 * URL and nothing else, so a Web or AI/ML lead had no way to set their own
 * weekly work. This catalogue is the shipped starting point for each technical
 * track — real, hosted challenges a lead can assign in one click, or replace
 * with any other https link.
 *
 * It is presentation data only: no DB access, no session. The API still accepts
 * a custom URL for every item; the suggestions exist so a lead does not have to
 * hunt for a week's worth of links before publishing.
 *
 * Verification stays honest per source: LeetCode solves are checked through the
 * public sync, everything else is self-reported here and confirmed by a
 * correction, because Kaggle and Frontend Mentor expose no per-chapter API.
 */

export const PRACTICE_QUESTIONS_PER_TRACK_WEEK = 7;

export const PRACTICE_SOURCES = {
  leetcode: { label: "LeetCode", host: "leetcode.com", verified: true },
  kaggle: { label: "Kaggle", host: "kaggle.com", verified: false },
  "frontend-mentor": { label: "Frontend Mentor", host: "frontendmentor.io", verified: false },
  portswigger: { label: "PortSwigger Academy", host: "portswigger.net", verified: false },
  tryhackme: { label: "TryHackMe", host: "tryhackme.com", verified: false },
  overthewire: { label: "OverTheWire", host: "overthewire.org", verified: false },
  picoctf: { label: "picoCTF", host: "picoctf.org", verified: false },
  cryptohack: { label: "CryptoHack", host: "cryptohack.org", verified: false },
  ethernaut: { label: "Ethernaut", host: "ethernaut.openzeppelin.com", verified: false },
  cryptozombies: { label: "CryptoZombies", host: "cryptozombies.io", verified: false },
  "speedrun-ethereum": { label: "Speedrun Ethereum", host: "speedrunethereum.com", verified: false },
  "solidity-by-example": { label: "Solidity by Example", host: "solidity-by-example.org", verified: false },
  "capture-the-ether": { label: "Capture the Ether", host: "capturetheether.com", verified: false },
  "damn-vulnerable-defi": { label: "Damn Vulnerable DeFi", host: "damnvulnerabledefi.xyz", verified: false },
  "scaffold-eth": { label: "Scaffold-ETH 2", host: "docs.scaffoldeth.io", verified: false },
  arduino: { label: "Arduino", host: "docs.arduino.cc", verified: false },
  "raspberry-pi": { label: "Raspberry Pi", host: "raspberrypi.com", verified: false },
  wokwi: { label: "Wokwi", host: "wokwi.com", verified: false },
  adafruit: { label: "Adafruit Learn", host: "learn.adafruit.com", verified: false },
  platformio: { label: "PlatformIO", host: "docs.platformio.org", verified: false },
  freertos: { label: "FreeRTOS", host: "freertos.org", verified: false },
  other: { label: "External resource", host: "", verified: false }
};

const HOST_SOURCE = [
  ["leetcode.com", "leetcode"],
  ["kaggle.com", "kaggle"],
  ["frontendmentor.io", "frontend-mentor"],
  ["portswigger.net", "portswigger"],
  ["tryhackme.com", "tryhackme"],
  ["overthewire.org", "overthewire"],
  ["picoctf.org", "picoctf"],
  ["cryptohack.org", "cryptohack"],
  ["ethernaut.openzeppelin.com", "ethernaut"],
  ["cryptozombies.io", "cryptozombies"],
  ["speedrunethereum.com", "speedrun-ethereum"],
  ["solidity-by-example.org", "solidity-by-example"],
  ["capturetheether.com", "capture-the-ether"],
  ["damnvulnerabledefi.xyz", "damn-vulnerable-defi"],
  ["docs.scaffoldeth.io", "scaffold-eth"],
  ["docs.arduino.cc", "arduino"],
  ["raspberrypi.com", "raspberry-pi"],
  ["wokwi.com", "wokwi"],
  ["learn.adafruit.com", "adafruit"],
  ["docs.platformio.org", "platformio"],
  ["freertos.org", "freertos"]
];

/**
 * Which track a practice set belongs to. Slugs match
 * `lib/department-catalog.js` so a department lead's own workspace maps to the
 * right resource set without a second mapping table.
 */
export const PRACTICE_TRACKS = [
  {
    slug: "dsa",
    label: "DSA & Problem Solving",
    provider: "LeetCode",
    note: "Solves are verified through the public LeetCode sync.",
    suggestions: [
      { title: "Two Sum", url: "https://leetcode.com/problems/two-sum/", difficulty: "Easy", topic: "Arrays" },
      { title: "Valid Parentheses", url: "https://leetcode.com/problems/valid-parentheses/", difficulty: "Easy", topic: "Stack" },
      { title: "Merge Two Sorted Lists", url: "https://leetcode.com/problems/merge-two-sorted-lists/", difficulty: "Easy", topic: "Linked list" },
      { title: "Best Time to Buy and Sell Stock", url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/", difficulty: "Easy", topic: "Arrays" },
      { title: "Binary Search", url: "https://leetcode.com/problems/binary-search/", difficulty: "Easy", topic: "Binary search" },
      { title: "Maximum Subarray", url: "https://leetcode.com/problems/maximum-subarray/", difficulty: "Medium", topic: "Dynamic programming" },
      { title: "Number of Islands", url: "https://leetcode.com/problems/number-of-islands/", difficulty: "Medium", topic: "Graphs" }
    ]
  },
  {
    slug: "ai_ml",
    label: "AI / ML",
    provider: "Kaggle",
    note: "Leaderboard submissions are self-reported; a lead confirms them as corrections.",
    suggestions: [
      { title: "Titanic - Machine Learning from Disaster", url: "https://www.kaggle.com/competitions/titanic", difficulty: "Easy", topic: "Classification" },
      { title: "House Prices - Advanced Regression Techniques", url: "https://www.kaggle.com/competitions/house-prices-advanced-regression-techniques", difficulty: "Easy", topic: "Regression" },
      { title: "Digit Recognizer", url: "https://www.kaggle.com/competitions/digit-recognizer", difficulty: "Easy", topic: "Computer vision" },
      { title: "Spaceship Titanic", url: "https://www.kaggle.com/competitions/spaceship-titanic", difficulty: "Easy", topic: "Feature engineering" },
      { title: "Store Sales - Time Series Forecasting", url: "https://www.kaggle.com/competitions/store-sales-time-series-forecasting", difficulty: "Medium", topic: "Forecasting" },
      { title: "Natural Language Processing with Disaster Tweets", url: "https://www.kaggle.com/competitions/nlp-getting-started", difficulty: "Medium", topic: "NLP" },
      { title: "Connect X", url: "https://www.kaggle.com/competitions/connectx", difficulty: "Hard", topic: "Reinforcement learning" }
    ]
  },
  {
    slug: "web",
    label: "Web Development",
    provider: "Frontend Mentor",
    note: "Ship the page, then submit a repository link for review.",
    suggestions: [
      { title: "QR code component", url: "https://www.frontendmentor.io/challenges/qr-code-component-iux_sIO_H", difficulty: "Easy", topic: "HTML / CSS" },
      { title: "Product preview card component", url: "https://www.frontendmentor.io/challenges/product-preview-card-component-GO7UmttRfa", difficulty: "Easy", topic: "Responsive layout" },
      { title: "Results summary component", url: "https://www.frontendmentor.io/challenges/results-summary-component-CE_K6s0maV", difficulty: "Easy", topic: "Flexbox" },
      { title: "Interactive rating component", url: "https://www.frontendmentor.io/challenges/interactive-rating-component-koxpeBUmI", difficulty: "Easy", topic: "JavaScript" },
      { title: "FAQ accordion", url: "https://www.frontendmentor.io/challenges/faq-accordion-wyfFdeBwBz", difficulty: "Medium", topic: "Accessibility" },
      { title: "REST Countries API with colour theme switcher", url: "https://www.frontendmentor.io/challenges/rest-countries-api-with-color-theme-switcher-5cacc469fec04111f7b848ca", difficulty: "Medium", topic: "API integration" },
      { title: "Entertainment web app", url: "https://www.frontendmentor.io/challenges/entertainment-web-app-J-UhgAW1X", difficulty: "Hard", topic: "Full stack" }
    ]
  },
  {
    slug: "cybersecurity",
    label: "Cybersecurity",
    provider: "PortSwigger Academy",
    note: "Authorised labs only. Write-ups must not include live credentials.",
    suggestions: [
      { title: "SQL injection - retrieve hidden data", url: "https://portswigger.net/web-security/sql-injection/lab-retrieve-hidden-data", difficulty: "Easy", topic: "SQL injection" },
      { title: "Reflected XSS into HTML context", url: "https://portswigger.net/web-security/cross-site-scripting/reflected/lab-html-context-nothing-encoded", difficulty: "Easy", topic: "XSS" },
      { title: "OverTheWire Bandit", url: "https://overthewire.org/wargames/bandit/", difficulty: "Easy", topic: "Linux" },
      { title: "Username enumeration via different responses", url: "https://portswigger.net/web-security/authentication/password-based/lab-username-enumeration-via-different-responses", difficulty: "Medium", topic: "Authentication" },
      { title: "CryptoHack - Introduction", url: "https://cryptohack.org/challenges/introduction/", difficulty: "Medium", topic: "Cryptography" },
      { title: "TryHackMe - Pre Security path", url: "https://tryhackme.com/path/outline/presecurity", difficulty: "Easy", topic: "Fundamentals" },
      { title: "picoCTF practice gym", url: "https://picoctf.org/", difficulty: "Medium", topic: "CTF" }
    ]
  },
  {
    slug: "blockchain",
    label: "Blockchain",
    provider: "Ethernaut",
    note: "Test networks only. Never deploy a contract with real funds to learn.",
    suggestions: [
      { title: "Ethernaut", url: "https://ethernaut.openzeppelin.com/", difficulty: "Easy", topic: "Contract security" },
      { title: "CryptoZombies", url: "https://cryptozombies.io/", difficulty: "Easy", topic: "Solidity" },
      { title: "Speedrun Ethereum", url: "https://speedrunethereum.com/", difficulty: "Medium", topic: "Build a dApp" },
      { title: "Solidity by Example", url: "https://solidity-by-example.org/", difficulty: "Medium", topic: "Solidity" },
      { title: "Scaffold-ETH 2 docs", url: "https://docs.scaffoldeth.io/", difficulty: "Medium", topic: "Tooling" },
      { title: "Capture the Ether", url: "https://capturetheether.com/", difficulty: "Hard", topic: "Security" },
      { title: "Damn Vulnerable DeFi", url: "https://www.damnvulnerabledefi.xyz/", difficulty: "Hard", topic: "DeFi security" }
    ]
  },
  {
    slug: "embedded",
    label: "Embedded & Hardware",
    provider: "Arduino",
    note: "Use the simulator when hardware is not available; log the bring-up either way.",
    suggestions: [
      { title: "Arduino Blink", url: "https://docs.arduino.cc/built-in-examples/basics/Blink/", difficulty: "Easy", topic: "GPIO" },
      { title: "Arduino built-in examples", url: "https://docs.arduino.cc/built-in-examples/", difficulty: "Easy", topic: "Fundamentals" },
      { title: "Raspberry Pi - getting started", url: "https://www.raspberrypi.com/documentation/computers/getting-started.html", difficulty: "Easy", topic: "Linux SBC" },
      { title: "Wokwi ESP32 simulator", url: "https://wokwi.com/projects/new/esp32", difficulty: "Easy", topic: "Simulation" },
      { title: "Adafruit Learn", url: "https://learn.adafruit.com/", difficulty: "Medium", topic: "Sensors" },
      { title: "PlatformIO documentation", url: "https://docs.platformio.org/en/latest/", difficulty: "Medium", topic: "Toolchain" },
      { title: "FreeRTOS overview", url: "https://www.freertos.org/Documentation/00-Overview", difficulty: "Hard", topic: "Real-time OS" }
    ]
  }
];

const TRACK_INDEX = new Map(PRACTICE_TRACKS.map((track) => [track.slug, track]));

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "_");
}

/** Track metadata for a department slug or display name, or null. */
export function trackFor(value) {
  const key = normalize(value);
  if (!key) return null;
  return (
    TRACK_INDEX.get(key) ||
    PRACTICE_TRACKS.find((track) => normalize(track.label) === key || normalize(track.provider) === key) ||
    null
  );
}

/** A fresh copy of the seven suggested items, so callers never mutate the catalogue. */
export function suggestionsFor(value) {
  const track = trackFor(value);
  return track ? track.suggestions.map((item) => ({ ...item })) : [];
}

/** The source key for a hosted link, by exact or suffix-matched host. */
export function sourceForUrl(link) {
  let host;
  try {
    host = new URL(String(link || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }
  const match = HOST_SOURCE.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return match ? match[1] : "other";
}

export function sourceLabel(source) {
  return PRACTICE_SOURCES[source]?.label || PRACTICE_SOURCES.other.label;
}

/** True when the source has a real per-member verification path. */
export function isVerifiedSource(source) {
  return PRACTICE_SOURCES[source]?.verified === true;
}

/** A stable slug for a non-LeetCode resource, from its title. */
export function slugFromTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Options a server page can hand to the editor without leaking the whole catalogue shape. */
export function trackOptions() {
  return PRACTICE_TRACKS.map((track) => ({
    slug: track.slug,
    label: track.label,
    provider: track.provider,
    note: track.note
  }));
}

/**
 * Track options for the departments a viewer may author for. A department the
 * catalogue does not know (an admin-created one) still gets an option: its own
 * name, no shipped suggestions, and the custom-link editor.
 */
export function trackOptionsForDepartments(departments = []) {
  return departments.map((department) => {
    const track = trackFor(department.slug) || trackFor(department.name);
    return {
      slug: department.slug,
      label: track?.label || department.name,
      provider: track?.provider || null,
      note: track?.note || "Paste any public https challenge link for this department."
    };
  });
}
