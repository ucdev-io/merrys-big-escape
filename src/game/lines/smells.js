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
