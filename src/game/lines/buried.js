// 🦴 Things buried in the ground: round town (gardens, the park), in the woods and on the farm. A sniff finds
// the spot, three digs bring it up (../town/buried.js). w: how often it turns up (rarer things less often).
// xp: stars. model: its shape (entities/buriedItems.js), if not the same as its id.

export const BURIED = {
  town: [
    { id: 'bone', emoji: '🦴', name: 'Buried bone', xp: 3, w: 8, lines: ['A bone! Somebody buried this ages ago. Finders keepers!', 'BONE! Still a bit crunchy. Excellent.', 'A forgotten bone! (Was it yours? It might have been yours.)'] },
    { id: 'ball', emoji: '🎾', name: 'Squashed tennis ball', xp: 3, w: 5, lines: ['A tennis ball! A bit squashed. Still bouncy-ish.', 'A ball! Lost for years, found by the best nose in town.'] },
    { id: 'bottletop', emoji: '🔴', name: 'Bottle top', xp: 2, w: 5, lines: ['A bottle top. Shiny! Worthless! Shiny!', 'A crinkly red bottle top. Treasure, obviously.'] },
    { id: 'spoon', emoji: '🥄', name: 'Lost teaspoon', xp: 3, w: 4, lines: ['A teaspoon! So THAT’S where it went.', 'A spoon! Somebody was digging with it. Amateurs.'] },
    { id: 'marble', emoji: '🔮', name: 'Marble', xp: 4, w: 4, lines: ['A glass marble! Swirly red and blue.', 'A marble! Somebody lost their best one.'] },
    { id: 'penny', emoji: '🪙', name: 'Old penny', xp: 4, w: 4, lines: ['An old penny! Very old. Very green round the edges.', 'A penny! Rich at last!'] },
    { id: 'soldier', emoji: '💂', name: 'Toy soldier', xp: 5, w: 3, lines: ['A little toy soldier! Standing to attention, even underground.', 'A tin soldier! He’s been on guard down there for years.'] },
    { id: 'toycar', emoji: '🚙', name: 'Toy car', xp: 5, w: 3, lines: ['A tiny blue toy car! Brrrm brrrm.', 'A toy car! The wheels still go round!'] },
    { id: 'key', emoji: '🗝️', name: 'Old key', xp: 6, w: 2, lines: ['An old brass key! What does it open? Nobody knows.', 'A key! To a treasure chest? A shed? A mystery!'] },
    { id: 'boot', emoji: '👢', name: 'Wellie boot', xp: 3, w: 2, lines: ['A wellie! Somebody sank in the mud and left it behind.', 'One boot. Pongy. Perfect.'] },
    { id: 'ring', emoji: '💍', name: 'Lost ring', xp: 10, w: 1, lines: ['A gold ring! Somebody looked for this for AGES.', 'A sparkly ring! What a nose!'] },
    { id: 'bigbone', emoji: '🦕', name: 'Dinosaur bone', xp: 10, w: 1, lines: ['A DINOSAUR BONE! (Probably. It’s very big. It’s a dinosaur.)', 'The biggest bone ever! Ever ever!'] },
    { id: 'tin', emoji: '⏳', name: 'Time capsule', xp: 12, w: 1, lines: ['A tin! Somebody buried it on purpose… a time capsule!'], capsule: true },
  ],
  woods: [
    { id: 'acorns', emoji: '🌰', name: 'Squirrel’s stash', xp: 3, w: 6, lines: ['A squirrel’s secret stash of acorns! Shh, don’t tell.', 'Acorns! Some squirrel’s winter dinner. Oops.'] },
    { id: 'conker', emoji: '🌰', name: 'Conker', xp: 3, w: 5, lines: ['A shiny conker! A champion one, too.', 'A conker! Polished by the soil.'] },
    { id: 'worm', emoji: '🪱', name: 'Wiggly worm', xp: 2, w: 4, lines: ['A worm! Hello, worm. Back you go.', 'Wiggle wiggle! A worm, not a treasure. Still exciting.'] },
    { id: 'bone', emoji: '🦴', name: 'Buried bone', xp: 3, w: 4, lines: ['A bone in the woods! A fox’s? A dog’s? Yours now.', 'Bone! The woods are full of surprises.'] },
    { id: 'stone', emoji: '🪨', name: 'Lucky stone', xp: 4, w: 2, lines: ['A stone with a hole right through it. Lucky!', 'A lucky stone! Make a wish!'] },
    { id: 'truffle', emoji: '🍄', name: 'Truffle', xp: 10, w: 2, lines: ['A TRUFFLE! The fanciest smell in the whole woods!', 'A truffle! Chefs would give anything for this nose.'] },
    { id: 'arrowhead', emoji: '🏹', name: 'Flint arrowhead', xp: 8, w: 1, lines: ['A flint arrowhead! Thousands of years old!', 'An arrowhead, from long, long ago. Treasure!'] },
    { id: 'fossil', emoji: '🐌', name: 'Fossil', xp: 8, w: 1, lines: ['A fossil! A stone snail from before the dinosaurs’ grannies.'] },
  ],
  farm: [
    { id: 'potato', emoji: '🥔', name: 'Potato', xp: 2, w: 7, lines: ['A potato! Farmer Mabel missed one.', 'Spud! Muddy, lumpy, lovely.'] },
    { id: 'carrot', emoji: '🥕', name: 'Carrot', xp: 3, w: 6, lines: ['A carrot! Crunchy. The pigs would want this.', 'Carrot! Pulled up by the best nose on the farm.'] },
    { id: 'egg', emoji: '🥚', name: 'Hidden egg', xp: 3, w: 3, lines: ['An egg! Some hen laid it somewhere silly.', 'An egg in the ground! Silly hens.'] },
    { id: 'bone', emoji: '🦴', name: 'Buried bone', xp: 3, w: 4, lines: ['A bone! The farm dog’s secret stash.', 'Bone! Smells of cows. Delicious.'] },
    { id: 'horseshoe', emoji: '🧲', name: 'Horseshoe', xp: 6, w: 2, lines: ['A horseshoe! That’s lucky. Everybody knows that.', 'An old horseshoe! Some horse went home in socks.'] },
    { id: 'penny', emoji: '🪙', name: 'Old penny', xp: 4, w: 2, lines: ['An old penny, ploughed up and lost again!'] },
    { id: 'coin', emoji: '🪙', name: 'Roman coin', xp: 10, w: 1, lines: ['A gold coin! A ROMAN one! (Probably.)', 'Ancient treasure! A coin from long ago!'] },
  ],
};

/** What's written on the note inside a time capsule. */
export const CAPSULES = [
  '“To whoever finds this: the best dog on our street is called Biscuit. Is that still true? — Class 4”',
  '“Hello, future! We have hover boots now, probably. Do you? Love, Sam (age 8)”',
  '“This tin contains: one marble, one sweet wrapper, and a VERY good drawing of a cat.”',
  '“If you are a dog reading this: well done. Good dog.”',
  '“Dear future: please look after the conker tree in the woods. It is the best one.”',
  '“We buried this the summer the pond froze. Wait, that doesn’t make sense. Anyway, hello!”',
];
