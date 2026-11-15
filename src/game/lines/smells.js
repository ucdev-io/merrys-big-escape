// Things to sniff out around the neighbourhood. {dog} = another dog's name (they leave news on lamp posts).
// where: 'post' (lamp posts, gates, bins), 'pond', or anywhere. xp: stars for finding it.

export const SMELLS = {
  news: {
    emoji: '📰', name: 'Dog news', where: 'post', xp: 3, lines: [
      '{dog} was here!', '{dog} was here. {dog} says hi!', '{dog} was here. Twice.',
      '{dog} wants everyone to know they are the BEST dog.', '{dog} was here and found nothing. Rubbish.',
      'Fresh news! {dog} had sausages for breakfast.', '{dog} was here, then ran away from a pigeon.',
      'A message from {dog}: “The postman is back.”', '{dog} was here. Very recently. Very smelly.',
    ],
  },
  chips: { emoji: '🍟', name: 'Dropped chips', xp: 3, lines: ['Chips! Someone dropped chips! (They’re all gone now.)', 'The ghost of a chip. Delicious.', 'Salty, vinegary, gone.'] },
  icecream: { emoji: '🍦', name: 'Ice-cream drip', xp: 3, lines: ['An ice-cream drip! Vanilla. Excellent.', 'Strawberry! Someone was sad about dropping this.', 'Sticky. Sweet. Lick lick lick.'] },
  crust: { emoji: '🥪', name: 'Sandwich crust', xp: 3, lines: ['A crust! Cheese and pickle, if this nose is right.', 'Somebody didn’t eat their crusts.', 'Ham sandwich. Ham sandwich! HAM SANDWICH!'] },
  apple: { emoji: '🍎', name: 'Apple core', xp: 3, lines: ['An apple core. Crunchy and a bit brown.', 'Apple! Healthy. Boring. Still sniffable.'] },
  crumbs: { emoji: '🥐', name: 'Bakery crumbs', xp: 3, lines: ['Croissant crumbs! Someone came from the bakery.', 'Buttery crumbs. A trail of deliciousness.'] },
  biscuit: { emoji: '🍪', name: 'Biscuit crumbs', xp: 3, lines: ['Biscuit crumbs! Chocolate chip!', 'Someone had a biscuit here and didn’t share.'] },
  cat: { emoji: '🐈', name: 'Cat', xp: 4, lines: ['Cat! Definitely a cat. Grrr.', 'A cat sat here. Smugly.', 'Was it Pickles? It smells VERY pleased with itself.'] },
  hedgehog: { emoji: '🦔', name: 'Hedgehog', xp: 5, lines: ['Hedgehog! Prickly AND smelly.', 'A hedgehog trotted past here last night.', 'Snuffly hedgehog trail. Don’t sniff too close!'] },
  fox: { emoji: '🦊', name: 'Fox', xp: 5, lines: ['Fox! Ooh, very whiffy.', 'A fox was here. Sneaky.', 'Fox smell! Better tell everyone.'] },
  squirrel: { emoji: '🐿️', name: 'Squirrel', xp: 4, lines: ['Squirrel! Where?! WHERE?!', 'A squirrel buried a nut here. Then forgot.', 'Nutty, twitchy squirrel smell.'] },
  snail: { emoji: '🐌', name: 'Snail trail', xp: 3, lines: ['A snail trail. Sparkly and slow.', 'Snail! It went thataway… very slowly.'] },
  ladybird: { emoji: '🐞', name: 'Ladybird', xp: 3, lines: ['A ladybird! Tickly nose!', 'Spotty little beetle. Hello!'] },
  duck: { emoji: '🦆', name: 'Duck', where: 'pond', xp: 4, lines: ['Duck! Quack-flavoured.', 'Ducky feathers. Somebody’s been paddling.'] },
  frog: { emoji: '🐸', name: 'Frog', where: 'pond', xp: 4, lines: ['A frog! Ribbit. Boing.', 'Damp, froggy smell. Lovely.'] },
  ball: { emoji: '🎾', name: 'Lost tennis ball', xp: 5, lines: ['A tennis ball smell! Somebody lost a ball!', 'Ball. Ball! BALL! (It rolled away.)'] },
  sock: { emoji: '🧦', name: 'Lost sock', xp: 5, lines: ['A lost sock! Extra stinky. Perfect.', 'One sock. Where’s the other one?'] },
  shoe: { emoji: '👟', name: 'Old trainer', xp: 5, lines: ['An old trainer. Pongy!', 'Shoe smell. Wonderful, awful shoe smell.'] },
  teddy: { emoji: '🧸', name: 'Lost teddy', xp: 5, lines: ['A teddy was dropped here. Somebody will miss it.', 'Teddy smell! Soft and dribbly.'] },
  frisbee: { emoji: '🥏', name: 'Frisbee', xp: 5, lines: ['A frisbee flew past here! Wheee!', 'Frisbee! Somebody played fetch without you.'] },
  bone: { emoji: '🦴', name: 'Old bone', xp: 5, lines: ['A bone was buried here once. Long, long ago.', 'Bone smell! Ancient. Magnificent.'] },
  keys: { emoji: '🔑', name: 'Lost keys', xp: 5, lines: ['Somebody dropped their keys! Jingly smell.', 'Keys! Someone’s going to be locked out…'] },
  flowers: { emoji: '🌸', name: 'Flowers', xp: 3, lines: ['Flowers. Nice, but no sausages.', 'Sneezy flowers! A-CHOO!'] },
  mushroom: { emoji: '🍄', name: 'Mushroom', xp: 3, lines: ['A mushroom. Sniff, don’t eat!', 'Earthy mushroom smell.'] },
  mint: { emoji: '🌿', name: 'Mint', xp: 3, lines: ['Mint! Fresh breath for dogs.', 'Minty! Your nose is all tingly.'] },
  leaves: { emoji: '🍂', name: 'Crunchy leaves', xp: 3, lines: ['A pile of crunchy leaves. Roll in it? Roll in it.', 'Leafy, crunchy, autumny.'] },
};

// How often each kind turns up (lamp posts are always news).
export const SMELL_WEIGHTS = {
  chips: 3, icecream: 2, crust: 3, apple: 2, crumbs: 2, biscuit: 2, cat: 3, hedgehog: 2, fox: 1, squirrel: 3,
  snail: 2, ladybird: 2, ball: 2, sock: 2, shoe: 1, teddy: 1, frisbee: 1, bone: 1, keys: 1, flowers: 3, mushroom: 1, mint: 1, leaves: 2,
};
// 🍂❄️🌸☀️ Smells that come with the seasons and the weather (they join SMELLS), and how often things turn up then.
Object.assign(SMELLS, {
  mincepie: { emoji: '🥧', name: 'Mince pie crumbs', xp: 4, lines: ['Mince pie crumbs! Somebody’s been at the Christmas treats.', 'Spicy, fruity, crumbly. Christmassy!'] },
  hotchoc: { emoji: '☕', name: 'Hot chocolate', xp: 3, lines: ['Hot chocolate! With marshmallows, if this nose is right.', 'Somebody spilt their hot chocolate. Warm and chocolatey!'] },
  carrot: { emoji: '🥕', name: 'Carrot', xp: 3, lines: ['A carrot! A snowman must have dropped his nose.', 'Carrot! Crunchy… and a bit snowy.'] },
  chestnuts: { emoji: '🌰', name: 'Roast chestnuts', xp: 4, lines: ['Roast chestnuts! Toasty and nutty.', 'Chestnuts roasting… somewhere near here!'] },
  pine: { emoji: '🎄', name: 'Christmas tree', xp: 3, lines: ['Pine needles! Smells like Christmas.', 'A Christmas tree was carried past here. Prickly!'] },
  ice: { emoji: '🧊', name: 'Frosty pond', where: 'pond', xp: 3, lines: ['Brrr! The pond smells frozen.', 'Icy! Ducks have been skating here.'] },
  bonfire: { emoji: '🔥', name: 'Bonfire smoke', xp: 3, lines: ['Smoky! Somebody’s had a bonfire.', 'Bonfire smell. Toasty!'] },
  toffee: { emoji: '🍎', name: 'Toffee apple', xp: 4, lines: ['A toffee apple! Sticky and sweet.', 'Toffee! Somebody dropped a bit of toffee apple.'] },
  pumpkin: { emoji: '🎃', name: 'Pumpkin', xp: 3, lines: ['Pumpkin! Someone’s been carving.', 'Pumpkin seeds everywhere. Squishy!'] },
  conker: { emoji: '🌰', name: 'Conker', xp: 3, lines: ['A conker! Shiny and smooth.', 'Conkers! Somebody’s been playing conkers.'] },
  blossom: { emoji: '🌸', name: 'Blossom', xp: 3, lines: ['Blossom! Pink and sneezy. A-CHOO!', 'Petals everywhere. Pretty!'] },
  chocegg: { emoji: '🥚', name: 'Chocolate egg', xp: 4, lines: ['Chocolate! Somebody had an Easter egg here.', 'A foil wrapper. The chocolate’s gone. Rats.'] },
  grass: { emoji: '🌱', name: 'Cut grass', xp: 3, lines: ['Fresh cut grass! Mowbot’s been busy.', 'Grassy! Roll in it? Roll in it.'] },
  suncream: { emoji: '🧴', name: 'Suncream', xp: 3, lines: ['Suncream! Coconutty.', 'Somebody’s ready for the beach!'] },
  strawberry: { emoji: '🍓', name: 'Strawberries', xp: 4, lines: ['Strawberries! Summery and sweet.', 'A squashed strawberry. Still smells lovely!'] },
  lolly: { emoji: '🍭', name: 'Ice lolly', xp: 3, lines: ['An ice lolly drip! Orange flavour.', 'A sticky lolly stick. Lick lick.'] },
  worm: { emoji: '🪱', name: 'Worm', xp: 4, lines: ['A worm! They come up when it rains.', 'Wiggly worm. Hello, worm!'] },
  puddle: { emoji: '💧', name: 'Puddle', xp: 2, lines: ['A puddle! Splashy smell.', 'Rainy, muddy, puddly. Lovely.'] },
  wetleaves: { emoji: '🍂', name: 'Wet leaves', xp: 3, lines: ['Soggy leaves. Squelch!', 'Wet leaves smell earthy and brilliant.'] },
});

/** Per season (and Christmas, and the weather): smells added (how often) and ones that are rarer then (× this). */
export const SEASON_SMELLS = {
  spring: { add: { blossom: 4, chocegg: 2, grass: 2, ladybird: 2 }, less: { leaves: 0.2 } },
  summer: { add: { suncream: 2, strawberry: 2, lolly: 2, grass: 3, icecream: 2 }, less: { leaves: 0.2 } },
  autumn: { add: { bonfire: 2, toffee: 2, pumpkin: 2, conker: 2, leaves: 3, mushroom: 2 }, less: { icecream: 0.4 } },
  winter: { add: { hotchoc: 2, carrot: 2, chestnuts: 2, mincepie: 1 }, less: { icecream: 0.15, flowers: 0.2, ladybird: 0.1, snail: 0.3, leaves: 0.5, frisbee: 0.5 } },
  christmas: { add: { mincepie: 3, pine: 3 } },
  showers: { add: { worm: 3, puddle: 2, wetleaves: 2 }, less: { chips: 0.6 } },
};

/** How often each smell turns up right now (this season, maybe Christmas, this weather). */
export function smellWeights(season, weather, festive) {
  const w = { ...SMELL_WEIGHTS };
  for (const key of [season, festive, weather]) {
    const s = SEASON_SMELLS[key];
    if (!s) continue;
    for (const [k, v] of Object.entries(s.add ?? {})) w[k] = (w[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.less ?? {})) if (w[k]) w[k] *= v;
  }
  return w;
}

/** What the pond smells of (frozen over: no frogs or flowers). */
export const POND_SMELLS = { winter: ['duck', 'ice', 'duck', 'snail', 'ice'], other: ['duck', 'frog', 'duck', 'snail', 'flowers'] };
