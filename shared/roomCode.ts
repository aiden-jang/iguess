// One shared default room name drops two unrelated groups into the same game, and the second
// group hits the player cap. Codes are meant to be read aloud, so words beat random characters.

const ADJECTIVES = [
  "brave",
  "calm",
  "clever",
  "cosmic",
  "cranky",
  "crisp",
  "dizzy",
  "eager",
  "fancy",
  "feral",
  "fuzzy",
  "gentle",
  "giant",
  "glossy",
  "grumpy",
  "hasty",
  "hollow",
  "humble",
  "jolly",
  "keen",
  "lucky",
  "mellow",
  "mighty",
  "nimble",
  "noble",
  "peppy",
  "plucky",
  "prickly",
  "quiet",
  "rapid",
  "rowdy",
  "rusty",
  "shiny",
  "silly",
  "sleepy",
  "smug",
  "snappy",
  "spicy",
  "sturdy",
  "swift",
  "tidy",
  "toasty",
  "velvet",
  "wily",
  "witty",
  "zany",
];

const NOUNS = [
  "otter",
  "badger",
  "puffin",
  "walrus",
  "gecko",
  "marmot",
  "heron",
  "lemur",
  "narwhal",
  "ocelot",
  "panda",
  "quokka",
  "raccoon",
  "salmon",
  "tapir",
  "urchin",
  "vulture",
  "wombat",
  "yak",
  "zebra",
  "beetle",
  "cactus",
  "comet",
  "donut",
  "ember",
  "fossil",
  "gizmo",
  "harbor",
  "iceberg",
  "jigsaw",
  "kettle",
  "lantern",
  "meteor",
  "noodle",
  "pickle",
  "quartz",
  "rocket",
  "socket",
  "turnip",
  "violin",
];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/** A fresh, speakable room code, e.g. "spicy-wombat-47". */
export function newRoomCode(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${Math.floor(Math.random() * 90) + 10}`;
}

/** A mistyped percent escape should still reach the join screen, not throw a server error. */
export function decodeRoomCode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
