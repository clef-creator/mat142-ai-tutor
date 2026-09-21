/**
 * The words that student passwords are built from.
 *
 * Every word here has to survive the same journey: read off a printed slip by
 * someone who is already a bit anxious, remembered for the walk to a computer,
 * and typed correctly first time. So the list is deliberately dull — short,
 * concrete, common, spelled the way it sounds.
 *
 * Rules that were applied and are enforced by `tests/signin.test.ts`:
 *
 *  - three to seven letters, lower case, nothing but a-z;
 *  - no duplicates, because a repeat quietly shrinks the list;
 *  - no word whose spelling has to be guessed at (no "queue", "rhythm");
 *  - no pair that sounds identical when read aloud, since these are spoken
 *    across a desk as often as they are read ("pear" is here, "pair" is not);
 *  - nothing unkind, crude or frightening, in any combination of four.
 *
 * Adding words only ever makes passwords harder to guess, so the list may grow.
 * Removing one is the change to think twice about.
 */

export const WORDS: readonly string[] = [
  // --- creatures ---
  'otter', 'tiger', 'panda', 'robin', 'heron', 'koala', 'zebra', 'camel',
  'horse', 'sheep', 'mouse', 'eagle', 'raven', 'finch', 'crane', 'shark',
  'whale', 'seal', 'crab', 'moth', 'owl', 'fox', 'deer', 'bear',
  'wolf', 'lion', 'goat', 'duck', 'swan', 'dove', 'hawk', 'lark',
  'toad', 'frog', 'newt', 'snail', 'squid', 'clam', 'trout', 'perch',
  'ibis', 'stork', 'quail', 'egret', 'lemur', 'bison', 'moose', 'llama',
  'mole', 'hare', 'lynx', 'beaver', 'falcon', 'parrot', 'monkey', 'rabbit',
  'donkey', 'turtle', 'walrus', 'ferret', 'gecko', 'cobra', 'mantis', 'beetle',
  'spider', 'badger', 'magpie', 'oriole', 'puffin', 'condor', 'osprey', 'weasel',
  'jackal', 'gibbon', 'langur', 'kitten', 'puppy', 'calf', 'foal', 'lamb',

  // --- land and water ---
  'river', 'creek', 'lake', 'pond', 'ocean', 'beach', 'shore', 'cliff',
  'ridge', 'valley', 'canyon', 'meadow', 'forest', 'jungle', 'desert', 'island',
  'marsh', 'dune', 'hill', 'peak', 'slope', 'cave', 'rock', 'stone',
  'pebble', 'gravel', 'sand', 'clay', 'soil', 'moss', 'fern', 'vine',
  'leaf', 'root', 'bark', 'twig', 'branch', 'trunk', 'grove', 'willow',
  'cedar', 'maple', 'birch', 'aspen', 'alder', 'cactus', 'bamboo', 'reed',
  'grass', 'bloom', 'petal', 'pollen', 'seed', 'sprout', 'thorn', 'acorn',

  // --- sky and weather ---
  'cloud', 'storm', 'mist', 'fog', 'dew', 'frost', 'snow', 'sleet',
  'hail', 'rain', 'wind', 'gale', 'breeze', 'sunset', 'dawn', 'dusk',
  'noon', 'night', 'star', 'moon', 'comet', 'orbit', 'galaxy', 'planet',
  'meteor', 'aurora', 'shadow', 'light', 'spark', 'flame', 'ember', 'glow',
  'tide', 'wave', 'ripple', 'stream',

  // --- colours ---
  'maroon', 'amber', 'azure', 'ivory', 'olive', 'coral', 'indigo', 'violet',
  'silver', 'golden', 'bronze', 'copper', 'cobalt', 'teal', 'jade', 'ruby',
  'topaz', 'opal', 'pearl', 'slate', 'ochre', 'sienna', 'umber', 'sepia',
  'lilac', 'scarlet',

  // --- things that grow and are eaten ---
  'mango', 'guava', 'lemon', 'lime', 'peach', 'plum', 'pear', 'apple',
  'grape', 'melon', 'berry', 'cherry', 'papaya', 'banana', 'walnut', 'almond',
  'cashew', 'peanut', 'sesame', 'ginger', 'garlic', 'pepper', 'chili', 'cumin',
  'clove', 'basil', 'mint', 'thyme', 'sage', 'millet', 'barley', 'wheat',
  'rice', 'lentil', 'bean', 'corn', 'honey', 'sugar', 'butter', 'bread',
  'toast', 'cake', 'mustard', 'cocoa',

  // --- made things ---
  'anchor', 'basket', 'bottle', 'bucket', 'button', 'candle', 'carpet', 'clock',
  'cradle', 'drum', 'flute', 'ladder', 'lamp', 'mirror', 'needle', 'paper',
  'pencil', 'pillow', 'pocket', 'ribbon', 'rocket', 'saddle', 'shell', 'shovel',
  'spoon', 'string', 'table', 'teapot', 'thread', 'ticket', 'torch', 'tower',
  'violin', 'wagon', 'wheel', 'window', 'bridge', 'castle', 'garden', 'kettle',
  'market', 'palace', 'temple', 'tunnel', 'bakery', 'lantern', 'compass', 'kite',
  'marble', 'puzzle', 'ruler', 'satchel', 'whistle', 'yarn',

  // --- how things are ---
  'quiet', 'gentle', 'bright', 'brave', 'calm', 'clever', 'eager', 'happy',
  'humble', 'kind', 'lively', 'merry', 'nimble', 'noble', 'proud', 'quick',
  'ready', 'swift', 'tidy', 'warm', 'wise', 'bold', 'clear', 'crisp',
  'deep', 'fresh', 'keen', 'plain', 'rapid', 'sharp', 'smooth', 'soft',
  'solid', 'steady', 'sturdy', 'sunny', 'tender', 'wide', 'young', 'hidden',
  'little', 'lucky', 'royal', 'silent', 'simple', 'sleepy', 'smart', 'gladly',

  // --- counts ---
  'three', 'four', 'five', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'eighty', 'ninety',
  'dozen', 'first', 'second', 'third',
];
