// 🌲 Everything said in the Woods: the owl, Brock the badger, the den, big sticks, mud, and the smells.
// {name} = your dog's name. {who} = a friend's dog's name.

export const OWL = {
  // Woofed at (owls sleep in the day, so…)
  woken: [
    'Whooo’s there?', 'Hoo-hoo! Who’s making all that noise?', 'Twit-twoo… oh. It’s a dog.', 'Who? WHO? …Oh. You.',
    'Some of us are trying to sleep, you know!', 'It’s daytime! Owls don’t DO daytime.', 'Whooo woke me up? Was it you? It was, wasn’t it.',
    'Hooo-hum. Five more minutes…', 'I was having a lovely dream about mice.', 'Twit-twoo to you too!', 'Who goes there? A dog goes there. Hoo.',
    'Shhh! The wood is sleeping. Well, I was.', 'Hoo! You’ve made my feathers go all fluffy.', 'Do you know what time it is? …Neither do I. Hoo.',
    'Hoo hoo! A visitor! A very loud visitor.', 'Who’s a good dog? Not the one who woke me up.',
  ],
  // Woofed at again, straight away.
  again: ['Yes, yes, I heard you the first time.', 'HOOO. Still here. Still sleepy.', 'Woof woof to you too.', 'I’m awake! I’m awake! Hoo.', 'Twit… twoo… twawn. (That was a yawn.)'],
  // Dozing on the branch while you’re about.
  dozing: ['Zzz… hoo… zzz…', 'Twit… zzz… twoo…', 'Mmm… mice…'],
  // You went round behind the tree, and the owl's head followed you all the way.
  behind: ['I can see you back there! Hoo.', 'Owls can turn their heads nearly ALL the way round, you know.', 'Where are you going? I’m watching. Hoo.'],
};

export const BROCK = {
  sleep: ['Zzz…', 'Snnnrk… zzz…', 'Mmm… worms… zzz…'],
  // Asks for help (two kinds of job, taking turns).
  askBedding: [
    'Oh! Hello, little dog. I’m Brock. My bed’s gone all damp — could you fetch me some dry bracken? Three bundles should do it.',
    'Morning! Or is it evening? I never know, I’m a badger. Would you fetch me three bundles of bracken for my bed?',
    'Ahem. Brock the badger. Bed-maker. I need three bundles of crunchy dry bracken. Can you help?',
  ],
  askDoors: [
    'The wind blew leaves into all my front doors! Could you dig them out? Dig dig dig!',
    'Hmph. Can’t get out of my own front doors for leaves. Would you dig them clear for me?',
    'Three front doors, all stuffed with leaves. A dog who can dig would be ever so handy…',
  ],
  bundle: ['Ooh, lovely and crunchy. Mind out — coming through backwards!', 'That’s the stuff! In it goes… backwards, as is traditional.', 'Perfect! Badgers always go in backwards. Don’t ask why.', 'Crunchy! My favourite kind of bed.'],
  door: ['That’s one door clear! Splendid digging!', 'Ooh, I can see daylight! Thank you!', 'Another one! You dig nearly as well as a badger.'],
  thanks: [
    'Ahh. Everything’s just right. You’re a very good dog, {name}. Night night!',
    'Thank you, {name}! I’m off for a proper snooze now. Zzz…',
    'Lovely work! You dig nearly as well as a badger. Nearly.',
    'Splendid! Come back soon — I’ll probably be asleep, but come back anyway.',
  ],
  remindBedding: ['Three bundles of bracken, please! It’s the brown fluffy stuff in the wood.', 'Still need a bit more bracken for my bed!'],
  remindDoors: ['Still a few doors full of leaves, I’m afraid!', 'Dig dig dig! There’s more leaves in my doors.'],
  idle: ['I’m having a little doze. Come back later!', 'Mmm. Comfy.', 'Badgers sleep in the day, you know.', 'Hello again! Busy snoozing.'],
};

export const DEN = {
  first: 'A stick for the den! Every den starts with one good stick.',
  stages: {
    3: 'The den’s got a frame! A sort of… pointy shape.',
    8: 'Walls going up! It’s starting to look like a den.',
    12: 'The den is finished! 🎉 A perfect den for a pack of dogs.',
    16: 'Bunting! The den is VERY fancy now.',
    20: 'A flag on the top! It’s a proper headquarters.',
    25: 'A jar of fireflies by the door. So cosy!',
    30: 'This is the grandest den in the whole wide world.',
  },
  added: ['Clonk! In it goes.', 'One more stick! 🪵', 'Den-tastic!', 'Good stick. Very good stick.', 'Perfect fit!'],
  woodpile: ['Another stick for the woodpile!', 'The den’s perfect — this one goes on the pile.'],
  friend: '{who} added a stick to the den!',
  hint: 'Bring a 🪵 big stick to the den!',
};

export const STICK = {
  grab: ['A BIG stick! The best kind of stick.', 'Biggest. Stick. Ever.', 'Ooh, this one’s a whopper!', 'A magnificent stick!'],
  bonk: ['Bonk!', 'It won’t fit!', 'Too wide!', 'Try going straight through!', 'The stick says no.', 'Bonk! Bonk!', 'Wider than it looks!', 'Hmm. Physics.', 'Straight on, straight on!'],
  through: ['Made it! 🪵', 'Straight through! Clever dog.', 'Squeezed through!'],
  tip: 'Big sticks only fit through gaps if you go straight on! 🪵',
};

export const MUD = {
  splodge: ['Squelch!', 'Splodge!', 'Ooh, squishy!', 'Mud! Glorious mud!', 'Splat!'],
  muddy: ['Completely muddy. Perfect.', 'Gloriously muddy!', 'A proper mud monster!', 'So. Much. Mud.'],
  roll: ['Rolling in mud: the best thing a dog can do!', 'Roll roll roll! Mud everywhere!', 'Wheee! Mud bath!'],
  clean: ['Squeaky clean! (For now.)', 'All washed off! Sparkly dog!', 'Clean again! What a shame.', 'Splash! Mud gone.'],
};

// Woodland smells (see game/town/smells.js): where 'woods' spots smell of these.
export const WOODS_SMELLS = {
  badger: { emoji: '🦡', name: 'Badger trail', xp: 4, lines: ['A badger came by here last night. Stripy and snuffly.', 'Badger! Big, busy, bossy badger smell.', 'Brock was here. He likes worms. Lots of worms.'] },
  deer: { emoji: '🦌', name: 'Deer', xp: 5, lines: ['Deer! Leapy, leafy, gone.', 'A deer stopped here for a nibble of something.', 'Hoofprints and deer smell. Very elegant.'] },
  rabbit: { emoji: '🐇', name: 'Rabbit', xp: 4, lines: ['Rabbit! Hoppy, flighty, VERY interesting.', 'A rabbit was here. Was. Is it still here? No.', 'Bunny smell! Twitchy-nosed and quick.'] },
  garlic: { emoji: '🧄', name: 'Wild garlic', xp: 3, lines: ['Wild garlic! Your nose will smell of this for HOURS.', 'Garlicky! Pongy! Lovely!'] },
  pinecone: { emoji: '🌲', name: 'Pine cones', xp: 3, lines: ['Pine cones! Sticky and spiky and smelling of Christmas.', 'Piney. Fresh. A bit prickly up the nose.'] },
  conker: { emoji: '🌰', name: 'Conkers', xp: 3, lines: ['Conkers! Shiny and brown and not for eating.', 'Somebody dropped a conker. A champion one, by the smell.'] },
  feather: { emoji: '🪶', name: 'Owl feather', xp: 4, lines: ['A feather! Owl, by the smell of it. Hoo.', 'Soft, fluffy feather. Somebody up a tree is moulting.'] },
  log: { emoji: '🪵', name: 'Mossy log', xp: 3, lines: ['A mossy old log. Damp and delicious.', 'Logs smell like… log. Wonderful.', 'Beetles live under here. Busy, tickly beetles.'] },
  picnic: { emoji: '🧺', name: 'Old picnic', xp: 4, lines: ['Somebody had a picnic here. Egg sandwiches, if this nose is right!', 'Picnic crumbs! Jam. Definitely jam.'] },
  stream: { emoji: '💧', name: 'Stream', xp: 3, lines: ['Fresh, splashy stream smell. And something fishy.', 'Water! Cold and clean and full of tiddlers.'] },
  stick: { emoji: '🪵', name: 'A good stick', xp: 3, lines: ['The perfect stick was here. Somebody else got it first.', 'Stick smell. The best smell there is (after sausages).'] },
};
// How often each turns up in the wood (smells from the town's list can turn up here too).
export const WOODS_SMELL_WEIGHTS = {
  badger: 3, deer: 2, rabbit: 3, garlic: 2, pinecone: 2, conker: 2, feather: 1, log: 2, picnic: 1, stream: 1, stick: 2,
  fox: 2, mushroom: 3, squirrel: 2, hedgehog: 1, leaves: 2,
};
