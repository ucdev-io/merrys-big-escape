// 🏖️ Everything said at the beach: Sandy the lifeguard, Gulliver and the seagulls, Nipper the crab, the
// waves, sandcastles, things dug up out of the sand, the kiosk, and the beach's smells.
// {name} = your dog's name. {who} = a friend's dog's name. {n} / {left}: how many.

export const SANDY = {
  hello: ['Hiya, {name}! Lovely day for a paddle.', 'Morning, pup! Sandy, lifeguard. Keeping an eye on things.', 'Hello there! Mind the waves — they’re ever so splashy today.'],
  // Asking for a hand (three kinds of job, taking turns).
  askBalls: [
    'Oh, {name}! The wind’s blown three beach balls out to sea. Could you swim out and fetch them back? Not past the buoys, mind!',
    'Three beach balls have floated off! I’d go myself, but I’m on duty. Would you paddle out and bring them back?',
  ],
  askWhistle: [
    'Disaster! A seagull pinched my whistle and buried it somewhere on the beach. Could you sniff it out and dig it up?',
    'My whistle’s gone! I think Gulliver took it. Seagulls bury things, you know. Sniff, sniff, dig!',
  ],
  askGulls: [
    'Those seagulls are after everyone’s chips again! Could you shoo them off the picnics? Three good woofs should do it.',
    'Gulliver and his gang are pestering the picnics. Woof them away for me — three times!',
  ],
  ball: ['Splendid! One more back on the beach.', 'Lovely fetching! Into the pile it goes.', 'That’s the spirit! Got it!'],
  gull: ['Ha! Off you go, seagull!', 'Good woof! The chips are safe.', 'That told him!'],
  thanks: [
    'Brilliant work, {name}! You’re a natural lifeguard.',
    'Thank you, {name}! I couldn’t have done it without you. Well, I could, but it would’ve taken ages.',
    'Top job! If you ever want a whistle of your own, just say.',
    'Smashing! Now, who wants an ice cream? (Not me, I’m on duty.)',
  ],
  remindBalls: ['The beach balls are out past the waves — swim out and grab them!', 'Still a ball or two bobbing about out there!'],
  remindWhistle: ['My whistle’s buried somewhere on the sand. Have a good sniff!', 'Sniff it out, then dig dig dig!'],
  remindGulls: ['Watch for seagulls swooping on the picnics — and WOOF!', 'Here comes another gull… woof it away!'],
  idle: ['All quiet on the beach. Just how I like it.', 'Remember: paddle where the lifeguard can see you!', 'Sand in my shoes again. Every single day.', 'Ooh, is that a crab?'],
  // Swimming right out to the buoys.
  buoys: ['PHWEEEP! That’s far enough, {name}! Back towards the beach!', 'PHWEEEP! Not past the buoys, pup!', 'PHWEEEP! Lovely swimming — now turn around!'],
};

export const GULLS = {
  // Gulliver, the biggest seagull, grabbing chips.
  mine: ['MINE!', 'Mine! Mine! MINE!', 'Chips! CHIPS!', 'Finders keepers!', 'Ha-ha-ha-ha!', 'Don’t mind if I do!', 'Lunchtime!'],
  // Woofed away.
  shoo: ['Squawk!', 'Rude!', 'Fine! FINE!', 'I wasn’t going to anyway!', 'Kyow!', 'My chips!'],
  // Somebody at a picnic, losing their chips.
  oi: ['Oi! My chips!', 'Hey! Shoo, you cheeky gull!', 'Not again!', 'That was my last chip!', 'Gerroff!'],
  // The dog saved the day.
  saved: ['Not today, seagull!', 'Chips: saved!', 'Good dog! Picnic saved!', 'Gull: nil. Dog: one.'],
  bought: 'More chips! 🍟',
};

export const CRABS = {
  // Nipper, the oldest crab in the rock pools.
  nipper: [
    'Pinch pinch! These are MY rock pools, young pup.',
    'I’m Nipper. I’ve lived in these rocks for… ooh, ages. Mind your nose.',
    'Sideways is the only proper way to walk. Everyone knows that.',
    'Have you seen my shell? Not this one. My OTHER shell.',
    'Snip snip! Just practising.',
    'The tide brings me all sorts. Yesterday: half a sandwich. Marvellous.',
  ],
  hide: ['Snip snip!', 'Eek!', 'Sideways! Sideways!', 'Not the nose!'],
  spotted: 'A crab! Scuttle scuttle! 🦀',
};

export const WAVES = {
  caught: ['SPLOSH! The wave got you!', 'Splash! Soggy paws!', 'Wheee! Wet dog!', 'The sea says hello!', 'Got you!'],
  missed: ['Ha! Missed me, wave!', 'Too quick for you, sea!', 'Run run run! Phew!', 'Dry paws! Ha!'],
  chase: ['Chase the wave!', 'Come back, wave!', 'Get it! Get the sea!', 'After it!'],
  big: 'Big wave coming! 🌊',
};

export const CASTLE_SAY = {
  stage: ['A heap of sand!', 'A tower!', 'Turrets and walls!', '🏰'],
  done: ['A sandcastle! The finest on the beach!', 'Castle complete! 🏰', 'King of the castle!', 'Sand-tastic!'],
  team: ['A team sandcastle! 🏰', 'Built together! Brilliant!', 'The pack’s castle!'],
  knock: ['SPLAT!', 'Whoops! Flat!', 'Sandcastle down!', 'Kersplosh!', 'Rebuild it!'],
  friend: '{who} built a sandcastle!',
};

// Things dug up on the beach: what each looks like is in entities/beachItems.js (TREASURE_MODELS).
export const TREASURES = [
  { id: 'scallop', emoji: '🐚', name: 'Scallop shell', xp: 3, w: 6, lines: ['A scallop shell! Pink and ridgy.', 'A shell! Hold it to your ear… the sea!', 'Shells! Shells, shells, shells.'] },
  { id: 'cockle', emoji: '🐚', name: 'Cockle shell', xp: 3, w: 5, lines: ['A cockle! Cockles are lucky. Probably.', 'A little stripy shell!'] },
  { id: 'conch', emoji: '🐚', name: 'Spiral shell', xp: 4, w: 3, lines: ['A twisty spiral shell! Very fancy.', 'Ooh, a swirly one!'] },
  { id: 'glass', emoji: '💎', name: 'Sea glass', xp: 4, w: 4, lines: ['Sea glass! Smoothed by the waves for years and years.', 'A green jewel! (It’s sea glass. Still a jewel.)'] },
  { id: 'starfish', emoji: '⭐', name: 'Starfish', xp: 5, w: 2, lines: ['A starfish! Back in the sea you go, little one.', 'A real starfish! Five arms. Show-off.'] },
  { id: 'stone', emoji: '🪨', name: 'Lucky stone', xp: 4, w: 3, lines: ['A stone with a hole right through it. That’s LUCKY.', 'A lucky stone! Make a wish!'] },
  { id: 'duck', emoji: '🦆', name: 'Rubber duck', xp: 5, w: 2, lines: ['A rubber duck! It’s come a long way. Squeak!', 'Squeak squeak! A rubber duck!'] },
  { id: 'boot', emoji: '👢', name: 'Old boot', xp: 3, w: 2, lines: ['An old boot. Pongy. Perfect.', 'One boot. Somewhere there’s a pirate with one cold foot.'] },
  { id: 'coin', emoji: '🪙', name: 'Pirate coin', xp: 8, w: 1, lines: ['A gold coin! Pirate treasure! Arrr!', 'Treasure! A real pirate coin! (Probably chocolate.)'] },
  { id: 'fossil', emoji: '🐌', name: 'Fossil', xp: 7, w: 1, lines: ['A fossil! Older than the dinosaurs’ grannies.', 'An ammonite! A stone snail from long, long ago.'] },
  { id: 'bottle', emoji: '🍾', name: 'Message in a bottle', xp: 8, w: 1, lines: ['A message in a bottle!'] },
];
/** What the messages in bottles say (all signed, all a bit odd). */
export const BOTTLES = [
  '“Dear finder: I have lost my rubber duck. If found, please give it a squeeze. Love, Captain Crumb.”',
  '“Help! I am stuck on an island made entirely of biscuits. Actually, don’t help. — Sid”',
  '“If you can read this, you are a very clever dog. — The Lighthouse Keeper”',
  '“Roses are red, the sea is blue, I buried my sandwich, and now I can’t find it too. — Gulliver”',
  '“X marks the spot. (I forgot where I put the X.) — a pirate”',
  '“Nipper owes me three shrimps. — A Concerned Prawn”',
  '“Remember: always share your chips. Except with seagulls. — Sandy”',
  '“Hut number seven is NOT haunted. Probably. — Management”',
];

export const KIOSK = {
  trick: ['A trick! Lovely! Here — a doggy ice cream, on the house.', 'Ooh, very good! One doggy ice cream coming up!', 'Clever pup! That’s worth a vanilla.', 'Bravo! Have a scoop!'],
  wait: ['Another one? Give me a minute to scoop!', 'Patience, pup! The next one’s nearly ready.'],
  hint: 'Do a trick at the kiosk (😀) for a doggy ice cream!',
  closed: 'The kiosk’s shut for winter. See you in the spring! 🍦',
};

// Beach smells (see game/town/smells.js): where 'beach' spots smell of these.
export const BEACH_SMELLS = {
  seaweed: { emoji: '🌿', name: 'Seaweed', xp: 3, lines: ['Seaweed! Slimy, salty and absolutely brilliant.', 'Pongy seaweed. Roll in it? Roll in it.', 'Seaweed pops when you step on it. POP!'] },
  fish: { emoji: '🐟', name: 'Fishy smell', xp: 4, lines: ['Fish! Somebody’s been fishing. Or a seagull dropped lunch.', 'Very, very fishy. Excellent.'] },
  crab: { emoji: '🦀', name: 'Crab', xp: 4, lines: ['A crab went sideways through here. Scuttle scuttle.', 'Crabby smell! Pinchy and salty.'] },
  shells: { emoji: '🐚', name: 'Shells', xp: 3, lines: ['Shells! Somebody collected a bucketful here.', 'Shell smell. It smells of… the sea, mostly.'] },
  driftwood: { emoji: '🪵', name: 'Driftwood', xp: 3, lines: ['Driftwood! Washed up from far away. A stick from the SEA.', 'A salty old stick. The best kind.'] },
  seagull: { emoji: '🕊️', name: 'Seagull', xp: 3, lines: ['A seagull stood here. Probably plotting something.', 'Gull! Cheeky, chip-pinching gull.'] },
  sandwich: { emoji: '🥪', name: 'Sandy sandwich', xp: 3, lines: ['A sandwich with sand in it. A SANDwich.', 'Somebody dropped their lunch. Crunchy!'] },
  candyfloss: { emoji: '🍭', name: 'Candyfloss', xp: 4, lines: ['Candyfloss! Sticky, pink and fluffy.', 'Sugar on the breeze! Candyfloss!'] },
  doughnut: { emoji: '🍩', name: 'Doughnut', xp: 4, lines: ['Hot doughnuts with sugar on! Somewhere!', 'Doughnut crumbs! Sugary paws!'] },
  rope: { emoji: '🪢', name: 'Old rope', xp: 3, lines: ['A bit of old rope. Tug of war, anyone?', 'Rope from a boat! Salty and knotty.'] },
  saltwater: { emoji: '🌊', name: 'Sea breeze', xp: 2, lines: ['Sniff the sea breeze! Salty and fresh.', 'Mmm. The sea. Big, wet, wonderful sea.'] },
  bucket: { emoji: '🪣', name: 'Bucket and spade', xp: 3, lines: ['A bucket and spade were here. Somebody built a castle!', 'Plastic bucket smell. Very seaside.'] },
};
// How often each turns up on the beach (smells from the town's list can turn up here too: chips, ice cream, suncream…).
export const BEACH_SMELL_WEIGHTS = {
  seaweed: 4, fish: 2, crab: 3, shells: 3, driftwood: 2, seagull: 3, sandwich: 2, rope: 1, saltwater: 2, bucket: 2,
  chips: 3, icecream: 2, sock: 1, ball: 1, frisbee: 1,
};
// …and through the seasons: candyfloss, suncream and ice creams in summer; a quieter, windswept beach in winter.
export const BEACH_SEASON_SMELLS = {
  spring: { add: { bucket: 1 }, less: { icecream: 0.5 } },
  summer: { add: { suncream: 4, icecream: 3, candyfloss: 2, doughnut: 2, lolly: 2, sandwich: 1 }, less: { driftwood: 0.6 } },
  autumn: { add: { driftwood: 2, doughnut: 1 }, less: { icecream: 0.3, bucket: 0.5 } },
  winter: { add: { driftwood: 2, saltwater: 2, hotchoc: 1 }, less: { icecream: 0.05, sandwich: 0.4, bucket: 0.2, chips: 0.7 } },
  christmas: { add: { mincepie: 1 } },
  showers: { add: { seaweed: 2, puddle: 1 }, less: { sandwich: 0.4, candyfloss: 0.3 } },
};
